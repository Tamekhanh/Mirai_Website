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

let lastHealthCheckTime = 0
let lastHealthCheckStatus = false

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
        }),
      },
      DEFAULT_TIMEOUT
    )

    if (!response.ok) {
      const serverError = new Error(`Server error: ${response.status} ${response.statusText}`)
      serverError.status = response.status
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

/**
 * Get server status with caching to reduce requests
 * @returns {Promise<boolean>} - Whether server is online
 */
export const checkServerStatus = async () => {
  const now = Date.now()
  
  // Return cached status if still valid (within HEALTH_CHECK_CACHE_DURATION)
  if (now - lastHealthCheckTime < HEALTH_CHECK_CACHE_DURATION) {
    return lastHealthCheckStatus
  }

  try {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/health`,
      {
        method: 'GET',
      },
      HEALTH_CHECK_TIMEOUT
    )
    lastHealthCheckStatus = response.ok
    lastHealthCheckTime = now
    return response.ok
  } catch (error) {
    console.error('[Health Check] Failed:', error.message)
    lastHealthCheckStatus = false
    lastHealthCheckTime = now
    return false
  }
}

/**
 * Force a fresh health check without using cache
 * @returns {Promise<boolean>} - Whether server is online
 */
export const forceHealthCheck = async () => {
  lastHealthCheckTime = 0 // Clear cache
  return checkServerStatus()
}
