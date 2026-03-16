const PLAYER_STORAGE_KEY = 'roses:player:v1'

function randomPlayerId() {
  const maybeUuid = globalThis?.crypto?.randomUUID?.()
  if (maybeUuid) return maybeUuid
  return `roses_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

export function getOrCreateRosesPlayerId() {
  try {
    const existing = localStorage.getItem(PLAYER_STORAGE_KEY)
    if (existing) {
      const parsed = JSON.parse(existing)
      if (parsed?.playerId && typeof parsed.playerId === 'string') return parsed.playerId
    }
  } catch {
    // Ignore malformed local storage value.
  }

  const playerId = randomPlayerId()
  try {
    localStorage.setItem(PLAYER_STORAGE_KEY, JSON.stringify({ playerId }))
  } catch {
    // Ignore write failures.
  }
  return playerId
}

export function getStoredRosesPlayerId() {
  try {
    const existing = localStorage.getItem(PLAYER_STORAGE_KEY)
    if (!existing) return ''
    const parsed = JSON.parse(existing)
    return typeof parsed?.playerId === 'string' ? parsed.playerId : ''
  } catch {
    return ''
  }
}

export function getBrowserTimezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
}

export function getLocalDayKey(timezone = getBrowserTimezone()) {
  // en-CA gives stable YYYY-MM-DD formatting in modern browsers.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

async function postJson(path, payload) {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {}),
  })

  let data = null
  try {
    data = await response.json()
  } catch {
    data = null
  }

  if (!response.ok) {
    const message = data?.error || `Request failed (${response.status})`
    throw new Error(message)
  }

  return data
}

export async function fetchRosesProfile({ playerId, timezone, localDay }) {
  return postJson('/api/roses/profile/get', { playerId, timezone, localDay })
}

export async function saveRosesProfile({ playerId, timezone, localDay, fields, manualFieldCount }) {
  return postJson('/api/roses/profile/save', {
    playerId,
    timezone,
    localDay,
    fields,
    manualFieldCount,
  })
}

export async function fetchRosesLeaderboard(limit = 25) {
  return postJson('/api/roses/leaderboard/get', { limit })
}

export async function fetchRosesDebugTaglines() {
  return postJson('/api/roses/debug/taglines/get', {})
}

export async function saveRosesDebugTaglines(entries = []) {
  return postJson('/api/roses/debug/taglines/save', { entries })
}

export async function fetchRosesSpeedDatePool({ excludePlayerId = '', limit = 200, includeSeeds = false } = {}) {
  return postJson('/api/roses/pool/get', {
    excludePlayerId,
    limit,
    includeSeeds,
  })
}

export async function startRosesRound({ playerId }) {
  return postJson('/api/roses/round/start', { playerId })
}

export async function submitRosesTurn({ playerId, roundId, question, responses }) {
  return postJson('/api/roses/round/turn', {
    playerId,
    roundId,
    question,
    responses,
  })
}

export async function completeRosesRound({ playerId, roundId, winnerId }) {
  return postJson('/api/roses/round/complete', {
    playerId,
    roundId,
    winnerId,
  })
}
