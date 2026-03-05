import { requirePost, readJsonBody, sendJson } from '../_json.js'
import { buildRankings, canEditProfileToday, getAllProfiles, getProfile, isCompleteProfile, profileToView } from '../_state.js'

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

    const [profile, allProfiles] = await Promise.all([
      getProfile(playerId),
      getAllProfiles(),
    ])

    const rankings = buildRankings(allProfiles)
    const view = profileToView(profile, rankings)

    const canPlay = Boolean(profile && isCompleteProfile(profile.fields))
    const canEditToday = canEditProfileToday(profile, localDay)

    sendJson(res, 200, {
      ok: true,
      profile: view,
      canPlay,
      canEditToday,
      weekKey: rankings.weekKey,
    })
  } catch (error) {
    console.error('Roses profile/get error:', error)
    sendJson(res, 500, { error: 'Failed to load profile.' })
  }
}
