/**
 * Chat API Service
 * Handles all communication with the backend server
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api'
const DEFAULT_TIMEOUT = 300000 // 5 minutes
const HEALTH_CHECK_TIMEOUT = 5000 // 5 seconds
const HEALTH_CHECK_CACHE_DURATION = 60000 // Cache health check for 60 seconds

let lastHealthCheckTime = 0
let lastHealthCheckStatus = false

/**
 * Helper function to add timeout to fetch requests
 * @param {string} url - API endpoint URL
 * @param {object} options - Fetch options
 * @param {number} timeout - Timeout in milliseconds
 * @returns {Promise} - Fetch promise with timeout
 */
const fetchWithTimeout = (url, options, timeout = DEFAULT_TIMEOUT) => {
  return Promise.race([
    fetch(url, options),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Request timeout: No response from server after ${timeout}ms`)), timeout)
    ),
  ])
}

/**
 * Send a message to the server and get a response
 * @param {string} message - User message to send
 * @returns {Promise<{text: string, audio: string | null, lipSync: any, sources: string[]}>}
 */
export const sendMessage = async (message) => {
  try {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/chat`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: message.trim(),
          timestamp: new Date().toISOString(),
        }),
      },
      DEFAULT_TIMEOUT
    )

    if (!response.ok) {
      throw new Error(`Server error: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()
    console.log('Server response:', data) // Debug log
    
    // Handle different response formats
    const reply = data.reply || data.message || data.response || data.text || data.content
    
    if (!reply) {
      console.warn('Unexpected response format:', data)
      throw new Error('Server response does not contain expected fields (reply, message, response, text, or content)')
    }

    return {
      text: reply,
      audio: typeof data.audio === 'string' ? data.audio : null,
      lipSync: data.lipSync ?? data.blendShapes ?? data.blendshape ?? null,
      sources: Array.isArray(data.sources) ? data.sources : [],
    }
  } catch (error) {
    console.error('Chat API Error:', error)
    throw error
  }
}

/**
 * Get server status with caching to reduce requests
 * @returns {Promise<boolean>} - Whether server is online
 */
export const checkServerStatus = async () => {
  const now = Date.now()
  
  // Return cached status if still valid (within 30 seconds)
  if (now - lastHealthCheckTime < HEALTH_CHECK_CACHE_DURATION) {
    console.log('[Health Check] Using cached status:', lastHealthCheckStatus, `(cache age: ${now - lastHealthCheckTime}ms)`)
    return lastHealthCheckStatus
  }
  
  console.log('[Health Check] Making fresh request...')
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
    console.log('[Health Check] Result:', response.ok)
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
