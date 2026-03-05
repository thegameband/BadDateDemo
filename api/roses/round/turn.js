import { requirePost, readJsonBody, sendJson } from '../_json.js'
import { getRound, saveRound } from '../_state.js'

const MAX_QUESTION_LENGTH = 280
const MAX_RESPONSE_LENGTH = 500
const QUESTION_COUNT = 3

function normalizeResponses(responses = []) {
  if (!Array.isArray(responses)) return []

  return responses
    .map((item) => ({
      candidateId: String(item?.candidateId || '').trim(),
      response: String(item?.response || '').trim().slice(0, MAX_RESPONSE_LENGTH),
    }))
    .filter((item) => item.candidateId && item.response)
}

export default async function handler(req, res) {
  if (!requirePost(req, res)) return

  try {
    const body = await readJsonBody(req)
    const playerId = String(body?.playerId || '').trim()
    const roundId = String(body?.roundId || '').trim()
    const question = String(body?.question || '').trim()
    const responses = normalizeResponses(body?.responses)

    if (!playerId || !roundId) {
      sendJson(res, 400, { error: 'Missing playerId or roundId' })
      return
    }

    if (!question) {
      sendJson(res, 400, { error: 'Missing question text.' })
      return
    }

    const round = await getRound(roundId)
    if (!round || round.id !== roundId) {
      sendJson(res, 404, { error: 'Round not found.' })
      return
    }

    if (!Array.isArray(round?.candidateIds) || round.candidateIds.length !== 2) {
      sendJson(res, 400, { error: 'Invalid round candidate data.' })
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

    if (round.turnIndex >= QUESTION_COUNT) {
      sendJson(res, 400, { error: 'Question limit reached. Choose a winner.' })
      return
    }

    if (responses.length !== 2) {
      sendJson(res, 400, { error: 'Expected responses for both profiles.' })
      return
    }

    const expectedIds = new Set(round.candidateIds.map((id) => String(id)))
    const receivedIds = new Set(responses.map((item) => item.candidateId))
    if (receivedIds.size !== 2) {
      sendJson(res, 400, { error: 'Duplicate profile responses are not allowed.' })
      return
    }

    const receivedAllCandidates = [...receivedIds].every((id) => expectedIds.has(id))
    if (!receivedAllCandidates) {
      sendJson(res, 400, { error: 'Responses must match the current candidate pair.' })
      return
    }

    round.turns.push({
      turnNumber: round.turnIndex + 1,
      question: question.slice(0, MAX_QUESTION_LENGTH),
      answers: responses,
      createdAt: Date.now(),
    })
    round.turnIndex += 1
    round.updatedAt = Date.now()

    await saveRound(round)

    sendJson(res, 200, {
      ok: true,
      round: {
        id: round.id,
        turnIndex: round.turnIndex,
        totalQuestions: QUESTION_COUNT,
        doneAsking: round.turnIndex >= QUESTION_COUNT,
      },
    })
  } catch (error) {
    console.error('Roses round/turn error:', error)
    sendJson(res, 500, { error: 'Failed to submit turn.' })
  }
}
