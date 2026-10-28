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
const MAX_HISTORY_ITEMS = 12
const MAX_HISTORY_CHARS = 500
const HEALTH_CACHE_SECONDS = 30
const MAX_TOKENS_CAP = 192
const MAX_WORDS_CAP = 60
const UPSTREAM_TIMEOUT_MS = 120000

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

const toClientResponse = (upstream) =>
  new Response(upstream.body, {
    status: upstream.status,
    headers: { 'content-type': upstream.headers.get('content-type') ?? 'application/json' },
  })

const isCrossOrigin = (request, url) => {
  const origin = request.headers.get('origin')
  return Boolean(origin) && origin !== url.origin
}

const isRateLimited = async (request, env) => {
  if (!env?.CHAT_LIMITER) {
    return false
  }

  const key = request.headers.get('cf-connecting-ip') ?? 'anonymous'
  const { success } = await env.CHAT_LIMITER.limit({ key })
  return !success
}

const handleChat = async (request, env, url) => {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  if (isCrossOrigin(request, url)) {
    return json({ error: 'Forbidden origin' }, 403)
  }

  if (await isRateLimited(request, env)) {
    return json({ error: 'Too many requests' }, 429)
  }

  const rawBody = await request.text()
  if (rawBody.length > MAX_BODY_BYTES) {
    return json({ error: 'Payload too large' }, 413)
  }

  let body
  try {
    body = JSON.parse(rawBody)
  } catch {
    return json({ error: 'Invalid JSON' }, 400)
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
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
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

const handleHealth = async (request, env, url) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return json({ error: 'Method not allowed' }, 405)
  }

  const modelKey = url.searchParams.get('model') ?? DEFAULT_MODEL
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

    if (cache && upstream.ok) {
      const cacheable = new Response(await response.clone().text(), {
        status: response.status,
        headers: {
          'content-type': response.headers.get('content-type') ?? 'application/json',
          'cache-control': `public, max-age=${HEALTH_CACHE_SECONDS}`,
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
