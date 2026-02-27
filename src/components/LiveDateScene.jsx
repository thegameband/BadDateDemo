import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion' // eslint-disable-line no-unused-vars -- motion used as JSX (motion.div, etc.)
import { useGameStore, SCORING_MODES } from '../store/gameStore'
import { getDaterDateResponse, getDaterResponseToPlayerAnswer, getDaterQuickAnswer, getDaterAnswerComparison, generateDaterValues, groupSimilarAnswers, generatePlotTwistSummary, getLlmErrorMessage, getLlmDebugSnapshot, evaluateLikesDislikesResponse, evaluateBingoBlindLockoutResponse, evaluateBingoActionsResponse, generateFinalDateDecision } from '../services/llmService'
import { speak, stopAllAudio, waitForAllAudio, onTTSStatus, setVoice } from '../services/ttsService'
import { getDaterPortrait, preloadDaterImages } from '../services/expressionService'
import AnimatedText from './AnimatedText'
import './LiveDateScene.css'

// PartyKit replaces Firebase for real-time state sync
// All state is managed by the PartyKit server - clients send actions, receive state

// EXPERIMENT: Dater sometimes interrupts Avatar when they hit a Love or Dealbreaker (low probability)
const INTERRUPT_AVATAR_PROBABILITY = 0.12 // ~12% of the time for loves/dealbreakers
const INTERRUPT_AFTER_AVATAR_MS = 2600   // Let avatar speak this long before "interruption"
const DATER_INTERRUPTIONS = {
  loves: ['Oh my god—', 'Wait, really?!', 'No way—', 'Oh!', 'Seriously?!'],
  dealbreakers: ['Wait, what?!', 'Hold on—', "I'm sorry, what?!", 'What?!', 'Excuse me—']
}

const DEBUG_AUTO_FILL_ANSWERS = {
  startingStats: {
    physical: [
      'Tall with messy hair and a leather jacket',
      'Short, athletic, and covered in vintage tattoos',
      'Lanky with glasses and an awkward smile',
      'Average height with bold makeup and silver rings',
    ],
    emotional: [
      'Nervous but trying to play it cool',
      'Confident, calm, and ready for chaos',
      'A little anxious but still excited',
      'Suspiciously optimistic about this whole thing',
    ],
    name: ['Jordan', 'Alex', 'Sam', 'Riley', 'Morgan'],
  },
  chat: [
    'I love chaotic adventures and midnight snacks.',
    'Honesty matters more to me than being cool.',
    'I would absolutely sing karaoke on a first date.',
    'My ideal night is tacos, dancing, and bad decisions.',
    'I am weirdly competitive about board games.',
  ],
  plotTwist: [
    'I challenge them to an immediate dance-off.',
    'I laugh, then calmly ask what is going on.',
    'I lean in and improvise like this was the plan.',
    'I pretend confidence and commit to the bit.',
    'I make a joke and try to defuse the chaos.',
  ],
}

const pickRandom = (items = []) => items[Math.floor(Math.random() * items.length)] || ''
const clampMeterValue = (value) => {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return 0
  return Math.max(0, Math.min(5, numeric))
}
const getMeterFillPercent = (value) => {
  const clamped = clampMeterValue(value)
  return (clamped / 5) * 100
}
const getRatingsTextMeter = (value) => {
  const normalized = String(value || '').toLowerCase()
  if (normalized === 'increase') return '▲▲'
  if (normalized === 'decrease') return '▼▼'
  return '▬'
}
const getRatingsEffectText = (value) => {
  const normalized = String(value || '').toLowerCase()
  if (normalized === 'increase') return 'Ratings Up'
  if (normalized === 'decrease') return 'Ratings Down'
  return 'Ratings Steady'
}
const SIDE_METER_LABELS = {
  compatibility: ['C', 'O', 'M', 'P', 'A', 'T', 'I', 'B', 'I', 'L', 'I', 'T', 'Y'],
  ratings: ['R', 'A', 'T', 'I', 'N', 'G', 'S'],
}

