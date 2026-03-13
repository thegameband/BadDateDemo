import { requirePost, readJsonBody, sendJson } from '../_json.js'
import { buildRankings, getAllProfiles, isCompleteProfile, profileToView } from '../_state.js'

const DEFAULT_LIMIT = 200
const MAX_LIMIT = 300

function normalizeLimit(value) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return DEFAULT_LIMIT
  return Math.max(10, Math.min(MAX_LIMIT, Math.floor(parsed)))
}

function isSeedProfile(profile) {
  return String(profile?.playerId || '').startsWith('seed:')
}

export default async function handler(req, res) {
  if (!requirePost(req, res)) return

  try {
    const body = await readJsonBody(req)
    const limit = normalizeLimit(body?.limit)
    const excludePlayerId = String(body?.excludePlayerId || '').trim()
    const includeSeeds = Boolean(body?.includeSeeds)

    const allProfiles = await getAllProfiles()
    const rankings = buildRankings(allProfiles)

    const profiles = allProfiles
      .filter((profile) => isCompleteProfile(profile?.fields))
      .filter((profile) => !excludePlayerId || String(profile?.playerId || '') !== excludePlayerId)
      .filter((profile) => includeSeeds || !isSeedProfile(profile))
      .sort((left, right) => Number(right?.updatedAt || 0) - Number(left?.updatedAt || 0))
      .slice(0, limit)
      .map((profile) => profileToView(profile, rankings))
      .filter(Boolean)

    sendJson(res, 200, {
      ok: true,
      profiles,
    })
  } catch (error) {
    console.error('Roses pool/get error:', error)
    sendJson(res, 500, { error: 'Failed to load Roses pool.' })
  }
}
