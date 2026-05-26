const SPACE_API_BASE_URL = 'https://tamek-mirai.hf.space'

const FORWARDED_HEADERS = ['content-type', 'accept', 'authorization']

const buildUpstreamHeaders = (request, env) => {
  const headers = new Headers()

  FORWARDED_HEADERS.forEach((headerName) => {
    const headerValue = request.headers.get(headerName)
    if (headerValue) {
      headers.set(headerName, headerValue)
    }
  })

  if (env?.SPACE_API_KEY) {
    headers.set('authorization', `Bearer ${env.SPACE_API_KEY}`)
  }

  return headers
}

const proxyRequest = async (request, env, path) => {
  const upstreamUrl = new URL(path, SPACE_API_BASE_URL)
  const headers = buildUpstreamHeaders(request, env)
  const hasBody = !['GET', 'HEAD'].includes(request.method)

  return fetch(upstreamUrl, {
    method: request.method,
    headers,
    body: hasBody ? await request.clone().arrayBuffer() : undefined,
    redirect: 'follow',
  })
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)

    if (url.pathname === '/chat' || url.pathname === '/api/chat') {
      return proxyRequest(request, env, '/chat')
    }

    if (url.pathname === '/health' || url.pathname === '/api/health') {
      return proxyRequest(request, env, '/health')
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