// Phase timers: 30 seconds for Phase 1 and Phase 2
function LiveDateScene() {
  const selectedDater = useGameStore((state) => state.selectedDater)
  const avatar = useGameStore((state) => state.avatar)
  const livePhase = useGameStore((state) => state.livePhase)
  const phaseTimer = useGameStore((state) => state.phaseTimer)
  const cycleCount = useGameStore((state) => state.cycleCount)
  const suggestedAttributes = useGameStore((state) => state.suggestedAttributes)
  const numberedAttributes = useGameStore((state) => state.numberedAttributes)
  const playerChat = useGameStore((state) => state.playerChat)
  const username = useGameStore((state) => state.username)
  const dateConversation = useGameStore((state) => state.dateConversation)
  const latestAttribute = useGameStore((state) => state.latestAttribute)
  const daterValues = useGameStore((state) => state.daterValues)
  const scoring = useGameStore((state) => state.scoring)
  const finalDateDecision = useGameStore((state) => state.finalDateDecision)
  const roomCode = useGameStore((state) => state.roomCode)
  const playerId = useGameStore((state) => state.playerId)
  const isHost = useGameStore((state) => state.isHost)
  const llmProvider = useGameStore((state) => state.llmProvider)
  const players = useGameStore((state) => state.players)
  
  const setLivePhase = useGameStore((state) => state.setLivePhase)
  const setPhaseTimer = useGameStore((state) => state.setPhaseTimer)
  const submitAttributeSuggestion = useGameStore((state) => state.submitAttributeSuggestion)
  const applyWinningAttribute = useGameStore((state) => state.applyWinningAttribute)
  const applySinglePlayerAnswer = useGameStore((state) => state.applySinglePlayerAnswer)
  const incrementCycle = useGameStore((state) => state.incrementCycle)
  const addPlayerChatMessage = useGameStore((state) => state.addPlayerChatMessage)
  const addDateMessage = useGameStore((state) => state.addDateMessage)
  const setPhase = useGameStore((state) => state.setPhase)
  const setDaterValues = useGameStore((state) => state.setDaterValues)
  const setSuggestedAttributes = useGameStore((state) => state.setSuggestedAttributes)
  const setSentimentCategories = useGameStore((state) => state.setSentimentCategories)
  const setPlayerChat = useGameStore((state) => state.setPlayerChat)
  const setCompatibility = useGameStore((state) => state.setCompatibility)
  const setNumberedAttributes = useGameStore((state) => state.setNumberedAttributes)
  const addLikesDislikesHits = useGameStore((state) => state.addLikesDislikesHits)
  const applyBingoBlindUpdates = useGameStore((state) => state.applyBingoBlindUpdates)
  const applyBingoActionFills = useGameStore((state) => state.applyBingoActionFills)
  const getScoringSummary = useGameStore((state) => state.getScoringSummary)
  const setFinalDateDecision = useGameStore((state) => state.setFinalDateDecision)
  const showTutorial = useGameStore((state) => state.showTutorial)
  const tutorialStep = useGameStore((state) => state.tutorialStep)
  const setShowTutorial = useGameStore((state) => state.setShowTutorial)
  const setTutorialStep = useGameStore((state) => state.setTutorialStep)
  const startingStatsMode = useGameStore((state) => state.startingStatsMode)
  const startingStats = useGameStore((state) => state.startingStats)
  const setStartingStats = useGameStore((state) => state.setStartingStats)
  const setAvatarName = useGameStore((state) => state.setAvatarName)
  const setPlayers = useGameStore((state) => state.setPlayers)
  const clearPlayerAnswerData = useGameStore((state) => state.clearPlayerAnswerData)
  const addPlotTwistAnswer = useGameStore((state) => state.addPlotTwistAnswer)
  
  const [chatInput, setChatInput] = useState('')
  const [_avatarBubble, setAvatarBubble] = useState('')
  const [daterBubble, setDaterBubble] = useState('')
  const [_avatarEmotion, setAvatarEmotion] = useState('neutral') // Avatar's current emotional state
  const [daterEmotion, setDaterEmotion] = useState('neutral') // Dater's current emotional state
  const [isGenerating, setIsGenerating] = useState(false)
  const [_userVote, setUserVote] = useState(null)
  const [_preGeneratedConvo, _setPreGeneratedConvo] = useState(null)
  const [isPreGenerating, setIsPreGenerating] = useState(false) // eslint-disable-line no-unused-vars -- used in JSX (pre-generating indicator)
  const [usingFallback, setUsingFallback] = useState(false)
  const [llmStatusMessage, setLlmStatusMessage] = useState('')

  const syncLlmStatusMessage = () => {
    const base = getLlmErrorMessage() || ''
    const snapshot = getLlmDebugSnapshot()

    if (!base || !snapshot) {
      setLlmStatusMessage(base)
      return
    }

    const status = snapshot.status ? `status:${snapshot.status}` : ''
    const req = snapshot.requestId ? `req:${snapshot.requestId}` : ''
    const source = snapshot.source ? `src:${snapshot.source}` : ''
    const stage = snapshot.stage ? `stage:${snapshot.stage}` : ''
    const provider = snapshot.provider ? `provider:${snapshot.provider}` : ''
    const fp = snapshot.keyFingerprint ? `key:${snapshot.keyFingerprint}` : ''
    const mode = snapshot?.runtime?.mode ? `mode:${snapshot.runtime.mode}` : ''
    const host = snapshot?.runtime?.host ? `host:${snapshot.runtime.host}` : ''
    const rawProviderError = snapshot?.rawErrorMessage
      ? String(snapshot.rawErrorMessage).replace(/\s+/g, ' ').trim().slice(0, 180)
      : ''
    const raw = rawProviderError ? `raw:${rawProviderError}` : ''
    const extras = [status, req, source, stage, provider, fp, mode, host, raw].filter(Boolean).join(' | ')

    setLlmStatusMessage(extras ? `${base} (${extras})` : base)
  }
  
  const [scoringSummary, setScoringSummary] = useState(() => getScoringSummary())
  
  // Reaction feedback - reserved for legacy/system notices
  const [reactionFeedback, setReactionFeedback] = useState(null)
  const reactionFeedbackTimeout = useRef(null)
  const [boardPanelOpen, setBoardPanelOpen] = useState(false)
  const [boardPanelFlash, setBoardPanelFlash] = useState(false)
  const boardPanelFlashTimeout = useRef(null)
  const [showDateBeginsOverlay, setShowDateBeginsOverlay] = useState(false)
  const [questionNarrationComplete, setQuestionNarrationComplete] = useState(true)
  const [ttsStatusNote, setTtsStatusNote] = useState('')
  const [submittedAnswer, setSubmittedAnswer] = useState('') // Shown in answer comparison box
  const [daterDisplayAnswer, setDaterDisplayAnswer] = useState('')
  // Timer starts immediately when phase begins (no waiting for submissions)
  const [showPhaseAnnouncement, setShowPhaseAnnouncement] = useState(false)
  const [announcementPhase, setAnnouncementPhase] = useState('')
  
  // LLM Debug state (host only)
  const [showLLMDebug, setShowLLMDebug] = useState(false)
  const [lastLLMPrompt, _setLastLLMPrompt] = useState({ avatar: '', dater: '' })
  
  // Plot Twist state
  const plotTwist = useGameStore((state) => state.plotTwist)
  const setPlotTwist = useGameStore((state) => state.setPlotTwist)
  const [plotTwistInput, setPlotTwistInput] = useState('')
  
  // Text-to-Speech state
  const [ttsEnabled] = useState(true) // Enabled by default
  const lastSpokenDater = useRef('')
  const [hasSubmittedPlotTwist, setHasSubmittedPlotTwist] = useState(false)
  const [plotTwistDaterAnswerDone, setPlotTwistDaterAnswerDone] = useState(false)
  const [plotTwistNarratorDone, setPlotTwistNarratorDone] = useState(false)
  const plotTwistTimerRef = useRef(null)
  const plotTwistAnimationRef = useRef(null)
  
  // Answer Selection state (replaces voting) - now uses wheel with slices
  const [answerSelection, setAnswerSelection] = useState({
    subPhase: 'idle', // 'idle' | 'grouping' | 'showing' | 'spinning' | 'winner'
    slices: [], // {id, label, weight, originalAnswers, color, startAngle, endAngle}
    spinAngle: 0, // Current rotation angle of the wheel/arrow
    winningSlice: null
  })
  const answerSelectionAnimationRef = useRef(null)
  const wheelSpinRef = useRef(null)
  
  // Pre-generated conversation data (for early LLM calls)
  const preGenConversationRef = useRef(null)
  const preGenPromiseRef = useRef(null)
  const daterQuickAnswerRef = useRef('')
  const lastQuickAnswerQuestionRef = useRef('')
  
  // Starting Stats Mode state
  const [startingStatsInput, setStartingStatsInput] = useState('')
  const [_startingStatsTimer, setStartingStatsTimer] = useState(15)
  const [hasSubmittedStartingStat, setHasSubmittedStartingStat] = useState(false)
  
  // Current round prompt state (persists during Phase 1)
  const [currentRoundPrompt, setCurrentRoundPrompt] = useState({ title: '', subtitle: '' })
  const [roundPromptAnimationComplete, setRoundPromptAnimationComplete] = useState(false)
  const startingStatsTimerRef = useRef(null)
  const lastActivePlayerRef = useRef(null)
  const lastAnswerCountRef = useRef(0)
  const chatEndRef = useRef(null)
  const phaseTimerRef = useRef(null)
  const lastPhaseRef = useRef('')
  const allPlotTwistAnsweredRef = useRef(false) // Prevent multiple plot twist auto-advance triggers
  const narratorSummarySpokenRef = useRef(null)  // Track which summary we've already read with narrator TTS
  const lastNarratedQuestionRef = useRef('')

  useEffect(() => {
    const mode = scoring?.selectedMode
    const shouldShow = mode === SCORING_MODES.BINGO_BLIND_LOCKOUT || mode === SCORING_MODES.BINGO_ACTIONS_OPEN
    setBoardPanelOpen(shouldShow)
  }, [scoring?.selectedMode])
  
  // Who Are You?: exactly 3 questions, no timer (single player only)
  const CREATE_YOUR_DATER_QUESTIONS = [
    { type: 'physical', question: 'How do you look?' },
    { type: 'emotional', question: 'How are you feeling?' },
    { type: 'name', question: 'What is your name?' },
  ]
  const STARTING_STATS_QUESTIONS = CREATE_YOUR_DATER_QUESTIONS

  const getRandomTestAnswer = (target) => {
    if (target === 'starting-stats') {
      const questionType = startingStats?.currentQuestionType || 'physical'
      return pickRandom(DEBUG_AUTO_FILL_ANSWERS.startingStats[questionType]) || pickRandom(DEBUG_AUTO_FILL_ANSWERS.chat)
    }
    if (target === 'plot-twist') return pickRandom(DEBUG_AUTO_FILL_ANSWERS.plotTwist)
    return pickRandom(DEBUG_AUTO_FILL_ANSWERS.chat)
  }
  
  // Helper to sync conversation state via PartyKit (host only)
  const syncConversationToPartyKit = async (avatarText, daterText, syncSentiments = false) => {
    if (!isHost || !partyClient) return
    
    // Sync bubbles
    if (avatarText !== undefined || daterText !== undefined) {
      partyClient.setBubbles(daterText, avatarText)
    }
    
    // Sync messages to conversation
    if (avatarText) {
      partyClient.addMessage('avatar', avatarText)
    }
    if (daterText) {
      partyClient.addMessage('dater', daterText)
    }
    
    // Sync sentiment categories if requested
    if (syncSentiments) {
      const currentSentiments = useGameStore.getState().sentimentCategories
      const currentExposed = useGameStore.getState().exposedValues
      const currentGlowing = useGameStore.getState().glowingValues
      const currentScoring = useGameStore.getState().scoring
      const currentFinalDateDecision = useGameStore.getState().finalDateDecision
      partyClient.syncState({
        sentimentCategories: currentSentiments,
        exposedValues: currentExposed,
        glowingValues: currentGlowing,
        scoring: currentScoring,
        finalDateDecision: currentFinalDateDecision,
      })
    }
  }
  
  // Show reaction feedback temporarily (auto-clears after 6 seconds)
  const REACTION_FEEDBACK_DURATION_MS = 6000
  const showRealtimeFeedback = (text, category = 'answer-reveal') => {
    if (reactionFeedbackTimeout.current) clearTimeout(reactionFeedbackTimeout.current)
    const payload = { text, category }
    setReactionFeedback(payload)
    if (partyClient && isHost) {
      partyClient.syncState({ reactionFeedback: payload })
    }

    reactionFeedbackTimeout.current = setTimeout(() => {
      setReactionFeedback(null)
      if (partyClient && isHost) {
        partyClient.syncState({ reactionFeedback: null })
      }
    }, REACTION_FEEDBACK_DURATION_MS)
  }

  const toTitleCase = (text = '') => String(text).replace(/\b\w/g, (c) => c.toUpperCase())

  const showDaterAnswerBanner = (answer = '') => {
    const cleanedAnswer = String(answer || '')
      .replace(/[^A-Za-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 4)
      .join(' ')
      .trim()
    const displayAnswer = toTitleCase(cleanedAnswer || 'from the heart')
    setDaterDisplayAnswer(displayAnswer)

    if (partyClient && isHost) {
      partyClient.syncState({ daterDisplayAnswer: displayAnswer })
    }
  }

  const truncateForDisplay = (text, maxWords = 4) => {
    const words = String(text || '').trim().split(/\s+/).filter(Boolean)
    if (words.length <= maxWords) return toTitleCase(words.join(' '))
    return toTitleCase(words.slice(0, maxWords).join(' ')) + '…'
  }

  const flashBoardPanelPulse = () => {
    const mode = useGameStore.getState().scoring?.selectedMode
    const isBingoMode = mode === SCORING_MODES.BINGO_BLIND_LOCKOUT || mode === SCORING_MODES.BINGO_ACTIONS_OPEN
    if (!isBingoMode) return
    if (boardPanelFlashTimeout.current) clearTimeout(boardPanelFlashTimeout.current)
    setBoardPanelFlash(true)
    boardPanelFlashTimeout.current = setTimeout(() => setBoardPanelFlash(false), 1200)
  }

  const applyScoringDecision = async ({ question = '', playerAnswer = '', daterResponse = '', source = '' } = {}) => {
    if (!isHost) return
    const responseText = String(daterResponse || '').trim()
    if (!responseText) return

    const state = useGameStore.getState()
    const mode = state.scoring?.selectedMode || SCORING_MODES.LIKES_MINUS_DISLIKES

    try {
      const isLikesMode = mode === SCORING_MODES.LIKES_MINUS_DISLIKES || mode === SCORING_MODES.LIKES_MINUS_DISLIKES_CHAOS
      const isChaosMode = mode === SCORING_MODES.LIKES_MINUS_DISLIKES_CHAOS

      if (isLikesMode) {
        const normalizedAnswer = String(playerAnswer || '').trim()
        const normalizedSource = String(source || '').toLowerCase()

        // Mode 1 is one score per player answer.
        // Initial impression is non-scorable, and follow-up/system lines should not score.
        if (normalizedSource.includes('first impression')) {
          return { hasNegative: false, skipped: true }
        }
        if (!normalizedAnswer) {
          return { hasNegative: false, skipped: true }
        }
        if (normalizedSource.includes('round follow-up')) {
          return { hasNegative: false, skipped: true }
        }

        const likesState = state.scoring?.likesMinusDislikes
        const result = await evaluateLikesDislikesResponse({
          dater: selectedDater,
          question,
          playerAnswer: normalizedAnswer,
          daterResponse: responseText,
          likes: likesState?.likes || [],
          dislikes: likesState?.dislikes || [],
          profileValues: daterValues,
          includeChaos: isChaosMode,
        })
        syncLlmStatusMessage()
        const { newLikes, newDislikes, ratingsEffectApplied } = addLikesDislikesHits(result)
        const latestSummary = useGameStore.getState().getScoringSummary()
        setScoringSummary(latestSummary)
        if (partyClient && isHost) {
          partyClient.syncState({ scoring: useGameStore.getState().scoring })
        }

        if (newLikes.length || newDislikes.length) {
          const fragments = []
          if (newLikes.length) fragments.push('Compatibility +1')
          if (newDislikes.length) fragments.push('Compatibility -1')
          if (isChaosMode) {
            fragments.push(`${getRatingsTextMeter(ratingsEffectApplied)} ${getRatingsEffectText(ratingsEffectApplied)}`)
          }
          const text = `Score update${source ? ` (${source})` : ''}: ${fragments.join(' | ')}`
          const category = newDislikes.length > 0 ? 'disliked' : 'liked'
          showRealtimeFeedback(text, category)
        } else {
          showRealtimeFeedback(`Score check${source ? ` (${source})` : ''}: no points.`, 'answer-reveal')
        }
        return { hasNegative: newDislikes.length > 0 }
      }

      if (mode === SCORING_MODES.BINGO_BLIND_LOCKOUT) {
        const boardCells = state.scoring?.bingoBlindLockout?.cells || []
        const { updates } = await evaluateBingoBlindLockoutResponse({
          dater: selectedDater,
          question,
          playerAnswer,
          daterResponse: responseText,
          cells: boardCells,
        })
        syncLlmStatusMessage()
        const { changed } = applyBingoBlindUpdates(updates)
        const latestSummary = useGameStore.getState().getScoringSummary()
        setScoringSummary(latestSummary)
        if (partyClient && isHost) {
          partyClient.syncState({ scoring: useGameStore.getState().scoring })
        }
        flashBoardPanelPulse()
        if (changed.length > 0) {
          const filled = changed.filter((cell) => cell.status === 'filled').length
          const locked = changed.filter((cell) => cell.status === 'locked').length
          const text = `Bingo update${source ? ` (${source})` : ''}: ${filled} filled, ${locked} locked.`
          const category = locked > 0 ? 'disliked' : 'liked'
          showRealtimeFeedback(text, category)
        } else {
          showRealtimeFeedback(`Bingo check${source ? ` (${source})` : ''}: no board changes.`, 'answer-reveal')
        }
        return { hasNegative: changed.some((cell) => cell.status === 'locked') }
      }

      const actionCells = state.scoring?.bingoActionsOpen?.cells || []
      const { filledIds } = await evaluateBingoActionsResponse({
        dater: selectedDater,
        question,
        playerAnswer,
        daterResponse: responseText,
        actionCells,
      })
      syncLlmStatusMessage()
      const { changed } = applyBingoActionFills(filledIds)
      const latestSummary = useGameStore.getState().getScoringSummary()
      setScoringSummary(latestSummary)
      if (partyClient && isHost) {
        partyClient.syncState({ scoring: useGameStore.getState().scoring })
      }
      flashBoardPanelPulse()
      if (changed.length > 0) {
        showRealtimeFeedback(`Action bingo update${source ? ` (${source})` : ''}: ${changed.length} action(s) filled.`, 'liked')
      } else {
        showRealtimeFeedback(`Action bingo check${source ? ` (${source})` : ''}: no action cells filled.`, 'answer-reveal')
      }
      return { hasNegative: false }
    } catch (error) {
      console.error('Scoring evaluation error:', error)
      showRealtimeFeedback('Scoring check failed on this line.', 'answer-reveal')
      return { hasNegative: false }
    }
  }
  
  // Handle tutorial advancement (host only, syncs to PartyKit)
  const handleAdvanceTutorial = async () => {
    if (!isHost) return
    
    if (tutorialStep < 3) {
      const newStep = tutorialStep + 1
      setTutorialStep(newStep)
      // Sync to PartyKit
      if (partyClient) {
        partyClient.syncState( { tutorialStep: newStep })
      }
    } else {
      // Tutorial complete - start the game
      setShowTutorial(false)
      setTutorialStep(0)
      setRoundPromptAnimationComplete(false)
      setLivePhase('phase1')
      // Sync to PartyKit
      if (partyClient) {
        const currentCompatibility = useGameStore.getState().compatibility
        const currentCycleCount = useGameStore.getState().cycleCount
        partyClient.syncState( { 
          showTutorial: false, 
          tutorialStep: 0, 
          phase: 'phase1', // Use 'phase' not 'livePhase' to match server
          compatibility: currentCompatibility, // PRESERVE!
          cycleCount: currentCycleCount // PRESERVE!
        })
      }
    }
  }
  
  // Track if portrait images are preloaded
  const [portraitsReady, setPortraitsReady] = useState(false)
  
  // Preload dater reaction images on mount - supports custom portraits or DiceBear fallback
  useEffect(() => {
    const loadPortraits = async () => {
      console.log('🖼️ Starting portrait preload...')
      if (selectedDater) {
        await preloadDaterImages(selectedDater)
      }
      console.log('✅ All portraits preloaded')
      setPortraitsReady(true)
    }
    loadPortraits()
  }, [selectedDater])
  
  // Set the dater's voice when dater is selected (supports per-dater voice IDs)
  useEffect(() => {
    if (selectedDater?.voiceId) {
      const isMale = selectedDater.pronouns?.includes('he') || false
      setVoice('dater', selectedDater.voiceId, isMale)
    }
  }, [selectedDater])
  
  // Check if API key is available
  useEffect(() => {
    const apiKey = llmProvider === 'anthropic'
      ? import.meta.env.VITE_ANTHROPIC_API_KEY
      : llmProvider === 'auto'
        ? (import.meta.env.VITE_OPENAI_API_KEY || import.meta.env.VITE_ANTHROPIC_API_KEY)
        : import.meta.env.VITE_OPENAI_API_KEY
    if (!apiKey) {
      setUsingFallback(true)
      console.warn('⚠️ No API key found - using fallback responses')
      return
    }
    setUsingFallback(false)
  }, [llmProvider])
  
  // PartyKit client from store
  const partyClient = useGameStore((state) => state.partyClient)
  
  // Log initial mount state for debugging
  useEffect(() => {
    console.log('🚀 LiveDateScene MOUNTED with initial state:', {
      livePhase,
      isHost,
      startingStatsMode,
      playersCount: players?.length,
      players: players?.map(p => ({ id: p.id, name: p.username })),
      roomCode,
      hasPartyClient: !!partyClient,
      startingStats: {
        questionAssignments: startingStats.questionAssignments?.length,
        activePlayerId: startingStats.activePlayerId
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: log once on mount
  }, [])
  
  // Subscribe to PartyKit game state (for all players to receive updates)
  useEffect(() => {
    if (!partyClient || !roomCode) return
    
    console.log('🎉 Setting up PartyKit state subscription for room:', roomCode, 'isHost:', isHost)
    
    const unsubscribe = partyClient.onStateChange((state) => {
      try {
        if (!state) return
        
        console.log('🎉 PartyKit state update:', state)
      
      // Sync suggestions - ALWAYS sync to ensure clients see them
      const serverSuggestions = state.suggestedAttributes || []
      console.log('🎉 Syncing suggestions to client:', serverSuggestions.length, 'items', JSON.stringify(serverSuggestions))
      setSuggestedAttributes(serverSuggestions)
      
      // Sync numbered attributes for voting - ALWAYS sync even if empty
      if (state.numberedAttributes !== undefined) {
        const numberedArray = Array.isArray(state.numberedAttributes) ? state.numberedAttributes : []
        const votesMap = state.votes || {}
        
        console.log('🗳️ CLIENT received numberedAttributes from server:', numberedArray.length, 'items', JSON.stringify(numberedArray))
        
        // Build numbered attributes with votes
        const numberedWithVotes = numberedArray.filter(attr => attr).map(attr => {
          const votersForThis = Object.entries(votesMap)
            .filter(([, voteNum]) => voteNum === attr.number)
            .map(([odId]) => odId)
          
          return {
            ...attr,
            votes: votersForThis
          }
        })
        
        console.log('🗳️ Setting local numberedAttributes:', numberedWithVotes.length, 'items')
        setNumberedAttributes(numberedWithVotes)
      }
      
      // Sync compatibility
      if (typeof state.compatibility === 'number') {
        setCompatibility(state.compatibility)
      }
      
      // Sync cycle count (round number)
      if (typeof state.cycleCount === 'number') {
        useGameStore.setState({ cycleCount: state.cycleCount })
      }
      
      // Sync phase - but don't let server overwrite host's forward progress
      if (state.phase) {
        const currentLocalPhase = useGameStore.getState().livePhase
        const phaseOrder = ['lobby', 'starting-stats', 'reaction', 'phase1', 'answer-selection', 'phase3', 'plot-twist', 'plot-twist-reaction', 'ended']
        const serverPhaseIndex = phaseOrder.indexOf(state.phase)
        const localPhaseIndex = phaseOrder.indexOf(currentLocalPhase)
        
        // Only sync phase if server is ahead or equal, OR if not host
        // This prevents race conditions where server's old state overwrites host's forward progress
        if (!isHost || serverPhaseIndex >= localPhaseIndex) {
          console.log('🎉 Syncing phase:', state.phase, '(local was:', currentLocalPhase, ')')
          setLivePhase(state.phase)
        } else {
          console.log('⏭️ Ignoring server phase', state.phase, '- host already at', currentLocalPhase)
        }
        
        if (state.phase === 'ended' && !isHost) {
          console.log('🏁 Game ended - transitioning non-host to results')
          setTimeout(() => setPhase('results'), 15000) // Match host timeout for breakdown reading
        }
      }
      
      // Timer sync (non-hosts only)
      if (typeof state.phaseTimer === 'number' && !isHost) {
        setPhaseTimer(state.phaseTimer)
      }
      
      // Sync tutorial state
      if (typeof state.showTutorial === 'boolean') {
        setShowTutorial(state.showTutorial)
      }
      if (typeof state.tutorialStep === 'number') {
        setTutorialStep(state.tutorialStep)
      }
      
      // Sync current round prompt (non-hosts)
      if (state.currentRoundPrompt && !isHost) {
        setCurrentRoundPrompt(state.currentRoundPrompt)
      }
      
      // Sync dater bubble (non-hosts)
      if (state.daterBubble !== undefined && !isHost) {
        setDaterBubble(state.daterBubble)
        const lastMessage = dateConversation[dateConversation.length - 1]
        if (state.daterBubble && dateConversation.length === 0 || (state.daterBubble && lastMessage?.message !== state.daterBubble)) {
          if (state.phase === 'phase1') {
            addDateMessage('dater', state.daterBubble)
          }
        }
        if (state.phase === 'phase1') {
          setAvatarBubble('')
          setSuggestedAttributes([])
          setNumberedAttributes([])
          setUserVote(null)
        }
      }
      
      // Sync conversation bubbles (non-hosts)
      if (!isHost) {
        if (state.avatarBubble !== undefined) {
          setAvatarBubble(state.avatarBubble)
        }
        if (state.conversation && Array.isArray(state.conversation)) {
          const validConversation = state.conversation.filter(msg => 
            msg && typeof msg === 'object' && msg.message !== undefined
          )
          if (validConversation.length > 0) {
            useGameStore.getState().setDateConversation(validConversation)
          }
        }
      }
      
      // Sync players
      if (state.players && state.players.length > 0) {
        setPlayers(state.players.map(p => ({
          id: p.odId,
          odId: p.odId,
          username: p.username,
          isHost: p.isHost
        })))
      }
      
      // Sync sentiment categories (loves, likes, dislikes, dealbreakers)
      if (state.sentimentCategories) {
        setSentimentCategories(state.sentimentCategories)
      }
      if (state.scoring && typeof state.scoring === 'object') {
        useGameStore.setState({ scoring: state.scoring })
        setScoringSummary(useGameStore.getState().getScoringSummary())
      }
      if (state.finalDateDecision && typeof state.finalDateDecision === 'object') {
        useGameStore.setState({ finalDateDecision: state.finalDateDecision })
      }
      
      // Sync reaction feedback (non-host only)
      if (state.reactionFeedback && !isHost) {
        setReactionFeedback(state.reactionFeedback)
        if (reactionFeedbackTimeout.current) {
          clearTimeout(reactionFeedbackTimeout.current)
        }
        reactionFeedbackTimeout.current = setTimeout(() => {
          setReactionFeedback(null)
        }, REACTION_FEEDBACK_DURATION_MS)
      } else if (state.reactionFeedback === null && !isHost) {
        setReactionFeedback(null)
      }
      if (state.daterDisplayAnswer !== undefined && !isHost) {
        setDaterDisplayAnswer(state.daterDisplayAnswer || '')
      }
      
      // Sync character emotions for speech animation (non-host only)
      if (state.daterEmotion && !isHost) {
        setDaterEmotion(state.daterEmotion)
      }
      if (state.avatarEmotion && !isHost) {
        setAvatarEmotion(state.avatarEmotion)
      }
      
      // Sync pre-generating state (non-host only)
      if (state.isPreGenerating !== undefined && !isHost) {
        setIsPreGenerating(state.isPreGenerating)
      }
      
      // Sync exposed values (for showing which attributes have been revealed)
      if (state.exposedValues && Array.isArray(state.exposedValues)) {
        useGameStore.setState({ exposedValues: state.exposedValues })
      }
      
      // Sync glowing values (for highlight effects)
      if (state.glowingValues && Array.isArray(state.glowingValues)) {
        useGameStore.setState({ glowingValues: state.glowingValues })
      }
      
      // Sync player chat
      if (state.playerChat && Array.isArray(state.playerChat)) {
        setPlayerChat(state.playerChat)
      }
      
      // Sync starting stats state
      if (state.startingStats) {
        setStartingStats(state.startingStats)
        if (!isHost && typeof state.startingStats.timer === 'number') {
          setStartingStatsTimer(state.startingStats.timer)
        }
        
        // Reset submission state when active player changes
        const newActivePlayer = state.startingStats.activePlayerId
        if (newActivePlayer && newActivePlayer !== lastActivePlayerRef.current) {
          console.log('🔄 Active player changed:', lastActivePlayerRef.current, '->', newActivePlayer)
          lastActivePlayerRef.current = newActivePlayer
          // Reset submission state for everyone when question changes
          setHasSubmittedStartingStat(false)
          setStartingStatsInput('')
        }
        
        // HOST: Detect when a new answer was added and advance to next question
        const newAnswerCount = state.startingStats.answers?.length || 0
        if (isHost && newAnswerCount > lastAnswerCountRef.current) {
          console.log('📥 Host detected new answer:', lastAnswerCountRef.current, '->', newAnswerCount)
          lastAnswerCountRef.current = newAnswerCount
          
          // Clear timer and advance to next question
          if (startingStatsTimerRef.current) {
            clearInterval(startingStatsTimerRef.current)
            startingStatsTimerRef.current = null
          }
          
          // Advance to next question (use setTimeout to avoid calling during render)
          setTimeout(() => {
            const phase = useGameStore.getState().livePhase
            if (phase === 'starting-stats') {
              moveToNextStartingStatsQuestion()
            }
          }, 100)
        }
      }
      
      // Sync plot twist state
      if (state.plotTwist) {
        setPlotTwist(state.plotTwist)
        // Reset submission state when sub-phase changes to 'input'
        if (state.plotTwist.subPhase === 'input') {
          const currentPlotTwist = useGameStore.getState().plotTwist
          if (currentPlotTwist.subPhase !== 'input') {
            setHasSubmittedPlotTwist(false)
            setPlotTwistInput('')
            allPlotTwistAnsweredRef.current = false // Reset auto-advance flag
          }
        }
        
        // Auto-advance to reveal if all players have answered (host only)
        const plotTwistAnswers = state.plotTwist.answers || []
        if (isHost && 
            state.plotTwist.subPhase === 'input' && 
            players.length > 0 && 
            plotTwistAnswers.length >= players.length && 
            !allPlotTwistAnsweredRef.current) {
          console.log('🎭 All players have answered the plot twist! Auto-advancing to reveal')
          allPlotTwistAnsweredRef.current = true
          // Small delay to ensure state is synced, then advance
          setTimeout(() => {
            advancePlotTwistToReveal()
          }, 500)
        }
      }
      
      // Sync plot twist completed flag
      if (state.plotTwistCompleted !== undefined) {
        useGameStore.setState({ plotTwistCompleted: state.plotTwistCompleted })
      }
      
      // Sync answer selection state (for non-host clients only - host generates this state)
      if (state.answerSelection && !isHost) {
        console.log('🎡 CLIENT syncing answerSelection from server:', state.answerSelection.subPhase, 'slices:', state.answerSelection.slices?.length || 0)
        setAnswerSelection(state.answerSelection)
      }
      
      } catch (error) {
        console.error('🎉 Error processing PartyKit state update:', error)
      }
    })
    
    return () => {
      unsubscribe()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: subscription setup only
  }, [partyClient, roomCode, isHost, setSuggestedAttributes, setCompatibility, setLivePhase, setPhaseTimer, setPlayerChat, setNumberedAttributes, setShowTutorial, setTutorialStep, setPlayers, setPlotTwist])
  
  // Narrator TTS: read the "What Happened" plot twist summary with a soothing narrator voice
  useEffect(() => {
    if (plotTwist?.subPhase !== 'summary' || !plotTwist?.summary) return
    if (narratorSummarySpokenRef.current === plotTwist.summary) return
    narratorSummarySpokenRef.current = plotTwist.summary
    setPlotTwistNarratorDone(false)
    const name = avatar?.name || 'your date'
    const text = (plotTwist.summary || '')
      .replace(/\bthe Avatar\b/gi, `the ${name}`)
      .replace(/\bAvatar\b/g, name)
    if (text.trim()) {
      speak(text, 'narrator')
      waitForAllAudio().then(() => setPlotTwistNarratorDone(true))
    } else {
      setPlotTwistNarratorDone(true)
    }
  }, [plotTwist?.subPhase, plotTwist?.summary, avatar?.name])

  // Narrator TTS: read each round question before player can answer
  useEffect(() => {
    if (livePhase !== 'phase1' || !currentRoundPrompt?.subtitle) return
    if (lastNarratedQuestionRef.current === currentRoundPrompt.subtitle) return

    let cancelled = false
    const narrateQuestion = async () => {
      setQuestionNarrationComplete(false)
      lastNarratedQuestionRef.current = currentRoundPrompt.subtitle
      speak(currentRoundPrompt.subtitle, 'narrator')
      await Promise.race([waitForAllAudio(), new Promise(resolve => setTimeout(resolve, 12000))])
      if (!cancelled) {
        setQuestionNarrationComplete(true)
      }
    }

    narrateQuestion()
    return () => { cancelled = true }
  }, [livePhase, currentRoundPrompt?.subtitle])

  // Pre-generate the dater's hidden 1-3 word answer for banner reveal.
  useEffect(() => {
    if (!isHost || livePhase !== 'phase1' || !questionNarrationComplete || !selectedDater) return

    const question = (currentRoundPrompt?.subtitle || '').trim()
    if (!question || lastQuickAnswerQuestionRef.current === question) return

    lastQuickAnswerQuestionRef.current = question
    daterQuickAnswerRef.current = ''

    let cancelled = false
    const runQuickAnswer = async () => {
      try {
        const answer = await getDaterQuickAnswer(
          selectedDater,
          question,
          useGameStore.getState().dateConversation || []
        )
        syncLlmStatusMessage()
        if (cancelled) return
        daterQuickAnswerRef.current = answer || ''
      } catch (err) {
        console.error('Quick-answer pregen error:', err)
      }
    }

    runQuickAnswer()
    return () => { cancelled = true }
  }, [isHost, livePhase, questionNarrationComplete, selectedDater, currentRoundPrompt?.subtitle])

  // Track timer value in a ref for the interval to access
  const phaseTimerValueRef = useRef(phaseTimer)
  useEffect(() => {
    phaseTimerValueRef.current = phaseTimer
  }, [phaseTimer])
  
  // Debug: Log when phase changes
  useEffect(() => {
    console.log('🔍 DEBUG: livePhase =', livePhase, ', isHost =', isHost)
    if (livePhase === 'answer-selection') {
      console.log('🔍 DEBUG Answer Selection: slices =', answerSelection.slices?.length || 0, ', subPhase =', answerSelection.subPhase)
    }
  }, [livePhase, answerSelection, isHost])
  
  // Debug: Log when suggestedAttributes changes
  useEffect(() => {
    console.log('💡 DEBUG suggestedAttributes count:', suggestedAttributes?.length || 0)
  }, [suggestedAttributes, livePhase])
  
  // Track which bubbles are ready to show (audio has started or TTS disabled)
  const [daterBubbleReady, setDaterBubbleReady] = useState(true)
  
  // TTS: Handle dater bubble changes - wait for audio to start before showing
  useEffect(() => {
    if (!daterBubble) {
      // Reset dedupe key when bubble is cleared so identical text can render in later rounds.
      lastSpokenDater.current = ''
      return
    }
    if (daterBubble === lastSpokenDater.current) return
    
    lastSpokenDater.current = daterBubble
    
    if (ttsEnabled) {
      // Hide bubble until audio starts
      setDaterBubbleReady(false)

      let released = false
      const revealBubble = () => {
        if (released) return
        released = true
        setDaterBubbleReady(true)
      }

      // Fail-safe: never keep text hidden if TTS start callback is delayed/missed.
      const fallbackRevealTimer = setTimeout(() => {
        revealBubble()
      }, 700)
      
      // Start TTS
      speak(daterBubble, 'dater')
        .then(() => {
          // Show bubble when audio starts (speak resolves when audio begins)
          revealBubble()
          console.log('▶️ Dater bubble shown - audio started')
        })
        .catch(() => {
          revealBubble()
        })

      return () => {
        clearTimeout(fallbackRevealTimer)
      }
    } else {
      // TTS disabled - show immediately
      setDaterBubbleReady(true)
    }
  }, [daterBubble, ttsEnabled])
  
  // Stop TTS when phase changes or game ends
  useEffect(() => {
    if (livePhase === 'ended' || livePhase === 'lobby') {
      stopAllAudio()
      lastSpokenDater.current = ''
      setDaterBubbleReady(true)
    }
  }, [livePhase])

  // Show a small status note when ElevenLabs fails and fallback voice is used
  useEffect(() => {
    const unsubscribe = onTTSStatus((status) => {
      if (!status?.code) return
      if (status.code === 'ELEVENLABS_OK') {
        setTtsStatusNote('')
        return
      }
      if (status.code === 'ELEVENLABS_FAILED' || status.code === 'BROWSER_TTS_UNAVAILABLE') {
        setTtsStatusNote(status.message || 'ElevenLabs audio failed; using browser voice fallback.')
      }
    })
    return unsubscribe
  }, [])
  
  useEffect(() => {
    setScoringSummary(useGameStore.getState().getScoringSummary())
  }, [scoring])

  useEffect(() => () => {
    if (reactionFeedbackTimeout.current) clearTimeout(reactionFeedbackTimeout.current)
    if (boardPanelFlashTimeout.current) clearTimeout(boardPanelFlashTimeout.current)
  }, [])
  
  // No phase timer: progression is turn-based (player submits → dater reacts → advance).
  
  // ============ STARTING STATS MODE LOGIC ============
  
  // Reset narrator ref at game start so each new game reads its own plot twist summary
  useEffect(() => {
    if (livePhase === 'starting-stats') {
      narratorSummarySpokenRef.current = null
    }
  }, [livePhase])

  // Initialize Starting Stats phase (host only)
  useEffect(() => {
    console.log('🎲 Starting Stats useEffect check:', {
      livePhase,
      isHost,
      partyClient,
      roomCode,
      playersLength: players?.length,
      players: players?.map(p => p.username),
      questionAssignmentsLength: startingStats.questionAssignments?.length,
      startingStatsMode
    })
    
    // Must be in starting-stats phase
    if (livePhase !== 'starting-stats') {
      console.log('🎲 Not in starting-stats phase, current phase:', livePhase)
      return
    }
    
    // Must be host to initialize
    if (!isHost) {
      console.log('🎲 Not host, waiting for host to initialize')
      return
    }
    
    // In multiplayer we need PartyKit + room; in solo (Play Now) there is no partyClient
    if (partyClient && !roomCode) {
      console.log('🎲 PartyKit room not ready')
      return
    }
    
    // Only initialize if no question assignments yet
    if (startingStats.questionAssignments?.length > 0) {
      console.log('🎲 Already initialized with', startingStats.questionAssignments.length, 'assignments')
      return
    }
    
    // Wait for players to be loaded - use a longer timeout as fallback
    if (!players || players.length === 0) {
      console.log('🎲 No players yet, waiting... (will retry when players load)')
      return
    }
    
    console.log('🎲 Initializing Starting Stats phase with', players.length, 'players')
    
    // No starting-stats timer: advance only when player submits (see submitStartingStatsAnswer)
    
    // Build question assignments - spread questions evenly across all players
    const assignments = []
    const playerAssignmentCount = {} // Track total questions assigned to each player
    
    // Initialize counts for all players
    players.forEach(p => {
      playerAssignmentCount[p.id] = 0
    })
    
    // Shuffle players for initial randomness
    const shuffledPlayers = [...players].sort(() => Math.random() - 0.5)
    
    // Assign questions - try to give each player a unique question first
    for (let i = 0; i < STARTING_STATS_QUESTIONS.length; i++) {
      const questionDef = STARTING_STATS_QUESTIONS[i]
      
      // Find the player with the fewest assignments
      // This ensures we spread questions evenly before anyone gets a second question
      let minAssignments = Infinity
      let candidatePlayers = []
      
      for (const player of shuffledPlayers) {
        const count = playerAssignmentCount[player.id]
        if (count < minAssignments) {
          minAssignments = count
          candidatePlayers = [player]
        } else if (count === minAssignments) {
          candidatePlayers.push(player)
        }
      }
      
      // Pick randomly from players with minimum assignments
      const assignedPlayer = candidatePlayers[Math.floor(Math.random() * candidatePlayers.length)]
      
      if (assignedPlayer) {
        playerAssignmentCount[assignedPlayer.id]++
        assignments.push({
          questionIndex: i,
          playerId: assignedPlayer.id,
          playerName: assignedPlayer.username,
          questionType: questionDef.type,
          question: questionDef.question,
        })
        console.log(`🎲 Question ${i + 1} (${questionDef.type}) assigned to ${assignedPlayer.username} (now has ${playerAssignmentCount[assignedPlayer.id]} questions)`)
      }
    }
    
    // Make sure we have at least one assignment
    if (assignments.length === 0) {
      console.error('🎲 No question assignments created! Players:', players)
      // Fallback: skip to phase1
      setRoundPromptAnimationComplete(false)
      setLivePhase('phase1')
      setPhaseTimer(30)
      if (partyClient) {
        const currentCompatibility = useGameStore.getState().compatibility
        const currentCycleCount = useGameStore.getState().cycleCount
        partyClient.syncState( { phase: 'phase1', phaseTimer: 45, compatibility: currentCompatibility, cycleCount: currentCycleCount })
      }
      return
    }
    
    // Set up the first question
    const firstAssignment = assignments[0]
    const newStartingStats = {
      ...startingStats,
      questionAssignments: assignments,
      currentQuestionIndex: 0,
      activePlayerId: firstAssignment.playerId,
      activePlayerName: firstAssignment.playerName,
      currentQuestion: firstAssignment.question,
      currentQuestionType: firstAssignment.questionType,
      timer: 22, // was 15
      answers: [],
    }
    
    setStartingStats(newStartingStats)
    setStartingStatsTimer(15)
    setHasSubmittedStartingStat(false)
    setStartingStatsInput('')
    lastActivePlayerRef.current = firstAssignment.playerId
    lastAnswerCountRef.current = 0
    
    // Sync to PartyKit when multiplayer (solo has no partyClient)
    if (partyClient) {
      const currentCycleCount = useGameStore.getState().cycleCount
      partyClient.syncState( {
        startingStats: newStartingStats,
        phase: 'starting-stats',
        cycleCount: currentCycleCount
      })
    }
    console.log('🎲 Starting Stats initialized:', newStartingStats)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: init once when phase/assignments change
  }, [livePhase, isHost, partyClient, roomCode, players.length, startingStats.questionAssignments?.length])
  
  // No Starting Stats timer: advance only when player submits (submitStartingStatsAnswer → moveToNextStartingStatsQuestion)
  
  // Move to next Starting Stats question
  const moveToNextStartingStatsQuestion = async () => {
    console.log('🎯 moveToNextStartingStatsQuestion called, isHost:', isHost)
    
    if (!isHost) {
      console.log('❌ Not host, returning')
      return
    }
    
    // Guard: check phase is still starting-stats
    const currentPhase = useGameStore.getState().livePhase
    if (currentPhase !== 'starting-stats') {
      console.log('⏭️ moveToNextStartingStatsQuestion skipped - phase is:', currentPhase)
      return
    }
    
    const currentStats = useGameStore.getState().startingStats
    if (!currentStats) {
      console.log('❌ No currentStats, returning')
      return
    }
    
    const assignments = currentStats.questionAssignments || []
    
    console.log('📋 Current stats:', {
      currentQuestionIndex: currentStats.currentQuestionIndex,
      activePlayerId: currentStats.activePlayerId,
      answersCount: currentStats.answers?.length,
      assignmentsCount: assignments.length
    })
    
    // Use currentQuestionIndex if available, otherwise find by active player
    let currentIndex = currentStats.currentQuestionIndex
    if (typeof currentIndex !== 'number' || currentIndex < 0) {
      console.log('⚠️ currentQuestionIndex invalid, using findIndex')
      currentIndex = assignments.findIndex(
        a => a.playerId === currentStats.activePlayerId && 
             a.questionType === currentStats.currentQuestionType
      )
    }
    
    const nextIndex = currentIndex + 1
    
    console.log('📊 Starting Stats progress:', { currentIndex, nextIndex, total: assignments.length })
    
    // If currentIndex is -1 or nextIndex is past the end, complete the phase
    if (currentIndex < 0 || nextIndex >= assignments.length) {
      console.log('🏁 All Starting Stats questions completed, transitioning...')
      await completeStartingStatsPhase()
      return
    }
    
    const nextAssignment = assignments[nextIndex]
    const newStats = {
      ...currentStats,
      currentQuestionIndex: nextIndex,
      activePlayerId: nextAssignment.playerId,
      activePlayerName: nextAssignment.playerName,
      currentQuestion: nextAssignment.question,
      currentQuestionType: nextAssignment.questionType,
      timer: 22, // was 15
    }
    
    setStartingStats(newStats)
    setStartingStatsTimer(15)
    setHasSubmittedStartingStat(false)
    
    // No timer: next question starts when player submits
    
    // Sync to PartyKit
    if (partyClient) {
      partyClient.syncState({ startingStats: newStats })
    }
    
    console.log('➡️ Moving to next Starting Stats question:', nextAssignment)
  }
  
  // Submit Starting Stats answer
  const submitStartingStatsAnswer = async (answer) => {
    if (!answer.trim() || hasSubmittedStartingStat) return
    
    setHasSubmittedStartingStat(true)
    
    // Clear the timer immediately on submission
    if (startingStatsTimerRef.current) {
      clearInterval(startingStatsTimerRef.current)
      startingStatsTimerRef.current = null
    }
    
    const currentStats = useGameStore.getState().startingStats
    const newAnswer = {
      playerId: playerId,
      playerName: username,
      question: currentStats.currentQuestion,
      questionType: currentStats.currentQuestionType,
      answer: answer.trim(),
    }
    
    const newAnswers = [...(currentStats.answers || []), newAnswer]
    const newStats = { ...currentStats, answers: newAnswers }
    
    // If this is the name question, also store the avatar name
    if (currentStats.currentQuestionType === 'name') {
      newStats.avatarName = answer.trim()
    }
    
    setStartingStats(newStats)
    setStartingStatsInput('')
    
    // Update answer count ref to prevent double-advance from state sync
    lastAnswerCountRef.current = newAnswers.length
    
    // Sync to PartyKit
    if (partyClient) {
      partyClient.syncState({ startingStats: newStats })
    }
    
    console.log('📝 Starting Stats answer submitted. Total answers:', newAnswers.length)
    console.log('📝 isHost:', isHost, 'Current questionIndex:', currentStats.currentQuestionIndex)
    
    // If host, directly advance to next question (don't wait for state sync)
    if (isHost) {
      console.log('🚀 Host scheduling moveToNextStartingStatsQuestion in 100ms')
      setTimeout(() => {
        console.log('⏰ Timeout fired, checking phase...')
        const phase = useGameStore.getState().livePhase
        console.log('⏰ Current phase:', phase)
        if (phase === 'starting-stats') {
          console.log('✅ Calling moveToNextStartingStatsQuestion')
          moveToNextStartingStatsQuestion()
        } else {
          console.log('❌ Phase changed, not calling moveToNextStartingStatsQuestion')
        }
      }, 100)
    }
  }
  
  // Complete Starting Stats phase and transition to reaction round
  const completeStartingStatsPhase = async () => {
    if (!isHost) return
    
    // Guard against being called multiple times
    const currentPhase = useGameStore.getState().livePhase
    if (currentPhase !== 'starting-stats') {
      console.log('⏭️ completeStartingStatsPhase called but phase is already:', currentPhase)
      return
    }
    
    // Clear timer immediately to prevent any more calls
    if (startingStatsTimerRef.current) {
      clearInterval(startingStatsTimerRef.current)
      startingStatsTimerRef.current = null
    }
    
    // Reset used round prompts for the new game
    usedRoundPromptsRef.current.clear()
    console.log('🔄 Reset used round prompts for new game')
    
    console.log('🎉 Starting Stats complete! Applying attributes...')
    
    const currentStats = useGameStore.getState().startingStats
    const answers = currentStats.answers || []
    
    // Helper: detect if input is gibberish (random characters, too short, no real words)
    const isGibberish = (text) => {
      if (!text || typeof text !== 'string') return true
      const cleaned = text.trim().toLowerCase()
      if (cleaned.length < 2) return true
      // Check for excessive non-letter characters
      const letterRatio = (cleaned.match(/[a-z]/g) || []).length / cleaned.length
      if (letterRatio < 0.5) return true
      // Check for random keyboard mashing (too many consonants in a row)
      if (/[bcdfghjklmnpqrstvwxz]{5,}/i.test(cleaned)) return true
      // Check for repeated characters
      if (/(.)\1{3,}/.test(cleaned)) return true
      // Check against common gibberish patterns
      const gibberishPatterns = [
        /^[asdfjkl;]+$/i, // keyboard row mashing
        /^[qwertyuiop]+$/i,
        /^[zxcvbnm]+$/i,
        /^[0-9]+$/, // just numbers
        /^test+$/i,
        /^asdf/i,
        /^qwer/i,
        /^[a-z]{1,2}$/i, // just 1-2 random letters
      ]
      for (const pattern of gibberishPatterns) {
        if (pattern.test(cleaned)) return true
      }
      return false
    }
    
    // Helper: sanitize attributes based on type
    const sanitizeAttribute = (text, type) => {
      if (isGibberish(text)) {
        console.log(`🧹 Detected gibberish "${text}" for ${type}, using default`)
        switch (type) {
          case 'physical': return 'average looking'
          case 'emotional': return 'neutral'
          case 'name': return 'Alex'
          default: return 'unremarkable'
        }
      }
      return text.trim()
    }
    
    // Extract and sanitize attributes by type
    const physicalAttrs = answers
      .filter(a => a.questionType === 'physical')
      .map(a => sanitizeAttribute(a.answer, 'physical'))
    const emotionalAttrs = answers
      .filter(a => a.questionType === 'emotional')
      .map(a => sanitizeAttribute(a.answer, 'emotional'))
    const nameAnswer = answers.find(a => a.questionType === 'name')
    const sanitizedName = nameAnswer ? sanitizeAttribute(nameAnswer.answer, 'name') : null
    
    // If all physical attrs are "average looking", just use one
    const uniquePhysicalAttrs = [...new Set(physicalAttrs)]
    const uniqueEmotionalAttrs = [...new Set(emotionalAttrs)]
    
    // Combine all attributes
    const allAttributes = [
      ...uniquePhysicalAttrs,
      ...uniqueEmotionalAttrs.map(e => `emotionally ${e}`),
    ]
    
    // Set avatar name if provided (and not gibberish)
    if (sanitizedName) {
      setAvatarName(sanitizedName)
    }
    
    // Add all attributes to the avatar
    const currentAvatar = useGameStore.getState().avatar
    const updatedAvatar = {
      ...currentAvatar,
      name: sanitizedName || currentAvatar.name,
      attributes: [...(currentAvatar.attributes || []), ...allAttributes],
    }
    useGameStore.setState({ avatar: updatedAvatar })
    
    // Transition to REACTION ROUND - dater reacts to all starting stats
    setLivePhase('reaction')
    setPhaseTimer(0) // No timer for reaction round - it's driven by conversation
    
    // Sync to PartyKit - always include compatibility and cycleCount!
    if (partyClient) {
      const currentCompatibility = useGameStore.getState().compatibility
      const currentCycleCount = useGameStore.getState().cycleCount
      partyClient.syncState( {
        phase: 'reaction',
        phaseTimer: 0,
        avatar: updatedAvatar,
        startingStatsComplete: true,
        initialStartingStatsAttributes: allAttributes,
        compatibility: currentCompatibility, // PRESERVE!
        cycleCount: currentCycleCount, // PRESERVE!
      })
    }
    
    console.log('✅ Avatar created:', updatedAvatar)
    console.log('🎭 Starting reaction round with attributes:', allAttributes)
  }
  
  // Run the reaction round - dater reacts to physical attributes, avatar reveals emotional state
  const runReactionRound = async () => {
    if (!isHost || isGenerating) return
    
    setIsGenerating(true)
    console.log('🎭 Running reaction round...')
    
    // IMPORTANT: Clear conversation history for fresh start
    // This ensures the avatar doesn't "remember" previous games
    useGameStore.setState({ dateConversation: [] })
    setScoringSummary(useGameStore.getState().getScoringSummary())
    console.log('🧹 Cleared conversation history for fresh reaction round')
    
    const currentAvatar = useGameStore.getState().avatar
    const _avatarName = currentAvatar.name || 'the date'
    const attributes = currentAvatar.attributes || []
    const currentStartingStats = useGameStore.getState().startingStats
    const answers = currentStartingStats?.answers || []
    
    // Separate physical and emotional attributes from starting stats
    const physicalAttrs = answers
      .filter(a => a.questionType === 'physical')
      .map(a => a.answer)
    const emotionalAttrs = answers
      .filter(a => a.questionType === 'emotional')
      .map(a => a.answer)
    
    // If no starting stats, fall back to all attributes
    const physicalList = physicalAttrs.length > 0 ? physicalAttrs.join(', ') : attributes.slice(0, 3).join(', ')
    const emotionalList = emotionalAttrs.length > 0 ? emotionalAttrs.join(' and ') : 'seems nervous'
    const avatarDisplayName = currentAvatar.name || 'your date'
    
    if (attributes.length === 0 && physicalAttrs.length === 0) {
      console.log('No attributes to react to, skipping reaction round')
      await finishReactionRound()
      return
    }
    
    try {
      // === COMMENT 1: Dater's initial impression of the Avatar's appearance ===
      const firstImpressionInstruction = `You (the Dater) are seeing ${avatarDisplayName} for the very first time. They look like: ${physicalList}.

YOUR TASK: Give YOUR immediate gut reaction to their appearance. What do you notice first? Are you attracted, alarmed, intrigued, or put off?

RULES:
- Speak as YOURSELF (the Dater), directly to your date.
- React to what you SEE — their physical appearance only.
- Have a strong opinion. Don't be generic.
- NEVER mention that they haven't spoken yet, are being quiet, or are silent. This is your opening — they'll talk soon.
- Exactly 2 sentences, dialogue only. No actions or asterisks.`
      const daterReaction1 = await getDaterDateResponse(
        selectedDater,
        currentAvatar,
        [],
        null,
        null,
        { positive: 0, negative: 0 },
        false,
        true,
        useGameStore.getState().compatibility,
        firstImpressionInstruction
      )

      let firstImpressionMood = 'neutral'
      if (daterReaction1) {
        firstImpressionMood = physicalList.toLowerCase().includes('attractive') ||
          physicalList.toLowerCase().includes('handsome') ||
          physicalList.toLowerCase().includes('beautiful') ||
          physicalList.toLowerCase().includes('cute') ? 'attracted'
          : physicalList.toLowerCase().includes('scary') ||
            physicalList.toLowerCase().includes('bloody') ||
            physicalList.toLowerCase().includes('terrifying') ? 'horrified'
            : physicalList.toLowerCase().includes('nervous') ||
              physicalList.toLowerCase().includes('sweaty') ? 'uncomfortable' : 'neutral'

        setDaterEmotion(firstImpressionMood)
        setDaterBubble(daterReaction1)
        addDateMessage('dater', daterReaction1)
        await syncConversationToPartyKit(undefined, daterReaction1, false)
        if (partyClient && isHost) {
          partyClient.syncState({ daterEmotion: firstImpressionMood })
        }

        const firstImpressionInput = `Appearance: ${physicalList}. Emotional state: ${emotionalList}.`
        await applyScoringDecision({
          question: 'First impressions',
          playerAnswer: firstImpressionInput,
          daterResponse: daterReaction1,
          source: 'first impression',
        })
      }

      await syncConversationToPartyKit(undefined, undefined, true)
      await waitForAllAudio()
    } catch (error) {
      console.error('Error in reaction round:', error)
    }
    
    setIsGenerating(false)
    await finishReactionRound()
  }
  
  // Finish reaction round and move to Phase 1
  const finishReactionRound = async () => {
    console.log('✅ Reaction round complete, waiting for audio...')
    
    // Wait for all audio to finish first
    await waitForAllAudio()
    console.log('✅ Audio complete, showing "The Date Begins" interstitial...')

    setShowDateBeginsOverlay(true)
    speak('The Date Begins', 'narrator')
    await Promise.race([waitForAllAudio(), new Promise(resolve => setTimeout(resolve, 12000))])
    setShowDateBeginsOverlay(false)
    console.log('🎬 Narrator complete, starting Round 1 prompt')
    
    // Get round prompt (Title + Question) - shown as interstitial, not asked by dater
    // This is Round 1 (first round after reaction), so use first round prompts
    const roundPrompt = getRoundPrompt(true) // true = first round
    setCurrentRoundPrompt(roundPrompt)
    
    // Get current compatibility to preserve it
    const currentCompatibility = useGameStore.getState().compatibility
    console.log('💯 Preserving compatibility:', currentCompatibility)
    
    setRoundPromptAnimationComplete(false)
    setLivePhase('phase1')
    setPhaseTimer(0) // No timer: advance when player submits answer
    setQuestionNarrationComplete(false)
    lastNarratedQuestionRef.current = ''
    // Don't set dater bubble - the prompt is shown as interstitial instead
    setDaterBubble('')
    setAvatarBubble('')
    
    if (partyClient) {
      const currentCycleCount = useGameStore.getState().cycleCount
      partyClient.syncState( {
        phase: 'phase1',
        phaseTimer: 0,
        reactionRoundComplete: true,
        currentRoundPrompt: roundPrompt, // Sync round prompt to all clients
        daterBubble: '',
        avatarBubble: '',
        compatibility: currentCompatibility,
        cycleCount: currentCycleCount,
      })
    }
    
    console.log('🎯 Round prompt:', roundPrompt.title, '-', roundPrompt.subtitle)
  }
  
  // ============ END STARTING STATS MODE LOGIC ============
  
  // Debug: skip first impressions + all questions and jump straight to plot twist
  useEffect(() => {
    if (livePhase === 'reaction' && isHost && useGameStore.getState().debugSkipToPlotTwist) {
      useGameStore.setState({ debugSkipToPlotTwist: false })
      console.log('🎭 DEBUG: Skipping to Plot Twist')
      // Set avatar defaults so the plot twist has a name to work with
      const avatarState = useGameStore.getState().avatar
      if (!avatarState?.name || avatarState.name === 'Avatar') {
        useGameStore.setState({
          avatar: {
            ...avatarState,
            name: 'Test Player',
            attributes: ['looks intriguing', 'seems adventurous', 'appears confident'],
            personality: 'A test player jumping straight to the plot twist.',
          }
        })
      }
      const timer = setTimeout(() => startPlotTwist(), 500)
      return () => clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [livePhase, isHost])

  // Trigger reaction round when phase changes to 'reaction'
  useEffect(() => {
    if (livePhase === 'reaction' && isHost && !isGenerating && !useGameStore.getState().debugSkipToPlotTwist) {
      // Small delay to let the UI update
      const timer = setTimeout(() => {
        runReactionRound()
      }, 1000)
      return () => clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: runReactionRound/isGenerating not in deps
  }, [livePhase, isHost])
  
  // Phase 1 initialization - round prompt is now set by finishReactionRound/handleRoundComplete/finishPlotTwist
  // This effect just ensures prompts are generated if somehow missing (fallback)
  useEffect(() => {
    if (livePhase === 'phase1' && isHost && !currentRoundPrompt.title) {
      // Fallback: generate a round prompt if none exists
      const currentCycle = useGameStore.getState().cycleCount
      const isFirstRound = currentCycle === 0
      const roundPrompt = getRoundPrompt(isFirstRound)
      setCurrentRoundPrompt(roundPrompt)
      if (partyClient) {
        partyClient.syncState({ currentRoundPrompt: roundPrompt })
      }
      console.log('🎯 Fallback round prompt:', roundPrompt.title, '-', roundPrompt.subtitle)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: getRoundPrompt/partyClient stable
  }, [livePhase, isHost, currentRoundPrompt.title])
  
  // Timer is now started immediately when phase1 begins - no animation-based delay needed
  
  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [playerChat])
  
  // Show phase announcement when phase changes
  useEffect(() => {
    // Don't show announcement for starting-stats, phase1 (has round prompt banner), or ended
    const skipAnnouncement = ['starting-stats', 'ended', 'waiting', 'phase1', 'phase3']
    if (livePhase && livePhase !== lastPhaseRef.current && !skipAnnouncement.includes(livePhase)) {
      lastPhaseRef.current = livePhase
      setAnnouncementPhase(livePhase)
      setShowPhaseAnnouncement(true)
      
      // Hide after 2.5 seconds (longer for reaction to build anticipation)
      const timer = setTimeout(() => {
        setShowPhaseAnnouncement(false)
      }, livePhase === 'reaction' ? 3000 : 2000)
      
      return () => clearTimeout(timer)
    }
  }, [livePhase])
  
  // Get phase announcement content
  // Compute the user-facing phase number (Phase 1-9) from game state
  const getGamePhaseNumber = () => {
    if (livePhase === 'reaction') return 1
    if (livePhase === 'plot-twist' || livePhase === 'plot-twist-reaction') return 5
    if (livePhase === 'ended') return 10
    const cc = useGameStore.getState().cycleCount
    const mc = useGameStore.getState().maxCycles
    if (cc >= mc - 1) return 9 // Wrap Up
    return cc < 3 ? cc + 2 : cc + 3 // Q1-3 → Phase 2-4, Q4-6 → Phase 6-8
  }

  const getQuestionNumber = () => {
    const cc = useGameStore.getState().cycleCount
    return cc + 1
  }

  const getPhaseAnnouncement = () => {
    const daterName = selectedDater?.name || 'Maya'
    const phaseNum = getGamePhaseNumber()
    const qNum = getQuestionNumber()
    switch (announcementPhase) {
      case 'reaction':
        return { title: `Phase ${phaseNum}: First Impressions`, subtitle: `Meeting ${daterName}`, icon: '👋', description: 'Watch them meet for the first time!' }
      case 'phase1': {
        const cc = useGameStore.getState().cycleCount
        const mc = useGameStore.getState().maxCycles
        if (cc >= mc - 1) {
          return { title: `Phase 9: Wrap Up`, subtitle: 'The date is ending...', icon: '🎬', description: `${daterName} shares final thoughts.` }
        }
        return { 
          title: currentRoundPrompt.title || `Phase ${phaseNum}: Date Question ${qNum}`, 
          subtitle: '', 
          icon: '✨', 
          description: currentRoundPrompt.subtitle || 'Submit your answer!' 
        }
      }
      case 'answer-selection':
        return { title: 'SELECTING', subtitle: 'Answer', icon: '🎲', description: 'Picking an answer...' }
      case 'phase3': {
        const cc = useGameStore.getState().cycleCount
        const mc = useGameStore.getState().maxCycles
        if (cc >= mc - 1) {
          return { title: `Phase 9: Wrap Up`, subtitle: `${daterName}'s final thoughts`, icon: '🎬', description: `See what ${daterName} thinks!` }
        }
        return { title: `Phase ${phaseNum}`, subtitle: `${daterName} reacts`, icon: '👀', description: 'See how they react!' }
      }
      case 'plot-twist-reaction':
        return { title: 'Phase 5: Plot Twist', subtitle: `${daterName}'s reaction`, icon: '🎭', description: "Watch the date react to what happened!" }
      default:
        return { title: '', subtitle: '', icon: '', description: '' }
    }
  }
  
  // Tutorial content
  const getTutorialContent = () => {
    switch (tutorialStep) {
      case 1:
        return {
          title: 'Welcome to Bad Date!',
          text: "Your goal is simple: score as high as you can in the mode you selected. Watch live scoring feedback after each dater line.",
          highlight: null
        }
      case 2:
        return {
          title: 'How to Play',
          text: "When your date asks a question, type your answer and press Enter (or tap ✨). Your date will react to whatever you say—no timers, no voting. Just you and the date!",
          highlight: null
        }
      case 3:
        return {
          title: "Let's Go!",
          text: "After 6 rounds, the date ends and you'll see your final score summary plus the dater's Yes/No decision.",
          highlight: null
        }
      default:
        return { title: '', text: '', highlight: null }
    }
  }
  
  // Generate dater values when the game starts (HOST ONLY)
  useEffect(() => {
    const initDaterValues = async () => {
      // Only host generates dater values - non-hosts receive via PartyKit
      if (!isHost) return
      
      if (selectedDater && (!daterValues.loves.length || daterValues.loves.length === 0)) {
        console.log('Generating dater values for', selectedDater.name)
        const values = await generateDaterValues(selectedDater)
        setDaterValues(values)
        console.log('Dater values set:', values)
        
        // Sync to PartyKit for non-hosts
        if (partyClient) {
          partyClient.syncState( { daterValues: values })
        }
      }
    }
    initDaterValues()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: daterValues/setDaterValues not in deps
  }, [selectedDater, isHost, partyClient, roomCode])
  
  // Auto-advance from Plot Twist input after submitting answer
  useEffect(() => {
    if (livePhase !== 'plot-twist' || plotTwist?.subPhase !== 'input' || !hasSubmittedPlotTwist || !isHost) return
    const t = setTimeout(() => advancePlotTwistToReveal(), 1500)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- advancePlotTwistToReveal intentionally omitted to avoid re-trigger loops
  }, [livePhase, plotTwist?.subPhase, hasSubmittedPlotTwist, isHost])

  
  // Round prompts - Title + Subtitle (Question) for each round
  // These are shown as interstitials during Phase 1 instead of the dater asking
  
  // FIRST ROUND ONLY - must be one of these 3
  const FIRST_ROUND_PROMPTS = [
    { title: "Green Flag", subtitle: "What small thing makes you think someone \"gets it\"?" },
    { title: "Ick", subtitle: "What totally harmless thing is a big turnoff?" },
    { title: "Dealbreaker", subtitle: "What would make you instantly lose interest?" },
  ]
  
  // ADDITIONAL prompts available for rounds 2+ (plus any unused from first round pool)
  const ADDITIONAL_PROMPTS = [
    { title: "Hot Take", subtitle: "Your most controversial relationship opinion?" },
    { title: "Love Language", subtitle: "How do you show someone that you care?" },
    { title: "Desert Island Date", subtitle: "Stranded together. What item do you bring?" },
    { title: "Time Traveler", subtitle: "First date in any time period—when and where?" },
    { title: "Superpower Romance", subtitle: "What superpower would make you a super-partner?" },
    { title: "Lottery Winner", subtitle: "You win $10 million; how does dating change?" },
    { title: "Secret Talent", subtitle: "What's a hidden skill that'd impress a date?" },
    { title: "Embarrassing Moment", subtitle: "What's your most mortifying dating story?" },
    { title: "Soft Spot", subtitle: "What's the fastest way to melt your heart?" },
    { title: "The Pattern", subtitle: "What dating habit do you keep repeating?" },
    { title: "First Five Minutes", subtitle: "What do you notice first about a date?" },
    { title: "Silent Tell", subtitle: "How can someone tell you secretly like them?" },
    { title: "Lost Cause", subtitle: "When do you know it's time to just give up?" },
    { title: "The Test", subtitle: "What do you do early on to vet a new partner?" },
    { title: "Unspoken Rule", subtitle: "What's a dating rule you never say out loud?" },
    { title: "Solo Chapter", subtitle: "What part of being single won't you give up?" },
  ]
  
  // All prompts combined (for rounds 2-5)
  const ALL_PROMPTS = [...FIRST_ROUND_PROMPTS, ...ADDITIONAL_PROMPTS]
  
  // Track which prompts have been used this game (by title)
  const usedRoundPromptsRef = useRef(new Set())
  
  // Get a random round prompt (returns {title, subtitle})
  // isFirstRound determines which pool to pick from
  const getRoundPrompt = (isFirstRound = false) => {
    // Determine which pool to use
    const promptPool = isFirstRound ? FIRST_ROUND_PROMPTS : ALL_PROMPTS
    
    // Filter out already-used prompts
    const availablePrompts = promptPool.filter(p => !usedRoundPromptsRef.current.has(p.title))
    
    // If no prompts available (shouldn't happen with 12 prompts and 5 rounds), use any unused
    if (availablePrompts.length === 0) {
      console.warn('⚠️ No available prompts! This should not happen.')
      // Fallback: pick from all prompts that haven't been used
      const anyAvailable = ALL_PROMPTS.filter(p => !usedRoundPromptsRef.current.has(p.title))
      if (anyAvailable.length > 0) {
        const prompt = anyAvailable[Math.floor(Math.random() * anyAvailable.length)]
        usedRoundPromptsRef.current.add(prompt.title)
        return prompt
      }
      // Ultimate fallback: reset and pick
      usedRoundPromptsRef.current.clear()
      const prompt = promptPool[Math.floor(Math.random() * promptPool.length)]
      usedRoundPromptsRef.current.add(prompt.title)
      return prompt
    }
    
    // Pick a random unused prompt from the appropriate pool
    const prompt = availablePrompts[Math.floor(Math.random() * availablePrompts.length)]
    usedRoundPromptsRef.current.add(prompt.title)
    console.log(`🎯 Selected prompt: "${prompt.title}" (${isFirstRound ? 'first round' : 'later round'})`)
    return prompt
  }
  
  const _handlePhaseEnd = async () => {
    if (phaseTimerRef.current) {
      clearInterval(phaseTimerRef.current)
    }
    
    // Only host controls phase transitions
    if (!isHost && partyClient) return
    
    // IMPORTANT: Get current compatibility to preserve it during phase transitions
    const currentCompatibility = useGameStore.getState().compatibility
    console.log('💯 Phase transition - preserving compatibility:', currentCompatibility)
    
    switch (livePhase) {
      case 'phase1':
        // Check if anyone submitted an attribute
        if (!suggestedAttributes || suggestedAttributes.length === 0) {
          // No suggestions - keep timer at 0 and wait
          console.log('Waiting for at least one attribute suggestion...')
          return // Don't transition, stay in Phase 1
        }
        // Move to Answer Selection - show all answers and randomly pick one
        console.log('📋 Processing suggestions for answer selection:', suggestedAttributes?.length || 0, 'items')
        {
          const answers = suggestedAttributes
            .filter(attr => attr && (attr.text || typeof attr === 'string'))
            .map((attr, idx) => ({
              id: idx,
              text: typeof attr === 'string' ? attr : (attr.text || 'Unknown'),
              submittedBy: attr.username || attr.suggestedBy || 'Anonymous'
            }))
          startAnswerSelection(answers)
        }
        break
        
      // Phase 3 ends are handled by handleRoundComplete() after conversation finishes
    }
  }
  
  // Phase 1 advancement is now on submit only (no timer); see handleChatSubmit → submitPhase1AnswerDirect
  
  // Get the winning attribute text (before applying it to the store)
  const _getWinningAttributeText = () => {
    if (numberedAttributes.length === 0) return null
    
    // Check if anyone voted
    const totalVotes = numberedAttributes.reduce((sum, attr) => sum + attr.votes.length, 0)
    
    if (totalVotes === 0) {
      // No votes - pick a random attribute
      const randomIndex = Math.floor(Math.random() * numberedAttributes.length)
      console.log('No votes cast - picking random attribute:', numberedAttributes[randomIndex]?.text)
      return numberedAttributes[randomIndex]?.text || null
    }
    
    // Sort by votes and return the winner
    const sorted = [...numberedAttributes].sort((a, b) => b.votes.length - a.votes.length)
    return sorted[0]?.text || null
  }
  
  // ============================================
  // PHASE 1: PRE-GENERATE ALL CONVERSATION
  // Front-load all LLM calls, store results
  // ============================================
  const preGenerateRoundConversation = async (currentAttribute) => {
    if (!isHost || !selectedDater) return null

    const playerAnswer = currentAttribute || latestAttribute
    if (!playerAnswer) return null

    // Always pass question + answer so LLM has context (critical for short answers like single words)
    const question = currentRoundPrompt.subtitle || 'Tell me about yourself'
    console.log('🎬 Pre-generating: Dater responds to player answer (question + answer context)...')
    setIsPreGenerating(true)
    if (partyClient) partyClient.syncState({ isPreGenerating: true })

    const currentCycleForCheck = useGameStore.getState().cycleCount
    const maxCyclesForCheck = useGameStore.getState().maxCycles
    const isFinalRound = currentCycleForCheck >= maxCyclesForCheck - 1
    const currentCompat = useGameStore.getState().compatibility
    const conversationHistory = useGameStore.getState().dateConversation

    try {
      const daterReaction = await getDaterResponseToPlayerAnswer(
        selectedDater, question, playerAnswer, conversationHistory, currentCompat, isFinalRound, daterValues, currentCycleForCheck
      )
      syncLlmStatusMessage()
      if (!daterReaction) {
        setIsPreGenerating(false)
        if (partyClient) partyClient.syncState({ isPreGenerating: false })
        return null
      }

      const daterQuickAnswer = String(daterQuickAnswerRef.current || '').trim() || await getDaterQuickAnswer(
        selectedDater,
        question,
        conversationHistory
      )
      if (daterQuickAnswer) {
        daterQuickAnswerRef.current = daterQuickAnswer
      }

      const daterComparison = await getDaterAnswerComparison(
        selectedDater,
        question,
        daterQuickAnswer || 'my gut',
        playerAnswer,
        conversationHistory
      )
      syncLlmStatusMessage()

      const lowerReaction = String(daterReaction || '').toLowerCase()
      const negativeCue = /\b(no|never|not|awful|bad|terrible|uncomfortable|hate|worse|wrong)\b/.test(lowerReaction)
      const daterMood = negativeCue ? 'uncomfortable' : 'happy'

      const preGenData = {
        attribute: playerAnswer,
        isFinalRound,
        question,
        exchanges: [
          {
            avatarResponse: null,
            daterReaction,
            daterMood,
            source: 'round reaction',
          },
          {
            avatarResponse: null,
            daterReaction: daterComparison,
            daterMood: 'neutral',
            source: 'round follow-up',
            daterQuickAnswer,
          }
        ].filter(e => e.daterReaction),
        avatarWithNewAttr: { ...avatar, attributes: avatar.attributes.includes(playerAnswer) ? avatar.attributes : [...avatar.attributes, playerAnswer] }
      }
      setIsPreGenerating(false)
      if (partyClient) partyClient.syncState({ isPreGenerating: false, preGeneratedConvo: preGenData })
      return preGenData
    } catch (error) {
      console.error('Pre-generation error:', error)
      setIsPreGenerating(false)
      if (partyClient) partyClient.syncState({ isPreGenerating: false })
      return null
    }
  }
  
  // ============================================
  // PHASE 2: PLAYBACK PRE-GENERATED CONVERSATION
  // Smooth, natural timing - waits for audio to complete
  // ============================================
  const playbackConversation = async (preGenData) => {
    if (!preGenData || !isHost) return

    console.log('▶️ PLAYING BACK pre-generated conversation (dater only)...')
    const { attribute, exchanges, question } = preGenData

    for (let i = 0; i < exchanges.length; i++) {
      const exchange = exchanges[i]
      if (exchange.daterReaction) {
        setDaterEmotion(exchange.daterMood || 'neutral')
        setDaterBubble(exchange.daterReaction)
        addDateMessage('dater', exchange.daterReaction)
        await syncConversationToPartyKit(undefined, exchange.daterReaction, undefined)
        if (partyClient) partyClient.syncState({ daterEmotion: exchange.daterMood || 'neutral' })

        await applyScoringDecision({
          question: question || currentRoundPrompt.subtitle || 'Tell me about yourself',
          playerAnswer: attribute,
          daterResponse: exchange.daterReaction,
          source: exchange.source || (i === 0 ? 'round reaction' : 'round follow-up'),
        })
        if (i > 0) {
          showDaterAnswerBanner(exchange.daterQuickAnswer || daterQuickAnswerRef.current)
        }

        await syncConversationToPartyKit(undefined, undefined, true)
        await waitForAllAudio()

        if (i < exchanges.length - 1) {
          await new Promise(r => setTimeout(r, 1000))
        }
      }
    }
    
    console.log('✅ Playback complete!')
  }
  
  // ============================================
  // MAIN CONVERSATION FUNCTION
  // Uses pre-generated data if available, otherwise generates fresh
  // ============================================
  const generateDateConversation = async (currentAttribute) => {
    if (!isHost) {
      console.log('Non-host skipping generateDateConversation')
      return
    }
    if (isGenerating || !selectedDater) return
    
    setIsGenerating(true)
    
    try {
      // Check if we have pre-generated data from early LLM call
      let preGenData = preGenConversationRef.current
      
      if (preGenData) {
        console.log('🚀 Using pre-generated conversation data!')
      } else if (preGenPromiseRef.current) {
        // Pre-gen started but not finished - wait for it
        console.log('⏳ Waiting for pre-generation to complete...')
        preGenData = await preGenPromiseRef.current
      } else {
        // No pre-gen - generate fresh (fallback)
        console.log('📝 No pre-gen available, generating fresh...')
        preGenData = await preGenerateRoundConversation(currentAttribute)
      }
      
      // Clear refs for next round
      preGenConversationRef.current = null
      preGenPromiseRef.current = null
      
      // IMPORTANT: Clear pre-generating indicator before playback starts!
      setIsPreGenerating(false)
      if (partyClient) {
        partyClient.syncState({ isPreGenerating: false })
      }
      
      if (preGenData) {
        await playbackConversation(preGenData)
      } else {
        const safeAnswer = String(currentAttribute || latestAttribute || 'that').trim()
        const fallbackReaction = `You gave me "${safeAnswer}"... and yes, I have an opinion.`
        setDaterBubble(fallbackReaction)
        addDateMessage('dater', fallbackReaction)
        await syncConversationToPartyKit(undefined, fallbackReaction, undefined)
        await applyScoringDecision({
          question: currentRoundPrompt.subtitle || 'Tell me about yourself',
          playerAnswer: safeAnswer,
          daterResponse: fallbackReaction,
          source: 'fallback reaction',
        })
      }

      // Wait for all audio to finish before ending the round
      console.log('⏳ Waiting for final audio to complete...')
      await waitForAllAudio()
      console.log('✅ All audio complete')

      // Wait 4 seconds after dater finishes reacting so player can read the response
      console.log('⏳ Holding for 4 seconds before next question...')
      await new Promise(r => setTimeout(r, 4000))

      await handleRoundComplete()
      
    } catch (error) {
      console.error('Conversation error:', error)
      setDaterBubble("Well, that was... something.")
    }
    
    setIsGenerating(false)
  }
  
  // ============================================
  // PHASE 9: WRAP UP
  // Comment 1: What the dater thought of the date and the avatar
  // Comment 2: Whether they want a second date
  // ============================================
  const waitForAudioOrTimeout = (maxMs = 12000) =>
    Promise.race([waitForAllAudio(), new Promise(r => setTimeout(r, maxMs))])

  const buildRatingsModeFinalDecision = () => {
    const summary = useGameStore.getState().getScoringSummary()
    const outcomeKey = summary?.dateOutcomeKey || 'total-failure'
    const decision = summary?.secondDateDecision === 'yes' ? 'yes' : 'no'

    const byOutcome = {
      'total-failure': {
        assessment: "That crashed as both a date and an episode.",
        verdict: 'Second date: no. The chemistry and the ratings both flatlined.',
      },
      'successful-tv-episode': {
        assessment: 'Great television, questionable romance.',
        verdict: 'Second date: no. Incredible episode, but not a match.',
      },
      'successful-date': {
        assessment: 'This was a real connection, even if it was low-drama TV.',
        verdict: 'Second date: yes. The date worked, even without chaos.',
      },
      'perfect-date': {
        assessment: 'You nailed both the chemistry and the spectacle.',
        verdict: 'Second date: yes. Perfect date, perfect episode.',
      },
    }

    const selected = byOutcome[outcomeKey] || byOutcome['total-failure']
    return {
      decision,
      assessment: selected.assessment,
      verdict: selected.verdict,
    }
  }

  const generateWrapUpRound = async () => {
    const avatarName = avatar?.name || 'you'
    console.log('🎬 Starting Phase 9: Wrap Up')

    try {
      const currentMode = useGameStore.getState().scoring?.selectedMode || SCORING_MODES.LIKES_MINUS_DISLIKES
      const useRatingsModeDecision = currentMode === SCORING_MODES.LIKES_MINUS_DISLIKES_CHAOS
      const decisionState = useRatingsModeDecision
        ? buildRatingsModeFinalDecision()
        : await generateFinalDateDecision(
          selectedDater,
          avatarName,
          useGameStore.getState().dateConversation || []
        )
      if (!useRatingsModeDecision) {
        syncLlmStatusMessage()
      }
      setFinalDateDecision(decisionState)

      const assessment = String(decisionState?.assessment || '').trim()
        || "This date had its moments, and I learned a lot about you."
      const verdict = String(decisionState?.verdict || '').trim()
        || (decisionState?.decision === 'yes'
          ? "Yes, I'd go on another date."
          : "No, I don't want a second date.")

      const assessmentMood = decisionState?.decision === 'yes' ? 'happy' : 'neutral'
      setDaterEmotion(assessmentMood)
      setDaterBubble(assessment)
      setDaterBubbleReady(true)
      addDateMessage('dater', assessment)
      await syncConversationToPartyKit(undefined, assessment, undefined)
      if (partyClient) {
        partyClient.syncState({ daterEmotion: assessmentMood, finalDateDecision: decisionState })
      }
      await applyScoringDecision({
        question: 'Date wrap-up assessment',
        playerAnswer: '',
        daterResponse: assessment,
        source: 'wrap-up assessment',
      })
      await waitForAudioOrTimeout()
      await new Promise(r => setTimeout(r, 900))

      const verdictMood = decisionState?.decision === 'yes' ? 'excited' : 'uncomfortable'
      setDaterEmotion(verdictMood)
      setDaterBubble(verdict)
      setDaterBubbleReady(true)
      addDateMessage('dater', verdict)
      await syncConversationToPartyKit(undefined, verdict, undefined)
      if (partyClient) {
        partyClient.syncState({ daterEmotion: verdictMood, finalDateDecision: decisionState })
      }
      await applyScoringDecision({
        question: 'Second date decision',
        playerAnswer: '',
        daterResponse: verdict,
        source: 'wrap-up verdict',
      })
      await waitForAudioOrTimeout()
      await new Promise(r => setTimeout(r, 1500))
      setScoringSummary(useGameStore.getState().getScoringSummary())
      console.log('✅ Wrap-Up Round complete!')
    } catch (error) {
      console.error('Error in wrap-up round:', error)
      const fallbackDecision = {
        decision: 'no',
        assessment: "This was definitely a memorable night.",
        verdict: "I'm going to pass on a second date.",
      }
      setFinalDateDecision(fallbackDecision)
      setDaterBubble(fallbackDecision.verdict)
      addDateMessage('dater', fallbackDecision.verdict)
      await syncConversationToPartyKit(undefined, fallbackDecision.verdict, undefined)
    }
  }
  
  // Handle round completion - check if we continue or end
  // ONLY HOST should run this - non-hosts receive state via PartyKit
  const handleRoundComplete = async () => {
    if (!isHost) {
      console.log('Non-host skipping handleRoundComplete')
      return
    }
    
    // IMPORTANT: Get ALL current values from store (not closure values!)
    const currentCycleCount = useGameStore.getState().cycleCount
    const currentMaxCycles = useGameStore.getState().maxCycles
    const currentPlotTwistCompleted = useGameStore.getState().plotTwistCompleted
    const newRoundCount = currentCycleCount + 1
    incrementCycle()
    
    // Keep compatibility around for legacy systems.
    const currentCompatibility = useGameStore.getState().compatibility
    const currentSummary = useGameStore.getState().getScoringSummary()
    console.log(`Round ${newRoundCount}/${currentMaxCycles} complete, mode: ${currentSummary.mode}, cycleCount: ${currentCycleCount} -> ${newRoundCount}`)
    
    // Check if we should trigger Plot Twist (after Round 3, i.e., newRoundCount === 3)
    if (newRoundCount === 3 && !currentPlotTwistCompleted) {
      console.log('🎭 Triggering Plot Twist after Round 3!')
      startPlotTwist()
      return
    }
    
    // With maxCycles=6: Rounds 1-5 are question rounds; Round 6 is wrap-up. Date ends ONLY after wrap-up.
    if (newRoundCount === currentMaxCycles - 1) {
      // PHASE 9: WRAP-UP (no questions, just final conversation)
      // Date must run this before ending — we never skip to "ended" before wrap-up
      console.log('🎬 Starting Phase 9: Wrap Up')
      
      setSubmittedAnswer('') // Clear answer comparison box
      setDaterDisplayAnswer('')
      setLivePhase('phase3')
      setCurrentRoundPrompt({ title: 'Phase 9: Wrap Up', subtitle: 'The date is ending...' })
      setDaterBubble('')
      setAvatarBubble('')
      
      if (partyClient) {
        partyClient.syncState({
          phase: 'phase3',
          currentRoundPrompt: { title: 'WRAP UP', subtitle: 'The date is ending...' },
          compatibility: currentCompatibility,
          cycleCount: newRoundCount,
          daterBubble: '',
          avatarBubble: '',
          daterDisplayAnswer: ''
        })
      }
      
      await generateWrapUpRound()
      
      // Date ends ONLY after wrap-up conversation finishes
      const finalCycleCount = newRoundCount + 1
      useGameStore.setState({ cycleCount: finalCycleCount })
      setLivePhase('ended')
      clearPlayerAnswerData()
      if (partyClient) {
        partyClient.syncState({ phase: 'ended', compatibility: currentCompatibility, cycleCount: finalCycleCount })
      }
      setTimeout(() => setPhase('results'), 10000)
    } else if (newRoundCount >= currentMaxCycles) {
      // Only reachable if maxCycles changed or wrap-up was already run; end game
      setLivePhase('ended')
      clearPlayerAnswerData()
      if (partyClient) {
        partyClient.syncState({ phase: 'ended', compatibility: currentCompatibility, cycleCount: newRoundCount })
      }
      setTimeout(() => setPhase('results'), 15000)
    } else {
      // Start new round - show round prompt interstitial (not dater question)
      setRoundPromptAnimationComplete(false)
      setSubmittedAnswer('') // Clear previous answer comparison box
      setDaterDisplayAnswer('')
      setLivePhase('phase1')
      setPhaseTimer(0) // No timer: advance when player submits
      setQuestionNarrationComplete(false)
      lastNarratedQuestionRef.current = ''
      
      // Only host sets up the next round
      if (isHost) {
        // Get round prompt (Title + Question) - shown as interstitial
        // newRoundCount is 0-indexed, so round 1 = cycleCount 0
        const isFirstRound = newRoundCount === 0
        const roundPrompt = getRoundPrompt(isFirstRound)
        setCurrentRoundPrompt(roundPrompt)
        
        // Don't set dater bubble - the prompt is shown as interstitial
        setDaterBubble('')
        setAvatarBubble('')
        
        // Clear previous round's suggestions
        setSuggestedAttributes([])
        setNumberedAttributes([])
        
        // Sync to PartyKit including the round prompt and cleared state
        if (partyClient) {
          partyClient.syncState( { 
            phase: 'phase1', 
            phaseTimer: 45,
            compatibility: currentCompatibility,
            currentRoundPrompt: roundPrompt, // Sync round prompt to all clients
            daterBubble: '',
            avatarBubble: '',
            cycleCount: newRoundCount,
            suggestedAttributes: [],
            numberedAttributes: [],
            daterDisplayAnswer: ''
          })
          partyClient.clearSuggestions()
          partyClient.clearVotes()
        }
        
        console.log('🎯 Round prompt:', roundPrompt.title, '-', roundPrompt.subtitle)
      }
      // Non-hosts will receive the round prompt via PartyKit subscription
    }
  }
  
  // ============================================
  // PLOT TWIST FUNCTIONS
  // ============================================
  
  // Start the plot twist round (host only)
  const startPlotTwist = () => {
    if (!isHost) return
    
    console.log('🎭 Starting Plot Twist!')
    
    // Reset plot twist state
    const initialPlotTwist = {
      subPhase: 'interstitial',
      timer: 22, // was 15
      answers: [],
      winningAnswer: null,
      animationIndex: -1,
    }
    setPlotTwist(initialPlotTwist)
    setHasSubmittedPlotTwist(false)
    setPlotTwistDaterAnswerDone(false)
    setPlotTwistInput('')
    allPlotTwistAnsweredRef.current = false // Reset auto-advance flag
    
    // Set the phase
    setLivePhase('plot-twist')
    
    // Sync to PartyKit
    const currentCompatibility = useGameStore.getState().compatibility
    const currentCycleCount = useGameStore.getState().cycleCount
    if (partyClient) {
      partyClient.syncState({
        phase: 'plot-twist',
        plotTwist: initialPlotTwist,
        compatibility: currentCompatibility,
        cycleCount: currentCycleCount,
      })
    }
    
    // Show interstitial for 3 seconds, then move to input phase
    setTimeout(() => {
      advancePlotTwistToInput()
    }, 3000)
  }
  
  // Move from interstitial to input phase
  const advancePlotTwistToInput = async () => {
    if (!isHost) return
    
    const newPlotTwist = {
      ...useGameStore.getState().plotTwist,
      subPhase: 'input',
      timer: 22,
    }
    setPlotTwist(newPlotTwist)
    
    // Player answers first -- no dater opener
    setPlotTwistDaterAnswerDone(true)
    
    // Sync to PartyKit
    if (partyClient) {
      partyClient.syncState({ plotTwist: newPlotTwist, plotTwistDaterAnswerDone: true })
    }
  }
  
  // Submit a plot twist answer (any player)
  const submitPlotTwistAnswer = (answer) => {
    if (!answer.trim() || hasSubmittedPlotTwist) return
    
    setHasSubmittedPlotTwist(true)
    setPlotTwistInput('')
    
    if (partyClient) {
      partyClient.submitPlotTwistAnswer(playerId, username, answer.trim())
    } else {
      // Single player: store answer locally so advancePlotTwistToReveal can use it
      addPlotTwistAnswer(playerId || 'local', username || avatar?.name || 'You', answer.trim())
    }
    
    console.log('🎭 Plot twist answer submitted')
  }
  
  // Move to reveal phase - create wheel slices and start spinning
  const advancePlotTwistToReveal = () => {
    if (!isHost) return
    
    if (plotTwistTimerRef.current) {
      clearInterval(plotTwistTimerRef.current)
    }
    
    const currentPlotTwist = useGameStore.getState().plotTwist
    
    // If no answers were submitted, use a fallback
    let answers = currentPlotTwist.answers || []
    if (answers.length === 0) {
      answers = [{ odId: 'system', username: 'The Universe', answer: 'Pretend nothing happened' }]
    }
    
    // Single player: only one answer — skip wheel/winner cards and go straight to "What Happened"
    if (answers.length === 1 && !partyClient) {
      const winner = answers[0]
      setPlotTwist({ ...currentPlotTwist, answers, winningAnswer: winner, animationIndex: 0 })
      setTimeout(() => generatePlotTwistSummaryPhase(winner), 300)
      return
    }
    
    // Create wheel slices from answers (each answer = 1 slice, equal weight)
    const wheelColors = [
      '#FF6B6B', '#4ECDC4', '#FFE66D', '#95E1D3', '#F38181',
      '#AA96DA', '#FCBAD3', '#A8D8EA', '#F9ED69', '#B8F2E6'
    ]
    
    const totalAnswers = answers.length
    const slices = answers.map((answer, index) => {
      const startAngle = (index / totalAnswers) * 360
      const endAngle = ((index + 1) / totalAnswers) * 360
      return {
        id: answer.odId,
        label: answer.answer,
        submittedBy: answer.username,
        weight: 1,
        color: wheelColors[index % wheelColors.length],
        startAngle,
        endAngle,
        originalAnswer: answer
      }
    })
    
    // Show wheel first (same as other rounds), then start spinning after brief pause
    const newPlotTwist = {
      ...currentPlotTwist,
      subPhase: 'showing',
      answers: answers,
      slices: slices,
      spinAngle: 0,
      winningSlice: null
    }
    setPlotTwist(newPlotTwist)
    
    if (partyClient) {
      partyClient.syncState({ plotTwist: newPlotTwist })
    }
    
    // Give wheel time to render (longer delay so it never cuts off)
    setTimeout(() => {
      const spinningState = { ...newPlotTwist, subPhase: 'spinning', slices }
      setPlotTwist(spinningState)
      if (partyClient) partyClient.syncState({ plotTwist: spinningState })
      startPlotTwistWheelSpin(slices)
    }, 1000)
  }
  
  // Start the plot twist wheel spinning animation
  // Keep slices in closure so state updates never lose them (avoids black screen / cut-off)
  const startPlotTwistWheelSpin = (slices) => {
    if (!isHost) return
    
    if (!slices || slices.length === 0) {
      finishPlotTwist()
      return
    }
    
    const winnerIndex = Math.floor(Math.random() * slices.length)
    const winningSlice = slices[winnerIndex]
    const winningMidAngle = (winningSlice.startAngle + winningSlice.endAngle) / 2
    const fullRotations = 5 + Math.floor(Math.random() * 3)
    const finalAngle = (fullRotations * 360) + (360 - winningMidAngle)
    
    console.log('🎭 Plot Twist wheel spinning to', finalAngle, 'degrees, winner:', winningSlice.label)
    
    let startTime = null
    const duration = 9000 // 9 seconds (50% longer to mask LLM call timing)
    const startAngle = 0
    
    const animateSpin = (timestamp) => {
      if (!startTime) startTime = timestamp
      const elapsed = timestamp - startTime
      const progress = Math.min(elapsed / duration, 1)
      
      let eased
      if (progress < 0.5) {
        eased = 4 * progress * progress * progress
      } else {
        eased = 1 - Math.pow(-2 * progress + 2, 3) / 2
      }
      
      const currentAngle = startAngle + (finalAngle * eased)
      
      // Always preserve slices so wheel never disappears mid-spin
      setPlotTwist(prev => ({
        ...prev,
        spinAngle: currentAngle,
        subPhase: 'spinning',
        slices: prev.slices?.length ? prev.slices : slices,
      }))
      
      if (partyClient && Math.floor(elapsed / 200) !== Math.floor((elapsed - 16) / 200)) {
        partyClient.syncState({
          plotTwist: {
            ...useGameStore.getState().plotTwist,
            spinAngle: currentAngle,
            subPhase: 'spinning',
            slices,
          },
        })
      }
      
      if (progress < 1) {
        plotTwistAnimationRef.current = requestAnimationFrame(animateSpin)
      } else {
        setTimeout(() => {
          declareWinner(winningSlice.originalAnswer, winnerIndex)
        }, 800)
      }
    }
    
    plotTwistAnimationRef.current = requestAnimationFrame(animateSpin)
  }
  
  // Declare the winning answer
  const declareWinner = (winner, winnerIndex) => {
    if (!isHost) return
    
    console.log('🎭 Plot twist winner selected')
    
    const currentPlotTwist = useGameStore.getState().plotTwist
    const newPlotTwist = {
      ...currentPlotTwist,
      winningAnswer: winner,
      animationIndex: winnerIndex,
    }
    setPlotTwist(newPlotTwist)
    
    if (partyClient) {
      partyClient.syncState({ plotTwist: newPlotTwist })
    }
    
    // No winner popup/card — move directly to summary
    setTimeout(() => {
      generatePlotTwistSummaryPhase(winner)
    }, 300)
  }
  
  // Generate and show the plot twist summary before the dater's reaction
  const generatePlotTwistSummaryPhase = async (winner) => {
    if (!isHost) return
    
    console.log('🎭 Generating plot twist summary...')
    
    const avatarName = avatar?.name || 'your date'
    const daterName = selectedDater?.name || 'Maya'
    const winnerText = typeof winner === 'string' ? winner : (winner?.answer || 'Stayed calm and handled it politely')
    let summary = 'A dramatic interruption shook the date, and both of you are still reacting to it.'
    try {
      // Generate the dramatic summary (use avatar's name, never "Avatar")
      summary = await Promise.race([
        generatePlotTwistSummary(avatarName, daterName, winnerText),
        new Promise(resolve => setTimeout(() => resolve(summary), 12000)),
      ])
    } catch (error) {
      console.error('Plot twist summary generation failed:', error)
    }
    
    // Update to summary phase with the generated text
    const currentPlotTwist = useGameStore.getState().plotTwist
    const newPlotTwist = {
      ...currentPlotTwist,
      subPhase: 'summary',
      summary: summary,
      winningAnswer: winner || { answer: winnerText }, // Store winner for when host advances
    }
    setPlotTwist(newPlotTwist)
    
    if (partyClient) {
      partyClient.syncState({ plotTwist: newPlotTwist })
    }
    
    // Host will manually advance by clicking a button
    console.log('🎭 Plot twist summary ready - waiting for host to advance')
  }
  
  // Host manually advances from plot twist summary to reaction
  const advanceFromPlotTwistSummary = () => {
    if (!isHost) return
    
    const currentPlotTwist = useGameStore.getState().plotTwist
    const safeWinner = currentPlotTwist?.winningAnswer || { answer: 'Stayed calm and handled it politely.' }
    // Pass the "What happened" story so the Dater responds to that narrative
    generatePlotTwistReaction(safeWinner, currentPlotTwist?.summary)
  }
  
  // Generate LLM reaction to the plot twist — one comment about what the Avatar did
  // whatHappenedStory = the LLM-generated "What happened" narrative; Dater responds to the Avatar's action.
  const generatePlotTwistReaction = async (winner, whatHappenedStory) => {
    if (!isHost) return
    
    // Close overlay and show date window in plot-twist-reaction
    setLivePhase('plot-twist-reaction')
    setDaterBubble('')
    setDaterBubbleReady(true)
    setPhaseTimer(0)
    
    const currentCompatibility = useGameStore.getState().compatibility
    const currentCycleCount = useGameStore.getState().cycleCount
    
    if (partyClient) {
      partyClient.syncState({ 
        phase: 'plot-twist-reaction', 
        phaseTimer: 0,
        compatibility: currentCompatibility,
        cycleCount: currentCycleCount,
        plotTwist: { ...useGameStore.getState().plotTwist, subPhase: 'done' }
      })
    }
    
    setIsGenerating(true)
    
    try {
      const winnerText = typeof winner === 'string' ? winner : (winner?.answer || '')
      const winnerTextLower = winnerText.toLowerCase()
      const daterName = selectedDater?.name || 'Maya'
      const avatarName = avatar?.name || 'your date'
      const daterValues = selectedDater?.values || 'honesty, authenticity'
      const daterDealbreakers = Array.isArray(selectedDater?.dealbreakers) ? selectedDater.dealbreakers.join(', ') : (selectedDater?.dealbreakers || '')
      const daterBackstoryNote = selectedDater?.backstory ? selectedDater.backstory.slice(0, 200) + '...' : ''
      const narrativeText = whatHappenedStory || `Someone hit on ${daterName}. ${avatarName} acted by ${winnerText || 'staying calm and polite'}. The room shifted immediately.`
      const plotTwistCompat = useGameStore.getState().compatibility

      // Determine dater mood from player action context
      const plotTwistDaterMood = winnerTextLower.includes('punch') ||
                                 winnerTextLower.includes('fight') ||
                                 winnerTextLower.includes('hit') ? 'horrified' :
                                 winnerTextLower.includes('nothing') ||
                                 winnerTextLower.includes('ignore') ? 'uncomfortable' :
                                 winnerTextLower.includes('flirt') ||
                                 winnerTextLower.includes('kiss') ? 'attracted' : 'excited'
      setDaterEmotion(plotTwistDaterMood)

      // Use only the last 4 messages so the LLM doesn't misread the conversation gap as silence
      const trimmedHistory = (useGameStore.getState().dateConversation || []).slice(-4)

      // Single comment: Dater's direct reaction to what the Avatar DID
      const comment1Prompt = `CRITICAL: ${avatarName} was ACTIVELY engaged in this situation. They made a deliberate, conscious choice to "${winnerText || 'stay calm and handle it politely'}". Do NOT comment on them being quiet, silent, hesitant, or passive. They ACTED. React to that action.

You are speaking directly to ${avatarName}. React specifically to what just happened and what ${avatarName} did during the plot twist. Nothing else.

PLOT TWIST — You just witnessed something on your date.

WHAT HAPPENED:
"${narrativeText}"

THE KEY THING: ${avatarName} chose to "${winnerText || 'stay calm and handle it politely'}". That was THEIR decision.

YOU ARE ${daterName}.
YOUR VALUES: ${daterValues}. DEALBREAKERS: ${daterDealbreakers}.${daterBackstoryNote ? ` BACKSTORY: ${daterBackstoryNote}` : ''}

🎯 YOUR TASK: React to what ${avatarName} DID. You have a STRONG OPINION about their choice. Were you impressed? Disgusted? Turned on? Horrified? Tell them.

RULES:
- You are talking TO ${avatarName}. Address them directly.
- React to THEIR ACTION, not the overall situation. What did THEY choose to do, and how does that make you feel?
- Do NOT summarize what happened. Do NOT describe the scene. You WITNESSED it — now give your OPINION.
- Have an OPINION — "I didn't expect that" is NOT an opinion. "That was the hottest thing I've ever seen" IS an opinion.
- Ground your reaction in your personality, values, and backstory.
- Exactly 2 sentences, dialogue only. No actions or asterisks.

EXAMPLES of strong opinions (match this energy):
- "Watching you throw a punch for me was either the sweetest or dumbest thing I have ever seen. I have not decided which."
- "You ignored them entirely and kept talking to me. That is worth more than any grand gesture."
- "You flirted with the person hitting on me. While I was sitting right here."

BAD examples (do NOT do this):
- "That was unexpected." (too vague, no opinion)
- "The stranger left after that happened." (summarizing the scene, not reacting)
- "I can't believe that just happened." (no actual opinion about what THEY did)
- "You've been so quiet..." (they were NOT quiet — they actively chose to "${winnerText}")`

      console.log('🎭 Plot Twist Comment 1: Dater gut reaction to Avatar action')
      const daterReaction1 = await getDaterDateResponse(
        selectedDater,
        avatar,
        trimmedHistory,
        null, null, { positive: 0, negative: 0 }, false, false,
        plotTwistCompat, comment1Prompt
      )
      
      const safeReaction1 = daterReaction1 || `You chose "${winnerText}" while I watched. I have very strong feelings about that choice.`
      console.log('🎭 Plot Twist Reaction 1:', safeReaction1)
      
      // Bypass auto-TTS effect: pre-set ref so the effect skips, then manually control speak + visibility
      lastSpokenDater.current = safeReaction1
      setDaterBubble(safeReaction1)
      setDaterBubbleReady(true)
      if (ttsEnabled) speak(safeReaction1, 'dater')
      addDateMessage('dater', safeReaction1)
      syncConversationToPartyKit(undefined, safeReaction1)
      await applyScoringDecision({
        question: 'Plot twist reaction',
        playerAnswer: winnerText || '',
        daterResponse: safeReaction1,
        source: 'plot twist reaction',
      })
      if (partyClient && isHost) {
        partyClient.syncState({ daterEmotion: plotTwistDaterMood })
      }
      
      await Promise.race([waitForAllAudio(), new Promise(resolve => setTimeout(resolve, 12000))])
      await new Promise(resolve => setTimeout(resolve, 2000))

    } catch (error) {
      console.error('Error generating plot twist reaction:', error)
      const fallback = "Well, THAT was unexpected! I... I don't even know what to say right now."
      setDaterBubble(fallback)
      setDaterBubbleReady(true)
      await new Promise(resolve => setTimeout(resolve, 5000))
    }
    
    setIsGenerating(false)
    finishPlotTwist()
  }
  
  // Finish plot twist and continue to next round
  const finishPlotTwist = () => {
    if (!isHost) return
    
    console.log('🎭 Phase 5 (Plot Twist) complete - continuing to Phase 6 (Date Question 4)')
    
    // Mark plot twist as completed
    useGameStore.setState({ plotTwistCompleted: true })
    
    // Clear any remaining timers
    if (plotTwistTimerRef.current) clearInterval(plotTwistTimerRef.current)
    if (plotTwistAnimationRef.current) clearTimeout(plotTwistAnimationRef.current)
    
    // Continue to next round (Phase 1 of Round 4) with round prompt
    const currentCompatibility = useGameStore.getState().compatibility
    const currentCycleCount = useGameStore.getState().cycleCount
    
    // Get round prompt (Title + Question) - shown as interstitial
    // This is after plot twist (round 4+), so NOT the first round
    const roundPrompt = getRoundPrompt(false)
    setCurrentRoundPrompt(roundPrompt)
    
    setRoundPromptAnimationComplete(false)
    setLivePhase('phase1')
    setPhaseTimer(0) // No timer: advance when player submits
    setQuestionNarrationComplete(false)
    lastNarratedQuestionRef.current = ''
    
    // Clear answer oval and input so they don't carry over into Phase 5
    setSubmittedAnswer('')
    setDaterDisplayAnswer('')
    setChatInput('')
    setPlotTwistDaterAnswerDone(false)

    // Reset narrator ref so the next game's plot twist VO always plays fresh
    narratorSummarySpokenRef.current = null

    // Don't set dater bubble - the prompt is shown as interstitial
    setDaterBubble('')
    setAvatarBubble('')
    
    setSuggestedAttributes([])
    setNumberedAttributes([])
    
    if (partyClient) {
      partyClient.syncState({
        phase: 'phase1',
        phaseTimer: 45,
        compatibility: currentCompatibility,
        cycleCount: currentCycleCount,
        plotTwistCompleted: true,
        currentRoundPrompt: roundPrompt, // Sync round prompt
        daterBubble: '',
        avatarBubble: '',
        suggestedAttributes: [],
        numberedAttributes: [],
        daterDisplayAnswer: '',
      })
      partyClient.clearSuggestions()
      partyClient.clearVotes()
    }
    
    console.log('🎯 Round prompt:', roundPrompt.title, '-', roundPrompt.subtitle)
  }
  
  // ============================================
  // END PLOT TWIST FUNCTIONS
  // ============================================
  
  // ============================================
  // ANSWER SELECTION FUNCTIONS (Wheel with weighted slices)
  // ============================================
  
  // Wheel colors (like the reference image)
  const WHEEL_COLORS = [
    '#E53935', // Red
    '#1E88E5', // Blue
    '#FDD835', // Yellow
    '#43A047', // Green
    '#E53935', // Red
    '#1E88E5', // Blue
    '#FDD835', // Yellow
    '#43A047', // Green
  ]
  
  // Calculate slice angles based on weights
  const calculateSliceAngles = (slices) => {
    const totalWeight = slices.reduce((sum, s) => sum + s.weight, 0)
    let currentAngle = 0
    
    return slices.map((slice, index) => {
      const sliceAngle = (slice.weight / totalWeight) * 360
      const startAngle = currentAngle
      const endAngle = currentAngle + sliceAngle
      currentAngle = endAngle
      
      return {
        ...slice,
        startAngle,
        endAngle,
        color: WHEEL_COLORS[index % WHEEL_COLORS.length]
      }
    })
  }
  
  // Start the answer selection sequence
  const startAnswerSelection = async (answers) => {
    console.log('🎰 startAnswerSelection called, isHost:', isHost)
    if (!isHost) return
    
    console.log('🎰 Starting answer selection with', answers.length, 'answer(s)')
    
    const currentCompatibility = useGameStore.getState().compatibility
    const currentCycleCount = useGameStore.getState().cycleCount
    
    // If no answers, skip to generating a default
    if (answers.length === 0) {
      console.log('⚠️ No answers submitted, using fallback')
      completeAnswerSelection('mysterious')
      return
    }
    
    // Set phase to grouping while LLM processes
    console.log('🎰 Setting phase to answer-selection')
    setLivePhase('answer-selection')
    setPhaseTimer(0)
    setAnswerSelection({
      subPhase: 'grouping',
      slices: [],
      spinAngle: 0,
      winningSlice: null
    })
    console.log('🎰 answerSelection subPhase set to: grouping')
    
    // Sync to PartyKit
    if (partyClient) {
      partyClient.syncState({
        phase: 'answer-selection',
        phaseTimer: 0,
        answerSelection: {
          subPhase: 'grouping',
          slices: [],
          spinAngle: 0,
          winningSlice: null
        },
        compatibility: currentCompatibility,
        cycleCount: currentCycleCount
      })
    }
    
    // Get the current question (dater's last message)
    const question = daterBubble || "What's something interesting about you?"
    
    try {
      // Group similar answers using LLM
      console.log('🤖 Grouping similar answers... count:', answers.length)
      const groupedSlices = await groupSimilarAnswers(question, answers)
      console.log('🤖 Grouping complete, got', groupedSlices.length, 'slices:', groupedSlices)
      
      // Calculate angles for the wheel
      const slicesWithAngles = calculateSliceAngles(groupedSlices)
      
      console.log('🎡 Created wheel with', slicesWithAngles.length, 'slices:', slicesWithAngles)
      
      // 🚀 PICK WINNER FIRST - before showing the wheel!
      // This lets us start LLM generation while the wheel spins
      const predeterminedWinner = selectWinningSlice(slicesWithAngles)
      console.log('🎯 Pre-selected winner:', predeterminedWinner.label)
      
      // 🚀 START LLM PRE-GENERATION IMMEDIATELY!
      // This runs in the background while the wheel spins
      console.log('🚀 Starting early LLM pre-generation for:', predeterminedWinner.label)
      preGenConversationRef.current = null
      preGenPromiseRef.current = preGenerateRoundConversation(predeterminedWinner.label)
      preGenPromiseRef.current.then(data => {
        preGenConversationRef.current = data
        console.log('✅ LLM pre-generation complete (during wheel spin!)')
      })
      
      // Show the wheel
      setAnswerSelection({
        subPhase: 'showing',
        slices: slicesWithAngles,
        spinAngle: 0,
        winningSlice: null
      })
      
      if (partyClient) {
        partyClient.syncState({
          answerSelection: {
            subPhase: 'showing',
            slices: slicesWithAngles,
            spinAngle: 0,
            winningSlice: null
          }
        })
      }
      
      // Start spinning - wheel will land on predetermined winner
      setTimeout(() => {
        startWheelSpin(slicesWithAngles, predeterminedWinner)
      }, 500)
    } catch (error) {
      console.error('❌ Error grouping answers:', error)
      // Fallback: create slices without grouping
      const fallbackSlices = calculateSliceAngles(answers.map(a => ({
        id: a.id,
        label: a.text,
        weight: 1,
        originalAnswers: [a]
      })))
      
      // 🚀 PICK WINNER FIRST - even in fallback!
      const predeterminedWinner = selectWinningSlice(fallbackSlices)
      console.log('🎯 Pre-selected winner (fallback):', predeterminedWinner.label)
      
      // 🚀 START LLM PRE-GENERATION IMMEDIATELY!
      console.log('🚀 Starting early LLM pre-generation for:', predeterminedWinner.label)
      preGenConversationRef.current = null
      preGenPromiseRef.current = preGenerateRoundConversation(predeterminedWinner.label)
      preGenPromiseRef.current.then(data => {
        preGenConversationRef.current = data
        console.log('✅ LLM pre-generation complete (during wheel spin!)')
      })
      
      setAnswerSelection({
        subPhase: 'showing',
        slices: fallbackSlices,
        spinAngle: 0,
        winningSlice: null
      })
      
      if (partyClient) {
        partyClient.syncState({
          answerSelection: {
            subPhase: 'showing',
            slices: fallbackSlices,
            spinAngle: 0,
            winningSlice: null
          }
        })
      }
      
      setTimeout(() => {
        startWheelSpin(fallbackSlices, predeterminedWinner)
      }, 500)
    }
  }
  
  // Helper: Select winning slice using weighted random
  const selectWinningSlice = (slices) => {
    if (slices.length === 0) return null
    if (slices.length === 1) return slices[0]
    
    const totalWeight = slices.reduce((sum, s) => sum + s.weight, 0)
    let randomValue = Math.random() * totalWeight
    
    for (const slice of slices) {
      randomValue -= slice.weight
      if (randomValue <= 0) {
        return slice
      }
    }
    return slices[0] // Fallback
  }
  
  // Start the wheel spinning animation
  // Now accepts a predetermined winner (selected earlier to allow early LLM generation)
  const startWheelSpin = (slices, predeterminedWinner = null) => {
    if (!isHost) return
    
    if (slices.length === 0) {
      completeAnswerSelection('mysterious')
      return
    }
    
    // Always show the wheel spinning, even with just one slice
    setAnswerSelection(prev => ({ ...prev, subPhase: 'spinning' }))
    
    if (partyClient) {
      partyClient.syncState({
        answerSelection: { ...answerSelection, subPhase: 'spinning' }
      })
    }
    
    // Use predetermined winner if provided, otherwise calculate (fallback)
    let winningSlice = predeterminedWinner
    if (!winningSlice) {
      // Fallback: calculate winner now (shouldn't happen with new flow)
      const totalWeight = slices.reduce((sum, s) => sum + s.weight, 0)
      let randomValue = Math.random() * totalWeight
      winningSlice = slices[0]
      
      for (const slice of slices) {
        randomValue -= slice.weight
        if (randomValue <= 0) {
          winningSlice = slice
          break
        }
      }
    }
    
    // Calculate the angle to stop at (middle of winning slice)
    const winningMidAngle = (winningSlice.startAngle + winningSlice.endAngle) / 2
    // Arrow points up (0 degrees), so we need to rotate to put winning slice at top
    // Add multiple full rotations for dramatic effect
    const fullRotations = 5 + Math.floor(Math.random() * 3) // 5-7 full spins
    const finalAngle = (fullRotations * 360) + (360 - winningMidAngle)
    
    console.log('🎡 Spinning wheel to', finalAngle, 'degrees, winner:', winningSlice.label)
    
    // Animate the spin with ease-in-out (slow start → fast middle → slow end)
    let startTime = null
    const duration = 9000 // 9 seconds (50% longer, more dramatic spin)
    const startAngle = 0
    
    const animateSpin = (timestamp) => {
      if (!startTime) startTime = timestamp
      const elapsed = timestamp - startTime
      const progress = Math.min(elapsed / duration, 1)
      
      // Ease-in-out cubic: starts slow, speeds up in middle, slows at end
      // This gives the classic wheel spin feel
      let eased
      if (progress < 0.5) {
        // First half: ease-in (accelerate)
        eased = 4 * progress * progress * progress
      } else {
        // Second half: ease-out (decelerate)
        eased = 1 - Math.pow(-2 * progress + 2, 3) / 2
      }
      
      const currentAngle = startAngle + (finalAngle * eased)
      
      setAnswerSelection(prev => ({ ...prev, spinAngle: currentAngle }))
      
      // Sync less frequently to reduce jitter (every 200ms)
      if (partyClient && Math.floor(elapsed / 200) !== Math.floor((elapsed - 16) / 200)) {
        partyClient.syncState({
          answerSelection: { ...answerSelection, spinAngle: currentAngle }
        })
      }
      
      if (progress < 1) {
        wheelSpinRef.current = requestAnimationFrame(animateSpin)
      } else {
        // Spin complete - declare winner after a moment
        setTimeout(() => {
          declareWheelWinner(winningSlice)
        }, 800)
      }
    }
    
    wheelSpinRef.current = requestAnimationFrame(animateSpin)
  }
  
  // Declare the winning slice
  // Note: LLM pre-generation already started when wheel began spinning!
  const declareWheelWinner = (winningSlice) => {
    if (!isHost) return
    
    console.log('🏆 Wheel winner:', winningSlice.label)
    console.log('🏆 Setting answerSelection subPhase to: winner')
    // LLM pre-generation was already started when the winner was pre-selected!
    
    setAnswerSelection(prev => ({
      ...prev,
      subPhase: 'winner',
      winningSlice: winningSlice
    }))
    
    if (partyClient) {
      partyClient.syncState({
        answerSelection: {
          ...answerSelection,
          subPhase: 'winner',
          winningSlice: winningSlice
        }
      })
    }
    
    // Show winner for 2 seconds, then proceed to Phase 3
    setTimeout(() => {
      completeAnswerSelection(winningSlice.label)
    }, 2000)
  }
  
  // Complete the answer selection and move to Phase 3
  const completeAnswerSelection = (winningText) => {
    if (!isHost) return
    
    const currentCompatibility = useGameStore.getState().compatibility
    const currentCycleCount = useGameStore.getState().cycleCount
    
    // Clear animation refs
    if (answerSelectionAnimationRef.current) {
      clearTimeout(answerSelectionAnimationRef.current)
    }
    if (wheelSpinRef.current) {
      cancelAnimationFrame(wheelSpinRef.current)
    }
    
    // Apply selected answer and move straight into dater reaction
    applyWinningAttribute()
    setLivePhase('phase3')
    setPhaseTimer(0)
    
    // Reset answer selection state
    setAnswerSelection({
      subPhase: 'idle',
      slices: [],
      spinAngle: 0,
      winningSlice: null
    })
    
    // Sync to PartyKit
    if (partyClient) {
      partyClient.syncState({
        phase: 'phase3',
        phaseTimer: 0,
        winningAttribute: winningText,
        compatibility: currentCompatibility,
        cycleCount: currentCycleCount,
        answerSelection: {
          subPhase: 'idle',
          slices: [],
          spinAngle: 0,
          winningSlice: null
        }
      })
      partyClient.clearSuggestions()
      partyClient.clearVotes()
    }
    
    setTimeout(() => generateDateConversation(winningText), 100)
  }
  
  // ============================================
  // END ANSWER SELECTION FUNCTIONS
  // ============================================
  
  // Single-player: accept whatever the player types as the answer; no wheel, no timer
  // New flow: show answer oval → narrator reads answer (parallel with LLM gen) → dater text+VO → wait 4s → next question
  const submitPhase1AnswerDirect = async (playerAnswer) => {
    if (!isHost) return
    const currentCompatibility = useGameStore.getState().compatibility
    const currentCycleCount = useGameStore.getState().cycleCount
    if (phaseTimerRef.current) {
      clearInterval(phaseTimerRef.current)
      phaseTimerRef.current = null
    }
    applySinglePlayerAnswer(playerAnswer)
    
    // Show the player's answer in the comparison box (truncated for display)
    setSubmittedAnswer(truncateForDisplay(playerAnswer))
    setDaterDisplayAnswer('')
    
    setLivePhase('phase3')
    setPhaseTimer(0)
    setAnswerSelection({ subPhase: 'idle', slices: [], spinAngle: 0, winningSlice: null })
    if (partyClient) {
      partyClient.syncState({
        phase: 'phase3',
        phaseTimer: 0,
        winningAttribute: playerAnswer,
        compatibility: currentCompatibility,
        cycleCount: currentCycleCount,
        answerSelection: { subPhase: 'idle', slices: [], spinAngle: 0, winningSlice: null },
        daterDisplayAnswer: '',
      })
      partyClient.clearSuggestions()
      partyClient.clearVotes()
    }
    
    // Narrator reads the answer aloud IN PARALLEL with LLM generating the dater response
    const narratorPromise = speak(playerAnswer, 'narrator')
    const llmPromise = new Promise(resolve => {
      setTimeout(() => resolve(generateDateConversation(playerAnswer)), 100)
    })
    
    // Wait for narrator to finish reading the answer before dater speaks
    // (generateDateConversation handles dater VO internally after LLM resolves)
    await narratorPromise
    await llmPromise
  }
  
  const handleChatSubmit = async (e) => {
    e.preventDefault()
    if (!chatInput.trim()) return
    
    const message = chatInput.trim()
    console.log('📝 handleChatSubmit called:', { message, livePhase, username, playerId, hasPartyClient: !!partyClient })
    
    // Helper to truncate long messages
    const truncate = (text, max = 40) => text.length > max ? text.slice(0, max) + '...' : text
    
    // In Phase 1, player's message is the answer for this round (no wheel)
    if (livePhase === 'phase1') {
      if (!questionNarrationComplete) return
      if (partyClient) {
        partyClient.submitAttribute(message, username, playerId)
        addPlayerChatMessage(username, `💡 ${truncate(message, 35)}`)
      } else {
        submitAttributeSuggestion(message, username)
        addPlayerChatMessage(username, `💡 ${truncate(message, 35)}`)
      }
      // Single-player: use this answer immediately and go to dater reaction (no wheel)
      if (isHost) {
        submitPhase1AnswerDirect(message)
      }
    } 
    // Regular chat (Phase 3 and others)
    else {
      if (partyClient) {
        partyClient.sendChatMessage(username, truncate(message))
      }
      addPlayerChatMessage(username, truncate(message))
    }
    
    setChatInput('')
  }

  
  const getPhaseTitle = () => {
    const daterName = selectedDater?.name || 'Maya'
    const phaseNum = getGamePhaseNumber()
    const qNum = getQuestionNumber()
    switch (livePhase) {
      case 'reaction': return { line1: `Phase ${phaseNum}`, line2: 'First', line3: 'Impressions' }
      case 'phase1': {
        const cc = useGameStore.getState().cycleCount
        const mc = useGameStore.getState().maxCycles
        if (cc >= mc - 1) return { line1: 'Phase 9', line2: 'Wrap', line3: 'Up' }
        return { line1: `Phase ${phaseNum}`, line2: `Question ${qNum}`, line3: '' }
      }
      case 'answer-selection': return { line1: '🎲', line2: 'Selecting', line3: 'Answer' }
      case 'phase3': {
        const cc = useGameStore.getState().cycleCount
        const mc = useGameStore.getState().maxCycles
        if (cc >= mc - 1) return { line1: 'Phase 9', line2: 'Wrap', line3: 'Up' }
        return { line1: `Phase ${phaseNum}`, line2: `${daterName}`, line3: 'Reacts' }
      }
      case 'plot-twist': return { line1: 'Phase 5', line2: 'Plot', line3: 'Twist!' }
      case 'plot-twist-reaction': return { line1: 'Phase 5', line2: `${daterName}'s`, line3: 'Reaction' }
      case 'ended': return { line1: 'The', line2: 'End', line3: '' }
      default: return { line1: '', line2: '', line3: '' }
    }
  }
  
  const getPhaseInstructions = () => {
    switch (livePhase) {
      case 'reaction': return 'First Impressions'
      case 'phase1': return 'Type your answer and press Enter (or tap ✨)'
      case 'answer-selection': return 'Selecting an answer...'
      case 'phase3': return `${selectedDater?.name || 'The dater'} reacts`
      case 'plot-twist': return 'What do you do?'
      case 'plot-twist-reaction': return `${selectedDater?.name || 'The dater'} reacts to what happened`
      default: return ''
    }
  }

  const selectedScoringMode = scoring?.selectedMode || SCORING_MODES.LIKES_MINUS_DISLIKES
  const isChaosLikesMode = selectedScoringMode === SCORING_MODES.LIKES_MINUS_DISLIKES_CHAOS
  const isLikesMode = selectedScoringMode === SCORING_MODES.LIKES_MINUS_DISLIKES || isChaosLikesMode
  const isBlindBingoMode = selectedScoringMode === SCORING_MODES.BINGO_BLIND_LOCKOUT
  const isActionBingoMode = selectedScoringMode === SCORING_MODES.BINGO_ACTIONS_OPEN
  const isBingoMode = isBlindBingoMode || isActionBingoMode
  const boardCells = isBlindBingoMode
    ? (scoring?.bingoBlindLockout?.cells || [])
    : (scoring?.bingoActionsOpen?.cells || [])

  const getScoreStatusChips = () => {
    if (selectedScoringMode === SCORING_MODES.LIKES_MINUS_DISLIKES_CHAOS) {
      return [
        {
          key: 'compatibility',
          kind: 'meter',
          meterType: 'compatibility',
          meterValue: scoringSummary?.compatibilityScore ?? 0,
          className: 'positive',
        },
        {
          key: 'ratings',
          kind: 'meter',
          meterType: 'ratings',
          meterValue: scoringSummary?.ratingsScore ?? 0,
          className: 'positive',
        },
      ]
    }
    if (selectedScoringMode === SCORING_MODES.LIKES_MINUS_DISLIKES) {
      return [
        { key: 'score', label: `Daily Score ${scoringSummary?.scoreOutOf5 ?? 0}/5`, className: 'positive' },
        { key: 'likes', label: `Likes ${scoringSummary?.likesCount ?? 0}`, className: 'positive' },
        { key: 'dislikes', label: `Dislikes ${scoringSummary?.dislikesCount ?? 0}`, className: 'dealbreaker' },
      ]
    }
    if (selectedScoringMode === SCORING_MODES.BINGO_BLIND_LOCKOUT) {
      return [
        { key: 'filled', label: `Filled ${scoringSummary?.filledCount ?? 0}/16`, className: 'positive' },
        { key: 'locked', label: `Locked ${scoringSummary?.lockedCount ?? 0}/16`, className: 'dealbreaker' },
        { key: 'bingo', label: `Bingos ${scoringSummary?.bingoCount ?? 0}`, className: 'positive' },
      ]
    }
    return [
      { key: 'filled', label: `Filled ${scoringSummary?.filledCount ?? 0}/16`, className: 'positive' },
      { key: 'bingo', label: `Bingos ${scoringSummary?.bingoCount ?? 0}`, className: 'positive' },
    ]
  }

  const getEndOverlayTitle = () => {
    if (isChaosLikesMode) {
      const outcome = scoringSummary?.dateOutcomeKey
      if (outcome === 'perfect-date') return '🏆 Perfect Date'
      if (outcome === 'successful-date') return '💘 Successful Date'
      if (outcome === 'successful-tv-episode') return '📺 Successful TV Episode'
      if (outcome === 'total-failure') return '📉 Total Failure'
      return 'Date Complete'
    }
    if (finalDateDecision?.decision === 'yes') return '💕 Second Date: Yes'
    if (finalDateDecision?.decision === 'no') return '💔 Second Date: No'
    return 'Date Complete'
  }
  
  return (
    <div className="live-date-scene">
      
      {/* Tutorial Overlay */}
      <AnimatePresence>
        {showTutorial && tutorialStep > 0 && (
          <motion.div 
            className={`tutorial-overlay ${getTutorialContent().highlight === 'compatibility' ? 'highlight-compat' : ''}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <motion.div 
              className="tutorial-card"
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: -20 }}
              transition={{ duration: 0.4, delay: 0.1 }}
            >
              <span className="tutorial-step-indicator">
                {tutorialStep} / 3
              </span>
              <h2 className="tutorial-title">{getTutorialContent().title}</h2>
              <p className="tutorial-text">{getTutorialContent().text}</p>
              {isHost && (
                <motion.button
                  className="tutorial-continue-btn"
                  onClick={handleAdvanceTutorial}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  {tutorialStep < 3 ? 'Continue →' : "Let's Start! 🎬"}
                </motion.button>
              )}
              {!isHost && (
                <p className="tutorial-wait-text">
                  Waiting for host to continue...
                </p>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Date Begins Overlay */}
      <AnimatePresence>
        {showDateBeginsOverlay && (
          <motion.div
            className="justify-fullscreen-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="justify-fullscreen-card"
              initial={{ scale: 0.95, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
            >
              <h2 className="justify-fullscreen-title">The Date Begins</h2>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Starting Stats Mode Overlay */}
      <AnimatePresence>
        {livePhase === 'starting-stats' && (
          <motion.div 
            className="starting-stats-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {/* Loading state while waiting for initialization */}
            {(!startingStats.questionAssignments || startingStats.questionAssignments.length === 0) ? (
              <div className="starting-stats-loading">
                <motion.div 
                  className="loading-spinner"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                >
                  🎲
                </motion.div>
                <h2>Setting up the game...</h2>
                <p>Preparing questions for {players.length} player{players.length !== 1 ? 's' : ''}</p>
              </div>
            ) : (
              <div className="starting-stats-container">
                <div className="starting-stats-header">
                  <h1 className="starting-stats-title">🎲 Who Are You?</h1>
                  <div className="starting-stats-progress">
                    Question {(startingStats.questionAssignments?.findIndex(
                      a => a.playerId === startingStats.activePlayerId && 
                           a.questionType === startingStats.currentQuestionType
                    ) || 0) + 1} of {startingStats.questionAssignments?.length || 3}
                  </div>
                </div>
                
                {/* No timer: Who Are You? advances on submit only */}
                
                {/* Show who's answering and the question */}
                <div className="starting-stats-question-area">
                    <div className="question-type-badge">
                    {startingStats.currentQuestionType === 'physical' && '👤 How do you look?'}
                    {startingStats.currentQuestionType === 'emotional' && '💭 How are you feeling?'}
                    {startingStats.currentQuestionType === 'name' && '📛 What is your name?'}
                  </div>
                  
                  {/* Single player: no "waiting for others" */}
                  <div className="active-player-indicator">
                    <span className="your-turn">✨ Your turn</span>
                  </div>
                  
                  <h2 className="starting-stats-question">
                    {startingStats.currentQuestion || 'Loading question...'}
                  </h2>
                </div>
                
                {/* Input area - only for active player */}
                {startingStats.activePlayerId === playerId ? (
                  <div className="starting-stats-input-area">
                    <form onSubmit={(e) => {
                      e.preventDefault()
                      submitStartingStatsAnswer(startingStatsInput)
                    }}>
                      <input
                        type="text"
                        className="starting-stats-input"
                        value={startingStatsInput}
                        onChange={(e) => setStartingStatsInput(e.target.value)}
                        placeholder={
                          startingStats.currentQuestionType === 'physical'
                            ? "e.g., tall with blue hair"
                            : startingStats.currentQuestionType === 'emotional'
                            ? "e.g., nervous"
                            : "e.g., Sam"
                        }
                        disabled={hasSubmittedStartingStat}
                        autoFocus
                      />
                      <button
                        type="button"
                        className="debug-autofill-btn"
                        onClick={() => setStartingStatsInput(getRandomTestAnswer('starting-stats'))}
                        title="Debug: fill random test answer"
                        aria-label="Debug fill random starting stats answer"
                        disabled={hasSubmittedStartingStat}
                      >
                        🎲
                      </button>
                      <button 
                        type="submit" 
                        className="starting-stats-submit-btn"
                        disabled={!startingStatsInput.trim() || hasSubmittedStartingStat}
                      >
                        {hasSubmittedStartingStat ? '✓ Submitted!' : 'Submit'}
                      </button>
                    </form>
                  </div>
                ) : (
                  <div className="starting-stats-spectator">
                    <span className="spectator-icon">👀</span>
                    <span>Watching {startingStats.activePlayerName || 'player'}...</span>
                  </div>
                )}
                
              </div>
            )}
            
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Plot Twist Overlay */}
      <AnimatePresence>
        {livePhase === 'plot-twist' && (
          <motion.div 
            className="plot-twist-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {/* Interstitial - Title Card */}
            {plotTwist.subPhase === 'interstitial' && (
              <motion.div 
                className="plot-twist-interstitial"
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', damping: 12 }}
              >
                <div className="plot-twist-badge">🎭 PLOT TWIST</div>
                <h1 className="plot-twist-title">Another Person Hit on {selectedDater?.name || 'Maya'}!</h1>
                <p className="plot-twist-subtitle">What Do You Do?</p>
              </motion.div>
            )}
            
            {/* Input Phase - Everyone answers */}
            {plotTwist.subPhase === 'input' && (
              <div className="plot-twist-input-container">
                <div className="plot-twist-header">
                  <div className="plot-twist-badge">🎭 PLOT TWIST</div>
                  <h2>Another Person Hit on {selectedDater?.name || 'Maya'}!</h2>
                  <p className="plot-twist-question">What Do You Do?</p>
                </div>
                
                {!hasSubmittedPlotTwist ? (
                  <div className="plot-twist-input-area">
                    <form onSubmit={(e) => {
                      e.preventDefault()
                      submitPlotTwistAnswer(plotTwistInput)
                    }}>
                      <input
                        type="text"
                        className="plot-twist-input"
                        value={plotTwistInput}
                        onChange={(e) => setPlotTwistInput(e.target.value)}
                        placeholder="e.g., 'Challenge them to a dance-off'"
                        autoFocus
                      />
                      <button
                        type="button"
                        className="debug-autofill-btn"
                        onClick={() => setPlotTwistInput(getRandomTestAnswer('plot-twist'))}
                        title="Debug: fill random test answer"
                        aria-label="Debug fill random plot twist answer"
                      >
                        🎲
                      </button>
                      <button 
                        type="submit" 
                        className="plot-twist-submit-btn"
                        disabled={!plotTwistInput.trim()}
                      >
                        Submit
                      </button>
                    </form>
                  </div>
                ) : (
                  <div className="plot-twist-submitted">
                    <span className="submitted-icon">✓</span>
                    <span>Answer submitted!</span>
                  </div>
                )}
                
                {partyClient && (
                  <div className="plot-twist-answer-count">
                    {plotTwist.answers?.length || 0} / {players.length} players answered
                  </div>
                )}
                
              </div>
            )}
            
            {/* Showing / Spinning Phase - Wheel (same structure as answer-selection overlay so it's not covered) */}
            {(plotTwist.subPhase === 'showing' || plotTwist.subPhase === 'spinning') && (
              <div className="plot-twist-wheel-phase answer-selection-content">
                <div className="plot-twist-badge spinning">🎭 {plotTwist.subPhase === 'showing' ? 'GET READY...' : 'CHOOSING...'}</div>
                <h2 className="spinning-text">{plotTwist.subPhase === 'showing' ? 'Starting spin...' : 'Spinning the wheel...'}</h2>
                
                {/* The Wheel - same markup as answer-selection wheel */}
                {plotTwist.slices && plotTwist.slices.length > 0 && (
                  <div className="wheel-container">
                    <div className="wheel-arrow">▼</div>
                    <svg 
                      className="answer-wheel" 
                      viewBox="0 0 200 200"
                      style={{ transform: `rotate(${plotTwist.spinAngle || 0}deg)` }}
                    >
                      {plotTwist.slices.map((slice) => {
                        const sliceAngle = slice.endAngle - slice.startAngle
                        const isFullCircle = sliceAngle >= 359.9
                        
                        if (isFullCircle) {
                          return (
                            <g key={slice.id}>
                              <circle
                                cx="100"
                                cy="100"
                                r="90"
                                fill={slice.color}
                                stroke="#1a1216"
                                strokeWidth="2"
                              />
                              <text
                                x="100"
                                y="100"
                                textAnchor="middle"
                                dominantBaseline="middle"
                                fill="#1a1216"
                                fontSize="10"
                                fontWeight="bold"
                                style={{ pointerEvents: 'none' }}
                              >
                                {slice.label.length > 20 ? slice.label.substring(0, 20) + '...' : slice.label}
                              </text>
                            </g>
                          )
                        }
                        
                        const startRad = (slice.startAngle - 90) * Math.PI / 180
                        const endRad = (slice.endAngle - 90) * Math.PI / 180
                        const x1 = 100 + 90 * Math.cos(startRad)
                        const y1 = 100 + 90 * Math.sin(startRad)
                        const x2 = 100 + 90 * Math.cos(endRad)
                        const y2 = 100 + 90 * Math.sin(endRad)
                        const largeArc = sliceAngle > 180 ? 1 : 0
                        
                        const midRad = ((slice.startAngle + slice.endAngle) / 2 - 90) * Math.PI / 180
                        const labelRadius = 55
                        const labelX = 100 + labelRadius * Math.cos(midRad)
                        const labelY = 100 + labelRadius * Math.sin(midRad)
                        
                        const path = `M 100 100 L ${x1} ${y1} A 90 90 0 ${largeArc} 1 ${x2} ${y2} Z`
                        
                        return (
                          <g key={slice.id}>
                            <path
                              d={path}
                              fill={slice.color}
                              stroke="#1a1216"
                              strokeWidth="2"
                            />
                            <text
                              x={labelX}
                              y={labelY}
                              textAnchor="middle"
                              dominantBaseline="middle"
                              fill="#1a1216"
                              fontSize={sliceAngle < 30 ? '6' : sliceAngle < 60 ? '8' : '9'}
                              fontWeight="bold"
                              style={{ pointerEvents: 'none' }}
                            >
                              {slice.label.length > 15 ? slice.label.substring(0, 15) + '...' : slice.label}
                            </text>
                          </g>
                        )
                      })}
                      <circle cx="100" cy="100" r="15" fill="#1a1216" stroke="#ffd700" strokeWidth="2" />
                      <text x="100" y="100" textAnchor="middle" dominantBaseline="middle" fill="#ffd700" fontSize="10">🎭</text>
                    </svg>
                  </div>
                )}
              </div>
            )}
            
            {/* Summary Phase - Dramatic narration of what happened */}
            {plotTwist.subPhase === 'summary' && (
              <motion.div 
                className="plot-twist-summary"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5 }}
              >
                <div className="plot-twist-badge">📖 WHAT HAPPENED</div>
                <motion.div 
                  className="plot-twist-summary-text"
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.3, duration: 0.5 }}
                >
                  {(() => {
                    const name = avatar?.name || 'your date'
                    const raw = plotTwist.summary || 'Something dramatic happened...'
                    return raw
                      .replace(/\bthe Avatar\b/gi, `the ${name}`)
                      .replace(/\bAvatar\b/g, name)
                  })()}
                </motion.div>
                <motion.div 
                  className="plot-twist-summary-footer"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 1 }}
                >
                  {isHost ? (
                    <motion.button
                      className="plot-twist-continue-btn"
                      onClick={advanceFromPlotTwistSummary}
                      disabled={!plotTwistNarratorDone}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: plotTwistNarratorDone ? 1 : 0.4, scale: 1 }}
                      transition={{ delay: 0.5 }}
                      whileHover={plotTwistNarratorDone ? { scale: 1.05 } : {}}
                      whileTap={plotTwistNarratorDone ? { scale: 0.95 } : {}}
                    >
                      {plotTwistNarratorDone ? 'Continue' : 'Listening...'}
                    </motion.button>
                  ) : (
                    <span>Waiting for host to continue...</span>
                  )}
                </motion.div>
              </motion.div>
            )}
            
            {/* Reaction Phase - now happens in the main date window, not here */}
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* End Game Breakdown Overlay */}
      <AnimatePresence>
        {livePhase === 'ended' && (
          <motion.div 
            className="end-game-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div 
              className="end-game-content"
              initial={{ y: 50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.3 }}
            >
              <h1 className="end-game-title">{getEndOverlayTitle()}</h1>
              <div className="end-game-compatibility">
                <span className={`compat-final ${isChaosLikesMode ? 'textual' : ''}`}>
                  {isLikesMode
                    ? (isChaosLikesMode
                      ? `${scoringSummary?.dateOutcomeLabel || 'Date Complete'}`
                      : `${scoringSummary?.scoreOutOf5 ?? 0}/5`)
                    : `${scoringSummary?.bingoCount ?? 0}`}
                </span>
                <span className="compat-label">
                  {isLikesMode ? (isChaosLikesMode ? 'Final Outcome' : 'Daily Score') : 'Bingos'}
                </span>
              </div>
              
              <div className="end-game-breakdown">
                <h2>Score Summary</h2>
                <div className="breakdown-list">
                  {getScoreStatusChips().map((chip, index) => (
                    <motion.div
                      key={chip.key}
                      className="breakdown-item conversational"
                      initial={{ x: -20, opacity: 0 }}
                      animate={{ x: 0, opacity: 1 }}
                      transition={{ delay: 0.35 + (index * 0.14) }}
                    >
                      {chip.kind === 'meter' ? (
                        <div className="breakdown-chaos-meter">
                          <span className="breakdown-chaos-label">
                            {chip.meterType === 'ratings' ? 'Ratings' : 'Compatibility'}
                          </span>
                          <span className={`chaos-meter-track ${chip.meterType || ''}`}>
                            <span
                              className={`chaos-meter-fill ${chip.meterType || ''}`}
                              style={{ width: `${getMeterFillPercent(chip.meterValue)}%` }}
                            />
                          </span>
                        </div>
                      ) : (
                        <span className="breakdown-text">{chip.label}</span>
                      )}
                    </motion.div>
                  ))}
                </div>
              </div>

              <div className="end-game-breakdown">
                <h2>{selectedDater?.name || 'Your date'}'s Final Call</h2>
                <div className="breakdown-list">
                  {finalDateDecision?.assessment ? (
                    <>
                      <motion.div
                        className="breakdown-item conversational"
                        initial={{ x: -20, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        transition={{ delay: 0.45 }}
                      >
                        <span className="breakdown-text">{finalDateDecision.assessment}</span>
                      </motion.div>
                      {finalDateDecision?.verdict ? (
                        <motion.div
                          className="breakdown-item conversational"
                          initial={{ x: -20, opacity: 0 }}
                          animate={{ x: 0, opacity: 1 }}
                          transition={{ delay: 0.65 }}
                        >
                          <span className="breakdown-text">{finalDateDecision.verdict}</span>
                        </motion.div>
                      ) : null}
                    </>
                  ) : (
                    <p className="no-impacts">Final decision is still processing...</p>
                  )}
                </div>
              </div>
              
              <motion.p 
                className="end-game-hint"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 2 }}
              >
                Returning to results...
              </motion.p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Fallback Mode Warning */}
      {usingFallback && (
        <div className="fallback-warning">
          ⚠️ NO API KEY - Using fallback responses (LLM not connected)
        </div>
      )}
      
      {/* Header Section - Centered layout */}
      <div className={`live-header ${showTutorial && getTutorialContent().highlight === 'compatibility' ? 'tutorial-highlight' : ''} ${reactionFeedback ? 'showing-feedback' : ''}`}>
        <AnimatePresence mode="wait" initial={false}>
          {reactionFeedback ? (
            <motion.div
              key="header-feedback"
              className={`header-feedback-banner ${reactionFeedback.category}`}
              initial={{ opacity: 0, y: -14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -14 }}
              transition={{ duration: 0.25 }}
            >
              {reactionFeedback.text}
            </motion.div>
          ) : (
            <motion.div
              key="header-content"
              className="live-header-content"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <div className="header-row header-centered">
                {/* Centered: Round indicator + Phase description */}
                <div className="header-center-content">
                  <div className="round-indicator">
                    <span className="round-label">Phase</span>
                    <span className="round-value">
                      {getGamePhaseNumber()}
                    </span>
                  </div>
                  <div className="header-cta">
                    <span className="cta-line1">{getPhaseTitle().line1}</span>
                    <span className="cta-line2">{getPhaseTitle().line2}</span>
                    <span className="cta-line3">{getPhaseTitle().line3}</span>
                  </div>
                </div>
                {isBingoMode && (
                  <button
                    type="button"
                    className={`bingo-panel-toggle ${boardPanelFlash ? 'flash' : ''}`}
                    onClick={() => setBoardPanelOpen((open) => !open)}
                  >
                    {boardPanelOpen ? 'Hide Board' : 'Show Board'}
                  </button>
                )}
              </div>
              {!(isBingoMode && boardPanelOpen) && !isChaosLikesMode && (
                <div className="header-scoring-row">
                  <span className="quality-tracker-label">Live Scoring</span>
                  <div className="quality-tracker">
                    {getScoreStatusChips().map((chip) => (
                      <motion.span
                        key={chip.key}
                        className={`quality-chip ${chip.className} ${chip.kind === 'meter' ? 'chaos-meter-chip' : ''}`}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                      >
                        {chip.kind === 'meter' ? (
                          <>
                            <span className={`chaos-meter-track ${chip.meterType || ''}`}>
                              <span
                                className={`chaos-meter-fill ${chip.meterType || ''}`}
                                style={{ width: `${getMeterFillPercent(chip.meterValue)}%` }}
                              />
                            </span>
                          </>
                        ) : chip.label}
                      </motion.span>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
        
        {/* LLM Debug Panel (Host only) */}
        <AnimatePresence>
          {showLLMDebug && isHost && (
            <motion.div 
              className="llm-debug-popup"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              style={{
                position: 'fixed',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                background: 'rgba(0, 0, 0, 0.95)',
                border: '2px solid #ff69b4',
                borderRadius: '12px',
                padding: '20px',
                maxWidth: '90vw',
                maxHeight: '80vh',
                overflow: 'auto',
                zIndex: 9999,
                color: '#fff',
                fontSize: '12px',
                fontFamily: 'monospace',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px' }}>
                <h3 style={{ margin: 0, color: '#ff69b4' }}>🔧 LLM Prompt Debug</h3>
                <button 
                  onClick={() => setShowLLMDebug(false)}
                  style={{ background: '#ff69b4', border: 'none', borderRadius: '4px', padding: '5px 10px', cursor: 'pointer' }}
                >
                  ✕ Close
                </button>
              </div>
              
              <div style={{ marginBottom: '20px' }}>
                <h4 style={{ color: '#4ecdc4', margin: '0 0 10px 0' }}>🎭 Avatar Prompt Chain:</h4>
                <pre style={{ 
                  background: '#1a1a2e', 
                  padding: '10px', 
                  borderRadius: '6px', 
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  maxHeight: '300px',
                  overflow: 'auto'
                }}>
                  {lastLLMPrompt.avatar || 'No prompt yet - wait for Phase 3 conversation'}
                </pre>
              </div>
              
              <div>
                <h4 style={{ color: '#ff6b6b', margin: '0 0 10px 0' }}>💕 Dater Prompt Chain:</h4>
                <pre style={{ 
                  background: '#1a1a2e', 
                  padding: '10px', 
                  borderRadius: '6px', 
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  maxHeight: '300px',
                  overflow: 'auto'
                }}>
                  {lastLLMPrompt.dater || 'No prompt yet - wait for Phase 3 conversation'}
                </pre>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      
      
      {/* Date Screen - Characters with Speech Bubbles */}
      <div
        className={`date-screen ${['phase1', 'answer-selection', 'phase3'].includes(livePhase) && currentRoundPrompt?.title ? 'has-round-prompt-banner' : ''} ${isChaosLikesMode ? 'with-side-meters' : ''}`}
      >
        {isChaosLikesMode && (
          <div className="side-meters" aria-hidden="true">
            {(() => {
              const compatibilityFill = getMeterFillPercent(scoringSummary?.compatibilityScore ?? 0)
              const ratingsFill = getMeterFillPercent(scoringSummary?.ratingsScore ?? 0)
              return (
                <>
                  <div className="side-meter-rail compatibility">
                    <span
                      className="side-meter-fill compatibility"
                      style={{ height: `${compatibilityFill}%` }}
                    />
                    <span className="side-meter-label">
                      <span className="side-meter-label-layer unfilled">
                        {SIDE_METER_LABELS.compatibility.map((letter, index) => (
                          <span key={`compat-unfilled-${index}`}>{letter}</span>
                        ))}
                      </span>
                      <span
                        className="side-meter-label-layer filled"
                        style={{
                          clipPath: `inset(${100 - compatibilityFill}% 0 0 0)`,
                          WebkitClipPath: `inset(${100 - compatibilityFill}% 0 0 0)`,
                        }}
                      >
                        {SIDE_METER_LABELS.compatibility.map((letter, index) => (
                          <span key={`compat-filled-${index}`}>{letter}</span>
                        ))}
                      </span>
                    </span>
                  </div>
                  <div className="side-meter-rail ratings">
                    <span
                      className="side-meter-fill ratings"
                      style={{ height: `${ratingsFill}%` }}
                    />
                    <span className="side-meter-label">
                      <span className="side-meter-label-layer unfilled">
                        {SIDE_METER_LABELS.ratings.map((letter, index) => (
                          <span key={`ratings-unfilled-${index}`}>{letter}</span>
                        ))}
                      </span>
                      <span
                        className="side-meter-label-layer filled"
                        style={{
                          clipPath: `inset(${100 - ratingsFill}% 0 0 0)`,
                          WebkitClipPath: `inset(${100 - ratingsFill}% 0 0 0)`,
                        }}
                      >
                        {SIDE_METER_LABELS.ratings.map((letter, index) => (
                          <span key={`ratings-filled-${index}`}>{letter}</span>
                        ))}
                      </span>
                    </span>
                  </div>
                </>
              )
            })()}
          </div>
        )}

        {/* Phase Announcement Banner - at top of conversation area */}
        <AnimatePresence>
          {showPhaseAnnouncement && (
            <motion.div 
              className="phase-announcement-overlay"
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
            >
              <motion.div 
                className="phase-announcement-card"
                initial={{ scale: 0.9 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0.9 }}
              >
                <span className="phase-icon">{getPhaseAnnouncement().icon}</span>
                <div className="phase-announcement-text">
                  <h2 className="phase-title">{getPhaseAnnouncement().title} {getPhaseAnnouncement().subtitle}</h2>
                  <p className="phase-description">{getPhaseAnnouncement().description}</p>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
        
        {/* Round Prompt Banner - not shown during plot twist reaction (header shows Plot Twist / Maya's reaction) */}
        <AnimatePresence mode="wait">
          {['phase1', 'answer-selection', 'phase3'].includes(livePhase) && currentRoundPrompt.title && (
            <motion.div 
              key={`round-prompt-${cycleCount}-${currentRoundPrompt.title}`}
              className="round-prompt-banner"
              initial={{ 
                opacity: 0, 
                y: '40vh', // Start in center of screen
                scale: 1.1
              }}
              animate={{ 
                opacity: 1, 
                y: 0, // Animate to top position
                scale: 1
              }}
              exit={{ opacity: 0, y: -20, scale: 0.95 }}
              transition={{ 
                duration: 0.8, 
                ease: [0.22, 1, 0.36, 1] // Custom ease for smooth entrance
              }}
              onAnimationComplete={() => {
                // Mark animation as complete (timer already started)
                if (livePhase === 'phase1' && !roundPromptAnimationComplete) {
                  console.log('🎬 Banner animation complete')
                  setRoundPromptAnimationComplete(true)
                }
              }}
            >
              <div className="round-prompt-content">
                <h2 className="round-prompt-title">{currentRoundPrompt.title}</h2>
                <p className="round-prompt-subtitle">{currentRoundPrompt.subtitle}</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {['phase1', 'answer-selection', 'phase3'].includes(livePhase) && currentRoundPrompt.title && submittedAnswer && (
            <motion.div
              key={`answer-comparison-${cycleCount}-${submittedAnswer}`}
              className="answer-comparison-box"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
            >
              <div className="answer-column">
                <p className="answer-column-title">{(startingStats?.activePlayerName || username || 'Player') + '\'s Answer'}</p>
                <p className="answer-column-value">&ldquo;{submittedAnswer}&rdquo;</p>
              </div>
              <div className="answer-column-divider" />
              <div className="answer-column">
                <p className="answer-column-title">{(selectedDater?.name || 'Dater') + '\'s Answer'}</p>
                <p className={`answer-column-value ${daterDisplayAnswer ? '' : 'pending'}`}>
                  {daterDisplayAnswer ? `"${daterDisplayAnswer}"` : '...'}
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        
        {/* Answer Selection Overlay - Spinning Wheel */}
        <AnimatePresence>
          {livePhase === 'answer-selection' && (
            <motion.div 
              className="answer-selection-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <div className="answer-selection-content">
                <div className="answer-selection-badge">🎡 SPIN THE WHEEL</div>
                
                {answerSelection.subPhase === 'grouping' && (
                  <>
                    <h2 className="grouping-text">Grouping similar answers...</h2>
                    <div className="grouping-spinner">🎲</div>
                  </>
                )}
                
                {answerSelection.subPhase === 'showing' && (
                  <h2 className="spinning-text">Starting spin...</h2>
                )}
                
                {answerSelection.subPhase === 'spinning' && (
                  <h2 className="spinning-text">Spinning...</h2>
                )}
                
                {/* The Wheel */}
                {answerSelection.slices && answerSelection.slices.length > 0 && (
                  <div className="wheel-container">
                    <div className="wheel-arrow">▼</div>
                    <svg 
                      className="answer-wheel" 
                      viewBox="0 0 200 200"
                      style={{ transform: `rotate(${answerSelection.spinAngle}deg)` }}
                    >
                      {answerSelection.slices.map((slice) => {
                        const sliceAngle = slice.endAngle - slice.startAngle
                        const isFullCircle = sliceAngle >= 359.9 // Handle single slice (full wheel)
                        const isWinner = answerSelection.subPhase === 'winner' && answerSelection.winningSlice?.id === slice.id
                        
                        // For a full circle (single slice), draw a circle instead of an arc
                        if (isFullCircle) {
                          return (
                            <g key={slice.id}>
                              <circle
                                cx="100"
                                cy="100"
                                r="90"
                                fill={slice.color}
                                stroke="#1a1225"
                                strokeWidth="2"
                                className={isWinner ? 'winning-slice' : ''}
                              />
                              <text
                                x="100"
                                y="100"
                                textAnchor="middle"
                                dominantBaseline="middle"
                                fill="#fff"
                                fontSize={slice.label.length > 12 ? '8' : '10'}
                                fontWeight="bold"
                                style={{ 
                                  textShadow: '1px 1px 2px rgba(0,0,0,0.8)',
                                  pointerEvents: 'none'
                                }}
                              >
                                {slice.label.length > 20 ? slice.label.slice(0, 20) + '...' : slice.label}
                              </text>
                              {/* Weight indicator */}
                              {slice.weight > 1 && (
                                <text
                                  x="100"
                                  y="115"
                                  textAnchor="middle"
                                  dominantBaseline="middle"
                                  fill="rgba(255,255,255,0.8)"
                                  fontSize="6"
                                  style={{ textShadow: '1px 1px 2px rgba(0,0,0,0.8)' }}
                                >
                                  ({slice.weight}x)
                                </text>
                              )}
                            </g>
                          )
                        }
                        
                        const startAngle = slice.startAngle * (Math.PI / 180)
                        const endAngle = slice.endAngle * (Math.PI / 180)
                        const largeArc = sliceAngle > 180 ? 1 : 0
                        
                        // Calculate path for pie slice
                        const x1 = 100 + 90 * Math.cos(startAngle - Math.PI/2)
                        const y1 = 100 + 90 * Math.sin(startAngle - Math.PI/2)
                        const x2 = 100 + 90 * Math.cos(endAngle - Math.PI/2)
                        const y2 = 100 + 90 * Math.sin(endAngle - Math.PI/2)
                        
                        // Calculate label position (middle of slice, 60% from center)
                        const midAngle = ((slice.startAngle + slice.endAngle) / 2) * (Math.PI / 180) - Math.PI/2
                        const labelX = 100 + 55 * Math.cos(midAngle)
                        const labelY = 100 + 55 * Math.sin(midAngle)
                        
                        return (
                          <g key={slice.id}>
                            <path
                              d={`M 100 100 L ${x1} ${y1} A 90 90 0 ${largeArc} 1 ${x2} ${y2} Z`}
                              fill={slice.color}
                              stroke="#1a1225"
                              strokeWidth="2"
                              className={isWinner ? 'winning-slice' : ''}
                            />
                            <text
                              x={labelX}
                              y={labelY}
                              textAnchor="middle"
                              dominantBaseline="middle"
                              fill="#fff"
                              fontSize={slice.label.length > 12 ? '6' : '8'}
                              fontWeight="bold"
                              style={{ 
                                textShadow: '1px 1px 2px rgba(0,0,0,0.8)',
                                pointerEvents: 'none'
                              }}
                            >
                              {slice.label.length > 15 ? slice.label.slice(0, 15) + '...' : slice.label}
                            </text>
                            {/* Weight indicator */}
                            {slice.weight > 1 && (
                              <text
                                x={labelX}
                                y={labelY + 10}
                                textAnchor="middle"
                                dominantBaseline="middle"
                                fill="rgba(255,255,255,0.8)"
                                fontSize="5"
                                style={{ textShadow: '1px 1px 2px rgba(0,0,0,0.8)' }}
                              >
                                ({slice.weight}x)
                              </text>
                            )}
                          </g>
                        )
                      })}
                      {/* Center circle */}
                      <circle cx="100" cy="100" r="15" fill="#1a1225" stroke="#333" strokeWidth="2" />
                      <circle cx="100" cy="100" r="8" fill="#444" />
                    </svg>
                  </div>
                )}
                
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {isBingoMode && boardPanelOpen && (
            <motion.div
              className={`bingo-overlay-layer ${['phase1', 'answer-selection', 'phase3'].includes(livePhase) && currentRoundPrompt.title ? 'with-round-prompt' : ''}`}
              initial={{ opacity: 0, y: -14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -14 }}
            >
              <div className={`bingo-board-panel ${boardPanelFlash ? 'flash' : ''}`}>
                <div className="bingo-board-meta">
                  {isBlindBingoMode
                    ? `Filled ${scoringSummary?.filledCount ?? 0} | Locked ${scoringSummary?.lockedCount ?? 0} | Bingos ${scoringSummary?.bingoCount ?? 0}`
                    : `Filled ${scoringSummary?.filledCount ?? 0} | Bingos ${scoringSummary?.bingoCount ?? 0}`}
                </div>
                <div className="bingo-board-grid">
                  {boardCells.slice(0, 16).map((cell, index) => {
                    const isHiddenCell = isBlindBingoMode && cell.status === 'hidden' && !cell.revealed
                    const statusClass = isBlindBingoMode
                      ? (cell.status === 'filled' ? 'filled' : cell.status === 'locked' ? 'locked' : 'hidden')
                      : (cell.status === 'filled' ? 'filled' : 'open')
                    const cellLabel = isHiddenCell ? 'Hidden' : (cell.label || `Cell ${index + 1}`)
                    return (
                      <div key={cell.id || `bingo-cell-${index}`} className={`bingo-cell ${statusClass}`}>
                        <span className="bingo-cell-label">{cellLabel}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Conversation Bubbles Area - dater speech text (always readable) */}
        <div className="conversation-bubbles">
          <div className="bubble-column dater-column">
            <AnimatePresence mode="wait">
              {daterBubble && daterBubbleReady && (
                <motion.div 
                  key={daterBubble}
                  className="speech-bubble dater-bubble"
                  initial={{ scale: 0.9, opacity: 0, y: 10 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  exit={{ scale: 0.9, opacity: 0, y: -10 }}
                >
                  <AnimatedText text={daterBubble} emotion={daterEmotion} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
        
        {/* Characters - dater portrait below speech */}
        <div className="characters-container">
          <div className="character dater-character">
            {portraitsReady && selectedDater ? (
              <img 
                src={getDaterPortrait(selectedDater, daterEmotion)}
                alt={selectedDater.name} 
                className="character-image"
              />
            ) : (
              <div className="character-image character-loading">💕</div>
            )}
            <span className="character-name">{selectedDater?.name || 'Dater'}</span>
          </div>
        </div>
        
        {/* Phase 1 suggestions display */}
        {livePhase === 'phase1' && (suggestedAttributes?.length || 0) > 0 && (
          <div className="suggestions-display">
            {(suggestedAttributes || []).slice(-5).map((attr, i) => (
              <motion.span 
                key={attr.id || `suggestion-${i}-${attr.text}`} 
                className="suggestion-chip"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
              >
                {attr.text || attr}
              </motion.span>
            ))}
          </div>
        )}
        {llmStatusMessage ? (
          <div style={{ position: 'absolute', bottom: '5px', left: '5px', fontSize: '10px', color: 'rgba(255, 200, 50, 0.85)' }}>
            ⚠️ {llmStatusMessage}
          </div>
        ) : null}
      </div>
      
      {/* Chat Module: hidden during passive phases, slim input bar during active phases */}
      {!['reaction', 'phase3', 'plot-twist-reaction', 'ended'].includes(livePhase) && (
        <div className="chat-module chat-module-single-input">
          <span className="chat-hint chat-hint-single">{getPhaseInstructions()}</span>
          <form className="chat-input-form" onSubmit={handleChatSubmit}>
            <input
              type="text"
              className="chat-input"
              placeholder={livePhase === 'phase1'
                ? (!questionNarrationComplete
                  ? 'Listen to the question...'
                  : 'Type your answer...')
                : livePhase === 'plot-twist'
                  ? 'What do you do?'
                  : 'Type your answer...'}
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              maxLength={100}
              disabled={
                (livePhase === 'phase1' && !questionNarrationComplete)
              }
            />
            <button
              type="button"
              className="debug-autofill-btn"
              onClick={() => setChatInput(getRandomTestAnswer(livePhase === 'plot-twist' ? 'plot-twist' : 'chat'))}
              title="Debug: fill random test answer"
              aria-label="Debug fill random chat answer"
            >
              🎲
            </button>
            <button type="submit" className="chat-send-btn">✨</button>
          </form>
        </div>
      )}

      {ttsStatusNote && (
        <div className="tts-status-note">{ttsStatusNote}</div>
      )}
    </div>
  )
}

export default LiveDateScene
