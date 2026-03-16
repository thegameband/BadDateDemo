import { requirePost, readJsonBody, sendJson } from '../_json.js'
import {
  buildRankings,
  canEditProfileToday,
  getAllProfiles,
  getHistory,
  getHistoryEntry,
  getProfile,
  isCompleteProfile,
  profileToView,
} from '../_state.js'

export default async function handler(req, res) {
  if (!requirePost(req, res)) return

  try {
    const body = await readJsonBody(req)
    const playerId = String(body?.playerId || '').trim()
    const localDay = String(body?.localDay || '').trim()

    if (!playerId) {
      sendJson(res, 400, { error: 'Missing playerId' })
      return
    }

    const [profile, allProfiles, history] = await Promise.all([
      getProfile(playerId),
      getAllProfiles(),
      getHistory(playerId),
    ])

    const rankings = buildRankings(allProfiles)
    const view = profileToView(profile, rankings)

    const hasPublishedProfile = Boolean(profile && isCompleteProfile(profile.fields))
    const hasCompletedIntroRound = Object.keys(history || {}).length > 0
    const canPlay = true
    const canEditToday = canEditProfileToday(profile, localDay)
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
      profile: view,
      rosesGiven,
      canPlay,
      canPlayIntroRound: !hasPublishedProfile && !hasCompletedIntroRound,
      mustCreateProfileBeforeNextRound: false,
      canEditToday,
      weekKey: rankings.weekKey,
    })
  } catch (error) {
    console.error('Roses profile/get error:', error)
    sendJson(res, 500, { error: 'Failed to load profile.' })
  }
}
