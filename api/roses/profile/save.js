import { requirePost, readJsonBody, sendJson } from '../_json.js'
import {
  buildRankings,
  canEditProfileToday,
  createOrUpdateProfile,
  getAllProfiles,
  getHistory,
  getHistoryEntry,
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

    const [allProfiles, history] = await Promise.all([
      getAllProfiles(),
      getHistory(playerId),
    ])
    const rankings = buildRankings(allProfiles)
    const rosesGiven = allProfiles
      .map((candidateProfile) => {
        const entry = getHistoryEntry(history, candidateProfile?.playerId)
        return {
          playerId: String(candidateProfile?.playerId || ''),
          name: String(candidateProfile?.fields?.name || '').trim() || 'Unknown',
          count: Number(entry.rosesGiven || 0),
        }
      })
      .filter((entry) => entry.playerId && entry.count > 0)
      .sort((a, b) => {
        if (a.count !== b.count) return b.count - a.count
        return a.name.localeCompare(b.name)
      })

    sendJson(res, 200, {
      ok: true,
      profile: profileToView(result.profile, rankings),
      rosesGiven,
      canPlay: isCompleteProfile(result.profile.fields),
      canEditToday: canEditProfileToday(result.profile, localDay),
      weekKey: rankings.weekKey,
    })
  } catch (error) {
    console.error('Roses profile/save error:', error)
    sendJson(res, 500, { error: 'Failed to save profile.' })
  }
}
