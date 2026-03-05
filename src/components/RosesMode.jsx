import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  completeRosesRound,
  fetchRosesLeaderboard,
  fetchRosesProfile,
  getBrowserTimezone,
  getLocalDayKey,
  getOrCreateRosesPlayerId,
  saveRosesProfile,
  startRosesRound,
  submitRosesTurn,
} from '../services/rosesApi'
import {
  generateRosesField,
  generateRosesReply,
  ROSES_FIELD_LIMITS,
  sanitizeRosesFields,
} from '../services/rosesLlmService'
import { daters } from '../data/daters'
import { setVoice, speakAndWait, stopAllAudio } from '../services/ttsService'
import './RosesMode.css'

const PROFILE_FIELDS = [
  { id: 'name', label: 'Name', multiline: false, placeholder: 'Smurf Blaster', half: true },
  { id: 'age', label: 'Age (18+)', multiline: false, placeholder: '28', half: true },
  { id: 'pronouns', label: 'Pronouns', multiline: false, placeholder: 'she/her', half: true },
  { id: 'occupation', label: 'Occupation', multiline: false, placeholder: 'Game Developer', half: true },
  { id: 'bio', label: 'Bio', multiline: true, rows: 5, placeholder: "I'm the developer of the biggest video games in the world: Where Cards Fall, Blaseball, and Dead Man's Party. I'm also extremely hot and successful. I bought a 1:1 scale replica Batcave." },
  { id: 'introTagline', label: 'Intro Tagline', multiline: true, rows: 3, placeholder: 'The line they open with in chat' },
]

const TURN_COUNT = 3
const INTRO_PHASE_HOLD_MS = 220
const BETWEEN_INTRO_LINES_MS = 220
const BETWEEN_ANSWER_LINES_MS = 180
const TTS_MIN_TIMEOUT_MS = 4500
const TTS_MAX_TIMEOUT_MS = 15000
const QUESTION_PLACEHOLDERS = [
  'Where would you take me on a first date?',
  "What's something you do that would impress me?",
  'If you had a million dollars, how would you spend it?',
]

const DEFAULT_ROSES_VOICES = {
  male: 'TX3LPaxmHKxFdv7VOQHJ', // Liam
  female: 'EXAVITQu4vr4xnSDxMaL', // Bella
}

const KNOWN_DATER_VOICES = new Map(
  daters.map((dater) => {
    const key = String(dater?.name || '').trim().toLowerCase()
    const pronouns = String(dater?.pronouns || '').toLowerCase()
    const isMale = pronouns.includes('he') && !pronouns.includes('she')
    return [key, { voiceId: dater?.voiceId || '', isMale }]
  }),
)

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function emptyFields() {
  return {
    name: '',
    age: '',
    pronouns: '',
    occupation: '',
    bio: '',
    introTagline: '',
  }
}

function getOtherCandidate(roundCandidates = [], winnerId = '') {
  return roundCandidates.find((candidate) => String(candidate.playerId) !== String(winnerId))
}

function scoreWordSize(count = 1) {
  const base = 0.85
  const extra = Math.min(1.3, Math.log2(Math.max(1, count)) * 0.35)
  return `${base + extra}rem`
}

function admirerNumberFromSlot(slot) {
  if (slot === 'A') return 1
  if (slot === 'B') return 2
  return slot || '?'
}

function admirerLabelFromSlot(slot) {
  return `Admirer ${admirerNumberFromSlot(slot)}`
}

function inferIsMaleFromPronouns(pronouns = '') {
  const normalized = String(pronouns || '').toLowerCase()
  if (!normalized) return false
  if (normalized.includes('she')) return false
  if (normalized.includes('he')) return true
  return false
}

function resolveAdmirerVoice(candidate, slot = 'A') {
  const nameKey = String(candidate?.fields?.name || '').trim().toLowerCase()
  const known = KNOWN_DATER_VOICES.get(nameKey)
  if (known?.voiceId) {
    return known
  }

  const inferredMale = inferIsMaleFromPronouns(candidate?.fields?.pronouns)
  const fallbackMale = slot === 'B'
  const isMale = inferredMale || fallbackMale
  return {
    voiceId: isMale ? DEFAULT_ROSES_VOICES.male : DEFAULT_ROSES_VOICES.female,
    isMale,
  }
}

function withAdmirerSpeechTag(slot, text) {
  const clean = String(text || '').trim()
  if (!clean) return ''
  return `${admirerLabelFromSlot(slot)}: ${clean}`
}

