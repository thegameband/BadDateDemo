import { requirePost, readJsonBody, sendJson } from '../_json.js'
import {
  buildRankings,
  canEditProfileToday,
  getAllProfiles,
  getHistory,
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
    const canPlay = hasPublishedProfile
    const canEditToday = canEditProfileToday(profile, localDay)

    sendJson(res, 200, {
      ok: true,
      profile: view,
      canPlay,
      canPlayIntroRound: !hasPublishedProfile && !hasCompletedIntroRound,
      mustCreateProfileBeforeNextRound: !hasPublishedProfile && hasCompletedIntroRound,
      canEditToday,
      weekKey: rankings.weekKey,
    })
  } catch (error) {
    console.error('Roses profile/get error:', error)
    sendJson(res, 500, { error: 'Failed to load profile.' })
  }
}
