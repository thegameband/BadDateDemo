const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions'
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'
const DEFAULT_OPENAI_MODEL = process.env.OPENAI_MODEL || process.env.VITE_OPENAI_MODEL || 'gpt-5.2'
const DEFAULT_ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-4-6'

function readSecret(name) {
  const value = process.env[name]
  return typeof value === 'string' ? value.trim() : ''
}

function readJsonBody(req) {
  if (req?.body && typeof req.body === 'object') return Promise.resolve(req.body)

  if (typeof req?.body === 'string' && req.body.trim()) {
    try {
      return Promise.resolve(JSON.parse(req.body))
    } catch {
      return Promise.resolve({})
    }
  }

  return new Promise((resolve) => {
    let raw = ''
    req.on('data', (chunk) => {
      raw += chunk
    })
    req.on('end', () => {
      if (!raw.trim()) {
        resolve({})
        return
      }
      try {
        resolve(JSON.parse(raw))
      } catch {
        resolve({})
      }
    })
    req.on('error', () => resolve({}))
  })
}

function sendJson(res, statusCode, payload, extraHeaders = {}) {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  Object.entries(extraHeaders).forEach(([key, value]) => {
    if (value != null && value !== '') {
      res.setHeader(key, String(value))
    }
  })
  res.end(JSON.stringify(payload))
}

function getProviderConfig(provider) {
  const openaiKey = readSecret('OPENAI_API_KEY') || readSecret('VITE_OPENAI_API_KEY')
  const anthropicKey = readSecret('ANTHROPIC_API_KEY') || readSecret('VITE_ANTHROPIC_API_KEY')

  if (provider === 'openai') {
    if (!openaiKey) return null
    return {
      provider: 'openai',
      apiUrl: OPENAI_API_URL,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiKey}`,
      },
      model: DEFAULT_OPENAI_MODEL,
    }
  }

  if (provider === 'anthropic') {
    if (!anthropicKey) return null
    return {
      provider: 'anthropic',
      apiUrl: ANTHROPIC_API_URL,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      model: DEFAULT_ANTHROPIC_MODEL,
    }
  }

  return null
}

function pickProvider(requestedProvider) {
  const normalized = String(requestedProvider || '').trim().toLowerCase()
  if (normalized === 'openai' || normalized === 'anthropic') return normalized

  const openaiAvailable = Boolean(readSecret('OPENAI_API_KEY') || readSecret('VITE_OPENAI_API_KEY'))
  if (openaiAvailable) return 'openai'

  const anthropicAvailable = Boolean(readSecret('ANTHROPIC_API_KEY') || readSecret('VITE_ANTHROPIC_API_KEY'))
  if (anthropicAvailable) return 'anthropic'

  return 'openai'
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    sendJson(res, 405, { error: 'Method not allowed' })
    return
  }

  const payload = await readJsonBody(req)
  const requestedProvider = String(payload?.provider || 'auto').trim().toLowerCase()
  const provider = pickProvider(requestedProvider)
  const providerConfig = getProviderConfig(provider)

  if (!providerConfig) {
    sendJson(
      res,
      503,
      { error: 'missing_api_key', provider },
      {
        'x-llm-provider': provider,
        'x-llm-error-code': 'missing_api_key',
      }
    )
    return
  }

  const providerBody = (payload && typeof payload.body === 'object' && payload.body) ? { ...payload.body } : null
  if (!providerBody) {
    sendJson(res, 400, { error: 'Invalid request body.' }, { 'x-llm-provider': provider })
    return
  }

  if (!providerBody.model) {
    providerBody.model = providerConfig.model
  }

  try {
    const upstreamResponse = await fetch(providerConfig.apiUrl, {
      method: 'POST',
      headers: providerConfig.headers,
      body: JSON.stringify(providerBody),
    })

    const bodyText = await upstreamResponse.text()
    const contentType = upstreamResponse.headers.get('content-type') || 'application/json; charset=utf-8'
    const requestId = upstreamResponse.headers.get('request-id') || upstreamResponse.headers.get('x-request-id') || ''

    res.statusCode = upstreamResponse.status
    res.setHeader('Content-Type', contentType)
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('x-llm-provider', provider)
    if (requestId) {
      res.setHeader('x-request-id', requestId)
    }
    res.end(bodyText)
  } catch (error) {
    sendJson(res, 502, {
      error: 'upstream_request_failed',
      message: error?.message || 'Unknown error',
      provider,
    }, {
      'x-llm-provider': provider,
      'x-llm-error-code': 'upstream_request_failed',
    })
  }
}
