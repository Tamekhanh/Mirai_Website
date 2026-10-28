const DEFAULT_MODEL = 'mirai-8b'

// Client chỉ gửi key model; URL upstream không bao giờ đến từ client.
// Thêm model nhỏ hơn bằng cách set biến SMALL_SPACE_URL (ví dụ https://tamek-mirai-small.hf.space).
const getModels = (env) => {
  const models = { [DEFAULT_MODEL]: 'https://tamek-mirai.hf.space' }
  if (env?.SMALL_SPACE_URL) {
    models['mirai-small'] = env.SMALL_SPACE_URL
  }
  return models
}

const MAX_BODY_BYTES = 16 * 1024
const MAX_MESSAGE_CHARS = 1000
const MAX_TTS_CHARS = 1000
const TTS_TIMEOUT_MS = 30000
const MAX_HISTORY_ITEMS = 12
const MAX_HISTORY_CHARS = 500
const HEALTH_CACHE_SECONDS = 30
const HEALTH_LOADING_CACHE_SECONDS = 5
const MAX_TOKENS_CAP = 192
const MAX_WORDS_CAP = 60
// Phải nhỏ hơn timeout của frontend (chatApi.js, 120s) để người dùng nhận 504 có nghĩa thay vì tự hết giờ.
const UPSTREAM_TIMEOUT_MS = 110000

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  })

const resolveUpstream = (env, modelKey) => {
  const models = getModels(env)
  return models[modelKey] ?? models[DEFAULT_MODEL]
}

const clampNumber = (value, fallback, max) => {
  const number = Number(value)
  if (!Number.isFinite(number) || number <= 0) {
    return fallback
  }
  return Math.min(Math.floor(number), max)
}

const sanitizeHistory = (history) => {
  if (!Array.isArray(history)) {
    return []
  }

  return history
    .filter((item) => item && (item.role === 'user' || item.role === 'assistant'))
    .map((item) => ({
      role: item.role,
      content: String(item.content ?? '').trim().slice(0, MAX_HISTORY_CHARS),
    }))
    .filter((item) => item.content)
    .slice(-MAX_HISTORY_ITEMS)
}

const buildUpstreamHeaders = (env) => {
  const headers = new Headers({ 'content-type': 'application/json', accept: 'application/json' })

  if (env?.SPACE_API_KEY) {
    headers.set('authorization', `Bearer ${env.SPACE_API_KEY}`)
    headers.set('x-api-key', env.SPACE_API_KEY)
  }

  return headers
}

const toClientResponse = (upstream) => {
  const headers = { 'content-type': upstream.headers.get('content-type') ?? 'application/json' }
  const retryAfter = upstream.headers.get('retry-after')
  if (retryAfter) {
    headers['retry-after'] = retryAfter
  }
  return new Response(upstream.body, { status: upstream.status, headers })
}

const isCrossOrigin = (request, url) => {
  const origin = request.headers.get('origin')
  return Boolean(origin) && origin !== url.origin
}

const isRateLimited = async (request, env, scope = '') => {
  if (!env?.CHAT_LIMITER) {
    return false
  }

  const key = (request.headers.get('cf-connecting-ip') ?? 'anonymous') + scope
  const { success } = await env.CHAT_LIMITER.limit({ key })
  return !success
}

// Kiểm tra chung cho các route POST: method, origin, rate limit, kích thước và JSON hợp lệ.
// Trả về { body } khi hợp lệ, hoặc { response } là lỗi để trả thẳng cho client.
const readGuardedJson = async (request, env, url, limiterScope = '') => {
  if (request.method !== 'POST') {
    return { response: json({ error: 'Method not allowed' }, 405) }
  }

  if (isCrossOrigin(request, url)) {
    return { response: json({ error: 'Forbidden origin' }, 403) }
  }

  if (await isRateLimited(request, env, limiterScope)) {
    return { response: json({ error: 'Too many requests' }, 429) }
  }

  const declaredLength = Number(request.headers.get('content-length'))
  if (declaredLength > MAX_BODY_BYTES) {
    return { response: json({ error: 'Payload too large' }, 413) }
  }

  const rawBody = await request.text()
  if (new TextEncoder().encode(rawBody).length > MAX_BODY_BYTES) {
    return { response: json({ error: 'Payload too large' }, 413) }
  }

  try {
    return { body: JSON.parse(rawBody) }
  } catch {
    return { response: json({ error: 'Invalid JSON' }, 400) }
  }
}

