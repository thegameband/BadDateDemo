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
import { QUESTION_BANK } from '../data/rosesQuestionBank'
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
const TUTORIAL_LINE_HOLD_MS = 340
const CHOOSE_STAGE_DELAY_MS = 340
const ADMIRER_SLOTS = ['A', 'B', 'C']
const DASHBOARD_TABS = [
  { id: 'profile', label: 'Profile' },
  { id: 'stats', label: 'Stats' },
  { id: 'boards', label: 'Boards' },
]
const ONBOARDING_TUTORIAL_LINES = {
  intro: "Let's let our first set of admirers introduce themselves!",
  compose: 'Compose your question! What would you want to know about a prospective partner?',
  afterFirstAnswer: 'You get three questions to learn as much as you can about your Admirers.',
  afterSecondAnswer: 'This is your last question, make it a good one!',
  finalChoice: "Which Admirer's answers did you like the best? You only have one Rose to give!",
}

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

function isTurnLogEntry(entry) {
  return String(entry?.type || 'turn') === 'turn'
}

function isIntroLogEntry(entry) {
  return String(entry?.type || '') === 'intro'
}

function TutorialLogEntry({ message }) {
  if (!String(message || '').trim()) return null
  return (
    <div className="roses-tutorial-card" role="note" aria-live="polite">
      <p className="roses-tutorial-body">{message}</p>
    </div>
  )
}

