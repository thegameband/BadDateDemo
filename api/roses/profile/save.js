import { requirePost, readJsonBody, sendJson } from '../_json.js'
import {
  buildRankings,
  createOrUpdateProfile,
  getAllProfiles,
  getProfile,
  isCompleteProfile,
  profileToView,
  saveProfile,
} from '../_state.js'

export default async function handler(req, res) {
  if (!requirePost(req, res)) return

  try {
    const body = await readJsonBody(req)
    const playerId = String(body?.playerId || '').trim()
    const timezone = String(body?.timezone || '').trim() || 'UTC'
    const localDay = String(body?.localDay || '').trim()
    const fields = body?.fields || {}
    const manualFieldCount = Number(body?.manualFieldCount || 0)

    if (!playerId) {
      sendJson(res, 400, { error: 'Missing playerId' })
      return
    }

    if (!localDay) {
      sendJson(res, 400, { error: 'Missing localDay' })
      return
    }

    const existingProfile = await getProfile(playerId)

    const result = createOrUpdateProfile({
      existingProfile,
      playerId,
      fields,
      localDay,
      timezone,
      manualFieldCount,
      nowMs: Date.now(),
    })

    if (result.error) {
      const isCooldown = result.error.toLowerCase().includes('once per local calendar day')
      sendJson(res, isCooldown ? 429 : 400, { error: result.error })
      return
    }

    await saveProfile(result.profile)

    const allProfiles = await getAllProfiles()
    const rankings = buildRankings(allProfiles)

    sendJson(res, 200, {
      ok: true,
      profile: profileToView(result.profile, rankings),
      canPlay: isCompleteProfile(result.profile.fields),
      canEditToday: false,
      weekKey: rankings.weekKey,
    })
  } catch (error) {
    console.error('Roses profile/save error:', error)
    sendJson(res, 500, { error: 'Failed to save profile.' })
  }
}
