import { requirePost, readJsonBody, sendJson } from '../_json.js'
import { buildRankings, getAllProfiles } from '../_state.js'

function toEntry(profile, allTimeRank, weeklyRank, weekKey) {
  return {
    playerId: profile.playerId,
    name: profile.fields?.name || 'Unknown',
    age: Number(profile.fields?.age || 0),
    pronouns: profile.fields?.pronouns || '',
    occupation: profile.fields?.occupation || '',
    introTagline: profile.fields?.introTagline || '',
    stats: {
      roseCount: Number(profile.stats?.roseCount || 0),
      shownCount: Number(profile.stats?.shownCount || 0),
      weeklyRoses: Number(profile.stats?.weeklyRoses?.[weekKey] || 0),
    },
    ranks: {
      allTime: allTimeRank,
      weekly: weeklyRank,
    },
  }
}

export default async function handler(req, res) {
  if (!requirePost(req, res)) return

  try {
    const body = await readJsonBody(req)
    const limitRaw = Number(body?.limit || 25)
    const limit = Number.isFinite(limitRaw) ? Math.max(5, Math.min(100, Math.floor(limitRaw))) : 25

    const allProfiles = await getAllProfiles()
    const rankings = buildRankings(allProfiles)

    const allTime = rankings.allTimeSorted
      .slice(0, limit)
      .map((profile) => toEntry(profile, rankings.allTimeRanks[profile.playerId], rankings.weeklyRanks[profile.playerId], rankings.weekKey))

    const weekly = rankings.weeklySorted
      .slice(0, limit)
      .map((profile) => toEntry(profile, rankings.allTimeRanks[profile.playerId], rankings.weeklyRanks[profile.playerId], rankings.weekKey))

    sendJson(res, 200, {
      ok: true,
      weekKey: rankings.weekKey,
      allTime,
      weekly,
    })
  } catch (error) {
    console.error('Roses leaderboard/get error:', error)
    sendJson(res, 500, { error: 'Failed to load leaderboard.' })
  }
}