function IntroLogEntry({ slot, message, isSpeaking = false }) {
  if (!String(message || '').trim()) return null

  return (
    <div
      className={[
        'roses-intro-log-card',
        isSpeaking ? 'is-speaking' : '',
      ].filter(Boolean).join(' ')}
    >
      <div className="roses-answer-head">{admirerLabelFromSlot(slot)}</div>
      <div className="roses-chat-answer">{message}</div>
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

function buildLeaderboardDisplayRows({
  entries = [],
  mode = 'allTime',
  currentPlayerId = '',
  maxRows = 10,
}) {
  const normalizedEntries = Array.isArray(entries) ? entries : []
  const limit = Math.max(10, Number(maxRows) || 10)

  if (normalizedEntries.length <= limit) {
    return normalizedEntries.slice(0, limit).map((entry, absoluteIndex) => ({
      type: 'entry',
      entry,
      absoluteIndex,
    }))
  }

  const playerIndex = normalizedEntries.findIndex(
    (entry) => String(entry?.playerId || '') === String(currentPlayerId || ''),
  )

  if (playerIndex < 0) {
    return normalizedEntries.slice(0, limit).map((entry, absoluteIndex) => ({
      type: 'entry',
      entry,
      absoluteIndex,
    }))
  }

  const playerRank = getRankForBoard(normalizedEntries[playerIndex], mode, playerIndex)
  if (playerRank <= limit) {
    return normalizedEntries.slice(0, limit).map((entry, absoluteIndex) => ({
      type: 'entry',
      entry,
      absoluteIndex,
    }))
  }

  const topCount = 5
  const aroundCount = 5
  const aroundStart = Math.max(0, playerIndex - 2)
  const aroundEnd = Math.min(normalizedEntries.length, aroundStart + aroundCount)
  const adjustedAroundStart = Math.max(0, aroundEnd - aroundCount)

  const topRows = normalizedEntries.slice(0, topCount).map((entry, absoluteIndex) => ({
    type: 'entry',
    entry,
    absoluteIndex,
  }))

  const aroundRows = normalizedEntries.slice(adjustedAroundStart, aroundEnd).map((entry, offset) => ({
    type: 'entry',
    entry,
    absoluteIndex: adjustedAroundStart + offset,
  }))

  return [
    ...topRows,
    { type: 'gap', key: `gap-${mode}-${currentPlayerId || 'unknown'}` },
    ...aroundRows,
  ]
}

function LeaderboardPanel({
  title,
  mode,
  entries = [],
  currentPlayerId = '',
  weekKey = '',
  maxRows = 10,
  compact = false,
}) {
  const weekLabel = mode === 'weekly' ? formatWeekStartLabel(weekKey) : ''
  const displayRows = buildLeaderboardDisplayRows({ entries, mode, currentPlayerId, maxRows })

  return (
    <section className={['roses-lb-panel', compact ? 'is-compact' : ''].filter(Boolean).join(' ')}>
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
  const [activeSpeechSlot, setActiveSpeechSlot] = useState('')
  const [activeSpeechAnswerKey, setActiveSpeechAnswerKey] = useState('')
  const [questionInput, setQuestionInput] = useState('')
  const [lockedQuestion, setLockedQuestion] = useState('')
  const [questionPromptIndexes, setQuestionPromptIndexes] = useState(() => randomPromptPlan())
  const [sendingQuestion, setSendingQuestion] = useState(false)
  const [choosingWinner, setChoosingWinner] = useState(false)
  const [previewCandidateId, setPreviewCandidateId] = useState('')
  const [reveal, setReveal] = useState(null)
  const [onboardingRoundActive, setOnboardingRoundActive] = useState(false)
  const [dashboardTab, setDashboardTab] = useState(DASHBOARD_TABS[0]?.id || 'profile')
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
  const introTutorialEntry = useMemo(
    () => chatLog.find((entry) => String(entry?.id || '') === 'tutorial-intro') || null,
    [chatLog],
  )
  const postIntroLogEntries = useMemo(
    () => chatLog.filter((entry) => String(entry?.id || '') !== 'tutorial-intro'),
    [chatLog],
  )
  const introLogEntries = useMemo(
    () => postIntroLogEntries.filter((entry) => isIntroLogEntry(entry)),
    [postIntroLogEntries],
  )
  const nonIntroLogEntries = useMemo(
    () => postIntroLogEntries.filter((entry) => !isIntroLogEntry(entry)),
    [postIntroLogEntries],
  )
  const turnEntries = useMemo(
    () => chatLog.filter((entry) => isTurnLogEntry(entry)),
    [chatLog],
  )
  const previewCandidate = useMemo(
    () => orderedCandidates.find((candidate) => String(candidate?.playerId || '') === String(previewCandidateId || '')) || null,
    [orderedCandidates, previewCandidateId],
  )
  const previewIntroEntry = useMemo(
    () => introLogEntries.find((entry) => String(entry?.slot || '') === String(previewCandidate?.slot || '')) || null,
    [introLogEntries, previewCandidate],
  )

  const questionNumber = Math.min(TURN_COUNT, Number(round?.turnIndex || 0) + 1)
  const currentTurnPromptIndex = Math.min(TURN_COUNT - 1, Number(round?.turnIndex || 0))
  const activePromptOptionIndex = questionPromptIndexes[currentTurnPromptIndex] ?? 0
  const activePrompt = QUESTION_BANK[activePromptOptionIndex] || QUESTION_BANK[0] || { template: '', options: [] }
  const activePromptTemplate = activePrompt.template || ''
  const activePromptOptions = activePrompt.options || []
  const introActive = stage === 'chat' && introPhase !== 'done'
  const composerState = introActive
    ? 'intro'
    : sendingQuestion
      ? 'locked'
      : 'compose'
  const sentimentKeywords = Array.isArray(profile?.sentimentKeywords) ? profile.sentimentKeywords : []
  const displayedSentimentKeywords = sentimentKeywords.slice(0, 10)
  const hasSentimentKeywords = sentimentKeywords.length > 0

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

  const appendTutorialLine = useCallback(async (key, message) => {
    const trimmedMessage = String(message || '').trim()
    const entryId = `tutorial-${String(key || '').trim()}`
    if (!onboardingRoundActive || !trimmedMessage || !entryId) return

    setChatLog((prev) => {
      if (prev.some((entry) => String(entry?.id || '') === entryId)) return prev
      return [...prev, { type: 'tutorial', id: entryId, message: trimmedMessage }]
    })

    await speakRosesLine({
      text: trimmedMessage,
      speaker: 'avatar',
    })
    await wait(TUTORIAL_LINE_HOLD_MS)
  }, [onboardingRoundActive, speakRosesLine])

  useEffect(() => {
    if (stage !== 'chat') return
    const node = chatLogRef.current
    if (!node) return

    const frameId = requestAnimationFrame(() => {
      node.scrollTop = node.scrollHeight
    })

    return () => cancelAnimationFrame(frameId)
  }, [stage, chatLog])

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
    if (turnEntries.length > 0) {
      setIntroPhase('done')
      return
    }
    if (orderedCandidates.length < 2) return

    let cancelled = false

    const playIntro = async () => {
      setIntroPhase('idle')
      if (onboardingRoundActive) {
        await appendTutorialLine('intro', ONBOARDING_TUTORIAL_LINES.intro)
      }
      await wait(INTRO_PHASE_HOLD_MS)
      if (cancelled) return

      for (let index = 0; index < orderedCandidates.length; index += 1) {
        const candidate = orderedCandidates[index]
        const slot = String(candidate?.slot || ADMIRER_SLOTS[index] || String(index + 1))
        const tagline = String(candidate?.fields?.introTagline || '...')

        setIntroPhase(slot.toLowerCase())
        setChatLog((prev) => {
          const entryId = `intro-${slot}`
          if (prev.some((entry) => String(entry?.id || '') === entryId)) return prev
          return [...prev, { type: 'intro', id: entryId, slot, message: tagline }]
        })
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

      if (onboardingRoundActive) {
        setIntroPhase('tutorial')
        await appendTutorialLine('compose', ONBOARDING_TUTORIAL_LINES.compose)
        if (cancelled) return
      }

      setIntroPhase('done')
    }

    playIntro()

    return () => {
      cancelled = true
    }
  }, [stage, turnEntries.length, orderedCandidates, speakRosesLine, onboardingRoundActive, appendTutorialLine])

  useEffect(() => () => {
    stopAllAudio()
  }, [])

  useEffect(() => {
    if (stage === 'dashboard') {
      setDashboardTab(DASHBOARD_TABS[0]?.id || 'profile')
    }
  }, [stage])

  useEffect(() => {
    if (stage !== 'choose') {
      setPreviewCandidateId('')
    }
  }, [stage])

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
      setActiveSpeechSlot('')
      setActiveSpeechAnswerKey('')
      setQuestionInput('')
      setLockedQuestion('')
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
    const alreadyAskedThisRound = turnEntries.some(
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
    setLockedQuestion(question)
    setError('')
    void triggerHaptic('heavy')
    const previousChatLog = chatLog
    let shouldAdvanceToChoose = false

    try {
      const buildsPriorTurns = (candidateId) => turnEntries
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

      const nextTurnNumber = turnEntries.length + 1
      const appendAnswerToTurn = (answerEntry) => {
        setChatLog((prev) => prev.map((entry) => {
          if (!isTurnLogEntry(entry) || entry.turnNumber !== nextTurnNumber) return entry
          const existingAnswers = Array.isArray(entry.answers) ? entry.answers : []
          const filteredAnswers = existingAnswers.filter(
            (item) => String(item?.candidateId || '') !== String(answerEntry?.candidateId || ''),
          )
          return {
            ...entry,
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
          type: 'turn',
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

      if (onboardingRoundActive) {
        if (nextTurnNumber === 1) {
          await appendTutorialLine('after-first-answer', ONBOARDING_TUTORIAL_LINES.afterFirstAnswer)
        } else if (nextTurnNumber === 2) {
          await appendTutorialLine('after-second-answer', ONBOARDING_TUTORIAL_LINES.afterSecondAnswer)
        } else if (nextTurnNumber === TURN_COUNT) {
          await appendTutorialLine('final-choice', ONBOARDING_TUTORIAL_LINES.finalChoice)
        }
      }

      if (response.round?.doneAsking) {
        shouldAdvanceToChoose = true
        setStatus('Time to give out your Rose...')
        await wait(CHOOSE_STAGE_DELAY_MS)
        setStage('choose')
      }
    } catch (turnError) {
      console.error(turnError)
      setChatLog(previousChatLog)
      setError(turnError.message || 'Failed to send question.')
      setLockedQuestion('')
      void triggerHaptic('error')
    } finally {
      setStatus('')
      setActiveSpeechSlot('')
      setActiveSpeechAnswerKey('')
      setSendingQuestion(false)
      if (!shouldAdvanceToChoose) {
        setLockedQuestion('')
      }
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
      const turnIndex = Math.min(TURN_COUNT - 1, turnEntries.length)
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
    requestAnimationFrame(() => {
      const node = questionInputRef.current
      if (!node) return
      node.focus()
      const pos = String(nextValue).length
      node.setSelectionRange(pos, pos)
    })
  }

  const handleExitRound = () => {
    stopAllAudio()
    setActiveSpeechSlot('')
    setActiveSpeechAnswerKey('')
    setIntroPhase('idle')
    setStatus('')
    setLockedQuestion('')
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

  const handlePreviewChoice = (candidateId) => {
    const nextId = String(candidateId || '').trim()
    if (!nextId) return
    setPreviewCandidateId(nextId)
  }

  const handlePreviewLeave = () => {
    if (typeof window !== 'undefined' && window.matchMedia?.('(hover: none)').matches) return
    setPreviewCandidateId('')
  }

  const handleChooseButtonPress = (candidateId) => {
    const nextId = String(candidateId || '').trim()
    if (!nextId || choosingWinner) return

    const requiresPreviewTap = typeof window !== 'undefined' && window.matchMedia?.('(hover: none)').matches
    if (requiresPreviewTap && previewCandidateId !== nextId) {
      setPreviewCandidateId(nextId)
      return
    }

    handleChooseWinner(nextId)
  }

  if (stage === 'loading') {
    return (
    <div className={['roses-mode', stage === 'dashboard' ? 'roses-mode-dashboard' : ''].filter(Boolean).join(' ')}>
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
            <h3 className="roses-onboarding-title">Giving Roses</h3>
            <div className="roses-onboarding-copy-list">
              <p className="roses-onboarding-copy">Meet 3 mystery admirers 🕵️</p>
              <p className="roses-onboarding-copy">Ask them some telling questions 👀</p>
              <p className="roses-onboarding-copy">Review their answers and give your Rose to your favorite 🌹</p>
            </div>
          </div>

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

          <div ref={chatLogRef} className="roses-chat-log">
            {introTutorialEntry && (
              <TutorialLogEntry
                key={introTutorialEntry.id || introTutorialEntry.message}
                message={introTutorialEntry.message}
              />
            )}
            {introLogEntries.length > 0 && (
              <div className="roses-intro-log-row">
                {introLogEntries.map((entry) => (
                  <IntroLogEntry
                    key={entry.id || `${entry.slot}-${entry.message}`}
                    slot={entry.slot}
                    message={entry.message}
                    isSpeaking={activeSpeechSlot === entry.slot}
                  />
                ))}
              </div>
            )}
            {nonIntroLogEntries.map((entry) => {
              if (!isTurnLogEntry(entry)) {
                return <TutorialLogEntry key={entry.id || entry.message} message={entry.message} />
              }

              return (
                <div key={`turn-${entry.turnNumber}`} className="roses-turn-card">
                  <div className="roses-chat-question">Q{entry.turnNumber}: {entry.question}</div>
                  <div className="roses-answers-grid">
                    {(entry.answers || []).map((answer) => {
                      const answerKey = `${entry.turnNumber}-${answer.candidateId}`
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
              )
            })}
          </div>

          <div className="roses-question-row">
            {composerState === 'compose' ? (
              <>
                <div className="roses-question-phase">Compose your next question</div>
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
                    Ask All Admirers
                  </button>
                </div>
              </>
            ) : (
              <div className="roses-question-locked">
                <div className="roses-question-phase">
                  {introActive ? 'Meet your admirers first' : 'Now asking'}
                </div>
                <div className="roses-question-template">
                  {lockedQuestion || 'Your question is on the way.'}
                </div>
                <div className="roses-question-locked-note">
                  {introActive ? 'Questioning opens right after introductions.' : 'Waiting for all three admirers to answer...'}
                </div>
              </div>
            )}
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

          {error && <div className="roses-error">{error}</div>}
          {status && <div className="roses-status">{status}</div>}

          <div className="roses-chat-log roses-choose-log">
            {introLogEntries.length > 0 && (
              <div className="roses-intro-log-row">
                {introLogEntries.map((entry) => (
                  <IntroLogEntry
                    key={entry.id || `${entry.slot}-${entry.message}`}
                    slot={entry.slot}
                    message={entry.message}
                  />
                ))}
              </div>
            )}
            {nonIntroLogEntries.map((entry) => {
              if (!isTurnLogEntry(entry)) {
                return <TutorialLogEntry key={entry.id || entry.message} message={entry.message} />
              }

              return (
                <div key={`choose-turn-${entry.turnNumber}`} className="roses-turn-card">
                  <div className="roses-chat-question">Q{entry.turnNumber}: {entry.question}</div>
                  <div className="roses-answers-grid">
                    {orderedCandidates.map((candidate, index) => {
                      const answer = (entry.answers || []).find(
                        (item) => String(item.candidateId) === String(candidate?.playerId || ''),
                      )
                      const slot = candidate?.slot || ADMIRER_SLOTS[index] || String(index + 1)
                      const responseText = String(answer?.response || 'No answer logged.')
                      return (
                        <div
                          key={`choose-turn-${entry.turnNumber}-cand-${candidate?.playerId || index}`}
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
              )
            })}
          </div>

          <div className="roses-choose-row">
            <div className="roses-question-template">Give your Rose to your favorite Admirer!</div>
            {previewCandidate && (
              <div className="roses-choose-preview" role="note" aria-live="polite">
                <div className="roses-choose-preview-head">
                  <span className="roses-answer-head">{admirerLabelFromSlot(previewCandidate?.slot || '')}</span>
                </div>
                {previewIntroEntry?.message && (
                  <div className="roses-choose-preview-line">
                    <span className="roses-choose-preview-label">Intro</span>
                    <span className="roses-choose-preview-copy">{previewIntroEntry.message}</span>
                  </div>
                )}
                {turnEntries.map((turn) => {
                  const answer = (turn.answers || []).find(
                    (item) => String(item?.candidateId || '') === String(previewCandidate?.playerId || ''),
                  )
                  if (!answer) return null

                  return (
                    <div key={`preview-turn-${turn.turnNumber}`} className="roses-choose-preview-line">
                      <span className="roses-choose-preview-label">Q{turn.turnNumber}</span>
                      <span className="roses-choose-preview-copy">
                        <span>{turn.question}</span>
                        <strong>{answer.response}</strong>
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
            <div className="roses-choose-actions" onMouseLeave={handlePreviewLeave}>
              {orderedCandidates.map((candidate, index) => {
                const slot = candidate?.slot || ADMIRER_SLOTS[index] || String(index + 1)
                const candidateId = String(candidate?.playerId || '')
                return (
                  <button
                    key={`pick-${candidateId || index}`}
                    type="button"
                    className="roses-choose-btn"
                    onMouseEnter={() => handlePreviewChoice(candidateId)}
                    onFocus={() => handlePreviewChoice(candidateId)}
                    onClick={() => handleChooseButtonPress(candidateId)}
                    disabled={choosingWinner || !candidateId}
                  >
                    {choosingWinner ? 'Submitting...' : `${admirerLabelFromSlot(slot)} 🌹`}
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
      <div
        className={[
          'roses-card',
          stage === 'profile' ? 'roses-profile-shell' : '',
          stage === 'dashboard' ? 'roses-dashboard-shell' : '',
        ].filter(Boolean).join(' ')}
      >
        <div className="roses-topbar">
          <button className="roses-back" type="button" onClick={onBack}>Back</button>
          <h2>
            {stage === 'profile'
              ? (profile ? 'Edit Your Roses Profile' : 'Create Your Roses Profile')
              : 'Roses'}
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
          <div className="roses-dashboard-frame">
            <div
              className={[
                'roses-dashboard-page',
                dashboardTab === 'profile' ? 'is-profile' : '',
                dashboardTab === 'stats' ? 'is-stats' : '',
                dashboardTab === 'boards' ? 'is-boards' : '',
              ].filter(Boolean).join(' ')}
            >
              {dashboardTab === 'profile' && (
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

                  <section className="roses-info-panel roses-profile-panel">
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

                    <div className="roses-profile-copy-grid">
                      <div className="roses-panel-copy">
                        <h3 className="roses-panel-title">Intro Tagline</h3>
                        <p className="roses-panel-body is-clamped is-tight">{profile?.fields?.introTagline || '-'}</p>
                      </div>
                      <div className="roses-panel-copy">
                        <h3 className="roses-panel-title">Bio</h3>
                        <p className="roses-panel-body is-clamped">{profile?.fields?.bio || '-'}</p>
                      </div>
                    </div>
                  </section>
                </>
              )}

              {dashboardTab === 'stats' && (
                <>
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

                  <section className="roses-info-panel roses-topics-panel">
                    <div className="roses-topics-head">
                      <h3 className="roses-panel-title">Topics Discussed</h3>
                      <span className="roses-muted">{profile?.fields?.name || 'Profile'}</span>
                    </div>
                    {hasSentimentKeywords ? (
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
                    ) : (
                      <div className="roses-lb-empty">Custom topics will show up here after a few rounds.</div>
                    )}
                  </section>
                </>
              )}

              {dashboardTab === 'boards' && (
                <div className="roses-leaderboards roses-leaderboards-dashboard">
                  <LeaderboardPanel
                    title="All-Time Roses"
                    mode="allTime"
                    entries={leaderboard.allTime}
                    currentPlayerId={playerId}
                    maxRows={10}
                    compact
                  />
                  <LeaderboardPanel
                    title="Top Roses This Week"
                    mode="weekly"
                    entries={leaderboard.weekly}
                    currentPlayerId={playerId}
                    weekKey={leaderboard.weekKey}
                    maxRows={10}
                    compact
                  />
                </div>
              )}
            </div>

            <div className="roses-dashboard-tabbar" role="tablist" aria-label="Roses dashboard pages">
              {DASHBOARD_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={dashboardTab === tab.id}
                  className={[
                    'roses-dashboard-tab',
                    dashboardTab === tab.id ? 'is-active' : '',
                  ].filter(Boolean).join(' ')}
                  onClick={() => setDashboardTab(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}

export default RosesMode
