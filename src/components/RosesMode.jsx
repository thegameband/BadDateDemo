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

const EDIT_PROFILE_FIELDS = [
  { id: 'name', label: 'Name', multiline: false, placeholder: 'Smurf Blaster', half: true },
  { id: 'occupation', label: 'Occupation', multiline: false, placeholder: 'Game Developer', half: true },
  { id: 'bio', label: 'Bio', multiline: true, rows: 5, placeholder: "I'm the developer of the biggest video games in the world: Where Cards Fall, Blaseball, and Dead Man's Party. I'm also extremely hot and successful. I bought a 1:1 scale replica Batcave." },
  { id: 'introTagline', label: 'Intro Tagline', multiline: true, rows: 3, placeholder: 'The line they open with in chat' },
]
const CREATION_FACT_LIMIT = 10
const CREATION_STEPS = ['name', 'occupation', 'final']

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
const BOARD_TABS = [
  { id: 'allTime', label: 'All-time' },
  { id: 'weekly', label: 'Weekly' },
]
const ONBOARDING_TUTORIAL_LINES = {
  intro: "Let's let our first set of admirers introduce themselves!",
  compose: 'Compose your first question by filling in the blank! What might you want to know about a prospective partner?',
  afterFirstAnswer: 'You get three questions to learn anything you want about your Admirers. Compose your question #2 now!',
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
    occupation: '',
    bio: '',
    introTagline: '',
  }
}

