import http from 'node:http'

const PORT = Number(process.env.PORT || 3000)
const SLACK_BOT_TOKEN = String(process.env.SLACK_BOT_TOKEN || '').trim()
const SLACK_CHANNEL_ID = String(process.env.SLACK_CHANNEL_ID || '').trim()
const SHARED_SECRET = String(process.env.NOTIFIER_SHARED_SECRET || '').trim()

function writeJson(res, status, payload) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json')
  res.end(JSON.stringify(payload))
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (chunk) => {
      chunks.push(chunk)
      if (Buffer.concat(chunks).length > 1024 * 1024) {
        reject(new Error('Request body too large'))
      }
    })
    req.on('error', reject)
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8')
        resolve(raw ? JSON.parse(raw) : {})
      } catch (error) {
        reject(new Error('Invalid JSON body'))
      }
    })
  })
}

function buildRoseLine(payload = {}) {
  if (payload?.message && String(payload.message).trim()) {
    return String(payload.message).trim()
  }

  const profileName = String(payload?.profileName || '').trim() || 'A profile'
  const roseCount = Number(payload?.roseCount || 0)
  const rank = Number.isFinite(Number(payload?.rank)) && Number(payload.rank) > 0 ? Number(payload.rank) : '?'
  const totalProfiles = Number.isFinite(Number(payload?.totalProfiles)) && Number(payload.totalProfiles) > 0
    ? Number(payload.totalProfiles)
    : '?'
  return `${profileName} just got a Rose! They have ${roseCount} roses, in ${rank}/${totalProfiles} place.`
}

async function postToSlack(text) {
  if (!SLACK_BOT_TOKEN || !SLACK_CHANNEL_ID) {
    throw new Error('Missing SLACK_BOT_TOKEN or SLACK_CHANNEL_ID')
  }

  const response = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${SLACK_BOT_TOKEN}`,
      'content-type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({
      channel: SLACK_CHANNEL_ID,
      text,
      unfurl_links: false,
      unfurl_media: false,
    }),
  })

  const data = await response.json().catch(() => null)
  if (!response.ok || !data?.ok) {
    throw new Error(`Slack API error (${response.status}): ${JSON.stringify(data)}`)
  }
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/healthz') {
      writeJson(res, 200, { ok: true })
      return
    }

    if (req.method !== 'POST' || req.url !== '/notify/rose') {
      writeJson(res, 404, { error: 'Not found' })
      return
    }

    if (SHARED_SECRET) {
      const incomingSecret = String(req.headers['x-roses-notifier-secret'] || '').trim()
      if (!incomingSecret || incomingSecret !== SHARED_SECRET) {
        writeJson(res, 401, { error: 'Unauthorized' })
        return
      }
    }

    const body = await readBody(req)
    const text = buildRoseLine(body)
    await postToSlack(text)
    writeJson(res, 200, { ok: true })
  } catch (error) {
    console.error('Notifier error:', error)
    writeJson(res, 500, { error: 'Notifier failed' })
  }
})

server.listen(PORT, () => {
  console.log(`Roses Slack notifier listening on ${PORT}`)
})
