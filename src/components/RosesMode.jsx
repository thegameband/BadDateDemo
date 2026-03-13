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
import { onAudioStart, primeTTSPlayback, setVoice, speakAndWait, stopAllAudio } from '../services/ttsService'
import { setMusicMode } from '../services/audioService'
import { useWebHaptics } from 'web-haptics/react'
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
const ADMIRER_SLOTS = ['A', 'B', 'C']
const QUESTION_BANK = [
  {
    template: "What's your hottest take about _____?",
    options: ['dating', 'capitalism', 'food'],
  },
  {
    template: 'Do you think _____ is a red flag?',
    options: ['baggage', 'crime', 'stupidity'],
  },
  {
    template: "What's your favorite _____?",
    options: ['movie', 'book', 'historical disaster'],
  },
  {
    template: "What's the earliest you'd _____ in a relationship?",
    options: ['kiss', 'open up', 'move in'],
  },
  {
    template: 'Do you think _____ is ever justifiable?',
    options: ['capital punishment', 'double dipping', 'cheating'],
  },
  {
    template: "I'm running around _____. What do you do?",
    options: ['on fire', 'with your bff', 'lying'],
  },
  {
    template: 'I confess to you that _____. What do you do?',
    options: ["i'm in love", "i'm a killer", 'i have kids'],
  },
]

const ROSES_VOICE_POOL = [
  { voiceId: 'EXAVITQu4vr4xnSDxMaL', isMale: false }, // Bella
  { voiceId: 'TX3LPaxmHKxFdv7VOQHJ', isMale: true }, // Liam
  { voiceId: 'Dkbbg7k9Ir9TNzn5GYLp', isMale: true }, // Henry
]

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

function scoreWordSize(count = 1) {
  const base = 0.85
  const extra = Math.min(1.3, Math.log2(Math.max(1, count)) * 0.35)
  return `${base + extra}rem`
}

function admirerNumberFromSlot(slot) {
  if (slot === 'A') return 1
  if (slot === 'B') return 2
  if (slot === 'C') return 3
  return slot || '?'
}

function admirerLabelFromSlot(slot) {
  return `Admirer ${admirerNumberFromSlot(slot)}`
}

function stableVoiceHash(value = '') {
  const text = String(value || '')
  let hash = 0
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash * 31) + text.charCodeAt(i)) >>> 0
  }
  return hash >>> 0
}

function getProfilePreferredVoice(candidate, slot = 'A') {
  const nameKey = String(candidate?.fields?.name || '').trim().toLowerCase()
  const known = KNOWN_DATER_VOICES.get(nameKey)
  if (known?.voiceId) {
    return known
  }

  const pronouns = String(candidate?.fields?.pronouns || '').toLowerCase()
  const seed = `${String(candidate?.playerId || '')}:${String(candidate?.fields?.name || '')}:${slot}`
  const hashed = stableVoiceHash(seed)

  const femaleVoices = ROSES_VOICE_POOL.filter((voice) => !voice.isMale)
  const maleVoices = ROSES_VOICE_POOL.filter((voice) => voice.isMale)

  if (pronouns.includes('she') && femaleVoices.length) {
    return femaleVoices[hashed % femaleVoices.length]
  }

  if (pronouns.includes('he') && maleVoices.length) {
    return maleVoices[hashed % maleVoices.length]
  }

  return ROSES_VOICE_POOL[hashed % ROSES_VOICE_POOL.length]
}

function buildAdmirerVoiceAssignments(candidates = []) {
  const assignments = new Map()
  const usedVoiceIds = new Set()
  const ordered = [...candidates].sort((a, b) => {
    const slotDelta = slotSortIndex(a?.slot) - slotSortIndex(b?.slot)
    if (slotDelta !== 0) return slotDelta
    return String(a?.playerId || '').localeCompare(String(b?.playerId || ''))
  })

  ordered.forEach((candidate, index) => {
    const slot = String(candidate?.slot || ADMIRER_SLOTS[index] || String(index + 1))
    const preferred = getProfilePreferredVoice(candidate, slot)

    let selected = preferred
    if (preferred?.voiceId && usedVoiceIds.has(preferred.voiceId)) {
      const sameGender = ROSES_VOICE_POOL.find(
        (voice) => voice.isMale === Boolean(preferred.isMale) && !usedVoiceIds.has(voice.voiceId),
      )
      const anyUnused = ROSES_VOICE_POOL.find((voice) => !usedVoiceIds.has(voice.voiceId))
      selected = sameGender || anyUnused || preferred
    }

    if (selected?.voiceId) {
      usedVoiceIds.add(selected.voiceId)
    }
    assignments.set(String(candidate?.playerId || ''), selected || ROSES_VOICE_POOL[0])
  })

  return assignments
}