function FieldInput({ field, value, onChange, onGenerate, generating }) {
  const maxLength = ROSES_FIELD_LIMITS[field.id] || 200
  const [isFocused, setIsFocused] = useState(false)
  const showCounter = isFocused && String(value || '').length > 0

  return (
    <div
      className={[
        'roses-field-row',
        field.half ? 'half' : 'full',
        field.multiline ? 'multiline' : 'singleline',
        showCounter ? 'show-counter' : '',
      ].filter(Boolean).join(' ')}
    >
      <div className="roses-field-head">
        <label htmlFor={`roses-field-${field.id}`}>{field.label}</label>
        <button
          type="button"
          className="roses-generate-btn"
          onClick={() => onGenerate(field.id)}
          disabled={Boolean(generating)}
        >
          {generating ? 'Generating...' : 'Generate'}
        </button>
      </div>
      <div className="roses-field-input-wrap">
        {field.multiline ? (
          <textarea
            id={`roses-field-${field.id}`}
            value={value}
            onChange={(event) => onChange(field.id, event.target.value)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            maxLength={maxLength}
            placeholder={field.placeholder}
            rows={field.rows || 2}
          />
        ) : (
          <input
            id={`roses-field-${field.id}`}
            value={value}
            onChange={(event) => onChange(field.id, event.target.value)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            maxLength={maxLength}
            placeholder={field.placeholder}
            inputMode={field.id === 'age' ? 'numeric' : 'text'}
          />
        )}
        {showCounter && (
          <span className="roses-field-counter">{String(value || '').length}/{maxLength}</span>
        )}
      </div>
    </div>
  )
}

function RevealCard({ profile, title }) {
  if (!profile) return null

  return (
    <div className="roses-reveal-card">
      <h3 className="roses-reveal-stage-title">{title}</h3>
      <div className="roses-reveal-ranks">
        <span>All-Time Rank: #{profile?.ranks?.allTime || '-'}</span>
        <span>Weekly Rank: #{profile?.ranks?.weekly || '-'}</span>
      </div>

      <div className="roses-reveal-identity">
        <div className="roses-reveal-name">{profile?.fields?.name || 'Unknown'}</div>
        <div className="roses-reveal-subhead">
          {[profile?.fields?.pronouns, profile?.fields?.age].filter(Boolean).join(' · ') || '-'}
        </div>
        <div className="roses-reveal-subhead occupation">{profile?.fields?.occupation || '-'}</div>
        <p className="roses-reveal-bio">{profile?.fields?.bio || '-'}</p>
      </div>

      <div className="roses-reveal-ranks">
        <span>Times Chatted: {profile?.stats?.shownCount ?? 0}</span>
        <span>Roses Won: {profile?.stats?.roseCount ?? 0}</span>
        <span>Weekly Roses: {profile?.stats?.weeklyRoses ?? 0}</span>
      </div>
    </div>
  )
}

function formatWeekStartLabel(weekKey) {
  const raw = String(weekKey || '').trim()
  if (!raw) return ''
  const startDate = new Date(`${raw}T00:00:00Z`)
  if (Number.isNaN(startDate.getTime())) return raw
  const endDate = new Date(startDate)
  endDate.setUTCDate(endDate.getUTCDate() + 6)

  const formatter = new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })

  return `${formatter.format(startDate)}-${formatter.format(endDate)}`
}

function getRankForBoard(entry, mode, index) {
  const rank = mode === 'weekly' ? Number(entry?.ranks?.weekly || 0) : Number(entry?.ranks?.allTime || 0)
  if (Number.isFinite(rank) && rank > 0) return rank
  return index + 1
}

function getPrimaryScoreForBoard(entry, mode) {
  return mode === 'weekly'
    ? Number(entry?.stats?.weeklyRoses || 0)
    : Number(entry?.stats?.roseCount || 0)
}

function buildLeaderboardDisplayRows({ entries = [], mode = 'allTime', currentPlayerId = '' }) {
  const normalizedEntries = Array.isArray(entries) ? entries : []
  if (normalizedEntries.length <= 10) {
    return normalizedEntries.slice(0, 10).map((entry, absoluteIndex) => ({
      type: 'entry',
      entry,
      absoluteIndex,
    }))
  }

  const playerIndex = normalizedEntries.findIndex(
    (entry) => String(entry?.playerId || '') === String(currentPlayerId || ''),
  )

  if (playerIndex < 0) {
    return normalizedEntries.slice(0, 10).map((entry, absoluteIndex) => ({
      type: 'entry',
      entry,
      absoluteIndex,
    }))
  }

  const playerRank = getRankForBoard(normalizedEntries[playerIndex], mode, playerIndex)
  if (playerRank <= 10) {
    return normalizedEntries.slice(0, 10).map((entry, absoluteIndex) => ({
      type: 'entry',
      entry,
      absoluteIndex,
    }))
  }

  const topRows = normalizedEntries.slice(0, 5).map((entry, absoluteIndex) => ({
    type: 'entry',
    entry,
    absoluteIndex,
  }))

  const aroundStart = Math.max(0, playerIndex - 2)
  const aroundEnd = Math.min(normalizedEntries.length, playerIndex + 3)
  const aroundRows = normalizedEntries.slice(aroundStart, aroundEnd).map((entry, offset) => ({
    type: 'entry',
    entry,
    absoluteIndex: aroundStart + offset,
  }))

  return [
    ...topRows,
    { type: 'gap', key: `gap-${mode}-${currentPlayerId || 'unknown'}` },
    ...aroundRows,
  ]
}

