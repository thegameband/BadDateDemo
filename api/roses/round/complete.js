import { requirePost, readJsonBody, sendJson } from '../_json.js'
import { addKeywordCounts, topKeywords } from '../_keywords.js'
import { currentWeekKey } from '../_keys.js'
import {
  buildRankings,
  getAllProfiles,
  getHistory,
  getProfile,
  getRound,
  saveHistory,
  saveProfile,
  saveRound,
} from '../_state.js'

const QUESTION_COUNT = 3
const DISCORD_TIMEOUT_MS = 2500

function getDiscordWebhookUrl() {
  const rosesWebhook = String(process.env.ROSES_DISCORD_WEBHOOK_URL || '').trim()
  if (rosesWebhook) return rosesWebhook
  return String(process.env.DISCORD_WEBHOOK_URL || '').trim()
}

async function postDiscordRoseAward({ profile, rank, totalProfiles }) {
  const webhookUrl = getDiscordWebhookUrl()
  if (!webhookUrl) return

  const name = String(profile?.fields?.name || '').trim() || 'A profile'
  const roseCount = Number(profile?.stats?.roseCount || 0)
  const safeRank = Number.isFinite(Number(rank)) && Number(rank) > 0 ? Number(rank) : '?'
  const safeTotal = Number.isFinite(Number(totalProfiles)) && Number(totalProfiles) > 0 ? Number(totalProfiles) : '?'
  const line = `${name} just got a Rose! They have ${roseCount} roses, in ${safeRank}/${safeTotal} place.`

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), DISCORD_TIMEOUT_MS)
  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        embeds: [
          {
            description: line,
            color: 0xF43F5E,
          },
        ],
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      const bodyText = await response.text()
      throw new Error(`Webhook responded with ${response.status}: ${bodyText.slice(0, 200)}`)
    }
  } finally {
    clearTimeout(timeout)
  }
}

function getRevealPayload(profile, ranks, weekKey) {
  const weeklyRoses = Number(profile.stats?.weeklyRoses?.[weekKey] || 0)
  return {
    playerId: profile.playerId,
    fields: profile.fields,
    stats: {
      shownCount: Number(profile.stats?.shownCount || 0),
      roseCount: Number(profile.stats?.roseCount || 0),
      weeklyRoses,
      questionCount: Number(profile.stats?.questionCount || 0),
    },
    ranks: {
      allTime: ranks.allTimeRanks?.[profile.playerId] || null,
      weekly: ranks.weeklyRanks?.[profile.playerId] || null,
    },
  }
}

export default async function handler(req, res) {
  if (!requirePost(req, res)) return

  try {
    const body = await readJsonBody(req)
    const playerId = String(body?.playerId || '').trim()
    const roundId = String(body?.roundId || '').trim()
    const winnerId = String(body?.winnerId || '').trim()

    if (!playerId || !roundId || !winnerId) {
      sendJson(res, 400, { error: 'Missing playerId, roundId, or winnerId.' })
      return
    }

    const round = await getRound(roundId)
    if (!round || round.id !== roundId) {
      sendJson(res, 404, { error: 'Round not found.' })
      return
    }

    if (String(round.bachelorId) !== playerId) {
      sendJson(res, 403, { error: 'Not authorized for this round.' })
      return
    }

    if (round.completed) {
      sendJson(res, 400, { error: 'Round already completed.' })
      return
    }

    if (!Array.isArray(round.candidateIds) || round.candidateIds.length !== 2) {
      sendJson(res, 400, { error: 'Invalid round candidate data.' })
      return
    }

    if (!round.candidateIds.includes(winnerId)) {
      sendJson(res, 400, { error: 'Winner is not one of the candidates.' })
      return
    }

    if ((Number(round.turnIndex) || 0) < QUESTION_COUNT || !Array.isArray(round.turns) || round.turns.length < QUESTION_COUNT) {
      sendJson(res, 400, { error: 'Round is incomplete. Finish all 3 questions first.' })
      return
    }

    const loserId = String(round.candidateIds.find((id) => String(id) !== winnerId))

    const [winnerProfile, loserProfile] = await Promise.all([
      getProfile(winnerId),
      getProfile(loserId),
    ])

    if (!winnerProfile || !loserProfile) {
      sendJson(res, 404, { error: 'Candidate profile no longer exists.' })
      return
    }

    const weekKey = currentWeekKey(Date.now())
    const turnsByCandidate = {
      [winnerId]: [],
      [loserId]: [],
    }

    round.turns.forEach((turn) => {
      const questionText = String(turn?.question || '')
      const answers = Array.isArray(turn?.answers) ? turn.answers : []
      answers.forEach((answer) => {
        const candidateId = String(answer?.candidateId || '')
        if (!turnsByCandidate[candidateId]) return
        turnsByCandidate[candidateId].push({
          question: questionText,
          response: String(answer?.response || ''),
        })
      })
    })

    const updateCandidateStats = (profile, turns, gotRose) => {
      const stats = profile.stats || {}
      const weeklyRoses = { ...(stats.weeklyRoses || {}) }
      const shownCount = Number(stats.shownCount || 0) + 1
      const roseCount = Number(stats.roseCount || 0) + (gotRose ? 1 : 0)
      const questionCount = Number(stats.questionCount || 0) + (Array.isArray(turns) ? turns.length : 0)
      if (gotRose) {
        weeklyRoses[weekKey] = Number(weeklyRoses[weekKey] || 0) + 1
      }

      let keywordCounts = { ...(stats.keywordCounts || {}) }
      ;(Array.isArray(turns) ? turns : []).forEach((turn) => {
        keywordCounts = addKeywordCounts(keywordCounts, String(turn.question || ''))
      })

      profile.stats = {
        ...stats,
        shownCount,
        roseCount,
        questionCount,
        weeklyRoses,
        keywordCounts,
      }
      profile.sentimentKeywords = topKeywords(keywordCounts, 32)
      profile.updatedAt = Date.now()
    }

    updateCandidateStats(winnerProfile, turnsByCandidate[winnerId], true)
    updateCandidateStats(loserProfile, turnsByCandidate[loserId], false)

    await Promise.all([
      saveProfile(winnerProfile),
      saveProfile(loserProfile),
    ])

    const history = await getHistory(playerId)
    history[winnerId] = Date.now()
    history[loserId] = Date.now()
    await saveHistory(playerId, history)

    round.completed = true
    round.winnerId = winnerId
    round.loserId = loserId
    round.completedAt = Date.now()
    round.updatedAt = Date.now()
    await saveRound(round)

    const allProfiles = await getAllProfiles()
    const rankings = buildRankings(allProfiles)

    try {
      await postDiscordRoseAward({
        profile: winnerProfile,
        rank: rankings.allTimeRanks?.[winnerId],
        totalProfiles: rankings.allTimeSorted?.length || 0,
      })
    } catch (discordError) {
      console.error('Roses Discord webhook error:', discordError)
    }

    sendJson(res, 200, {
      ok: true,
      reveal: {
        loser: getRevealPayload(loserProfile, rankings, rankings.weekKey),
        winner: getRevealPayload(winnerProfile, rankings, rankings.weekKey),
      },
      weekKey: rankings.weekKey,
    })
  } catch (error) {
    console.error('Roses round/complete error:', error)
    sendJson(res, 500, { error: 'Failed to complete round.' })
  }
}
