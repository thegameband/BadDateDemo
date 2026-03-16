import { requirePost, readJsonBody, sendJson } from '../../_json.js'
import { getAllProfiles, saveProfile } from '../../_state.js'

export default async function handler(req, res) {
  if (!requirePost(req, res)) return

  try {
    const body = await readJsonBody(req)
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
  } catch (error) {
    console.error('Roses debug/taglines/save error:', error)
    sendJson(res, 500, { error: 'Failed to save Roses taglines.' })
  }
}
