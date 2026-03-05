import {
  currentWeekKey,
  historyKey,
  profileIndexKey,
  profileKey,
  ROSES_HISTORY_TTL_SECONDS,
  ROSES_PROFILE_TTL_SECONDS,
  roundKey,
  ROSES_ROUND_TTL_SECONDS,
} from './_keys.js'
import { kvGetJSON, kvSetJSON } from './_storage.js'
import { daters } from '../../src/data/daters.js'

export const PROFILE_FIELDS = [
  'name',
  'age',
  'pronouns',
  'occupation',
  'bio',
  'introTagline',
]

const SEED_PROFILE_IDS = {
  Adam: 'seed:adam',
  Kickflip: 'seed:kickflip',
}

const SEED_PROFILE_HINTS = {
  Adam: {
    occupation: 'In Between Jobs',
  },
  Kickflip: {
    occupation: 'Extreme Stunt Streamer',
  },
}

let seedBootstrapPromise = null

function toSingleLine(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function clipText(value, maxLength) {
  const text = toSingleLine(value)
  if (!maxLength || text.length <= maxLength) return text
  return text.slice(0, maxLength).trimEnd()
}

function buildSeedBios(dater) {
  const description = toSingleLine(dater?.description)
  const values = toSingleLine(dater?.values)
  const hometown = toSingleLine(dater?.hometown)
  const hometownSuffix = hometown ? ` Based in ${hometown}.` : ''
  return clipText(`${description}${hometownSuffix} ${values}`.trim(), 620)
}

function createEmptyStats() {
  return {
    shownCount: 0,
    roseCount: 0,
    questionCount: 0,
    weeklyRoses: {},
    keywordCounts: {},
  }
}

function normalizeStats(stats = {}) {
  return {
    shownCount: Number(stats?.shownCount || 0),
    roseCount: Number(stats?.roseCount || 0),
    questionCount: Number(stats?.questionCount || 0),
    weeklyRoses: { ...(stats?.weeklyRoses || {}) },
    keywordCounts: { ...(stats?.keywordCounts || {}) },
  }
}

function buildSeedProfileTemplates(nowMs = Date.now()) {
  const sourceNames = ['Adam', 'Kickflip']
  const templates = []

  sourceNames.forEach((sourceName) => {
    const dater = daters.find((item) => String(item?.name) === sourceName)
    if (!dater) return

    const hints = SEED_PROFILE_HINTS[sourceName] || {}
    const occupation = toSingleLine(
      dater?.dropALineProfile?.occupation ||
      hints.occupation ||
      dater?.archetype ||
      'Professional',
    )
    const bio = buildSeedBios(dater)
    const playerId = SEED_PROFILE_IDS[sourceName] || `seed:${String(dater.name || '').toLowerCase()}`

    templates.push({
      version: 1,
      playerId,
      createdAt: nowMs,
      updatedAt: nowMs,
      lastEditedLocalDay: null,
      firstPublishedLocalDay: null,
      firstDayEditUsed: false,
      lastEditedTimezone: 'UTC',
      fields: normalizeProfileFields({
        name: dater?.name,
        age: dater?.age,
        pronouns: dater?.pronouns,
        occupation,
        bio,
        introTagline: dater?.tagline,
      }),
      stats: createEmptyStats(),
      sentimentKeywords: [],
    })
  })

  return templates
}

function toTrimmed(value) {
  return String(value ?? '').trim()
}

export function normalizeProfileFields(input = {}) {
  const normalized = {
    name: toTrimmed(input.name),
    age: Number.parseInt(String(input.age ?? ''), 10),
    pronouns: toTrimmed(input.pronouns),
    occupation: toTrimmed(input.occupation),
    bio: toTrimmed(input.bio),
    introTagline: toTrimmed(input.introTagline),
  }

  if (!Number.isFinite(normalized.age)) normalized.age = NaN
  return normalized
}

export function isCompleteProfile(fields = {}) {
  const normalized = normalizeProfileFields(fields)
  if (!normalized.name) return false
  if (!Number.isFinite(normalized.age) || normalized.age < 18) return false
  if (!normalized.pronouns) return false
  if (!normalized.occupation) return false
  if (!normalized.bio) return false
  if (!normalized.introTagline) return false
  return true
}

export function profileToView(profile, rankings) {
  if (!profile) return null
  const pid = String(profile.playerId)
  const allTimeRank = rankings?.allTimeRanks?.[pid] || null
  const weeklyRank = rankings?.weeklyRanks?.[pid] || null
  const week = rankings?.weekKey || currentWeekKey()
  const weeklyRoses = Number(profile.stats?.weeklyRoses?.[week] || 0)

  return {
    playerId: pid,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
    lastEditedLocalDay: profile.lastEditedLocalDay || null,
    lastEditedTimezone: profile.lastEditedTimezone || null,
    fields: profile.fields,
    stats: {
      shownCount: Number(profile.stats?.shownCount || 0),
      roseCount: Number(profile.stats?.roseCount || 0),
      questionCount: Number(profile.stats?.questionCount || 0),
      weeklyRoses,
    },
    ranks: {
      allTime: allTimeRank,
      weekly: weeklyRank,
    },
    sentimentKeywords: profile.sentimentKeywords || [],
  }
}

export function getRandomId(prefix = 'id') {
  const random = Math.random().toString(36).slice(2, 10)
  return `${prefix}_${Date.now()}_${random}`
}

export async function getProfileIndex() {
  const data = await kvGetJSON(profileIndexKey())
  return Array.isArray(data) ? data : []
}

export async function saveProfileIndex(index = []) {
  const deduped = [...new Set((Array.isArray(index) ? index : []).map((id) => String(id)))]
  await kvSetJSON(profileIndexKey(), deduped, { exSeconds: ROSES_PROFILE_TTL_SECONDS })
}

export async function getProfile(playerId) {
  if (!playerId) return null
  const profile = await kvGetJSON(profileKey(playerId))
  if (!profile) return null
  if (profile.playerId !== playerId) return null
  return profile
}

async function ensureSeedProfiles() {
  if (seedBootstrapPromise) return seedBootstrapPromise

  seedBootstrapPromise = (async () => {
    const templates = buildSeedProfileTemplates()
    if (!templates.length) return

    const existingIndex = await getProfileIndex()
    const nextIndex = [...existingIndex]

    for (const template of templates) {
      const existing = await getProfile(template.playerId)
      const merged = existing
        ? {
          ...existing,
          version: 1,
          updatedAt: Date.now(),
          firstPublishedLocalDay: existing.firstPublishedLocalDay || null,
          firstDayEditUsed: Boolean(existing.firstDayEditUsed),
          fields: template.fields,
          stats: normalizeStats(existing.stats || {}),
          sentimentKeywords: Array.isArray(existing.sentimentKeywords) ? existing.sentimentKeywords : [],
        }
        : template

      await kvSetJSON(profileKey(template.playerId), merged, { exSeconds: ROSES_PROFILE_TTL_SECONDS })
      if (!nextIndex.includes(template.playerId)) {
        nextIndex.push(template.playerId)
      }
    }

    if (nextIndex.length !== existingIndex.length) {
      await saveProfileIndex(nextIndex)
    }
  })().finally(() => {
    seedBootstrapPromise = null
  })

  return seedBootstrapPromise
}

export async function saveProfile(profile) {
  if (!profile?.playerId) return
  await kvSetJSON(profileKey(profile.playerId), profile, { exSeconds: ROSES_PROFILE_TTL_SECONDS })

  const index = await getProfileIndex()
  if (!index.includes(profile.playerId)) {
    await saveProfileIndex([...index, profile.playerId])
  }
}

export async function getAllProfiles() {
  await ensureSeedProfiles()
  const ids = await getProfileIndex()
  if (!ids.length) return []

  const profiles = await Promise.all(ids.map((id) => getProfile(id)))
  return profiles.filter(Boolean)
}

export async function getHistory(playerId) {
  if (!playerId) return {}
  const history = await kvGetJSON(historyKey(playerId))
  if (!history || typeof history !== 'object') return {}
  return history
}

export async function saveHistory(playerId, history) {
  await kvSetJSON(historyKey(playerId), history || {}, { exSeconds: ROSES_HISTORY_TTL_SECONDS })
}

export async function getRound(roundId) {
  if (!roundId) return null
  return kvGetJSON(roundKey(roundId))
}

export async function saveRound(round) {
  if (!round?.id) return
  await kvSetJSON(roundKey(round.id), round, { exSeconds: ROSES_ROUND_TTL_SECONDS })
}

function profileShownCount(profile) {
  return Number(profile?.stats?.shownCount || 0)
}

function profileRoseCount(profile) {
  return Number(profile?.stats?.roseCount || 0)
}

function profileWeekRoseCount(profile, weekKey) {
  return Number(profile?.stats?.weeklyRoses?.[weekKey] || 0)
}

function profileCreatedAt(profile) {
  return Number(profile?.createdAt || 0)
}

function compareByMetricDesc(metricFn, weekKey = '') {
  return (a, b) => {
    const aMetric = metricFn(a, weekKey)
    const bMetric = metricFn(b, weekKey)
    if (aMetric !== bMetric) return bMetric - aMetric

    const aShown = profileShownCount(a)
    const bShown = profileShownCount(b)
    if (aShown !== bShown) return aShown - bShown

    const aCreated = profileCreatedAt(a)
    const bCreated = profileCreatedAt(b)
    if (aCreated !== bCreated) return bCreated - aCreated

    return String(a.playerId).localeCompare(String(b.playerId))
  }
}

export function buildRankings(profiles = [], nowMs = Date.now()) {
  const completeProfiles = profiles.filter((profile) => isCompleteProfile(profile?.fields))
  const weekKey = currentWeekKey(nowMs)

  const allTimeSorted = [...completeProfiles].sort(compareByMetricDesc((profile) => profileRoseCount(profile)))
  const weeklySorted = [...completeProfiles].sort(compareByMetricDesc((profile, wk) => profileWeekRoseCount(profile, wk), weekKey))

  const allTimeRanks = {}
  allTimeSorted.forEach((profile, idx) => {
    allTimeRanks[profile.playerId] = idx + 1
  })

  const weeklyRanks = {}
  weeklySorted.forEach((profile, idx) => {
    weeklyRanks[profile.playerId] = idx + 1
  })

  return {
    weekKey,
    allTimeSorted,
    weeklySorted,
    allTimeRanks,
    weeklyRanks,
  }
}

export function findRoundCandidates({ allProfiles = [], bachelorId = '', history = {}, nowMs = Date.now() }) {
  const lockoutMs = 7 * 24 * 60 * 60 * 1000
  const candidates = allProfiles
    .filter((profile) => String(profile.playerId) !== String(bachelorId))
    .filter((profile) => isCompleteProfile(profile?.fields))
    .map((profile) => {
      const lastSeenAt = Number(history?.[profile.playerId] || 0)
      const wasSeen = Number.isFinite(lastSeenAt) && lastSeenAt > 0
      const withinLockout = wasSeen && ((nowMs - lastSeenAt) < lockoutMs)
      const group = wasSeen ? (withinLockout ? 2 : 1) : 0
      return {
        profile,
        group,
        shownCount: profileShownCount(profile),
        random: Math.random(),
      }
    })

  candidates.sort((a, b) => {
    if (a.group !== b.group) return a.group - b.group
    if (a.shownCount !== b.shownCount) return a.shownCount - b.shownCount
    if (a.random !== b.random) return a.random - b.random
    return String(a.profile.playerId).localeCompare(String(b.profile.playerId))
  })

  return candidates.slice(0, 2).map((entry) => entry.profile)
}

export function createOrUpdateProfile({
  existingProfile = null,
  playerId,
  fields,
  localDay,
  timezone,
  manualFieldCount = 0,
  nowMs = Date.now(),
}) {
  const normalized = normalizeProfileFields(fields)

  if (manualFieldCount < 1) {
    return { error: 'Add at least one field manually before publishing.' }
  }

  if (!isCompleteProfile(normalized)) {
    if (!Number.isFinite(normalized.age) || normalized.age < 18) {
      return { error: 'Age must be at least 18.' }
    }
    return { error: 'All profile fields are required before publish.' }
  }

  const firstPublishedLocalDay = String(existingProfile?.firstPublishedLocalDay || localDay || '')
  const wasEditedToday = Boolean(existingProfile && existingProfile.lastEditedLocalDay === localDay)
  const isFirstPublishedDay = Boolean(firstPublishedLocalDay && firstPublishedLocalDay === localDay)
  const firstDayEditUsed = Boolean(existingProfile?.firstDayEditUsed)
  const usingFirstDayBonusEdit = wasEditedToday && isFirstPublishedDay && !firstDayEditUsed

  if (wasEditedToday && !usingFirstDayBonusEdit) {
    return { error: 'You can publish edits once per local calendar day.' }
  }

  const stats = existingProfile?.stats || {
    ...createEmptyStats(),
  }

  const profile = {
    version: 1,
    playerId,
    createdAt: existingProfile?.createdAt || nowMs,
    updatedAt: nowMs,
    lastEditedLocalDay: localDay,
    firstPublishedLocalDay,
    firstDayEditUsed: firstDayEditUsed || usingFirstDayBonusEdit,
    lastEditedTimezone: timezone || 'UTC',
    fields: normalized,
    stats,
    sentimentKeywords: existingProfile?.sentimentKeywords || [],
  }

  return { profile }
}

export function canEditProfileToday(profile, localDay) {
  if (!profile) return true
  if (!localDay) return true

  if (profile.lastEditedLocalDay !== localDay) return true

  const firstPublishedLocalDay = String(profile.firstPublishedLocalDay || '')
  const isFirstPublishedDay = Boolean(firstPublishedLocalDay && firstPublishedLocalDay === localDay)
  const firstDayEditUsed = Boolean(profile.firstDayEditUsed)
  return isFirstPublishedDay && !firstDayEditUsed
}