function cleanFactValue(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function punctuateFact(value = '') {
  const trimmed = cleanFactValue(value)
  if (!trimmed) return ''
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`
}

function buildBioFromFacts({ name = '', occupation = '', facts = [] }) {
  const normalizedFacts = (Array.isArray(facts) ? facts : [])
    .map((fact) => punctuateFact(fact))
    .filter(Boolean)

  if (normalizedFacts.length) {
    return normalizedFacts.join(' ')
  }

  const safeName = String(name || '').trim() || 'This person'
  const safeOccupation = String(occupation || '').trim() || 'person'
  return `${safeName} works as ${safeOccupation}.`
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

function revealName(profile, fallback = 'Unknown') {
  return String(profile?.fields?.name || '').trim() || fallback
}

function formatRevealNameList(items = []) {
  const names = (Array.isArray(items) ? items : [])
    .map((item, index) => revealName(item, `Admirer ${index + 1}`))
    .filter(Boolean)

  if (!names.length) return 'them'
  if (names.length === 1) return names[0]
  if (names.length === 2) return `${names[0]} and ${names[1]}`
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`
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

function splitQuestionTemplate(template = '') {
  const marker = '_____'
  const source = String(template || '')
  const markerIndex = source.indexOf(marker)

  if (markerIndex < 0) {
    return {
      before: source,
      after: '',
    }
  }

  return {
    before: source.slice(0, markerIndex),
    after: source.slice(markerIndex + marker.length),
  }
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

function FieldInput({ field, value, onChange }) {
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
            inputMode="text"
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
      <div className="roses-reveal-identity">
        <div className="roses-reveal-rank-strip">
          <div className="roses-reveal-rank-pill">
            <span className="roses-reveal-rank-label">All-Time</span>
            <span className="roses-reveal-rank-value">#{profile?.ranks?.allTime || '-'}</span>
          </div>
          <div className="roses-reveal-rank-pill">
            <span className="roses-reveal-rank-label">This Week</span>
            <span className="roses-reveal-rank-value">#{profile?.ranks?.weekly || '-'}</span>
          </div>
        </div>
        <div className="roses-reveal-name">{profile?.fields?.name || 'Unknown'}</div>
        <div className="roses-reveal-subhead occupation">{profile?.fields?.occupation || '-'}</div>
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
}) {
  const weekLabel = mode === 'weekly' ? formatWeekStartLabel(weekKey) : ''
  const displayRows = buildLeaderboardDisplayRows({ entries, mode, currentPlayerId, maxRows })
  const [activeTooltipId, setActiveTooltipId] = useState('')
  const panelRef = useRef(null)

  useEffect(() => {
    function handlePointerDown(event) {
      if (!panelRef.current?.contains(event.target)) {
        setActiveTooltipId('')
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [])

  return (
    <section ref={panelRef} className="roses-lb-panel">
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
            const occupation = String(entry?.occupation || '').trim()
            const tooltipId = `roses-lb-occupation-${mode}-${entry.playerId}`
            const isTooltipOpen = activeTooltipId === entry.playerId

            return (
              <li
                key={`${mode}-${entry.playerId}`}
                className={[
                  'roses-lb-row',
                  isYou ? 'is-you' : '',
                ].filter(Boolean).join(' ')}
              >
                <span className="roses-lb-rank">#{rank}</span>
                <span
                  className="roses-lb-name-wrap"
                  onMouseEnter={() => {
                    if (occupation) setActiveTooltipId(entry.playerId)
                  }}
                  onMouseLeave={() => {
                    setActiveTooltipId((current) => (current === entry.playerId ? '' : current))
                  }}
                >
                  <button
                    type="button"
                    className="roses-lb-name-button"
                    title={displayName}
                    aria-label={occupation ? `${displayName}, occupation: ${occupation}` : displayName}
                    aria-describedby={occupation && isTooltipOpen ? tooltipId : undefined}
                    onFocus={() => {
                      if (occupation) setActiveTooltipId(entry.playerId)
                    }}
                    onBlur={() => {
                      setActiveTooltipId((current) => (current === entry.playerId ? '' : current))
                    }}
                    onClick={(event) => {
                      event.preventDefault()
                      if (!occupation) return
                      setActiveTooltipId((current) => (current === entry.playerId ? '' : entry.playerId))
                    }}
                  >
                    <span className="roses-lb-name">
                      {displayName}{isYou ? ' (you)' : ''}
                    </span>
                  </button>
                  {occupation && isTooltipOpen && (
                    <span id={tooltipId} role="tooltip" className="roses-lb-tooltip">
                      {occupation}
                    </span>
                  )}
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
  const [canEditToday, setCanEditToday] = useState(true)
  const [leaderboard, setLeaderboard] = useState({ allTime: [], weekly: [] })
  const [rosesGiven, setRosesGiven] = useState([])

  const [fields, setFields] = useState(emptyFields)
  const [manualTouched, setManualTouched] = useState({})
  const [creationStep, setCreationStep] = useState(CREATION_STEPS[0])
  const [creationFacts, setCreationFacts] = useState([''])
  const [savingProfile, setSavingProfile] = useState(false)

  const [round, setRound] = useState(null)
  const [candidates, setCandidates] = useState([])
  const [chatLog, setChatLog] = useState([])
  const [introPhase, setIntroPhase] = useState('idle')
  const [activeSpeechSlot, setActiveSpeechSlot] = useState('')
  const [activeSpeechAnswerKey, setActiveSpeechAnswerKey] = useState('')
  const [questionInput, setQuestionInput] = useState('')
  const [questionPromptIndexes, setQuestionPromptIndexes] = useState(() => randomPromptPlan())
  const [sendingQuestion, setSendingQuestion] = useState(false)
  const [choosingWinner, setChoosingWinner] = useState(false)
  const [previewCandidateId, setPreviewCandidateId] = useState('')
  const [reveal, setReveal] = useState(null)
  const [onboardingRoundActive, setOnboardingRoundActive] = useState(false)
  const [dashboardTab, setDashboardTab] = useState(DASHBOARD_TABS[0]?.id || 'profile')
  const [boardsTab, setBoardsTab] = useState(BOARD_TABS[0]?.id || 'allTime')
  const chatLogRef = useRef(null)
  const questionInputRef = useRef(null)
  const bottomPanelRef = useRef(null)
  const revealAnnouncementRef = useRef('')
  const profileStepNarrationRef = useRef('')

  const [status, setStatus] = useState('')
  const [error, setError] = useState('')

  const manualFieldCount = useMemo(() => {
    return Object.entries(manualTouched)
      .filter(([key, touched]) => touched && String(fields[key] || '').trim())
      .length
  }, [fields, manualTouched])

  const hasProfile = Boolean(profile?.fields && String(profile?.playerId || '').trim())

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

  const scrollChatToBottom = useCallback((attempts = 1, delayMs = 0) => {
    const run = () => {
      const node = chatLogRef.current
      if (!node) return
      node.scrollTop = node.scrollHeight
      if (attempts > 1) {
        requestAnimationFrame(() => scrollChatToBottom(attempts - 1, 0))
      }
    }

    if (delayMs > 0) {
      window.setTimeout(run, delayMs)
      return
    }
    requestAnimationFrame(run)
  }, [])

  const currentTurnPromptIndex = Math.min(TURN_COUNT - 1, Number(round?.turnIndex || 0))
  const activePromptOptionIndex = questionPromptIndexes[currentTurnPromptIndex] ?? 0
  const activePrompt = QUESTION_BANK[activePromptOptionIndex] || QUESTION_BANK[0] || { template: '', options: [] }
  const activePromptTemplate = activePrompt.template || ''
  const activePromptOptions = activePrompt.options || []
  const activePromptParts = useMemo(
    () => splitQuestionTemplate(activePromptTemplate),
    [activePromptTemplate],
  )
  const introActive = stage === 'chat' && introPhase !== 'done' && introPhase !== 'tutorial'
  const composerState = introActive
    ? 'intro'
    : sendingQuestion
      ? 'locked'
      : 'compose'
  const isCreatingProfile = stage === 'profile' && !profile
  const creationFactsUsed = useMemo(
    () => creationFacts.map((fact) => cleanFactValue(fact)).filter(Boolean),
    [creationFacts],
  )
  const creationStepIndex = Math.max(0, CREATION_STEPS.indexOf(creationStep))
  const currentCreationPrompt = useMemo(() => {
    const name = String(fields.name || '').trim() || 'this character'

    if (creationStep === 'name') {
      return "Roses isn't just about judging - it's about being judged! Your goal is to make a profile that will accumulate as many Roses as possible from other players. Let's start with a name!"
    }
    if (creationStep === 'occupation') {
      return `It's delightful to meet ${name}. What do they do?`
    }
    return "Last step! Your character's Tagline is how they will introduce themselves in chat. Optionally, you are welcome to enter any additional facts about this character you want. When you're done, submit this profile to the global pool and start gathering your Roses!"
  }, [creationStep, fields.name])
  const sentimentKeywords = Array.isArray(profile?.sentimentKeywords) ? profile.sentimentKeywords : []
  const displayedSentimentKeywords = sentimentKeywords.slice(0, 10)
  const hasSentimentKeywords = sentimentKeywords.length > 0
  const revealNonWinners = useMemo(
    () => (Array.isArray(reveal?.nonWinners) ? reveal.nonWinners : [reveal?.loser].filter(Boolean)),
    [reveal],
  )
  const nonWinnerAnnouncement = useMemo(
    () => `You didn't pick ${formatRevealNameList(revealNonWinners)}.`,
    [revealNonWinners],
  )
  const nonWinnerTutorialBanner = useMemo(
    () => `${nonWinnerAnnouncement} Hit the button below to reveal your chosen!`,
    [nonWinnerAnnouncement],
  )
  const winnerAnnouncement = useMemo(
    () => `You gave your rose to ${revealName(reveal?.winner, 'your chosen admirer')}!`,
    [reveal],
  )

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

  const appendTutorialLine = useCallback(async (key, message, { waitForPlayback = true } = {}) => {
    const trimmedMessage = String(message || '').trim()
    const entryId = `tutorial-${String(key || '').trim()}`
    if (!onboardingRoundActive || !trimmedMessage || !entryId) return

    setChatLog((prev) => {
      if (prev.some((entry) => String(entry?.id || '') === entryId)) return prev
      return [...prev, { type: 'tutorial', id: entryId, message: trimmedMessage }]
    })

    const playback = speakRosesLine({
      text: trimmedMessage,
      speaker: 'avatar',
    })

    if (!waitForPlayback) return

    await playback
    await wait(TUTORIAL_LINE_HOLD_MS)
  }, [onboardingRoundActive, speakRosesLine])

  useEffect(() => {
    if (stage !== 'chat' && stage !== 'choose') return
    scrollChatToBottom(2)
  }, [stage, chatLog, scrollChatToBottom])

  useEffect(() => {
    if (stage !== 'chat' && stage !== 'choose') return undefined
    const logNode = chatLogRef.current
    const panelNode = bottomPanelRef.current
    if (!logNode || !panelNode || typeof ResizeObserver === 'undefined') return undefined

    const observer = new ResizeObserver(() => {
      scrollChatToBottom(2)
    })

    observer.observe(panelNode)
    return () => observer.disconnect()
  }, [stage, composerState, previewCandidateId, scrollChatToBottom])

  useEffect(() => {
    if (stage !== 'choose') return undefined
    scrollChatToBottom(3)
    const timeoutId = window.setTimeout(() => {
      scrollChatToBottom(3)
    }, 180)
    return () => window.clearTimeout(timeoutId)
  }, [stage, previewCandidateId, scrollChatToBottom])

  useEffect(() => {
    if (stage !== 'chat' || introPhase !== 'tutorial' || sendingQuestion) return
    requestAnimationFrame(() => {
      const node = questionInputRef.current
      if (!node) return
      node.focus()
      const pos = String(node.value || '').length
      node.setSelectionRange(pos, pos)
    })
  }, [stage, introPhase, sendingQuestion])

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
          text: tagline,
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
        void appendTutorialLine('compose', ONBOARDING_TUTORIAL_LINES.compose, { waitForPlayback: false })
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
      setBoardsTab(BOARD_TABS[0]?.id || 'allTime')
    }
  }, [stage])

  useEffect(() => {
    if (stage !== 'choose') {
      setPreviewCandidateId('')
    }
  }, [stage])

  const startCreateProfileFlow = useCallback(() => {
    setFields(emptyFields())
    setManualTouched({})
    setCreationStep(CREATION_STEPS[0])
    setCreationFacts([''])
    setStatus('')
    setError('')
    setStage('profile')
  }, [])

  useEffect(() => {
    if (stage !== 'reveal-nonwinners' && stage !== 'reveal-winner') {
      revealAnnouncementRef.current = ''
      return
    }

    const message = stage === 'reveal-nonwinners'
      ? nonWinnerAnnouncement
      : winnerAnnouncement

    const key = `${stage}:${message}`
    if (!message || revealAnnouncementRef.current === key) return
    revealAnnouncementRef.current = key

    void speakRosesLine({
      text: message,
      speaker: 'avatar',
    })
  }, [stage, nonWinnerAnnouncement, winnerAnnouncement, speakRosesLine])

  useEffect(() => {
    if (!isCreatingProfile) {
      profileStepNarrationRef.current = ''
      return
    }

    const narrationKey = creationStep
    if (profileStepNarrationRef.current === narrationKey) return
    profileStepNarrationRef.current = narrationKey

    void speakRosesLine({
      text: currentCreationPrompt,
      speaker: 'avatar',
    })
  }, [isCreatingProfile, creationStep, currentCreationPrompt, speakRosesLine])

  useEffect(() => {
    if (!isCreatingProfile) return

    requestAnimationFrame(() => {
      const targetId = creationStep === 'final'
        ? 'roses-field-introTagline'
        : `roses-create-${creationStep}`
      const node = document.getElementById(targetId)
      if (!node || typeof node.focus !== 'function') return
      node.focus()
      if ('value' in node && typeof node.value === 'string' && typeof node.setSelectionRange === 'function') {
        const pos = node.value.length
        node.setSelectionRange(pos, pos)
      }
    })
  }, [isCreatingProfile, creationStep])

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
    setCanEditToday(Boolean(profileResp.canEditToday))
    setLeaderboard({
      allTime: leaderboardResp.allTime || [],
      weekly: leaderboardResp.weekly || [],
      weekKey: leaderboardResp.weekKey || '',
    })
    setRosesGiven(Array.isArray(profileResp.rosesGiven) ? profileResp.rosesGiven : [])

    if (profileResp.profile?.fields) {
      setFields(sanitizeRosesFields(profileResp.profile.fields))
      setManualTouched({})
      setCreationStep(CREATION_STEPS[0])
      setCreationFacts([''])
      setOnboardingRoundActive(false)
      setStage('dashboard')
      return
    }

    setFields(emptyFields())
    setManualTouched({})
    setCreationStep(CREATION_STEPS[0])
    setCreationFacts([''])
    setOnboardingRoundActive(false)
    setStage(profileResp.canPlayIntroRound ? 'onboarding' : 'dashboard')
  }

  useEffect(() => {
    const pid = getOrCreateRosesPlayerId()
    const tz = getBrowserTimezone()
    const day = getLocalDayKey(tz)
    setPlayerId(pid)
    setTimezone(tz)

    loadEverything(pid, tz, day).catch((loadError) => {
      console.error(loadError)
      setStage('dashboard')
      setError(loadError.message || 'Failed to load Roses mode data.')
    })
  }, [])

  const setFieldValue = (fieldId, rawValue) => {
    const nextValue = String(rawValue || '')
    setFields((prev) => ({ ...prev, [fieldId]: nextValue }))
  }

  const handleFieldChange = (fieldId, value) => {
    setFieldValue(fieldId, value)
    setManualTouched((prev) => ({ ...prev, [fieldId]: true }))
  }

  const handleCreationFactChange = (index, value) => {
    setCreationFacts((prev) => prev.map((fact, idx) => (idx === index ? value : fact)))
  }

  const handleAddCreationFact = () => {
    setCreationFacts((prev) => {
      if (prev.length >= CREATION_FACT_LIMIT) return prev
      return [...prev, '']
    })
  }

  const handleRemoveCreationFact = (index) => {
    setCreationFacts((prev) => {
      if (prev.length <= 1) return ['']
      return prev.filter((_, idx) => idx !== index)
    })
  }

  const handleCreationNext = () => {
    setError('')
    const name = String(fields.name || '').trim()
    const occupation = String(fields.occupation || '').trim()

    if (creationStep === 'name') {
      if (!name) {
        setError('Enter a name to continue.')
        return
      }
      setCreationStep('occupation')
      return
    }

    if (creationStep === 'occupation') {
      if (!occupation) {
        setError('Enter an occupation to continue.')
        return
      }
      setCreationStep('final')
    }
  }

  const handleCreationBack = () => {
    setError('')
    if (creationStep === 'final') {
      setCreationStep('occupation')
      return
    }
    if (creationStep === 'occupation') {
      setCreationStep('name')
    }
  }

  const handlePublishCreatedProfile = async () => {
    setError('')
    setStatus('')
    void triggerHaptic('heavy')

    const name = String(fields.name || '').trim()
    const occupation = String(fields.occupation || '').trim()
    const introTagline = String(fields.introTagline || '').trim()
    const bio = buildBioFromFacts({ name, occupation, facts: creationFacts })

    if (!name) {
      setError('Enter a name to continue.')
      void triggerHaptic('error')
      return
    }
    if (!occupation) {
      setError('Enter an occupation to continue.')
      void triggerHaptic('error')
      return
    }
    if (!introTagline) {
      setError('Enter an intro tagline before publishing.')
      void triggerHaptic('error')
      return
    }

    setSavingProfile(true)

    try {
      const normalized = sanitizeRosesFields({
        ...fields,
        bio,
      })
      const response = await saveRosesProfile({
        playerId,
        timezone,
        localDay: getLocalDayKey(timezone),
        fields: normalized,
        manualFieldCount: 1,
      })

      setProfile(response.profile)
      setCanPlay(Boolean(response.canPlay))
      setCanPlayIntroRound(false)
      setCanEditToday(Boolean(response.canEditToday))
      setFields(normalized)
      setCreationFacts([''])
      setCreationStep(CREATION_STEPS[0])
      setStatus('Profile published to the global Roses pool.')
      void triggerHaptic('success')

      const leaderboardResp = await fetchRosesLeaderboard(25)
      setLeaderboard({
        allTime: leaderboardResp.allTime || [],
        weekly: leaderboardResp.weekly || [],
        weekKey: leaderboardResp.weekKey || '',
      })
      setRosesGiven(Array.isArray(response.rosesGiven) ? response.rosesGiven : [])

      setStage('dashboard')
    } catch (saveError) {
      console.error(saveError)
      setError(saveError.message || 'Failed to publish profile.')
      void triggerHaptic('error')
    } finally {
      setSavingProfile(false)
    }
  }

  const handlePublishProfile = async () => {
    setError('')
    setStatus('')
    void triggerHaptic('heavy')

    const normalized = sanitizeRosesFields(fields)

    const missingStill = EDIT_PROFILE_FIELDS
      .map((field) => field.id)
      .filter((fieldId) => !String(normalized[fieldId] || '').trim())

    if (missingStill.length) {
      setError('Fill out every profile field before publishing.')
      void triggerHaptic('error')
      return
    }

    if (manualFieldCount < 1) {
      setError('Edit at least one field before publishing.')
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
      setRosesGiven(Array.isArray(response.rosesGiven) ? response.rosesGiven : [])

      setStage('dashboard')
    } catch (saveError) {
      console.error(saveError)
      setError(saveError.message || 'Failed to publish profile.')
      void triggerHaptic('error')
    } finally {
      setSavingProfile(false)
    }
  }

  const handleEditProfile = () => {
    if (!hasProfile) {
      startCreateProfileFlow()
      return
    }

    if (!canEditToday) {
      setError('You can publish edits once per local calendar day.')
      return
    }

    const base = sanitizeRosesFields(profile?.fields || emptyFields())
    setFields(base)
    setManualTouched({})
    setCreationStep(CREATION_STEPS[0])
    setCreationFacts([''])
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
    setError('')
    void triggerHaptic('heavy')
    const previousChatLog = chatLog

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
          text: item.response,
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
          setSendingQuestion(false)
          void appendTutorialLine('after-first-answer', ONBOARDING_TUTORIAL_LINES.afterFirstAnswer, { waitForPlayback: false })
        } else if (nextTurnNumber === 2) {
          setSendingQuestion(false)
          void appendTutorialLine('after-second-answer', ONBOARDING_TUTORIAL_LINES.afterSecondAnswer, { waitForPlayback: false })
        } else if (nextTurnNumber === TURN_COUNT) {
          void appendTutorialLine('final-choice', ONBOARDING_TUTORIAL_LINES.finalChoice, { waitForPlayback: false })
        }
      }

      if (response.round?.doneAsking) {
        setStatus('Time to give out your Rose...')
        await wait(CHOOSE_STAGE_DELAY_MS)
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
    handleSendQuestion(nextValue)
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
      setRosesGiven(Array.isArray(profileResp.rosesGiven) ? profileResp.rosesGiven : [])
      setCanPlay(Boolean(profileResp.canPlay))
      setCanPlayIntroRound(Boolean(profileResp.canPlayIntroRound))
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
                    isSpeaking={introPhase === String(entry.slot || '').toLowerCase() && activeSpeechSlot === entry.slot}
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

          <div ref={bottomPanelRef} className="roses-question-row">
            {composerState === 'compose' ? (
              <>
                <label className="roses-question-fillline" htmlFor="roses-question-input">
                  {activePromptParts.before && (
                    <span className="roses-question-fillcopy">{activePromptParts.before}</span>
                  )}
                  <input
                    ref={questionInputRef}
                    id="roses-question-input"
                    className="roses-question-fillinput"
                    type="text"
                    value={questionInput}
                    onChange={(event) => setQuestionInput(event.target.value.slice(0, 90))}
                    onKeyDown={handleQuestionKeyDown}
                    onFocus={handleQuestionFocus}
                    placeholder="fill in the blank"
                    disabled={sendingQuestion || introActive}
                  />
                  {activePromptParts.after && (
                    <span className="roses-question-fillcopy">{activePromptParts.after}</span>
                  )}
                </label>
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
                <div className="roses-question-template">Waiting...</div>
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

          <div ref={bottomPanelRef} className="roses-choose-row">
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
              {orderedCandidates.map((candidate) => {
                const candidateId = String(candidate?.playerId || '')
                return (
                  <button
                    key={`pick-${candidateId || 'unknown'}`}
                    type="button"
                    className={[
                      'roses-choose-btn',
                      previewCandidateId === candidateId ? 'is-open' : '',
                    ].filter(Boolean).join(' ')}
                    onMouseEnter={() => handlePreviewChoice(candidateId)}
                    onFocus={() => handlePreviewChoice(candidateId)}
                    onClick={() => handleChooseButtonPress(candidateId)}
                    disabled={choosingWinner || !candidateId}
                  >
                    {choosingWinner ? 'Submitting...' : 'Give Rose'}
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
    return (
      <div className="roses-mode">
        <div className="roses-card">
          {onboardingRoundActive && <div className="roses-reveal-banner">{nonWinnerTutorialBanner}</div>}
          <h2 className="roses-reveal-stage-title is-loser">Admirers Not Chosen</h2>
          <div className="roses-reveal-multi-grid">
            {revealNonWinners.map((item, index) => (
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
          {onboardingRoundActive && <div className="roses-reveal-banner">{winnerAnnouncement}</div>}
          <RevealCard profile={reveal?.winner} title="Rose Winner" />
          {onboardingRoundActive ? (
            <div className="roses-profile-actions">
              <button
                type="button"
                className="roses-secondary"
                onClick={() => {
                  setOnboardingRoundActive(false)
                  void handleStartRound({ onboarding: false })
                }}
              >
                Continue Judging
              </button>
              <button
                type="button"
                className="roses-primary"
                onClick={() => {
                  setOnboardingRoundActive(false)
                  startCreateProfileFlow()
                }}
              >
                Make a Profile
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="roses-primary"
              onClick={() => {
                setOnboardingRoundActive(false)
                setStage('dashboard')
              }}
            >
              Back to Roses Dashboard
            </button>
          )}
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
          profile ? (
            <>
              <p className="roses-profile-subtitle">
                Build the most enticing imaginary dating profile possible!
              </p>
              <div className="roses-form-grid">
                {EDIT_PROFILE_FIELDS.map((field) => (
                  <FieldInput
                    key={field.id}
                    field={field}
                    value={fields[field.id] || ''}
                    onChange={handleFieldChange}
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
                  className="roses-primary"
                  onClick={handlePublishProfile}
                  disabled={savingProfile}
                >
                  {savingProfile ? 'Publishing...' : 'Publish Profile'}
                </button>
              </div>
            </>
          ) : (
            <div className="roses-create-shell">
              <div className="roses-create-head">
                <div className="roses-create-step">Step {creationStepIndex + 1} / {CREATION_STEPS.length}</div>
              </div>

              <div className="roses-tutorial-card roses-create-instruction" role="note" aria-live="polite">
                <p className="roses-tutorial-body">{currentCreationPrompt}</p>
              </div>

              {creationStep === 'name' && (
                <div className="roses-create-panel">
                  <div className="roses-create-field-head">
                    <label className="roses-create-label" htmlFor="roses-create-name">Name</label>
                  </div>
                  <input
                    id="roses-create-name"
                    className="roses-create-input"
                    type="text"
                    maxLength={ROSES_FIELD_LIMITS.name}
                    value={fields.name || ''}
                    onChange={(event) => setFieldValue('name', event.target.value)}
                    placeholder="Smurf Blaster"
                  />
                </div>
              )}

              {creationStep === 'occupation' && (
                <div className="roses-create-panel">
                  <div className="roses-create-field-head">
                    <label className="roses-create-label" htmlFor="roses-create-occupation">Occupation</label>
                  </div>
                  <input
                    id="roses-create-occupation"
                    className="roses-create-input"
                    type="text"
                    maxLength={ROSES_FIELD_LIMITS.occupation}
                    value={fields.occupation || ''}
                    onChange={(event) => setFieldValue('occupation', event.target.value)}
                    placeholder="Game Developer"
                  />
                </div>
              )}

              {creationStep === 'final' && (
                <div className="roses-create-panel is-final">
                  <div className="roses-field-row full singleline show-counter">
                    <div className="roses-field-head">
                      <label htmlFor="roses-field-introTagline">Intro Tagline</label>
                    </div>
                    <div className="roses-field-input-wrap">
                      <input
                        id="roses-field-introTagline"
                        value={fields.introTagline || ''}
                        onChange={(event) => setFieldValue('introTagline', event.target.value)}
                        maxLength={ROSES_FIELD_LIMITS.introTagline}
                        placeholder="The line they open with in chat"
                      />
                      <span className="roses-field-counter">{String(fields.introTagline || '').length}/{ROSES_FIELD_LIMITS.introTagline}</span>
                    </div>
                  </div>

                  <div className="roses-create-facts-head">
                    <div>
                      <h3 className="roses-panel-title">Character Facts</h3>
                      <p className="roses-create-helper">Add up to {CREATION_FACT_LIMIT} optional facts. We&apos;ll turn them directly into the Bio.</p>
                    </div>
                    <button
                      type="button"
                      className="roses-secondary"
                      onClick={handleAddCreationFact}
                      disabled={creationFacts.length >= CREATION_FACT_LIMIT}
                    >
                      Add Fact
                    </button>
                  </div>

                  <div className="roses-create-facts-list">
                    {creationFacts.map((fact, index) => (
                      <div key={`fact-${index}`} className="roses-create-fact-row">
                        <input
                          id={index === 0 ? 'roses-create-fact-0' : undefined}
                          className="roses-create-input"
                          type="text"
                          value={fact}
                          maxLength={120}
                          onChange={(event) => handleCreationFactChange(index, event.target.value)}
                          placeholder={`Fact ${index + 1}`}
                        />
                        <button
                          type="button"
                          className="roses-create-fact-remove"
                          onClick={() => handleRemoveCreationFact(index)}
                          disabled={creationFacts.length === 1 && !creationFactsUsed.length}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="roses-profile-actions">
                <button
                  type="button"
                  className="roses-secondary"
                  onClick={handleCreationBack}
                  disabled={creationStep === 'name' || savingProfile}
                >
                  Back
                </button>
                <button
                  type="button"
                  className="roses-primary"
                  onClick={creationStep === 'final' ? handlePublishCreatedProfile : handleCreationNext}
                  disabled={savingProfile}
                >
                  {savingProfile ? 'Publishing...' : creationStep === 'final' ? 'Publish Profile' : 'Next'}
                </button>
              </div>
            </div>
          )
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
                    <button
                      type="button"
                      className={hasProfile ? 'roses-primary' : 'roses-secondary'}
                      onClick={() => handleStartRound()}
                      disabled={!canPlay}
                    >
                      Judge Profiles
                    </button>
                    <button
                      type="button"
                      className={hasProfile ? 'roses-secondary' : 'roses-primary roses-create-profile-cta'}
                      onClick={handleEditProfile}
                      disabled={hasProfile && !canEditToday}
                      title={hasProfile ? (canEditToday ? 'Edit profile' : 'Edit available once per local day') : 'Create profile'}
                    >
                      {hasProfile ? (canEditToday ? 'Edit Profile' : 'One Edit Daily') : 'Create Profile'}
                    </button>
                  </div>

                  {hasProfile ? (
                    <section className="roses-info-panel roses-profile-panel">
                      <div className="roses-profile-grid roses-panel-grid">
                        <div className="roses-panel-item">
                          <span className="roses-panel-label">Name</span>
                          <span className="roses-panel-value">{profile?.fields?.name || '-'}</span>
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
                  ) : (
                    <section className="roses-info-panel roses-empty-panel">
                      <h3 className="roses-panel-title">No Profile Yet</h3>
                      <p className="roses-panel-body">
                        Create a character profile if you want other players to judge you, discuss you, and start sending Roses your way.
                      </p>
                    </section>
                  )}
                </>
              )}

              {dashboardTab === 'stats' && (
                <>
                  {hasProfile && (
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
                  )}

                  <section className="roses-info-panel roses-awarded-panel">
                    <h3 className="roses-panel-title">Roses You've Given Out</h3>
                    {rosesGiven.length > 0 ? (
                      <div className="roses-awarded-list">
                        {rosesGiven.map((entry) => (
                          <div key={entry.playerId} className="roses-awarded-row">
                            <span className="roses-awarded-name">{entry.name}</span>
                            <span className="roses-awarded-count">{entry.count}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="roses-lb-empty">Characters you choose will show up here.</div>
                    )}
                  </section>

                  {hasProfile ? (
                    <section className="roses-info-panel roses-topics-panel">
                      <h3 className="roses-panel-title">Topics Discussed with {profile?.fields?.name || 'Profile'}</h3>
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
                        <div className="roses-lb-empty">Topics that people discuss with your profile will begin to appear here after it has participated in few conversations. Check back later!</div>
                      )}
                    </section>
                  ) : (
                    <section className="roses-info-panel roses-empty-panel">
                      <h3 className="roses-panel-title">Profile Stats Unlock Later</h3>
                      <p className="roses-panel-body">
                        Create a profile to start collecting Roses, leaderboard ranks, and discussion topics from other players.
                      </p>
                    </section>
                  )}
                </>
              )}

              {dashboardTab === 'boards' && (
                hasProfile ? (
                  <div className="roses-leaderboards roses-leaderboards-dashboard">
                    <LeaderboardPanel
                      title={boardsTab === 'allTime' ? 'All-Time Roses' : 'Top Roses This Week'}
                      mode={boardsTab}
                      entries={boardsTab === 'allTime' ? leaderboard.allTime : leaderboard.weekly}
                      currentPlayerId={playerId}
                      weekKey={leaderboard.weekKey}
                      maxRows={10}
                    />
                  </div>
                ) : (
                  <section className="roses-info-panel roses-empty-panel">
                    <h3 className="roses-panel-title">Leaderboards Await</h3>
                    <p className="roses-panel-body">
                      Create a profile to appear on the Roses boards and see how your character stacks up against the rest of the pool.
                    </p>
                  </section>
                )
              )}
            </div>

            {dashboardTab === 'boards' && hasProfile && (
              <div className="roses-board-tabbar" role="tablist" aria-label="Roses leaderboard views">
                {BOARD_TABS.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={boardsTab === tab.id}
                    className={[
                      'roses-board-tab',
                      boardsTab === tab.id ? 'is-active' : '',
                    ].filter(Boolean).join(' ')}
                    onClick={() => setBoardsTab(tab.id)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            )}

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
