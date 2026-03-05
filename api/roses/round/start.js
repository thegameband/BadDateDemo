import { requirePost, readJsonBody, sendJson } from '../_json.js'
import {
  findRoundCandidates,
  getAllProfiles,
  getHistory,
  getProfile,
  getRandomId,
  isCompleteProfile,
  saveRound,
} from '../_state.js'

function candidatePayload(profile, slot) {
  return {
    slot,
    playerId: profile.playerId,
    fields: profile.fields,
  }
}

export default async function handler(req, res) {
  if (!requirePost(req, res)) return

  try {
    const body = await readJsonBody(req)
    const playerId = String(body?.playerId || '').trim()

    if (!playerId) {
      sendJson(res, 400, { error: 'Missing playerId' })
      return
    }

    const [bachelorProfile, allProfiles, history] = await Promise.all([
      getProfile(playerId),
      getAllProfiles(),
      getHistory(playerId),
    ])

    if (!bachelorProfile || !isCompleteProfile(bachelorProfile.fields)) {
      sendJson(res, 400, { error: 'Create and publish your profile before playing Roses.' })
      return
    }

    const candidates = findRoundCandidates({
      allProfiles,
      bachelorId: playerId,
      history,
      nowMs: Date.now(),
    })

    if (candidates.length < 2) {
      sendJson(res, 409, { error: 'Not enough profiles in the pool yet. Please try again soon.' })
      return
    }

    const round = {
      version: 1,
      id: getRandomId('roses_round'),
      bachelorId: playerId,
      candidateIds: [candidates[0].playerId, candidates[1].playerId],
      turnIndex: 0,
      turns: [],
      winnerId: null,
      completed: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }

    await saveRound(round)

    sendJson(res, 200, {
      ok: true,
      round: {
        id: round.id,
        turnIndex: round.turnIndex,
        totalQuestions: 3,
        candidateIds: round.candidateIds,
      },
      candidates: [
        candidatePayload(candidates[0], 'A'),
        candidatePayload(candidates[1], 'B'),
      ],
    })
  } catch (error) {
    console.error('Roses round/start error:', error)
    sendJson(res, 500, { error: 'Failed to start Roses round.' })
  }
}
