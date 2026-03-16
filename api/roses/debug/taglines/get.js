import { requirePost, sendJson } from '../../_json.js'
import { getAllProfiles } from '../../_state.js'

function compareProfiles(a, b) {
  const nameA = String(a?.fields?.name || '').trim().toLowerCase()
  const nameB = String(b?.fields?.name || '').trim().toLowerCase()
  return nameA.localeCompare(nameB)
}

export default async function handler(req, res) {
  if (!requirePost(req, res)) return

  try {
    const profiles = await getAllProfiles()
    const entries = profiles
      .filter((profile) => profile?.playerId && profile?.fields)
      .sort(compareProfiles)
      .map((profile) => ({
        playerId: String(profile.playerId),
        name: String(profile.fields?.name || '').trim() || 'Unknown',
        occupation: String(profile.fields?.occupation || '').trim(),
        introTagline: String(profile.fields?.introTagline || ''),
      }))

    sendJson(res, 200, {
      ok: true,
      entries,
    })
  } catch (error) {
    console.error('Roses debug/taglines/get error:', error)
    sendJson(res, 500, { error: 'Failed to load Roses taglines.' })
  }
}
