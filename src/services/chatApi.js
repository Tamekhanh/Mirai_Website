/**
 * Chat API Service
 * Handles all communication with the backend server
 */

const normalizeApiBaseUrl = (value) => {
  const rawValue = String(value ?? '').trim()

  if (!rawValue) {
    return ''
  }

  return rawValue.replace(/\/+$/, '')
}

const API_BASE_URL = normalizeApiBaseUrl(import.meta.env.VITE_API_URL)
const DEFAULT_TIMEOUT = 120000 // 2 minutes (covers HF Space cold start)
const HEALTH_CHECK_TIMEOUT = 5000 // 5 seconds
const HEALTH_CHECK_CACHE_DURATION = 60000 // Cache health check for 60 seconds
const MIRAI_MAX_TOKENS = Number(import.meta.env.VITE_MIRAI_MAX_TOKENS || 128)
const MIRAI_MAX_WORDS = Number(import.meta.env.VITE_MIRAI_MAX_WORDS || 40)
const MIRAI_MODEL = String(import.meta.env.VITE_MIRAI_MODEL || '').trim()

export const SERVER_STATE = Object.freeze({ ONLINE: 'online', LOADING: 'loading', OFFLINE: 'offline' })

// Khi Space đang nạp model thì hỏi lại sớm hơn để người dùng thấy trạng thái chuyển sang Online.
const HEALTH_RETRY_DURATION = 10000

let lastHealthCheckTime = 0
let lastHealthCheckState = SERVER_STATE.OFFLINE

const parseRetryAfter = (value) => {
  const seconds = Number(value)
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null
}

// Backend (FastAPI) trả { detail }, Worker trả { error }: đọc cả hai thành một chuỗi.
const readErrorDetail = async (response) => {
  try {
    const data = await response.json()
    const detail = data?.error ?? data?.detail
    return typeof detail === 'string' ? detail : null
  } catch {
    return null
  }
}

export class ChatTimeoutError extends Error {
  constructor() {
    super('Request timeout')
    this.name = 'ChatTimeoutError'
  }
}

/**
 * Fetch with a real abort-based timeout. An optional caller signal can cancel it too.
 * @param {string} url - API endpoint URL
 * @param {object} options - Fetch options (may include `signal`)
 * @param {number} timeout - Timeout in milliseconds
 * @returns {Promise<Response>}
 */
const fetchWithTimeout = async (url, options = {}, timeout = DEFAULT_TIMEOUT) => {
  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeout)

  const { signal: callerSignal, ...fetchOptions } = options
  const forwardAbort = () => controller.abort()
  if (callerSignal) {
    if (callerSignal.aborted) {
      controller.abort()
    } else {
      callerSignal.addEventListener('abort', forwardAbort, { once: true })
    }
  }

  try {
    return await fetch(url, { ...fetchOptions, signal: controller.signal })
  } catch (error) {
    if (timedOut) {
      throw new ChatTimeoutError()
    }
    throw error
  } finally {
    clearTimeout(timer)
    callerSignal?.removeEventListener('abort', forwardAbort)
  }
}

/**
 * Send a message to the server and get a response
 * @param {string} message - User message to send
 * @param {{history?: {role: 'user' | 'assistant', content: string}[], model?: string, signal?: AbortSignal}} [options]
 * @returns {Promise<{text: string, audio: string | null, lipSync: any, sources: string[]}>}
 */
export const sendMessage = async (message, { history = [], model = MIRAI_MODEL, signal } = {}) => {
  try {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/chat`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        signal,
        body: JSON.stringify({
          message: message.trim(),
          history,
          model: model || undefined,
          max_words: MIRAI_MAX_WORDS,
          max_tokens: MIRAI_MAX_TOKENS,
          // Chữ hiện ngay khi LLM xong; audio lấy riêng bằng fetchSpeech().
          tts: false,
        }),
      },
      DEFAULT_TIMEOUT
    )

    if (!response.ok) {
      const serverError = new Error(`Server error: ${response.status} ${response.statusText}`)
      serverError.status = response.status
      serverError.retryAfter = parseRetryAfter(response.headers.get('retry-after'))
      serverError.detail = await readErrorDetail(response)
      throw serverError
    }

    const data = await response.json()

    // Handle different response formats
    const reply = data.reply || data.message || data.response || data.text || data.content
    
    if (!reply) {
      console.warn('Unexpected response format:', data)
      throw new Error('Server response does not contain expected fields (reply, message, response, text, or content)')
    }

    return {
      text: reply,
      emotion: typeof data.emotion === 'string' ? data.emotion.trim().toLowerCase() : null,
      audio: typeof data.audio === 'string' ? data.audio : null,
      lipSync: data.lipSync ?? data.blendShapes ?? data.blendshape ?? null,
      sources: Array.isArray(data.sources) ? data.sources : [],
    }
  } catch (error) {
    if (error?.name !== 'AbortError') {
      console.error('Chat API Error:', error)
    }
    throw error
  }
}

const SPEECH_TIMEOUT = 30000

/**
 * Synthesize speech for a reply that was already shown as text.
 * Never throws for server problems: speech is optional, so failures resolve to null.
 * @param {string} text - Reply text to speak
 * @param {{signal?: AbortSignal}} [options]
 * @returns {Promise<{audio: string, lipSync: any} | null>}
 */
export const fetchSpeech = async (text, { signal } = {}) => {
  try {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/tts`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal,
        body: JSON.stringify({ text }),
      },
      SPEECH_TIMEOUT
    )

    if (!response.ok) {
      return null
    }

    const data = await response.json()
    if (typeof data.audio !== 'string' || !data.audio) {
      return null
    }

    return { audio: data.audio, lipSync: data.lipSync ?? null }
  } catch (error) {
    if (error?.name !== 'AbortError') {
      console.warn('[TTS] Speech unavailable:', error.message)
    }
    return null
  }
}

/**
 * Get server state with caching to reduce requests.
 * 'loading' = backend reachable but the model is still starting (HTTP 503 from /health).
 * @returns {Promise<'online' | 'loading' | 'offline'>}
 */
export const getServerState = async () => {
  const now = Date.now()
  const cacheDuration =
    lastHealthCheckState === SERVER_STATE.ONLINE ? HEALTH_CHECK_CACHE_DURATION : HEALTH_RETRY_DURATION

  // Return cached state if still valid
  if (now - lastHealthCheckTime < cacheDuration) {
    return lastHealthCheckState
  }

  let state = SERVER_STATE.OFFLINE
  try {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/health`,
      {
        method: 'GET',
      },
      HEALTH_CHECK_TIMEOUT
    )
    if (response.ok) {
      state = SERVER_STATE.ONLINE
    } else if (response.status === 503) {
      state = SERVER_STATE.LOADING
    }
  } catch (error) {
    console.error('[Health Check] Failed:', error.message)
  }

  lastHealthCheckState = state
  lastHealthCheckTime = now
  return state
}

/**
 * Whether the server is fully online (model loaded).
 * @returns {Promise<boolean>}
 */
export const checkServerStatus = async () => (await getServerState()) === SERVER_STATE.ONLINE

/**
 * Force a fresh health check without using cache
 * @returns {Promise<'online' | 'loading' | 'offline'>}
 */
export const forceHealthCheck = async () => {
  lastHealthCheckTime = 0 // Clear cache
  return getServerState()
}