function LeaderboardPanel({ title, mode, entries = [], currentPlayerId = '', weekKey = '' }) {
  const weekLabel = mode === 'weekly' ? formatWeekStartLabel(weekKey) : ''
  const displayRows = buildLeaderboardDisplayRows({ entries, mode, currentPlayerId })

  return (
    <section className="roses-lb-panel">
      <div className="roses-lb-panel-head">
        <h3>{title}</h3>
        {mode === 'weekly' && weekLabel && (
          <span className="roses-lb-subhead">Week of {weekLabel}</span>
        )}
      </div>

      {!entries.length && (
        <div className="roses-lb-empty">No profiles ranked yet.</div>
      )}

      {entries.length > 0 && (
        <ol className="roses-lb-list">
          {displayRows.map((row) => {
            if (row.type === 'gap') {
              return (
                <li key={row.key} className="roses-lb-gap" aria-hidden="true">
                  <span>...</span>
                </li>
              )
            }

            const entry = row.entry
            const rank = getRankForBoard(entry, mode, row.absoluteIndex)
            const isYou = String(entry?.playerId || '') === String(currentPlayerId || '')
            const primaryScore = getPrimaryScoreForBoard(entry, mode)
            const displayName = String(entry?.name || '').trim() || 'Unnamed'

            return (
              <li
                key={`${mode}-${entry.playerId}`}
                className={[
                  'roses-lb-row',
                  isYou ? 'is-you' : '',
                ].filter(Boolean).join(' ')}
              >
                <span className="roses-lb-rank">#{rank}</span>
                <span className="roses-lb-name" title={displayName}>
                  {displayName}{isYou ? ' (you)' : ''}
                </span>
                <span className="roses-lb-score">{primaryScore} 🌹</span>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}

function RosesMode({ onBack }) {
  const [stage, setStage] = useState('loading')
  const [playerId, setPlayerId] = useState('')
  const [timezone, setTimezone] = useState('UTC')

  const [profile, setProfile] = useState(null)
  const [canPlay, setCanPlay] = useState(false)
  const [canEditToday, setCanEditToday] = useState(true)
  const [leaderboard, setLeaderboard] = useState({ allTime: [], weekly: [] })

  const [fields, setFields] = useState(emptyFields)
  const [manualTouched, setManualTouched] = useState({})
  const [savingProfile, setSavingProfile] = useState(false)
  const [generatingField, setGeneratingField] = useState('')
  const [autoFilling, setAutoFilling] = useState(false)

  const [round, setRound] = useState(null)
  const [candidates, setCandidates] = useState([])
  const [chatLog, setChatLog] = useState([])
  const [introPhase, setIntroPhase] = useState('idle')
  const [introTaglines, setIntroTaglines] = useState({ A: '', B: '' })
  const [activeSpeechSlot, setActiveSpeechSlot] = useState('')
  const [activeSpeechAnswerKey, setActiveSpeechAnswerKey] = useState('')
  const [questionInput, setQuestionInput] = useState('')
  const [sendingQuestion, setSendingQuestion] = useState(false)
  const [choosingWinner, setChoosingWinner] = useState(false)
  const [reveal, setReveal] = useState(null)
  const chatLogRef = useRef(null)
  const questionInputRef = useRef(null)
  const skipQuestionClearOnFocusRef = useRef(false)

  const [status, setStatus] = useState('')
  const [error, setError] = useState('')

  const manualFieldCount = useMemo(() => {
    return Object.entries(manualTouched)
      .filter(([key, touched]) => touched && String(fields[key] || '').trim())
      .length
  }, [fields, manualTouched])

  const allFieldsFilled = useMemo(() => (
    PROFILE_FIELDS
      .map((field) => field.id)
      .every((fieldId) => String(fields[fieldId] || '').trim())
  ), [fields])

  const hasAnyFieldValue = useMemo(() => (
    PROFILE_FIELDS
      .map((field) => field.id)
      .some((fieldId) => String(fields[fieldId] || '').trim())
  ), [fields])

  const candidateById = useMemo(() => {
    const map = new Map()
    candidates.forEach((candidate) => {
      map.set(String(candidate.playerId), candidate)
    })
    return map
  }, [candidates])

  const questionNumber = Math.min(TURN_COUNT, Number(round?.turnIndex || 0) + 1)
  const questionPlaceholder =
    QUESTION_PLACEHOLDERS[Math.min(chatLog.length, QUESTION_PLACEHOLDERS.length - 1)]
  const candidateA = candidates.find((candidate) => candidate.slot === 'A') || candidates[0] || null
  const candidateB = candidates.find((candidate) => candidate.slot === 'B') || candidates[1] || null
  const introActive = stage === 'chat' && chatLog.length === 0 && introPhase !== 'done'
  const sentimentKeywords = Array.isArray(profile?.sentimentKeywords) ? profile.sentimentKeywords : []
  const hasSentimentKeywords = sentimentKeywords.length > 0

  const withTimeout = useCallback((promise, ms) => (
    Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error(`TTS timeout (${ms}ms)`)), ms)),
    ])
  ), [])

  const estimateTtsTimeout = useCallback((text = '') => {
    const words = String(text || '').split(/\s+/).filter(Boolean).length
    const estimated = 2200 + (words * 380)
    return Math.max(TTS_MIN_TIMEOUT_MS, Math.min(TTS_MAX_TIMEOUT_MS, estimated))
  }, [])

  const speakRosesLine = useCallback(async ({
    text,
    speaker = 'dater',
    slot = '',
    candidate = null,
    answerKey = '',
  }) => {
    const line = String(text || '').trim()
    if (!line) return

    try {
      if (speaker === 'dater') {
        const voice = resolveAdmirerVoice(candidate, slot)
        if (voice?.voiceId) {
          setVoice('dater', voice.voiceId, Boolean(voice.isMale))
        }
      }
      if (slot) {
        setActiveSpeechSlot(slot)
      }
      if (answerKey) {
        setActiveSpeechAnswerKey(answerKey)
      }
      const timeoutMs = estimateTtsTimeout(line)
      await withTimeout(speakAndWait(line, speaker), timeoutMs)
    } catch (speechError) {
      console.warn('Roses TTS skipped due to timeout/failure:', speechError)
      stopAllAudio()
    } finally {
      if (slot) {
        setActiveSpeechSlot((current) => (current === slot ? '' : current))
      }
      if (answerKey) {
        setActiveSpeechAnswerKey((current) => (current === answerKey ? '' : current))
      }
    }
  }, [estimateTtsTimeout, withTimeout])

  useEffect(() => {
    if (stage !== 'chat') return
    const node = chatLogRef.current
    if (!node) return

    const frameId = requestAnimationFrame(() => {
      node.scrollTop = node.scrollHeight
    })

    return () => cancelAnimationFrame(frameId)
  }, [stage, chatLog.length, introTaglines.A, introTaglines.B])

  useEffect(() => {
    if (stage !== 'chat') return
    if (chatLog.length > 0) {
      setIntroPhase('done')
      return
    }
    if (!candidateA || !candidateB) return

    const taglineA = String(candidateA?.fields?.introTagline || '...')
    const taglineB = String(candidateB?.fields?.introTagline || '...')

    let cancelled = false

    const playIntro = async () => {
      setIntroPhase('idle')
      setIntroTaglines({ A: '', B: '' })
      await wait(INTRO_PHASE_HOLD_MS)
      if (cancelled) return

      setIntroPhase('a')
      setIntroTaglines({ A: taglineA, B: '' })
      await speakRosesLine({
        text: withAdmirerSpeechTag('A', taglineA),
        speaker: 'dater',
        slot: 'A',
        candidate: candidateA,
      })
      if (cancelled) return

      await wait(BETWEEN_INTRO_LINES_MS)
      if (cancelled) return

      setIntroPhase('b')
      setIntroTaglines({ A: taglineA, B: taglineB })
      await speakRosesLine({
        text: withAdmirerSpeechTag('B', taglineB),
        speaker: 'dater',
        slot: 'B',
        candidate: candidateB,
      })
      if (cancelled) return

      setIntroPhase('done')
    }

    playIntro()

    return () => {
      cancelled = true
    }
  }, [stage, chatLog.length, candidateA, candidateB, speakRosesLine])

  useEffect(() => () => {
    stopAllAudio()
  }, [])

  const loadEverything = async (pid, tz, day) => {
    setStage('loading')
    setError('')

    const [profileResp, leaderboardResp] = await Promise.all([
      fetchRosesProfile({ playerId: pid, timezone: tz, localDay: day }),
      fetchRosesLeaderboard(25),
    ])

    setProfile(profileResp.profile || null)
    setCanPlay(Boolean(profileResp.canPlay))
    setCanEditToday(Boolean(profileResp.canEditToday))
    setLeaderboard({
      allTime: leaderboardResp.allTime || [],
      weekly: leaderboardResp.weekly || [],
      weekKey: leaderboardResp.weekKey || '',
    })

    if (profileResp.profile?.fields) {
      setFields(sanitizeRosesFields(profileResp.profile.fields))
      setManualTouched({})
      setStage('dashboard')
      return
    }

    setFields(emptyFields())
    setManualTouched({})
    setStage('profile')
  }

  useEffect(() => {
    const pid = getOrCreateRosesPlayerId()
    const tz = getBrowserTimezone()
    const day = getLocalDayKey(tz)
    setPlayerId(pid)
    setTimezone(tz)

    loadEverything(pid, tz, day).catch((loadError) => {
      console.error(loadError)
      setStage('profile')
      setError(loadError.message || 'Failed to load Roses mode data.')
    })
  }, [])

  const setFieldValue = (fieldId, rawValue) => {
    let nextValue = String(rawValue || '')
    if (fieldId === 'age') {
      nextValue = nextValue.replace(/[^0-9]/g, '')
    }

    setFields((prev) => ({ ...prev, [fieldId]: nextValue }))
  }

  const handleFieldChange = (fieldId, value) => {
    setFieldValue(fieldId, value)
    setManualTouched((prev) => ({ ...prev, [fieldId]: true }))
  }

  const handleGenerateField = async (fieldId) => {
    setError('')
    setStatus('')
    setGeneratingField(fieldId)

    try {
      const value = await generateRosesField(fieldId, fields)
      if (!value) {
        setError(`Could not generate ${fieldId}. Try again.`)
        return
      }
      setFieldValue(fieldId, value)
      setManualTouched((prev) => ({ ...prev, [fieldId]: true }))
      setStatus(`Generated ${fieldId}.`)
    } catch (genError) {
      console.error(genError)
      setError(`Could not generate ${fieldId}.`)
    } finally {
      setGeneratingField('')
    }
  }

  const fillMissingFields = async (startFields) => {
    const next = { ...startFields }
    const missing = PROFILE_FIELDS
      .map((field) => field.id)
      .filter((fieldId) => !String(next[fieldId] || '').trim())

    if (!missing.length) return next

    setAutoFilling(true)
    setStatus('Generating missing profile fields...')

    try {
      for (const fieldId of missing) {
        const generated = await generateRosesField(fieldId, next)
        if (!generated) {
          throw new Error(`Could not auto-generate ${fieldId}.`)
        }
        next[fieldId] = generated
        setFieldValue(fieldId, generated)
      }
      return next
    } finally {
      setAutoFilling(false)
    }
  }

  const handleGenerateEmpties = async () => {
    setError('')
    setStatus('')

    const rawFields = sanitizeRosesFields(fields)
    const allEmpty = Object.values(rawFields).every((value) => !String(value || '').trim())

    if (allEmpty) {
      setError('Add at least one field manually before publishing.')
      return
    }

    if (manualFieldCount < 1) {
      setError('Add at least one field manually before publishing.')
      return
    }

    try {
      const completedFields = await fillMissingFields(rawFields)
      const normalized = sanitizeRosesFields(completedFields)
      setFields(normalized)
      setStatus('Filled empty fields. Review your profile, then publish.')
    } catch (fillError) {
      console.error(fillError)
      setError(fillError.message || 'Failed to generate missing fields.')
    }
  }

  const handlePublishProfile = async () => {
    setError('')
    setStatus('')

    const normalized = sanitizeRosesFields(fields)
    const allEmpty = Object.values(normalized).every((value) => !String(value || '').trim())

    if (allEmpty) {
      setError('Add at least one field manually before publishing.')
      return
    }

    if (manualFieldCount < 1) {
      setError('Add at least one field manually before publishing.')
      return
    }

    const missingStill = PROFILE_FIELDS
      .map((field) => field.id)
      .filter((fieldId) => !String(normalized[fieldId] || '').trim())

    if (missingStill.length) {
      setError('Some fields are still empty. Use Generate Empties first.')
      return
    }

    const age = Number.parseInt(String(normalized.age || ''), 10)
    if (!Number.isFinite(age) || age < 18) {
      setError('Age must be 18 or older.')
      return
    }

    setSavingProfile(true)

    try {
      const response = await saveRosesProfile({
        playerId,
        timezone,
        localDay: getLocalDayKey(timezone),
        fields: normalized,
        manualFieldCount,
      })

      setProfile(response.profile)
      setCanPlay(Boolean(response.canPlay))
      setCanEditToday(Boolean(response.canEditToday))
      setFields(normalized)
      setManualTouched({})
      setStatus('Profile published to the global Roses pool.')

      const leaderboardResp = await fetchRosesLeaderboard(25)
      setLeaderboard({
        allTime: leaderboardResp.allTime || [],
        weekly: leaderboardResp.weekly || [],
        weekKey: leaderboardResp.weekKey || '',
      })

      setStage('dashboard')
    } catch (saveError) {
      console.error(saveError)
      setError(saveError.message || 'Failed to publish profile.')
    } finally {
      setSavingProfile(false)
      setAutoFilling(false)
    }
  }

  const handleEditProfile = () => {
    if (!canEditToday) {
      setError('You can publish edits once per local calendar day.')
      return
    }

    const base = sanitizeRosesFields(profile?.fields || emptyFields())
    setFields(base)
    setManualTouched({})
    setStatus('')
    setError('')
    setStage('profile')
  }

  const handleStartRound = async () => {
    setError('')
    setStatus('Starting Roses round...')

    try {
      const response = await startRosesRound({ playerId })
      setRound(response.round)
      setCandidates(response.candidates || [])
      setChatLog([])
      setIntroPhase('idle')
      setIntroTaglines({ A: '', B: '' })
      setActiveSpeechSlot('')
      setActiveSpeechAnswerKey('')
      setQuestionInput('')
      setReveal(null)
      setStage('chat')
      setStatus('')
    } catch (roundError) {
      console.error(roundError)
      setError(roundError.message || 'Failed to start round.')
      setStatus('')
    }
  }

  const handleSendQuestion = async () => {
    if (!round || sendingQuestion || introActive) return

    const question = String(questionInput || '').trim()
    if (!question) return

    if ((Number(round.turnIndex) || 0) >= TURN_COUNT) {
      setStage('choose')
      return
    }

    setSendingQuestion(true)
    setError('')

    try {
      const buildsPriorTurns = (candidateId) => chatLog
        .map((turn) => {
          const answer = (turn.answers || []).find((item) => String(item.candidateId) === String(candidateId))
          if (!answer) return null
          return { question: turn.question, response: answer.response }
        })
        .filter(Boolean)

      if (!candidateA || !candidateB) {
        setError('Round candidate data is missing.')
        return
      }

      setStatus('Reading your question while admirers think...')
      const replyPromise = Promise.all([
        generateRosesReply({
          profile: candidateA,
          question,
          priorTurns: buildsPriorTurns(candidateA.playerId),
        }),
        generateRosesReply({
          profile: candidateB,
          question,
          priorTurns: buildsPriorTurns(candidateB.playerId),
        }),
      ])

      const questionSpeechPromise = speakRosesLine({
        text: question,
        speaker: 'avatar',
        slot: 'Q',
      })

      const [replyA, replyB] = await replyPromise
      await questionSpeechPromise

      const responses = [
        { candidateId: candidateA.playerId, response: replyA },
        { candidateId: candidateB.playerId, response: replyB },
      ]

      setStatus('Recording round turn...')
      const response = await submitRosesTurn({
        playerId,
        roundId: round.id,
        question,
        responses,
      })
      const nextTurnNumber = chatLog.length + 1

      setChatLog((prev) => [
        ...prev,
        {
          turnNumber: nextTurnNumber,
          question,
          answers: responses.map((item) => ({
            candidateId: item.candidateId,
            candidateSlot: candidateById.get(String(item.candidateId))?.slot || '?',
            response: item.response,
          })),
        },
      ])

      setRound((prev) => ({ ...prev, ...response.round }))
      setQuestionInput('')

      const slotA = candidateA?.slot || 'A'
      const slotB = candidateB?.slot || 'B'

      setStatus(`${admirerLabelFromSlot(slotA)} responds...`)
      await speakRosesLine({
        text: withAdmirerSpeechTag(slotA, replyA),
        speaker: 'dater',
        slot: slotA,
        candidate: candidateA,
        answerKey: `${nextTurnNumber}-${candidateA.playerId}`,
      })

      await wait(BETWEEN_ANSWER_LINES_MS)

      setStatus(`${admirerLabelFromSlot(slotB)} responds...`)
      await speakRosesLine({
        text: withAdmirerSpeechTag(slotB, replyB),
        speaker: 'dater',
        slot: slotB,
        candidate: candidateB,
        answerKey: `${nextTurnNumber}-${candidateB.playerId}`,
      })

      if (response.round?.doneAsking) {
        setStage('choose')
      }
    } catch (turnError) {
      console.error(turnError)
      setError(turnError.message || 'Failed to send question.')
    } finally {
      setStatus('')
      setActiveSpeechSlot('')
      setActiveSpeechAnswerKey('')
      setSendingQuestion(false)
    }
  }

  const handleQuestionKeyDown = (event) => {
    if (event.key !== 'Enter') return
    if (event.nativeEvent?.isComposing || event.repeat) return
    event.preventDefault()
    if (sendingQuestion || introActive) return
    if (!String(questionInput || '').trim()) return
    handleSendQuestion()
  }

  const handleQuestionFocus = () => {
    if (sendingQuestion || introActive) return
    if (skipQuestionClearOnFocusRef.current) {
      skipQuestionClearOnFocusRef.current = false
      requestAnimationFrame(() => {
        const node = questionInputRef.current
        if (!node) return
        const pos = String(node.value || '').length
        node.setSelectionRange(pos, pos)
      })
      return
    }
    setQuestionInput('')
    requestAnimationFrame(() => {
      const node = questionInputRef.current
      if (!node) return
      const pos = String(node.value || '').length
      node.setSelectionRange(pos, pos)
    })
  }

  const handleUseSuggestedQuestion = () => {
    if (sendingQuestion || introActive) return
    const suggestion = String(questionPlaceholder || '').trim()
    if (!suggestion) return
    setQuestionInput(suggestion)
    skipQuestionClearOnFocusRef.current = true
    requestAnimationFrame(() => {
      const node = questionInputRef.current
      if (!node) return
      node.focus()
      const pos = String(suggestion).length
      node.setSelectionRange(pos, pos)
    })
  }

  const handleExitRound = () => {
    stopAllAudio()
    setActiveSpeechSlot('')
    setActiveSpeechAnswerKey('')
    setIntroPhase('idle')
    setIntroTaglines({ A: '', B: '' })
    setStatus('')
    setStage('dashboard')
  }

  const handleChooseWinner = async (winnerId) => {
    if (!round || choosingWinner) return

    setChoosingWinner(true)
    setError('')

    try {
      const response = await completeRosesRound({ playerId, roundId: round.id, winnerId })
      setReveal(response.reveal)
      setStage('reveal-loser')

      const refreshedDay = getLocalDayKey(timezone)
      const [profileResp, leaderboardResp] = await Promise.all([
        fetchRosesProfile({ playerId, timezone, localDay: refreshedDay }),
        fetchRosesLeaderboard(25),
      ])
      setProfile(profileResp.profile || null)
      setCanPlay(Boolean(profileResp.canPlay))
      setCanEditToday(Boolean(profileResp.canEditToday))
      setLeaderboard({
        allTime: leaderboardResp.allTime || [],
        weekly: leaderboardResp.weekly || [],
        weekKey: leaderboardResp.weekKey || '',
      })
    } catch (completeError) {
      console.error(completeError)
      setError(completeError.message || 'Failed to submit Rose decision.')
    } finally {
      setChoosingWinner(false)
    }
  }

  const winnerCandidate = useMemo(() => {
    if (!reveal?.winner) return null
    return candidates.find((candidate) => candidate.playerId === reveal.winner.playerId) || reveal.winner
  }, [reveal, candidates])

  const loserCandidate = useMemo(() => {
    if (!reveal?.winner) return null
    return getOtherCandidate(candidates, reveal.winner.playerId)
  }, [reveal, candidates])

  if (stage === 'loading') {
    return (
      <div className="roses-mode">
        <div className="roses-card centered">Loading Roses mode...</div>
      </div>
    )
  }

  if (stage === 'chat') {
    return (
      <div className="roses-mode roses-mode-chat">
        <div className="roses-card roses-chat-shell">
          <div className="roses-chat-head">
            <button className="roses-back" type="button" onClick={handleExitRound}>Exit Round</button>
            <h2>Roses Chat</h2>
            <span className="roses-chat-progress">Question {questionNumber} / {TURN_COUNT}</span>
          </div>

          <div ref={chatLogRef} className="roses-chat-log">
            {chatLog.length === 0 && (
              <div className="roses-intro-sequence">
                {[
                  { slot: 'A', candidate: candidateA, tagline: introTaglines.A, active: activeSpeechSlot === 'A' },
                  { slot: 'B', candidate: candidateB, tagline: introTaglines.B, active: activeSpeechSlot === 'B' },
                ].map((item) => (
                  <div
                    key={`intro-${item.slot}`}
                    className={[
                      'roses-intro-card',
                      item.active ? 'is-active' : '',
                      item.tagline ? 'is-revealed' : '',
                    ].filter(Boolean).join(' ')}
                  >
                    <div className="roses-answer-head">{admirerLabelFromSlot(item.candidate?.slot || item.slot)}</div>
                    <div className="roses-intro-tagline">{item.tagline}</div>
                  </div>
                ))}
              </div>
            )}
            {chatLog.map((turn) => (
              <div key={`turn-${turn.turnNumber}`} className="roses-turn-card">
                <div className="roses-chat-question">Q{turn.turnNumber}: {turn.question}</div>
                <div className="roses-answers-grid">
                  {(turn.answers || []).map((answer) => {
                    const answerKey = `${turn.turnNumber}-${answer.candidateId}`
                    return (
                      <div
                        key={answerKey}
                        className={[
                          'roses-answer-panel',
                          activeSpeechAnswerKey === answerKey ? 'is-speaking' : '',
                        ].filter(Boolean).join(' ')}
                      >
                      <div className="roses-answer-head">{admirerLabelFromSlot(answer.candidateSlot)}</div>
                      <div className="roses-chat-answer">{answer.response}</div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="roses-question-row">
            <textarea
              ref={questionInputRef}
              value={questionInput}
              onChange={(event) => setQuestionInput(event.target.value.slice(0, 280))}
              onKeyDown={handleQuestionKeyDown}
              onFocus={handleQuestionFocus}
              rows={3}
              placeholder={questionPlaceholder}
              disabled={sendingQuestion || introActive}
            />
            <div className="roses-question-actions">
              <button
                type="button"
                className="roses-question-dice"
                aria-label="Use suggested question"
                onClick={handleUseSuggestedQuestion}
                disabled={sendingQuestion || introActive}
                title="Use suggested question"
              >
                🎲
              </button>
              <button
                type="button"
                className="roses-primary"
                onClick={handleSendQuestion}
                disabled={sendingQuestion || introActive || !questionInput.trim()}
              >
                {sendingQuestion ? 'Getting Both Answers...' : 'Ask Both Admirers'}
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (stage === 'choose') {
    const profileA = candidates.find((candidate) => candidate.slot === 'A') || candidates[0] || null
    const profileB = candidates.find((candidate) => candidate.slot === 'B') || candidates[1] || null

    const answersFor = (candidateId) => chatLog.map((turn) => {
      const answer = (turn.answers || []).find((item) => String(item.candidateId) === String(candidateId))
      return {
        turnNumber: turn.turnNumber,
        question: turn.question,
        response: answer?.response || 'No answer logged.',
      }
    })

    const profileAAnswers = profileA ? answersFor(profileA.playerId) : []
    const profileBAnswers = profileB ? answersFor(profileB.playerId) : []

    return (
      <div className="roses-mode">
        <div className="roses-card">
          <h2>Award One Rose</h2>
          <p className="roses-muted">Choose your favorite admirer. You must pick one.</p>
          <div className="roses-compare-grid">
            {[
              { profile: profileA, answers: profileAAnswers },
              { profile: profileB, answers: profileBAnswers },
            ].map(({ profile: candidate, answers }, index) => (
              <div key={candidate?.playerId || `candidate-${index}`} className="roses-choice-card compare">
                <h3>{admirerLabelFromSlot(candidate?.slot)}</h3>
                <p className="roses-choice-tagline">{candidate?.fields?.introTagline}</p>
                <div className="roses-choice-answers">
                  {answers.map((item) => (
                    <div key={`${candidate?.playerId || 'x'}-a-${item.turnNumber}`} className="roses-choice-answer-row">
                      <div className="roses-choice-question">Q{item.turnNumber}: {item.question}</div>
                      <div className="roses-choice-answer">{item.response}</div>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  className="roses-primary"
                  onClick={() => candidate?.playerId && handleChooseWinner(candidate.playerId)}
                  disabled={choosingWinner || !candidate?.playerId}
                >
                  {choosingWinner ? 'Submitting...' : `Give Rose to ${admirerLabelFromSlot(candidate?.slot)}`}
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (stage === 'reveal-loser') {
    return (
      <div className="roses-mode">
        <div className="roses-card">
          <RevealCard profile={reveal?.loser} title="Not Chosen" />
          <button type="button" className="roses-primary" onClick={() => setStage('reveal-winner')}>
            Reveal Rose Winner
          </button>
        </div>
      </div>
    )
  }

  if (stage === 'reveal-winner') {
    return (
      <div className="roses-mode">
        <div className="roses-card">
          <RevealCard profile={reveal?.winner} title="Rose Winner" />
          <button type="button" className="roses-primary" onClick={() => setStage('dashboard')}>
            Back to Roses Dashboard
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="roses-mode">
      <div className={['roses-card', stage === 'profile' ? 'roses-profile-shell' : ''].filter(Boolean).join(' ')}>
        <div className="roses-topbar">
          <button className="roses-back" type="button" onClick={onBack}>Back</button>
          <h2>Your Roses Profile</h2>
          <span className="roses-topbar-spacer" aria-hidden="true" />
        </div>

        {error && <div className="roses-error">{error}</div>}
        {status && <div className="roses-status">{status}</div>}

        {stage === 'profile' ? (
          <>
            <p className="roses-profile-subtitle">
              Build the most enticing imaginary dating profile possible!
            </p>
            <div className="roses-form-grid">
              {PROFILE_FIELDS.map((field) => (
                <FieldInput
                  key={field.id}
                  field={field}
                  value={fields[field.id] || ''}
                  onChange={handleFieldChange}
                  onGenerate={handleGenerateField}
                  generating={generatingField === field.id}
                />
              ))}
            </div>
            <div className="roses-profile-actions">
              <button
                type="button"
                className="roses-secondary"
                onClick={() => {
                  setFields(profile?.fields ? sanitizeRosesFields(profile.fields) : emptyFields())
                  setManualTouched({})
                  setStatus('')
                }}
              >
                Reset Form
              </button>
              <button
                type="button"
                className={[
                  'roses-primary',
                  !hasAnyFieldValue ? 'roses-fill-any-fields' : '',
                  hasAnyFieldValue && !allFieldsFilled ? 'roses-generate-empties' : '',
                ].filter(Boolean).join(' ')}
                onClick={allFieldsFilled ? handlePublishProfile : handleGenerateEmpties}
                disabled={!hasAnyFieldValue || savingProfile || autoFilling}
              >
                {!hasAnyFieldValue
                  ? 'Fill Any Fields'
                  : autoFilling
                  ? 'Generating...'
                  : savingProfile
                    ? 'Publishing...'
                    : allFieldsFilled
                      ? 'Publish Profile'
                      : 'Generate Empties'}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="roses-dashboard-actions">
              <button type="button" className="roses-primary" onClick={handleStartRound} disabled={!canPlay}>
                Give a Rose
              </button>
              <button
                type="button"
                className="roses-secondary"
                onClick={handleEditProfile}
                disabled={!canEditToday}
                title={canEditToday ? 'Edit profile' : 'Edit available once per local day'}
              >
                {canEditToday ? 'Edit Profile' : 'One Edit Daily'}
              </button>
            </div>

            <div className="roses-dashboard-panels">
              <section className="roses-info-panel">
                <h3 className="roses-panel-title">Profile</h3>
                <div className="roses-profile-grid roses-panel-grid">
                  <div className="roses-panel-item">
                    <span className="roses-panel-label">Name</span>
                    <span className="roses-panel-value">{profile?.fields?.name || '-'}</span>
                  </div>
                  <div className="roses-panel-item">
                    <span className="roses-panel-label">Age</span>
                    <span className="roses-panel-value">{profile?.fields?.age || '-'}</span>
                  </div>
                  <div className="roses-panel-item">
                    <span className="roses-panel-label">Pronouns</span>
                    <span className="roses-panel-value">{profile?.fields?.pronouns || '-'}</span>
                  </div>
                  <div className="roses-panel-item">
                    <span className="roses-panel-label">Occupation</span>
                    <span className="roses-panel-value">{profile?.fields?.occupation || '-'}</span>
                  </div>
                </div>

                <div className="roses-panel-section">
                  <h4 className="roses-panel-subtitle">Intro Tagline</h4>
                  <p className="roses-panel-body">{profile?.fields?.introTagline || '-'}</p>
                </div>

                <div className="roses-panel-section">
                  <h4 className="roses-panel-subtitle">Bio</h4>
                  <p className="roses-panel-body">{profile?.fields?.bio || '-'}</p>
                </div>
              </section>

              <section className="roses-info-panel">
                <h3 className="roses-panel-title">Stats</h3>
                <div className="roses-profile-grid roses-panel-grid">
                  <div className="roses-panel-item">
                    <span className="roses-panel-label">Times Chatted</span>
                    <span className="roses-panel-value">{profile?.stats?.shownCount ?? 0}</span>
                  </div>
                  <div className="roses-panel-item">
                    <span className="roses-panel-label">Roses Won</span>
                    <span className="roses-panel-value">{profile?.stats?.roseCount ?? 0}</span>
                  </div>
                  <div className="roses-panel-item">
                    <span className="roses-panel-label">All-Time Rank</span>
                    <span className="roses-panel-value">#{profile?.ranks?.allTime || '-'}</span>
                  </div>
                  <div className="roses-panel-item">
                    <span className="roses-panel-label">Weekly Rank</span>
                    <span className="roses-panel-value">#{profile?.ranks?.weekly || '-'}</span>
                  </div>
                </div>
              </section>
            </div>

            {hasSentimentKeywords && (
              <div className="roses-word-cloud-wrap">
                <h3>Topics Discussed with {profile?.fields?.name || 'This Profile'}</h3>
                <div className="roses-word-cloud">
                  {sentimentKeywords.map((item) => (
                    <span
                      key={item.word}
                      className="roses-word"
                      style={{ fontSize: scoreWordSize(item.count) }}
                    >
                      {item.word}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="roses-leaderboards">
              <LeaderboardPanel
                title="All-Time Roses"
                mode="allTime"
                entries={leaderboard.allTime}
                currentPlayerId={playerId}
              />
              <LeaderboardPanel
                title="Top Roses This Week"
                mode="weekly"
                entries={leaderboard.weekly}
                currentPlayerId={playerId}
                weekKey={leaderboard.weekKey}
              />
            </div>
          </>
        )}

        {(winnerCandidate || loserCandidate) && (
          <div className="roses-dev-note">
            Last reveal: loser {admirerLabelFromSlot(loserCandidate?.slot)} then winner {admirerLabelFromSlot(winnerCandidate?.slot)}.
          </div>
        )}
      </div>
    </div>
  )
}

export default RosesMode