const handleChat = async (request, env, url) => {
  const { body, response } = await readGuardedJson(request, env, url)
  if (response) {
    return response
  }

  const message = String(body?.message ?? '').trim().slice(0, MAX_MESSAGE_CHARS)
  if (!message) {
    return json({ error: 'Message is required' }, 400)
  }

  const maxWords = clampNumber(body.max_words, 40, MAX_WORDS_CAP)
  const maxTokens = clampNumber(body.max_tokens, 128, MAX_TOKENS_CAP)
  const history = sanitizeHistory(body.history)

  const payload = {
    message,
    history,
    // Backend tự dựng chỉ dẫn độ dài từ max_words; không gửi instruction để tránh tiêm system prompt.
    max_words: maxWords,
    max_tokens: maxTokens,
  }

  // Client tách TTS ra khỏi /chat bằng tts=false để chữ hiện ngay; mặc định giữ hành vi cũ.
  if (body.tts === false) {
    payload.tts = false
  }

  const startedAt = Date.now()
  const logChat = (status) =>
    console.log(
      JSON.stringify({
        event: 'chat',
        model: body.model ?? DEFAULT_MODEL,
        status,
        ms: Date.now() - startedAt,
        historyLen: history.length,
      })
    )

  try {
    const upstream = await fetch(new URL('/chat', resolveUpstream(env, body.model)), {
      method: 'POST',
      headers: buildUpstreamHeaders(env),
      body: JSON.stringify(payload),
      // Client ngắt kết nối (ví dụ xóa hội thoại) thì hủy luôn request upstream.
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)]),
    })
    logChat(upstream.status)
    return toClientResponse(upstream)
  } catch (error) {
    const timedOut = error?.name === 'TimeoutError'
    const status = timedOut ? 504 : 502
    logChat(status)
    return json({ error: timedOut ? 'Upstream timeout' : 'Upstream unavailable' }, status)
  }
}

const handleTts = async (request, env, url) => {
  // Bucket rate limit riêng để mỗi lượt chat (chat + tts) không ăn đôi hạn mức của /chat.
  const { body, response } = await readGuardedJson(request, env, url, ':tts')
  if (response) {
    return response
  }

  const text = String(body?.text ?? '').trim().slice(0, MAX_TTS_CHARS)
  if (!text) {
    return json({ error: 'Text is required' }, 400)
  }

  try {
    const upstream = await fetch(new URL('/tts', resolveUpstream(env, body.model)), {
      method: 'POST',
      headers: buildUpstreamHeaders(env),
      body: JSON.stringify({ text }),
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(TTS_TIMEOUT_MS)]),
    })
    return toClientResponse(upstream)
  } catch (error) {
    const timedOut = error?.name === 'TimeoutError'
    return json({ error: timedOut ? 'Upstream timeout' : 'Upstream unavailable' }, timedOut ? 504 : 502)
  }
}

const handleHealth = async (request, env, url) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return json({ error: 'Method not allowed' }, 405)
  }

  const requestedModel = url.searchParams.get('model') ?? DEFAULT_MODEL
  // Chỉ nhận key model đã khai báo để query lạ không tạo thêm mục cache.
  const modelKey = requestedModel in getModels(env) ? requestedModel : DEFAULT_MODEL
  const cache = typeof caches !== 'undefined' ? caches.default : null
  const cacheKey = new Request(`${url.origin}/__health/${encodeURIComponent(modelKey)}`)

  const cached = await cache?.match(cacheKey)
  if (cached) {
    return cached
  }

  try {
    const upstream = await fetch(new URL('/health', resolveUpstream(env, modelKey)), {
      method: 'GET',
      headers: buildUpstreamHeaders(env),
      signal: AbortSignal.timeout(10000),
    })
    const response = toClientResponse(upstream)

    // 200 cache lâu; 503 (model đang nạp) cache ngắn để các client không cùng đánh vào Space đang khởi động.
    const cacheSeconds = upstream.ok ? HEALTH_CACHE_SECONDS : upstream.status === 503 ? HEALTH_LOADING_CACHE_SECONDS : 0
    if (cache && cacheSeconds > 0) {
      const cacheable = new Response(await response.clone().text(), {
        status: response.status,
        headers: {
          'content-type': response.headers.get('content-type') ?? 'application/json',
          'cache-control': `public, max-age=${cacheSeconds}`,
        },
      })
      await cache.put(cacheKey, cacheable.clone())
      return cacheable
    }

    return response
  } catch {
    return json({ error: 'Upstream unavailable' }, 502)
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)

    if (url.pathname === '/chat' || url.pathname === '/api/chat') {
      return handleChat(request, env, url)
    }

    if (url.pathname === '/tts' || url.pathname === '/api/tts') {
      return handleTts(request, env, url)
    }

    if (url.pathname === '/health' || url.pathname === '/api/health') {
      return handleHealth(request, env, url)
    }

    if (url.pathname === '/api/models') {
      return json({ default: DEFAULT_MODEL, models: Object.keys(getModels(env)) })
    }

    if (url.pathname.startsWith('/api/')) {
      return new Response('Not found', { status: 404 })
    }

    if (env?.ASSETS) {
      return env.ASSETS.fetch(request)
    }

    return new Response('Assets binding is not available', { status: 500 })
  },
}