function resolveAdmirerVoice(candidate, slot = 'A') {
  const preferred = getProfilePreferredVoice(candidate, slot)
  if (preferred?.voiceId) {
    return preferred
  }
  return ROSES_VOICE_POOL[0]
}

function slotSortIndex(slot = '') {
  const normalized = String(slot || '').toUpperCase()
  const idx = ADMIRER_SLOTS.indexOf(normalized)
  if (idx >= 0) return idx
  return 999
}

function fillQuestionTemplate(template = '', value = '') {
  const cleaned = String(value || '')
    .replace(/[?!.;,:-]+$/g, '')
    .trim()
  if (!cleaned) return String(template || '')
  return String(template || '').replace('_____', cleaned)
}

function normalizeQuestionForDuplicateCheck(value = '') {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function randomPromptPlan(count = TURN_COUNT) {
  const totalPrompts = QUESTION_BANK.length
  if (!totalPrompts) return []
  const picks = []

  for (let index = 0; index < Math.max(1, count); index += 1) {
    const used = new Set(picks)
    const available = Array.from({ length: totalPrompts }, (_, idx) => idx)
      .filter((idx) => !used.has(idx))

    const pool = available.length
      ? available
      : Array.from({ length: totalPrompts }, (_, idx) => idx)

    const next = pool[Math.floor(Math.random() * pool.length)] ?? 0
    if (!Number.isFinite(next)) {
      picks.push(0)
    } else {
      picks.push(next)
    }
  }

  return picks
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

function RevealCard({ profile, title, emphasis = 'default' }) {
  if (!profile) return null

  return (
    <div className="roses-reveal-card">
      {String(title || '').trim() && (
        <h3
          className={[
            'roses-reveal-stage-title',
            emphasis === 'loser' ? 'is-loser' : '',
          ].filter(Boolean).join(' ')}
        >
          {title}
        </h3>
      )}
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
        <span>Roses This Week: {profile?.stats?.weeklyRoses ?? 0}</span>
      </div>
    </div>
  )
}

function TutorialCue({ title, body }) {
  if (!String(title || '').trim() && !String(body || '').trim()) return null

  return (
    <div className="roses-tutorial-card" role="note" aria-live="polite">
      {String(title || '').trim() && <div className="roses-tutorial-title">{title}</div>}
      {String(body || '').trim() && <p className="roses-tutorial-body">{body}</p>}
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
                <div className="roses-lb-meta">
                  <span className="roses-lb-rank">#{rank}</span>
                  <span className="roses-lb-score">{primaryScore} 🌹</span>
                </div>
                <span className="roses-lb-name" title={displayName}>
                  {displayName}{isYou ? ' (you)' : ''}
                </span>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}

function RosesMode({ onBack }) {
  useEffect(() => {
    void setMusicMode('roses')
    return () => {
      void setMusicMode(null)
    }
  }, [])

  const { trigger: triggerHaptic } = useWebHaptics()
  const [stage, setStage] = useState('loading')
  const [playerId, setPlayerId] = useState('')
  const [timezone, setTimezone] = useState('UTC')

  const [profile, setProfile] = useState(null)
  const [canPlay, setCanPlay] = useState(false)
  const [canPlayIntroRound, setCanPlayIntroRound] = useState(false)
  const [mustCreateProfileBeforeNextRound, setMustCreateProfileBeforeNextRound] = useState(false)
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
  const [introTaglines, setIntroTaglines] = useState({})
  const [activeSpeechSlot, setActiveSpeechSlot] = useState('')
  const [activeSpeechAnswerKey, setActiveSpeechAnswerKey] = useState('')
  const [questionInput, setQuestionInput] = useState('')
  const [questionPromptIndexes, setQuestionPromptIndexes] = useState(() => randomPromptPlan())
  const [sendingQuestion, setSendingQuestion] = useState(false)
  const [choosingWinner, setChoosingWinner] = useState(false)
  const [reveal, setReveal] = useState(null)
  const [onboardingRoundActive, setOnboardingRoundActive] = useState(false)
  const chatLogRef = useRef(null)
  const questionInputRef = useRef(null)

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

  const orderedCandidates = useMemo(() => (
    [...candidates].sort((a, b) => {
      const slotDelta = slotSortIndex(a?.slot) - slotSortIndex(b?.slot)
      if (slotDelta !== 0) return slotDelta
      return String(a?.playerId || '').localeCompare(String(b?.playerId || ''))
    })
  ), [candidates])

  const admirerVoiceByCandidateId = useMemo(
    () => buildAdmirerVoiceAssignments(orderedCandidates),
    [orderedCandidates],
  )

  const questionNumber = Math.min(TURN_COUNT, Number(round?.turnIndex || 0) + 1)
  const currentTurnPromptIndex = Math.min(TURN_COUNT - 1, chatLog.length)
  const activePromptOptionIndex = questionPromptIndexes[currentTurnPromptIndex] ?? 0
  const activePrompt = QUESTION_BANK[activePromptOptionIndex] || QUESTION_BANK[0] || { template: '', options: [] }
  const activePromptTemplate = activePrompt.template || ''
  const activePromptOptions = activePrompt.options || []
  const introActive = stage === 'chat' && chatLog.length === 0 && introPhase !== 'done'
  const sentimentKeywords = Array.isArray(profile?.sentimentKeywords) ? profile.sentimentKeywords : []
  const displayedSentimentKeywords = sentimentKeywords.slice(0, 12)
  const hasSentimentKeywords = sentimentKeywords.length > 0
  const onboardingChatTutorial = onboardingRoundActive
    ? chatLog.length === 0
      ? {
        title: 'Meet your admirers.',
        body: 'These three Daters are all competing for your Rose.',
      }
      : {
        title: 'Ask all 3 the same question.',
        body: 'Tap a fill or write your own. Every admirer answers the exact same prompt.',
      }
    : null
  const onboardingChooseTutorial = onboardingRoundActive
    ? {
      title: 'You only get one Rose.',
      body: 'Pick the admirer whose answers won you over.',
    }
    : null

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
        const candidateId = String(candidate?.playerId || '')
        const voice = admirerVoiceByCandidateId.get(candidateId) || resolveAdmirerVoice(candidate, slot)
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
      await speakAndWait(line, speaker)
    } catch (speechError) {
      console.warn('Roses TTS failed:', speechError)
      stopAllAudio()
    } finally {
      if (slot) {
        setActiveSpeechSlot((current) => (current === slot ? '' : current))
      }
      if (answerKey) {
        setActiveSpeechAnswerKey((current) => (current === answerKey ? '' : current))
      }
    }
  }, [admirerVoiceByCandidateId])

  useEffect(() => {
    if (stage !== 'chat') return
    const node = chatLogRef.current
    if (!node) return

    const frameId = requestAnimationFrame(() => {
      node.scrollTop = node.scrollHeight
    })

    return () => cancelAnimationFrame(frameId)
  }, [stage, chatLog, introTaglines])

  useEffect(() => {
    return onAudioStart((_text, speaker) => {
      if (speaker !== 'dater' && speaker !== 'avatar') return
      void triggerHaptic('heavy')
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate(40)
      }
    })
  }, [triggerHaptic])

  useEffect(() => {
    if (stage !== 'chat') return
    if (chatLog.length > 0) {
      setIntroPhase('done')
      return
    }
    if (orderedCandidates.length < 2) return

    let cancelled = false

    const playIntro = async () => {
      setIntroPhase('idle')
      setIntroTaglines({})
      await wait(INTRO_PHASE_HOLD_MS)
      if (cancelled) return

      for (let index = 0; index < orderedCandidates.length; index += 1) {
        const candidate = orderedCandidates[index]
        const slot = String(candidate?.slot || ADMIRER_SLOTS[index] || String(index + 1))
        const tagline = String(candidate?.fields?.introTagline || '...')

        setIntroPhase(slot.toLowerCase())
        setIntroTaglines((prev) => ({ ...prev, [slot]: tagline }))
        await speakRosesLine({
          text: withAdmirerSpeechTag(slot, tagline),
          speaker: 'dater',
          slot,
          candidate,
        })
        if (cancelled) return

        if (index < orderedCandidates.length - 1) {
          await wait(BETWEEN_INTRO_LINES_MS)
          if (cancelled) return
        }
      }

      setIntroPhase('done')
    }

    playIntro()

    return () => {
      cancelled = true
    }
  }, [stage, chatLog.length, orderedCandidates, speakRosesLine])

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
    setCanPlayIntroRound(Boolean(profileResp.canPlayIntroRound))
    setMustCreateProfileBeforeNextRound(Boolean(profileResp.mustCreateProfileBeforeNextRound))
    setCanEditToday(Boolean(profileResp.canEditToday))
    setLeaderboard({
      allTime: leaderboardResp.allTime || [],
      weekly: leaderboardResp.weekly || [],
      weekKey: leaderboardResp.weekKey || '',
    })

    if (profileResp.profile?.fields) {
      setFields(sanitizeRosesFields(profileResp.profile.fields))
      setManualTouched({})
      setOnboardingRoundActive(false)
      setStage('dashboard')
      return
    }

    setFields(emptyFields())
    setManualTouched({})
    setOnboardingRoundActive(false)
    setStage(profileResp.canPlayIntroRound ? 'onboarding' : 'profile')
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
    void triggerHaptic('heavy')

    try {
      const value = await generateRosesField(fieldId, fields)
      if (!value) {
        setError(`Could not generate ${fieldId}. Try again.`)
        void triggerHaptic('error')
        return
      }
      setFieldValue(fieldId, value)
      setManualTouched((prev) => ({ ...prev, [fieldId]: true }))
      setStatus(`Generated ${fieldId}.`)
      void triggerHaptic('success')
    } catch (genError) {
      console.error(genError)
      setError(`Could not generate ${fieldId}.`)
      void triggerHaptic('error')
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
    void triggerHaptic('heavy')

    const normalized = sanitizeRosesFields(fields)
    const allEmpty = Object.values(normalized).every((value) => !String(value || '').trim())

    if (allEmpty) {
      setError('Add at least one field manually before publishing.')
      void triggerHaptic('error')
      return
    }

    if (manualFieldCount < 1) {
      setError('Add at least one field manually before publishing.')
      void triggerHaptic('error')
      return
    }

    const missingStill = PROFILE_FIELDS
      .map((field) => field.id)
      .filter((fieldId) => !String(normalized[fieldId] || '').trim())

    if (missingStill.length) {
      setError('Some fields are still empty. Use Generate Empties first.')
      void triggerHaptic('error')
      return
    }

    const age = Number.parseInt(String(normalized.age || ''), 10)
    if (!Number.isFinite(age) || age < 18) {
      setError('Age must be 18 or older.')
      void triggerHaptic('error')
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
      setCanPlayIntroRound(false)
      setMustCreateProfileBeforeNextRound(false)
      setCanEditToday(Boolean(response.canEditToday))
      setFields(normalized)
      setManualTouched({})
      setStatus('Profile published to the global Roses pool.')
      void triggerHaptic('success')

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
      void triggerHaptic('error')
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

  const handleStartRound = async ({ onboarding = false } = {}) => {
    await primeTTSPlayback()
    setError('')
    setStatus('Starting Roses round...')
    void triggerHaptic('heavy')

    try {
      const response = await startRosesRound({ playerId })
      setRound(response.round)
      setCandidates(response.candidates || [])
      setChatLog([])
      setIntroPhase('idle')
      setIntroTaglines({})
      setActiveSpeechSlot('')
      setActiveSpeechAnswerKey('')
      setQuestionInput('')
      setQuestionPromptIndexes(randomPromptPlan())
      setReveal(null)
      setOnboardingRoundActive(Boolean(onboarding))
      setStage('chat')
      setStatus('')
      void triggerHaptic('success')
    } catch (roundError) {
      console.error(roundError)
      setError(roundError.message || 'Failed to start round.')
      setStatus('')
      void triggerHaptic('error')
    }
  }

  const handleSendQuestion = async (overrideBlank = '') => {
    if (!round || sendingQuestion || introActive) return

    const explicitBlank = typeof overrideBlank === 'string' ? overrideBlank.trim() : ''
    const blankSource = explicitBlank || String(questionInput || '').trim()
    const question = fillQuestionTemplate(activePromptTemplate, blankSource).trim()
    if (!question) return
    const normalizedQuestion = normalizeQuestionForDuplicateCheck(question)
    const alreadyAskedThisRound = chatLog.some(
      (turn) => normalizeQuestionForDuplicateCheck(turn?.question) === normalizedQuestion,
    )
    if (alreadyAskedThisRound) {
      setError('You already asked that question this round. Ask a different one.')
      void triggerHaptic('error')
      return
    }

    if ((Number(round.turnIndex) || 0) >= TURN_COUNT) {
      setStage('choose')
      return
    }

    await primeTTSPlayback()
    setSendingQuestion(true)
    setError('')
    void triggerHaptic('heavy')
    const previousChatLog = chatLog

    try {
      const buildsPriorTurns = (candidateId) => chatLog
        .map((turn) => {
          const answer = (turn.answers || []).find((item) => String(item.candidateId) === String(candidateId))
          if (!answer) return null
          return { question: turn.question, response: answer.response }
        })
        .filter(Boolean)

      if (orderedCandidates.length < 2) {
        setError('Round candidate data is missing.')
        void triggerHaptic('error')
        return
      }

      const nextTurnNumber = chatLog.length + 1
      const appendAnswerToTurn = (answerEntry) => {
        setChatLog((prev) => prev.map((turn) => {
          if (turn.turnNumber !== nextTurnNumber) return turn
          const existingAnswers = Array.isArray(turn.answers) ? turn.answers : []
          const filteredAnswers = existingAnswers.filter(
            (item) => String(item?.candidateId || '') !== String(answerEntry?.candidateId || ''),
          )
          return {
            ...turn,
            answers: [...filteredAnswers, answerEntry],
          }
        }))
      }

      setStatus('Reading your question while admirers think...')
      const questionSpeechPromise = speakRosesLine({
        text: question,
        speaker: 'avatar',
        slot: 'Q',
      })

      setChatLog((prev) => [
        ...prev,
        {
          turnNumber: nextTurnNumber,
          question,
          answers: [],
        },
      ])

      const collectedResponses = []
      let upcomingReplyPromise = generateRosesReply({
        profile: orderedCandidates[0],
        question,
        priorTurns: buildsPriorTurns(orderedCandidates[0]?.playerId),
        usedResponses: [],
      })

      for (let index = 0; index < orderedCandidates.length; index += 1) {
        const candidate = orderedCandidates[index]
        const responseText = String(await upcomingReplyPromise || '').trim()
        const item = {
          candidateId: candidate?.playerId,
          response: responseText,
        }
        const slot = String(candidate?.slot || ADMIRER_SLOTS[index] || String(index + 1))
        const answerEntry = {
          candidateId: item.candidateId,
          candidateSlot: slot,
          response: item.response,
        }

        if (index === 0) {
          await questionSpeechPromise
        }

        appendAnswerToTurn(answerEntry)
        collectedResponses.push(item)

        if (index < orderedCandidates.length - 1) {
          const nextCandidate = orderedCandidates[index + 1]
          upcomingReplyPromise = generateRosesReply({
            profile: nextCandidate,
            question,
            priorTurns: buildsPriorTurns(nextCandidate?.playerId),
            usedResponses: collectedResponses.map((entry) => entry.response),
          })
        } else {
          upcomingReplyPromise = null
        }

        setStatus(`${admirerLabelFromSlot(slot)} responds...`)
        await speakRosesLine({
          text: withAdmirerSpeechTag(slot, item.response),
          speaker: 'dater',
          slot,
          candidate,
          answerKey: `${nextTurnNumber}-${item.candidateId}`,
        })

        if (index < orderedCandidates.length - 1) {
          await wait(BETWEEN_ANSWER_LINES_MS)
        }
      }

      setStatus('Recording round turn...')
      const response = await submitRosesTurn({
        playerId,
        roundId: round.id,
        question,
        responses: collectedResponses,
      })

      setRound((prev) => ({ ...prev, ...response.round }))
      setQuestionInput('')

      if (response.round?.doneAsking) {
        setStage('choose')
      }
    } catch (turnError) {
      console.error(turnError)
      setChatLog(previousChatLog)
      setError(turnError.message || 'Failed to send question.')
      void triggerHaptic('error')
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
    requestAnimationFrame(() => {
      const node = questionInputRef.current
      if (!node) return
      const pos = String(node.value || '').length
      node.setSelectionRange(pos, pos)
    })
  }

  const handleUseSuggestedQuestion = () => {
    if (sendingQuestion || introActive) return
    void triggerHaptic('heavy')
    setQuestionPromptIndexes((prev) => {
      const next = [...prev]
      const turnIndex = Math.min(TURN_COUNT - 1, chatLog.length)
      const currentValue = Number(next[turnIndex] || 0)
      const usedInOtherTurns = new Set(
        next
          .map((value, idx) => (idx === turnIndex ? null : Number(value)))
          .filter((value) => Number.isFinite(value)),
      )

      let candidatePool = Array.from({ length: QUESTION_BANK.length }, (_, idx) => idx)
        .filter((idx) => idx !== currentValue)
        .filter((idx) => !usedInOtherTurns.has(idx))

      if (!candidatePool.length) {
        candidatePool = Array.from({ length: QUESTION_BANK.length }, (_, idx) => idx)
          .filter((idx) => idx !== currentValue)
      }

      const updatedValue = candidatePool[Math.floor(Math.random() * candidatePool.length)] ?? currentValue
      next[turnIndex] = updatedValue
      return next
    })
    setQuestionInput('')
    requestAnimationFrame(() => {
      const node = questionInputRef.current
      if (!node) return
      node.focus()
      node.setSelectionRange(0, 0)
    })
  }

  const handleQuickFillQuestion = (value = '') => {
    if (sendingQuestion || introActive) return
    const nextValue = String(value || '').trim()
    if (!nextValue) return
    setQuestionInput(nextValue)
    handleSendQuestion(nextValue)
  }

  const handleExitRound = () => {
    stopAllAudio()
    setActiveSpeechSlot('')
    setActiveSpeechAnswerKey('')
    setIntroPhase('idle')
    setIntroTaglines({})
    setStatus('')
    setOnboardingRoundActive(false)
    if (profile?.fields) {
      setStage('dashboard')
      return
    }
    setStage(canPlayIntroRound ? 'onboarding' : 'profile')
  }

  const handleChooseWinner = async (winnerId) => {
    if (!round || choosingWinner) return

    setChoosingWinner(true)
    setError('')
    void triggerHaptic('heavy')

    try {
      const response = await completeRosesRound({ playerId, roundId: round.id, winnerId })
      setReveal(response.reveal)
      setStage('reveal-nonwinners')
      void triggerHaptic('success')

      const refreshedDay = getLocalDayKey(timezone)
      const [profileResp, leaderboardResp] = await Promise.all([
        fetchRosesProfile({ playerId, timezone, localDay: refreshedDay }),
        fetchRosesLeaderboard(25),
      ])
      setProfile(profileResp.profile || null)
      setCanPlay(Boolean(profileResp.canPlay))
      setCanPlayIntroRound(Boolean(profileResp.canPlayIntroRound))
      setMustCreateProfileBeforeNextRound(Boolean(profileResp.mustCreateProfileBeforeNextRound))
      setCanEditToday(Boolean(profileResp.canEditToday))
      setLeaderboard({
        allTime: leaderboardResp.allTime || [],
        weekly: leaderboardResp.weekly || [],
        weekKey: leaderboardResp.weekKey || '',
      })
    } catch (completeError) {
      console.error(completeError)
      setError(completeError.message || 'Failed to submit Rose decision.')
      void triggerHaptic('error')
    } finally {
      setChoosingWinner(false)
    }
  }

  if (stage === 'loading') {
    return (
      <div className="roses-mode">
        <div className="roses-card centered">Loading Roses mode...</div>
      </div>
    )
  }

  if (stage === 'onboarding') {
    return (
      <div className="roses-mode">
        <div className="roses-card roses-onboarding-shell">
          <div className="roses-topbar">
            <button className="roses-back" type="button" onClick={onBack}>Back</button>
            <h2>Roses</h2>
            <span className="roses-topbar-spacer" aria-hidden="true" />
          </div>

          {error && <div className="roses-error">{error}</div>}
          {status && <div className="roses-status">{status}</div>}

          <div className="roses-onboarding-hero">
            <div className="roses-onboarding-kicker">First Round</div>
            <h3 className="roses-onboarding-title">Judge first. Make your profile after.</h3>
            <p className="roses-onboarding-copy">
              Start with a real round of Roses. Meet three admirers, ask all three the same
              questions, and hand one of them your Rose.
            </p>
            <p className="roses-onboarding-copy">
              After the reveal, you&apos;ll make your own profile so the pool can judge you back.
            </p>
          </div>

          <TutorialCue
            title="How Roses Works"
            body="Ask all 3 admirers the same questions. After 3 exchanges, give your Rose to your favorite."
          />

          <button
            type="button"
            className="roses-primary roses-onboarding-cta"
            onClick={() => handleStartRound({ onboarding: true })}
            disabled={!canPlayIntroRound}
          >
            Give out your first Rose!
          </button>
        </div>
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

          {onboardingChatTutorial && (
            <TutorialCue
              title={onboardingChatTutorial.title}
              body={onboardingChatTutorial.body}
            />
          )}

          <div ref={chatLogRef} className="roses-chat-log">
            {chatLog.length === 0 && (
              <div className="roses-intro-sequence">
                {orderedCandidates.map((candidate, index) => {
                  const slot = String(candidate?.slot || ADMIRER_SLOTS[index] || String(index + 1))
                  const tagline = introTaglines[slot] || ''
                  const active = activeSpeechSlot === slot
                  return (
                  <div
                    key={`intro-${slot}`}
                    className={[
                      'roses-intro-card',
                      active ? 'is-active' : '',
                      tagline ? 'is-revealed' : '',
                    ].filter(Boolean).join(' ')}
                  >
                    <div className="roses-answer-head">{admirerLabelFromSlot(slot)}</div>
                    <div className="roses-intro-tagline">{tagline}</div>
                  </div>
                  )
                })}
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
            <div className="roses-question-template">{activePromptTemplate}</div>
            <div className="roses-question-options" role="group" aria-label="Quick fill options">
              {activePromptOptions.map((option) => (
                <button
                  key={`${activePromptTemplate}-${option}`}
                  type="button"
                  className={[
                    'roses-question-option',
                    String(questionInput || '').trim().toLowerCase() === String(option).toLowerCase()
                      ? 'is-selected'
                      : '',
                  ].filter(Boolean).join(' ')}
                  onClick={() => handleQuickFillQuestion(option)}
                  disabled={sendingQuestion || introActive}
                >
                  {option}
                </button>
              ))}
            </div>
            <input
              ref={questionInputRef}
              type="text"
              value={questionInput}
              onChange={(event) => setQuestionInput(event.target.value.slice(0, 90))}
              onKeyDown={handleQuestionKeyDown}
              onFocus={handleQuestionFocus}
              placeholder="Or any custom text!"
              disabled={sendingQuestion || introActive}
            />
            <div className="roses-question-actions">
              <button
                type="button"
                className="roses-question-dice"
                aria-label="Randomize question prompt"
                onClick={handleUseSuggestedQuestion}
                disabled={sendingQuestion || introActive}
                title="Randomize question prompt"
              >
                🎲
              </button>
              <button
                type="button"
                className="roses-primary"
                onClick={() => handleSendQuestion()}
                disabled={sendingQuestion || introActive || !questionInput.trim()}
              >
                {sendingQuestion ? 'Getting All Answers...' : 'Ask All Admirers'}
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (stage === 'choose') {
    return (
      <div className="roses-mode roses-mode-chat">
        <div className="roses-card roses-chat-shell roses-choose-shell">
          <div className="roses-chat-head">
            <button className="roses-back" type="button" onClick={handleExitRound}>Exit Round</button>
            <h2>Award One Rose</h2>
            <span className="roses-chat-progress">Final Choice</span>
          </div>

          {onboardingChooseTutorial && (
            <TutorialCue
              title={onboardingChooseTutorial.title}
              body={onboardingChooseTutorial.body}
            />
          )}

          <div className="roses-chat-log roses-choose-log">
            {chatLog.map((turn) => (
              <div key={`choose-turn-${turn.turnNumber}`} className="roses-turn-card">
                <div className="roses-chat-question">Q{turn.turnNumber}: {turn.question}</div>
                <div className="roses-answers-grid">
                  {orderedCandidates.map((candidate, index) => {
                    const answer = (turn.answers || []).find(
                      (item) => String(item.candidateId) === String(candidate?.playerId || ''),
                    )
                    const slot = candidate?.slot || ADMIRER_SLOTS[index] || String(index + 1)
                    const responseText = String(answer?.response || 'No answer logged.')
                    return (
                      <div
                        key={`choose-turn-${turn.turnNumber}-cand-${candidate?.playerId || index}`}
                        className={[
                          'roses-answer-panel',
                          responseText === 'No answer logged.' ? 'is-empty' : '',
                        ].filter(Boolean).join(' ')}
                      >
                        <div className="roses-answer-head">{admirerLabelFromSlot(slot)}</div>
                        <div className="roses-chat-answer">{responseText}</div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="roses-choose-row">
            <div className="roses-question-template">Choose your favorite admirer. You must pick one.</div>
            <div className="roses-choose-actions">
              {orderedCandidates.map((candidate, index) => {
                const slot = candidate?.slot || ADMIRER_SLOTS[index] || String(index + 1)
                return (
                  <button
                    key={`pick-${candidate?.playerId || index}`}
                    type="button"
                    className="roses-choose-btn"
                    onClick={() => candidate?.playerId && handleChooseWinner(candidate.playerId)}
                    disabled={choosingWinner || !candidate?.playerId}
                  >
                    {choosingWinner ? 'Submitting...' : `Give Rose to ${admirerLabelFromSlot(slot)}`}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (stage === 'reveal-nonwinners') {
    const nonWinnerProfiles = Array.isArray(reveal?.nonWinners)
      ? reveal.nonWinners
      : [reveal?.loser].filter(Boolean)

    return (
      <div className="roses-mode">
        <div className="roses-card">
          <h2 className="roses-reveal-stage-title is-loser">Admirers Not Chosen</h2>
          <div className="roses-reveal-multi-grid">
            {nonWinnerProfiles.map((item, index) => (
              <RevealCard
                key={`nonwinner-${item?.playerId || index}`}
                profile={item}
                title=""
                emphasis="default"
              />
            ))}
          </div>
          <button
            type="button"
            className="roses-reveal-cta"
            onClick={() => {
              void triggerHaptic('success')
              setStage('reveal-winner')
            }}
          >
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
          <button
            type="button"
            className="roses-primary"
            onClick={() => {
              setOnboardingRoundActive(false)
              setStage(mustCreateProfileBeforeNextRound ? 'profile' : 'dashboard')
            }}
          >
            {mustCreateProfileBeforeNextRound ? 'Make Your Roses Profile' : 'Back to Roses Dashboard'}
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
          <h2>
            {stage === 'profile'
              ? (profile ? 'Edit Your Roses Profile' : 'Create Your Roses Profile')
              : 'Roses Dashboard'}
          </h2>
          <span className="roses-topbar-spacer" aria-hidden="true" />
        </div>

        {error && <div className="roses-error">{error}</div>}
        {status && <div className="roses-status">{status}</div>}

        {stage === 'profile' ? (
          <>
            <p className="roses-profile-subtitle">
              {mustCreateProfileBeforeNextRound && !profile
                ? 'You gave out your first Rose. Now build your own profile so the pool can judge you back.'
                : 'Build the most enticing imaginary dating profile possible!'}
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
              <button type="button" className="roses-primary" onClick={() => handleStartRound()} disabled={!canPlay}>
                Judge Profiles
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
                  {displayedSentimentKeywords.map((item) => (
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

      </div>
    </div>
  )
}

export default RosesMode
