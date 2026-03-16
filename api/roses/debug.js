import { requirePost, readJsonBody, sendJson } from './_json.js'
import { getAllProfiles, saveProfile } from './_state.js'

function compareProfiles(a, b) {
  const nameA = String(a?.fields?.name || '').trim().toLowerCase()
  const nameB = String(b?.fields?.name || '').trim().toLowerCase()
  return nameA.localeCompare(nameB)
}

function buildTaglineEntries(profiles = []) {
  return profiles
    .filter((profile) => profile?.playerId && profile?.fields)
    .sort(compareProfiles)
    .map((profile) => ({
      playerId: String(profile.playerId),
      name: String(profile.fields?.name || '').trim() || 'Unknown',
      occupation: String(profile.fields?.occupation || '').trim(),
      introTagline: String(profile.fields?.introTagline || ''),
    }))
}

async function handleGetTaglines(res) {
  const profiles = await getAllProfiles()
  sendJson(res, 200, {
    ok: true,
    entries: buildTaglineEntries(profiles),
  })
}

async function handleSaveTaglines(body, res) {
  const updates = Array.isArray(body?.entries) ? body.entries : []

  if (!updates.length) {
    sendJson(res, 200, { ok: true, savedCount: 0 })
    return
  }

  const updateMap = new Map(
    updates
      .map((entry) => [String(entry?.playerId || ''), String(entry?.introTagline || '').trim()])
      .filter(([playerId]) => playerId),
  )

  const profiles = await getAllProfiles()
  let savedCount = 0

  for (const profile of profiles) {
    const playerId = String(profile?.playerId || '')
    if (!updateMap.has(playerId)) continue

    const nextTagline = updateMap.get(playerId) || ''
    if (String(profile?.fields?.introTagline || '') === nextTagline) continue

    await saveProfile({
      ...profile,
      updatedAt: Date.now(),
      fields: {
        ...(profile.fields || {}),
        introTagline: nextTagline,
      },
    })
    savedCount += 1
  }

  sendJson(res, 200, {
    ok: true,
    savedCount,
  })
}

export default async function handler(req, res) {
  if (!requirePost(req, res)) return

  try {
    const body = await readJsonBody(req)
    const action = String(body?.action || '').trim()

    if (action === 'getTaglines') {
      await handleGetTaglines(res)
      return
    }

    if (action === 'saveTaglines') {
      await handleSaveTaglines(body, res)
      return
    }

    sendJson(res, 400, { error: 'Unknown Roses debug action.' })
  } catch (error) {
    console.error('Roses debug error:', error)
    sendJson(res, 500, { error: 'Failed to process Roses debug request.' })
  }
}
