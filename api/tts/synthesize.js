const DEFAULT_VOICE_BY_SPEAKER = {
  dater: 'EXAVITQu4vr4xnSDxMaL',
  avatar: 'TX3LPaxmHKxFdv7VOQHJ',
  narrator: process.env.ELEVENLABS_NARRATOR_VOICE_ID || process.env.VITE_ELEVENLABS_NARRATOR_VOICE_ID || 'XB0fDUnXU5powFXDhCwa',
}

const MAX_TEXT_LENGTH = 1500

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

function resolveVoiceId(rawVoiceId, speaker) {
  const cleaned = String(rawVoiceId || '').trim()
  if (cleaned && /^[A-Za-z0-9]+$/.test(cleaned)) return cleaned
  return DEFAULT_VOICE_BY_SPEAKER[speaker] || DEFAULT_VOICE_BY_SPEAKER.avatar
}

function getVoiceSettings(speaker) {
  if (speaker === 'dater') {
    return {
      stability: 0.35,
      similarity_boost: 0.75,
      style: 0.75,
      use_speaker_boost: true,
    }
  }

  if (speaker === 'narrator') {
    return {
      stability: 0.55,
      similarity_boost: 0.75,
      style: 0.5,
      use_speaker_boost: true,
    }
  }

  return {
    stability: 0.5,
    similarity_boost: 0.75,
    style: 0.5,
    use_speaker_boost: true,
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    sendJson(res, 405, { error: 'Method not allowed' })
    return
  }

  const apiKey = readSecret('ELEVENLABS_API_KEY') || readSecret('VITE_ELEVENLABS_API_KEY')
  if (!apiKey) {
    sendJson(
      res,
      503,
      { error: 'missing_api_key' },
      { 'x-tts-error-code': 'missing_api_key' }
    )
    return
  }

  const payload = await readJsonBody(req)
  const text = String(payload?.text || '').trim()
  const speaker = String(payload?.speaker || 'avatar').trim().toLowerCase()
  const voiceId = resolveVoiceId(payload?.voiceId, speaker)

  if (!text) {
    sendJson(res, 400, { error: 'Missing text.' })
    return
  }

  if (text.length > MAX_TEXT_LENGTH) {
    sendJson(res, 400, { error: `Text too long (max ${MAX_TEXT_LENGTH} chars).` })
    return
  }

  try {
    const upstreamResponse = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text,
          model_id: 'eleven_multilingual_v2',
          voice_settings: getVoiceSettings(speaker),
        }),
      }
    )

    if (!upstreamResponse.ok) {
      const errorText = await upstreamResponse.text()
      sendJson(res, upstreamResponse.status, {
        error: 'elevenlabs_error',
        details: errorText.slice(0, 3000),
      })
      return
    }

    const audioArrayBuffer = await upstreamResponse.arrayBuffer()
    const audioBuffer = Buffer.from(audioArrayBuffer)
    const contentType = upstreamResponse.headers.get('content-type') || 'audio/mpeg'

    res.statusCode = 200
    res.setHeader('Content-Type', contentType)
    res.setHeader('Cache-Control', 'no-store')
    res.end(audioBuffer)
  } catch (error) {
    sendJson(res, 502, {
      error: 'upstream_request_failed',
      message: error?.message || 'Unknown error',
    })
  }
}
