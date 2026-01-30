import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useGameStore } from '../store/gameStore'
import { getDaterDateResponse, getAvatarDateResponse, getDaterConversationOpener, generateDaterValues, checkAttributeMatch, runAttributePromptChain, groupSimilarAnswers, generateBreakdownSentences, generatePlotTwistSummary } from '../services/llmService'
import { speak, stopAllAudio, setTTSEnabled, isTTSEnabled, waitForAllAudio } from '../services/ttsService'
import { getMayaPortraitCached, getAvatarPortraitCached, preloadExpressions, waitForPreload } from '../services/expressionService'
import AnimatedText from './AnimatedText'
import './LiveDateScene.css'

// PartyKit replaces Firebase for real-time state sync
// All state is managed by the PartyKit server - clients send actions, receive state

// Phase timers: 30 seconds for Phase 1 and Phase 2
function LiveDateScene() {
  const selectedDater = useGameStore((state) => state.selectedDater)
  const avatar = useGameStore((state) => state.avatar)
  const compatibility = useGameStore((state) => state.compatibility)
  const livePhase = useGameStore((state) => state.livePhase)
  const phaseTimer = useGameStore((state) => state.phaseTimer)
  const cycleCount = useGameStore((state) => state.cycleCount)
  const maxCycles = useGameStore((state) => state.maxCycles)
  const suggestedAttributes = useGameStore((state) => state.suggestedAttributes)
  const numberedAttributes = useGameStore((state) => state.numberedAttributes)
  const playerChat = useGameStore((state) => state.playerChat)
  const sentimentCategories = useGameStore((state) => state.sentimentCategories)
  const username = useGameStore((state) => state.username)
  const winningAttribute = useGameStore((state) => state.winningAttribute)
  const dateConversation = useGameStore((state) => state.dateConversation)
  const latestAttribute = useGameStore((state) => state.latestAttribute)
  const daterValues = useGameStore((state) => state.daterValues)
  const glowingValues = useGameStore((state) => state.glowingValues)
  const roomCode = useGameStore((state) => state.roomCode)
  const playerId = useGameStore((state) => state.playerId)
  const isHost = useGameStore((state) => state.isHost)
  const players = useGameStore((state) => state.players)
  
  const setLivePhase = useGameStore((state) => state.setLivePhase)
  const setPhaseTimer = useGameStore((state) => state.setPhaseTimer)
  const tickPhaseTimer = useGameStore((state) => state.tickPhaseTimer)
  const submitAttributeSuggestion = useGameStore((state) => state.submitAttributeSuggestion)
  const processAttributesForVoting = useGameStore((state) => state.processAttributesForVoting)
  const voteForNumberedAttribute = useGameStore((state) => state.voteForNumberedAttribute)
  const applyWinningAttribute = useGameStore((state) => state.applyWinningAttribute)
  const incrementCycle = useGameStore((state) => state.incrementCycle)
  const addPlayerChatMessage = useGameStore((state) => state.addPlayerChatMessage)
  const addDateMessage = useGameStore((state) => state.addDateMessage)
  const addSentimentItem = useGameStore((state) => state.addSentimentItem)
  const setPhase = useGameStore((state) => state.setPhase)
  const setDaterValues = useGameStore((state) => state.setDaterValues)
  const exposeValue = useGameStore((state) => state.exposeValue)
  const triggerGlow = useGameStore((state) => state.triggerGlow)
  const adjustCompatibility = useGameStore((state) => state.adjustCompatibility)
  const setSuggestedAttributes = useGameStore((state) => state.setSuggestedAttributes)
  const setSentimentCategories = useGameStore((state) => state.setSentimentCategories)
  const setPlayerChat = useGameStore((state) => state.setPlayerChat)
  const setCompatibility = useGameStore((state) => state.setCompatibility)
  const setNumberedAttributes = useGameStore((state) => state.setNumberedAttributes)
  const showTutorial = useGameStore((state) => state.showTutorial)
  const tutorialStep = useGameStore((state) => state.tutorialStep)
  const setShowTutorial = useGameStore((state) => state.setShowTutorial)
  const setTutorialStep = useGameStore((state) => state.setTutorialStep)
  const startingStatsMode = useGameStore((state) => state.startingStatsMode)
  const startingStats = useGameStore((state) => state.startingStats)
  const setStartingStats = useGameStore((state) => state.setStartingStats)
  const setAvatarName = useGameStore((state) => state.setAvatarName)
  const setPlayers = useGameStore((state) => state.setPlayers)
  
  const [chatInput, setChatInput] = useState('')
  const [avatarBubble, setAvatarBubble] = useState('')
  const [daterBubble, setDaterBubble] = useState('')
  const [avatarEmotion, setAvatarEmotion] = useState('neutral') // Avatar's current emotional state
  const [daterEmotion, setDaterEmotion] = useState('neutral') // Dater's current emotional state
  const [isGenerating, setIsGenerating] = useState(false)
  const [userVote, setUserVote] = useState(null)
  const [showDaterValuesPopup, setShowDaterValuesPopup] = useState(false)
  const showAttributesByDefault = useGameStore((state) => state.showAttributesByDefault)
  const [showCompatPercent, setShowCompatPercent] = useState(false) // Heart shows compatibility %
  const [showSentimentDebug, setShowSentimentDebug] = useState(showAttributesByDefault) // Phase label shows attributes
  const [usingFallback, setUsingFallback] = useState(false)
  const [showWinnerPopup, setShowWinnerPopup] = useState(false)
  
  // Track compatibility changes for end-of-game breakdown
  const [compatibilityHistory, setCompatibilityHistory] = useState([])
  const [breakdownSentences, setBreakdownSentences] = useState([])
  const [isGeneratingBreakdown, setIsGeneratingBreakdown] = useState(false)
  
  // Reaction feedback - shows temporarily when date reacts to an attribute
  const [reactionFeedback, setReactionFeedback] = useState(null)
  const reactionFeedbackTimeout = useRef(null)
  const [winnerText, setWinnerText] = useState('')
  // Timer starts immediately when phase begins (no waiting for submissions)
  const [showPhaseAnnouncement, setShowPhaseAnnouncement] = useState(false)
  const [announcementPhase, setAnnouncementPhase] = useState('')
  const [reactionStreak, setReactionStreak] = useState({ positive: 0, negative: 0 }) // Track escalation
  
  // LLM Debug state (host only)
  const [showLLMDebug, setShowLLMDebug] = useState(false)
  const [lastLLMPrompt, setLastLLMPrompt] = useState({ avatar: '', dater: '' })
  
  // Plot Twist state
  const plotTwist = useGameStore((state) => state.plotTwist)
  const plotTwistCompleted = useGameStore((state) => state.plotTwistCompleted)
  const setPlotTwist = useGameStore((state) => state.setPlotTwist)
  const resetPlotTwist = useGameStore((state) => state.resetPlotTwist)
  const [plotTwistInput, setPlotTwistInput] = useState('')
  
  // Text-to-Speech state
  const [ttsEnabled, setTtsEnabledState] = useState(true) // Enabled by default
  const lastSpokenDater = useRef('')
  const lastSpokenAvatar = useRef('')
  const [hasSubmittedPlotTwist, setHasSubmittedPlotTwist] = useState(false)
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
  
  // Starting Stats Mode state
  const [startingStatsInput, setStartingStatsInput] = useState('')
  const [startingStatsTimer, setStartingStatsTimer] = useState(15)
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
  
  // Starting Stats question definitions - Players build the Avatar (the dater going on the date)
  const STARTING_STATS_QUESTIONS = [
    { type: 'physical', question: "What physical attribute do you want to have?" },
    { type: 'physical', question: "What physical attribute do you want to have?" },
    { type: 'physical', question: "What physical attribute do you want to have?" },
    { type: 'emotional', question: "What emotional state do you want to be in?" },
    { type: 'emotional', question: "What emotional state do you want to be in?" },
    { type: 'name', question: "What do you want your name to be?" },
  ]
  
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
      partyClient.syncState({
        sentimentCategories: currentSentiments,
        exposedValues: currentExposed,
        glowingValues: currentGlowing,
      })
    }
  }
  
  // Helper: Map avatar's emotional traits to animation emotion (baseline)
  const getAvatarEmotionFromTraits = () => {
    const emotionalTrait = avatar?.attributes?.find(attr => 
      /nervous|anxious|scared|shy|timid/i.test(attr)) ? 'nervous' :
      avatar?.attributes?.find(attr => 
      /excited|eager|enthusiastic|happy|thrilled/i.test(attr)) ? 'excited' :
      avatar?.attributes?.find(attr => 
      /confident|bold|assertive|cocky/i.test(attr)) ? 'confident' :
      avatar?.attributes?.find(attr => 
      /angry|furious|mad|irritated/i.test(attr)) ? 'angry' :
      avatar?.attributes?.find(attr => 
      /flirty|seductive|romantic|charming/i.test(attr)) ? 'flirty' :
      avatar?.attributes?.find(attr => 
      /confused|puzzled|uncertain|unsure/i.test(attr)) ? 'confused' :
      'neutral'
    return emotionalTrait
  }
  
  // Helper: Get avatar emotion based on how the dater reacted
  const getAvatarEmotionFromContext = (daterSentiment) => {
    if (!daterSentiment) return getAvatarEmotionFromTraits()
    
    // Avatar reacts to how the dater responded - MORE DRAMATIC!
    const emotionMap = {
      loves: 'excited',      // Date loved it → Avatar EXCITED!!!
      likes: 'happy',        // Date liked it → Avatar happy!
      dislikes: 'worried',   // Date didn't like it → Avatar worried...
      dealbreakers: 'nervous' // Major red flag → Avatar nervous/scared
    }
    return emotionMap[daterSentiment] || getAvatarEmotionFromTraits()
  }
  
  // Helper: Get dater emotion based on sentiment AND compatibility
  // For LIKES/DISLIKES (minor): 70% weight on date vibe, 30% on comment
  // For LOVES/DEALBREAKERS (major): 30% weight on date vibe, 70% on comment
  const getDaterEmotionFromSentiment = (sentiment, currentCompatibility = null) => {
    const compat = currentCompatibility ?? useGameStore.getState().compatibility
    const isMajor = sentiment === 'loves' || sentiment === 'dealbreakers'
    const isMinor = sentiment === 'likes' || sentiment === 'dislikes'
    const isPositive = sentiment === 'loves' || sentiment === 'likes'
    
    // Base emotions for each sentiment
    const baseEmotionMap = {
      loves: 'excited',       // LOVES it → EXCITED!!!
      likes: 'happy',         // Likes it → Happy!
      dislikes: 'uncomfortable', // Dislikes → Uncomfortable...
      dealbreakers: 'horrified'  // Dealbreaker → HORRIFIED!
    }
    
    // For MAJOR sentiments (loves/dealbreakers), mostly use the base emotion
    // but slightly temper it based on compatibility
    if (isMajor) {
      // 70% comment, 30% date vibe - mostly use base emotion
      if (sentiment === 'loves') {
        // Even if date is going poorly, a LOVE should still be positive
        // But maybe not MAXIMUM excited if they were having doubts
        if (compat < 30) return 'happy' // Tone down from excited to just happy
        return 'excited' // Normal excited for most cases
      }
      if (sentiment === 'dealbreakers') {
        // Even if date was going well, a dealbreaker is still horrifying
        // But maybe they're more shocked than horrified if it was going great
        if (compat > 70) return 'worried' // More shocked/worried than horrified
        return 'horrified' // Normal horrified for most cases
      }
    }
    
    // For MINOR sentiments (likes/dislikes), heavily weight by compatibility
    // 70% date vibe, 30% comment
    if (isMinor) {
      if (sentiment === 'likes') {
        // Like hit, but how enthused they are depends on the date
        if (compat >= 70) return 'excited' // Date going great + like = very happy!
        if (compat >= 50) return 'happy'   // Neutral-positive date + like = happy
        if (compat >= 30) return 'neutral' // Date not great + like = meh
        return 'neutral' // Date going poorly + like = barely registers
      }
      if (sentiment === 'dislikes') {
        // Dislike hit, but severity depends on the date
        if (compat >= 70) return 'neutral' // Date going great + dislike = brush it off
        if (compat >= 50) return 'uncomfortable' // Neutral date + dislike = uncomfortable
        if (compat >= 30) return 'uncomfortable' // Date rough + dislike = more uncomfortable
        return 'worried' // Date going poorly + dislike = very worried
      }
    }
    
    return baseEmotionMap[sentiment] || 'neutral'
  }
  
  // Show reaction feedback temporarily (auto-clears after 4 seconds)
  // Now includes matchedValue and shortLabel to explain WHY the dater reacted this way
  const showReactionFeedback = (category, matchedValue = null, shortLabel = null) => {
    const daterName = selectedDater?.name || 'Maya'
    const topic = shortLabel || matchedValue || ''
    
    // Generate specific reactions that explain WHY based on the matched value
    let reactionText = ''
    
    if (topic) {
      // Topic-specific reactions that explain the WHY
      const specificReactions = {
        loves: [
          `${daterName} LOVES ${topic}!`,
          `${topic} is exactly what ${daterName} looks for!`,
          `${daterName} is super into ${topic}!`,
          `That ${topic} vibe? ${daterName} is HERE for it!`,
          `${daterName}'s heart skipped a beat - she loves ${topic}!`
        ],
        likes: [
          `${daterName} appreciates ${topic}.`,
          `${topic}? ${daterName} can get behind that.`,
          `${daterName} thinks ${topic} is pretty nice.`,
          `${daterName} liked the ${topic} energy.`,
          `Points for ${topic}!`
        ],
        dislikes: [
          `${daterName} isn't a fan of ${topic}...`,
          `${topic}? Not really ${daterName}'s thing.`,
          `${daterName} dislikes ${topic}.`,
          `${topic} is kind of a turn-off for ${daterName}.`,
          `That ${topic} thing made ${daterName} uncomfortable.`
        ],
        dealbreakers: [
          `${daterName} can't handle ${topic}!`,
          `${topic} is a DEALBREAKER for ${daterName}!`,
          `${daterName} is horrified by ${topic}!`,
          `${topic}?! ${daterName} wants to RUN!`,
          `NOPE! ${daterName} can't do ${topic}!`
        ]
      }
      
      const categoryReactions = specificReactions[category] || specificReactions.dislikes
      reactionText = categoryReactions[Math.floor(Math.random() * categoryReactions.length)]
    } else {
      // Fallback generic reactions if no topic provided
      const genericReactions = {
        loves: [
          `${daterName} is INTO this!`,
          `This really got ${daterName} excited!`,
          `${daterName} absolutely loved that!`
        ],
        likes: [
          `${daterName} thought that was sweet.`,
          `${daterName} liked that!`,
          `${daterName} found that charming.`
        ],
        dislikes: [
          `${daterName} didn't love that...`,
          `${daterName} cringed a little.`,
          `${daterName} was not impressed.`
        ],
        dealbreakers: [
          `${daterName} is horrified!`,
          `This is a HUGE red flag for ${daterName}!`,
          `DEALBREAKER for ${daterName}!`
        ]
      }
      
      const categoryReactions = genericReactions[category] || genericReactions.dislikes
      reactionText = categoryReactions[Math.floor(Math.random() * categoryReactions.length)]
    }
    
    const randomReaction = reactionText
    
    // Clear any existing timeout
    if (reactionFeedbackTimeout.current) {
      clearTimeout(reactionFeedbackTimeout.current)
    }
    
    setReactionFeedback({ text: randomReaction, category })
    
    // Set dater emotion based on reaction category for speech animation speed
    setDaterEmotion(category)
    
    // Auto-clear after 4 seconds
    reactionFeedbackTimeout.current = setTimeout(() => {
      setReactionFeedback(null)
    }, 4000)
    
    // Sync to other players
    if (partyClient && isHost) {
      partyClient.syncState({ reactionFeedback: { text: randomReaction, category }, daterEmotion: category })
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
  
  // Preload character expressions on mount - wait for all to load
  useEffect(() => {
    const loadPortraits = async () => {
      console.log('🖼️ Starting portrait preload...')
      await Promise.all([
        preloadExpressions('maya'),
        preloadExpressions('avatar')
      ])
      console.log('✅ All portraits preloaded')
      setPortraitsReady(true)
    }
    loadPortraits()
  }, [])
  
  // Check if API key is available
  useEffect(() => {
    const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY
    if (!apiKey) {
      setUsingFallback(true)
      console.warn('⚠️ No API key found - using fallback responses')
    }
  }, [])
  
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
  }, []) // Empty dependency - only logs on mount
  
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
        const totalVotes = Object.keys(votesMap).length
        
        console.log('🗳️ CLIENT received numberedAttributes from server:', numberedArray.length, 'items', JSON.stringify(numberedArray))
        
        // Build numbered attributes with votes
        const numberedWithVotes = numberedArray.filter(attr => attr).map(attr => {
          const votersForThis = Object.entries(votesMap)
            .filter(([_, voteNum]) => voteNum === attr.number)
            .map(([odId, _]) => odId)
          
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
      
      // Sync winning attribute
      if (state.winningAttribute) {
        setWinnerText(state.winningAttribute)
      }
      
      // Sync winner popup state (server-controlled)
      if (typeof state.showWinnerPopup === 'boolean') {
        setShowWinnerPopup(state.showWinnerPopup)
      }
      
      // Sync phase - but don't let server overwrite host's forward progress
      if (state.phase) {
        const currentLocalPhase = useGameStore.getState().livePhase
        const phaseOrder = ['lobby', 'starting-stats', 'reaction', 'phase1', 'answer-selection', 'phase3', 'plot-twist', 'ended']
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
      
      // Sync reaction feedback (non-host only)
      if (state.reactionFeedback && !isHost) {
        setReactionFeedback(state.reactionFeedback)
        // Auto-clear after 4 seconds
        if (reactionFeedbackTimeout.current) {
          clearTimeout(reactionFeedbackTimeout.current)
        }
        reactionFeedbackTimeout.current = setTimeout(() => {
          setReactionFeedback(null)
        }, 4000)
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
  }, [partyClient, roomCode, isHost, setSuggestedAttributes, setCompatibility, setLivePhase, setPhaseTimer, setPlayerChat, setNumberedAttributes, setShowTutorial, setTutorialStep, setPlayers, setPlotTwist])
  
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
    console.log('💡 DEBUG suggestedAttributes changed:', suggestedAttributes?.length, 'items', suggestedAttributes)
    console.log('💡 Should display suggestions?', livePhase === 'phase1' && (suggestedAttributes?.length || 0) > 0)
  }, [suggestedAttributes, livePhase])
  
  // Track which bubbles are ready to show (audio has started or TTS disabled)
  const [daterBubbleReady, setDaterBubbleReady] = useState(true)
  const [avatarBubbleReady, setAvatarBubbleReady] = useState(true)
  
  // TTS: Handle dater bubble changes - wait for audio to start before showing
  useEffect(() => {
    if (!daterBubble || daterBubble === lastSpokenDater.current) return
    
    lastSpokenDater.current = daterBubble
    
    if (ttsEnabled) {
      // Hide bubble until audio starts
      setDaterBubbleReady(false)
      
      // Start TTS
      speak(daterBubble, 'dater').then(result => {
        // Show bubble when audio starts (speak resolves when audio begins)
        setDaterBubbleReady(true)
        console.log('▶️ Dater bubble shown - audio started')
      })
    } else {
      // TTS disabled - show immediately
      setDaterBubbleReady(true)
    }
  }, [daterBubble, ttsEnabled])
  
  // TTS: Handle avatar bubble changes - wait for audio to start before showing
  useEffect(() => {
    if (!avatarBubble || avatarBubble === lastSpokenAvatar.current) return
    
    lastSpokenAvatar.current = avatarBubble
    
    if (ttsEnabled) {
      // Hide bubble until audio starts
      setAvatarBubbleReady(false)
      
      // Start TTS
      speak(avatarBubble, 'avatar').then(result => {
        // Show bubble when audio starts (speak resolves when audio begins)
        setAvatarBubbleReady(true)
        console.log('▶️ Avatar bubble shown - audio started')
      })
    } else {
      // TTS disabled - show immediately
      setAvatarBubbleReady(true)
    }
  }, [avatarBubble, ttsEnabled])
  
  // Stop TTS when phase changes or game ends
  useEffect(() => {
    if (livePhase === 'ended' || livePhase === 'lobby') {
      stopAllAudio()
      lastSpokenDater.current = ''
      lastSpokenAvatar.current = ''
      setDaterBubbleReady(true)
      setAvatarBubbleReady(true)
    }
  }, [livePhase])
  
  // Generate LLM breakdown sentences when game ends
  useEffect(() => {
    if (livePhase === 'ended' && compatibilityHistory.length > 0 && !isGeneratingBreakdown && breakdownSentences.length === 0) {
      setIsGeneratingBreakdown(true)
      const daterName = selectedDater?.name || 'Maya'
      const avatarName = avatar?.name || 'your date'
      
      generateBreakdownSentences(daterName, avatarName, compatibilityHistory, compatibility)
        .then(sentences => {
          setBreakdownSentences(sentences)
          setIsGeneratingBreakdown(false)
        })
        .catch(err => {
          console.error('Failed to generate breakdown:', err)
          setIsGeneratingBreakdown(false)
        })
    }
  }, [livePhase, compatibilityHistory, compatibility, selectedDater, avatar, isGeneratingBreakdown, breakdownSentences.length])
  
  // Phase timer countdown - only host runs the timer, others sync from PartyKit
  // Timer starts immediately when phase begins
  useEffect(() => {
    // Only the host should run the timer
    if (!isHost && partyClient) return
    
    // Run timer during Phase 1 and Phase 3 (answer-selection has no timer)
    const shouldRunTimer = livePhase === 'phase1' || livePhase === 'phase3'
    
    if (shouldRunTimer) {
      phaseTimerRef.current = setInterval(async () => {
        const currentTime = phaseTimerValueRef.current
        const newTime = currentTime - 1
        if (newTime >= 0) {
          setPhaseTimer(newTime)
          // Sync timer to PartyKit for other players every second
          if (partyClient && isHost) {
            partyClient.setTimer(newTime)
          }
        }
      }, 1000)
      
      return () => {
        if (phaseTimerRef.current) {
          clearInterval(phaseTimerRef.current)
        }
      }
    }
  }, [livePhase, isHost, partyClient, roomCode, setPhaseTimer])
  
  // Handle phase transitions when timer hits 0
  useEffect(() => {
    // Only trigger once when timer reaches 0 (only Phase 1 needs timer-based transitions now)
    if (phaseTimer === 0 && livePhase === 'phase1') {
      console.log('⏰ Timer hit 0, triggering phase end for:', livePhase)
      handlePhaseEnd()
    }
  }, [phaseTimer, livePhase])
  
  // ============ STARTING STATS MODE LOGIC ============
  
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
    
    if (!partyClient || !roomCode) {
      console.log('🎲 PartyKit not ready or no room code')
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
        partyClient.syncState( { phase: 'phase1', phaseTimer: 45, compatibility: currentCompatibility, cycleCount: currentCycleCount }) // was 30
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
    
    // Sync to PartyKit - always include cycleCount for consistency
    const currentCycleCount = useGameStore.getState().cycleCount
    partyClient.syncState( { 
      startingStats: newStartingStats,
      phase: 'starting-stats', // Ensure phase is synced
      cycleCount: currentCycleCount
    })
    console.log('🎲 Starting Stats initialized:', newStartingStats)
  }, [livePhase, isHost, partyClient, roomCode, players.length, startingStats.questionAssignments?.length])
  
  // Starting Stats timer (host only)
  useEffect(() => {
    if (livePhase !== 'starting-stats' || !isHost) return
    
    // Clear any existing timer
    if (startingStatsTimerRef.current) {
      clearInterval(startingStatsTimerRef.current)
    }
    
    startingStatsTimerRef.current = setInterval(() => {
      // Check phase is still starting-stats before doing anything
      const currentPhase = useGameStore.getState().livePhase
      if (currentPhase !== 'starting-stats') {
        if (startingStatsTimerRef.current) {
          clearInterval(startingStatsTimerRef.current)
        }
        return
      }
      
      setStartingStatsTimer(prev => {
        const newTime = prev - 1
        
        // Sync timer to PartyKit
        if (partyClient) {
          const currentStats = useGameStore.getState().startingStats
          if (currentStats) {
            partyClient.syncState({ 
              startingStats: { ...currentStats, timer: newTime }
            })
          }
        }
        
        // When timer hits 0, move to next question
        if (newTime <= 0) {
          // Clear timer before moving to prevent race conditions
          if (startingStatsTimerRef.current) {
            clearInterval(startingStatsTimerRef.current)
          }
          // Use setTimeout to move out of the setState callback
          setTimeout(() => {
            const phase = useGameStore.getState().livePhase
            if (phase === 'starting-stats') {
              moveToNextStartingStatsQuestion()
            }
          }, 0)
          return 15 // Reset timer (will be overwritten by next question setup)
        }
        
        return newTime
      })
    }, 1000)
    
    return () => {
      if (startingStatsTimerRef.current) {
        clearInterval(startingStatsTimerRef.current)
      }
    }
  }, [livePhase, isHost, partyClient, roomCode])
  
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
    
    // Restart the timer for the next question
    if (startingStatsTimerRef.current) {
      clearInterval(startingStatsTimerRef.current)
    }
    startingStatsTimerRef.current = setInterval(() => {
      const currentPhase = useGameStore.getState().livePhase
      if (currentPhase !== 'starting-stats') {
        if (startingStatsTimerRef.current) {
          clearInterval(startingStatsTimerRef.current)
        }
        return
      }
      
      setStartingStatsTimer(prev => {
        const newTime = prev - 1
        
        if (partyClient) {
          const stats = useGameStore.getState().startingStats
          if (stats) {
            partyClient.syncState({ startingStats: { ...stats, timer: newTime } })
          }
        }
        
        if (newTime <= 0) {
          if (startingStatsTimerRef.current) {
            clearInterval(startingStatsTimerRef.current)
          }
          setTimeout(() => {
            const phase = useGameStore.getState().livePhase
            if (phase === 'starting-stats') {
              moveToNextStartingStatsQuestion()
            }
          }, 0)
          return 15
        }
        
        return newTime
      })
    }, 1000)
    
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
    
    console.log('📝 Starting Stats answer submitted:', newAnswer, 'Total answers:', newAnswers.length)
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
    setCompatibilityHistory([]) // Reset end-of-game breakdown tracking
    setBreakdownSentences([]) // Reset LLM-generated breakdown
    setIsGeneratingBreakdown(false)
    console.log('🧹 Cleared conversation history for fresh reaction round')
    
    const currentAvatar = useGameStore.getState().avatar
    const avatarName = currentAvatar.name || 'the date'
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
    
    if (attributes.length === 0 && physicalAttrs.length === 0) {
      console.log('No attributes to react to, skipping reaction round')
      await finishReactionRound()
      return
    }
    
    try {
      // === STEP 1: Dater reacts to PHYSICAL attributes they can SEE ===
      console.log('👀 Dater reacting to physical attributes:', physicalList)
      
      const daterReaction1 = await getDaterDateResponse(
        selectedDater,
        currentAvatar,
        [], // Empty conversation - this is the first message
        physicalList, // Only physical attributes
        null,
        { positive: 0, negative: 0 },
        false,
        true, // isFirstImpressions
        useGameStore.getState().compatibility // Pass current compatibility
      )
      
      if (daterReaction1) {
        // Set dater's initial emotion based on first impression
        // Analyze the physical attributes to guess her reaction
        const firstImpressionMood = physicalList.toLowerCase().includes('attractive') || 
                                    physicalList.toLowerCase().includes('handsome') ||
                                    physicalList.toLowerCase().includes('beautiful') ||
                                    physicalList.toLowerCase().includes('cute') ? 'attracted' :
                                    physicalList.toLowerCase().includes('scary') ||
                                    physicalList.toLowerCase().includes('bloody') ||
                                    physicalList.toLowerCase().includes('terrifying') ? 'horrified' :
                                    physicalList.toLowerCase().includes('nervous') ||
                                    physicalList.toLowerCase().includes('sweaty') ? 'uncomfortable' : 'neutral'
        setDaterEmotion(firstImpressionMood)
        setDaterBubble(daterReaction1)
        addDateMessage('dater', daterReaction1)
        await syncConversationToPartyKit(undefined, daterReaction1, false)
        if (partyClient && isHost) {
          partyClient.syncState({ daterEmotion: firstImpressionMood })
        }
      }
      
      // Score physical attributes
      for (const attr of physicalAttrs) {
        const matchResult = await checkAttributeMatch(attr, daterValues, selectedDater, daterReaction1)
        if (matchResult.category) {
          const wasAlreadyExposed = exposeValue(matchResult.category, matchResult.matchedValue, matchResult.shortLabel)
          if (wasAlreadyExposed) triggerGlow(matchResult.shortLabel)
          const baseChanges = { loves: 25, likes: 10, dislikes: -10, dealbreakers: -25 }
          const change = Math.round(baseChanges[matchResult.category] * 0.5)
          if (change !== 0) {
            const newCompat = adjustCompatibility(change)
            console.log(`Physical impression: ${change > 0 ? '+' : ''}${change}% (${matchResult.shortLabel})`)
            if (partyClient) {
              partyClient.syncState( { compatibility: newCompat })
            }
            // No reaction feedback during first impressions - only during conversation
          }
        }
      }
      await syncConversationToPartyKit(undefined, undefined, true)
      
      // SHORTER DELAY - quick back and forth
      await new Promise(resolve => setTimeout(resolve, 1500))
      
      // === STEP 2: Avatar responds, EMPHASIZING their EMOTIONAL state ===
      console.log('💭 Avatar responding with emotional state:', emotionalList)
      
      // Get avatar's starting emotional state for introduction
      const startingMood = getAvatarEmotionFromTraits()
      
      const avatarIntro = await getAvatarDateResponse(
        currentAvatar,
        selectedDater,
        [{ speaker: 'dater', message: daterReaction1 }],
        emotionalList, // Pass emotional attributes as the focus
        'introduce-emotional', // Special mode emphasizing emotional state
        startingMood // Pass current emotional state
      )
      
      if (avatarIntro) {
        const avatarMood = getAvatarEmotionFromTraits()
        setAvatarEmotion(avatarMood)
        setAvatarBubble(avatarIntro)
        addDateMessage('avatar', avatarIntro)
        await syncConversationToPartyKit(avatarIntro, undefined, false)
        if (partyClient && isHost) {
          partyClient.syncState({ avatarEmotion: avatarMood })
        }
      }
      
      // Score emotional attributes
      for (const attr of emotionalAttrs) {
        const matchResult = await checkAttributeMatch(`emotionally ${attr}`, daterValues, selectedDater, avatarIntro)
        if (matchResult.category) {
          const wasAlreadyExposed = exposeValue(matchResult.category, matchResult.matchedValue, matchResult.shortLabel)
          if (wasAlreadyExposed) triggerGlow(matchResult.shortLabel)
          const baseChanges = { loves: 25, likes: 10, dislikes: -10, dealbreakers: -25 }
          const change = Math.round(baseChanges[matchResult.category] * 0.5)
          if (change !== 0) {
            const newCompat = adjustCompatibility(change)
            console.log(`Emotional impression: ${change > 0 ? '+' : ''}${change}% (${matchResult.shortLabel})`)
            if (partyClient) {
              partyClient.syncState( { compatibility: newCompat })
            }
            // No reaction feedback during first impressions - only during conversation
          }
        }
      }
      await syncConversationToPartyKit(undefined, undefined, true)
      
      await new Promise(resolve => setTimeout(resolve, 2000))
      
      // === STEP 3: Dater responds to what the Avatar said (First Impressions - REACT TO CONTENT!) ===
      console.log('💬 Dater responding to avatar (first impressions - emotional reaction)')
      
      // Check sentiment FIRST - how does Maya feel about what the avatar said?
      const emotionalMatchResult = await checkAttributeMatch(avatarIntro, daterValues, selectedDater, null)
      const emotionalSentiment = emotionalMatchResult.category || null
      console.log('🎯 First impressions - Maya\'s emotional reaction to avatar:', emotionalSentiment, emotionalMatchResult.shortLabel)
      
      const daterReaction2 = await getDaterDateResponse(
        selectedDater,
        currentAvatar,
        [
          { speaker: 'dater', message: daterReaction1 },
          { speaker: 'avatar', message: avatarIntro }
        ],
        avatarIntro, // Pass what the avatar said so Maya can react to it
        emotionalSentiment, // Pass the sentiment so Maya knows how to react!
        reactionStreak,
        false, // not final round
        true,  // isFirstImpressions - react, don't ask questions
        useGameStore.getState().compatibility // Pass current compatibility
      )
      
      if (daterReaction2) {
        // Set dater's emotion based on her reaction to avatar's intro + current compatibility
        const daterReaction2Mood = getDaterEmotionFromSentiment(emotionalSentiment, useGameStore.getState().compatibility)
        setDaterEmotion(daterReaction2Mood)
        setDaterBubble(daterReaction2)
        addDateMessage('dater', daterReaction2)
        await syncConversationToPartyKit(undefined, daterReaction2, false)
        if (partyClient && isHost) {
          partyClient.syncState({ daterEmotion: daterReaction2Mood })
        }
        
        // Update avatar's emotion based on how dater reacted
        const avatarReactionToFeedback = getAvatarEmotionFromContext(emotionalSentiment)
        setAvatarEmotion(avatarReactionToFeedback)
        if (partyClient && isHost) {
          partyClient.syncState({ avatarEmotion: avatarReactionToFeedback })
        }
        
        // Show reaction feedback AND APPLY SCORING if there was a sentiment hit
        // Show immediately when dater starts speaking (not with delay!)
        if (emotionalSentiment) {
          showReactionFeedback(emotionalSentiment, emotionalMatchResult.matchedValue, emotionalMatchResult.shortLabel)
          
          // SCORE the dater's first impression reaction!
          const wasAlreadyExposed = exposeValue(emotionalMatchResult.category, emotionalMatchResult.matchedValue, emotionalMatchResult.shortLabel)
          if (wasAlreadyExposed) triggerGlow(emotionalMatchResult.shortLabel)
          
          const baseChanges = { loves: 25, likes: 10, dislikes: -10, dealbreakers: -25 }
          const change = baseChanges[emotionalSentiment] // Full 1.0x multiplier for first impression!
          if (change !== 0) {
            const newCompat = adjustCompatibility(change)
            console.log(`🎭 First impression reaction: ${change > 0 ? '+' : ''}${change}% (${emotionalMatchResult.shortLabel})`)
            if (partyClient) {
              partyClient.syncState({ compatibility: newCompat })
            }
            
            // Record for end-of-game breakdown
            setCompatibilityHistory(prev => [...prev, {
              attribute: avatarIntro,
              topic: emotionalMatchResult.shortLabel || emotionalMatchResult.matchedValue,
              category: emotionalSentiment,
              change: change,
              daterValue: emotionalMatchResult.matchedValue,
              reason: 'First impression reaction'
            }])
          }
        }
      }
      
      // Brief pause before Phase 1
      await new Promise(resolve => setTimeout(resolve, 3000))
      
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
    console.log('✅ Audio complete, waiting 5s before Phase 1...')
    
    // Give players 5 seconds to read the conversation before starting Phase 1
    await new Promise(resolve => setTimeout(resolve, 5000))
    
    console.log('⏰ Delay complete, starting Phase 1')
    
    // Get round prompt (Title + Question) - shown as interstitial, not asked by dater
    // This is Round 1 (first round after reaction), so use first round prompts
    const roundPrompt = getRoundPrompt(true) // true = first round
    setCurrentRoundPrompt(roundPrompt)
    
    // Get current compatibility to preserve it
    const currentCompatibility = useGameStore.getState().compatibility
    console.log('💯 Preserving compatibility:', currentCompatibility)
    
    setRoundPromptAnimationComplete(false)
    setLivePhase('phase1')
    setPhaseTimer(45) // Start timer immediately
    // Don't set dater bubble - the prompt is shown as interstitial instead
    setDaterBubble('')
    setAvatarBubble('')
    
    if (partyClient) {
      const currentCycleCount = useGameStore.getState().cycleCount
      partyClient.syncState( {
        phase: 'phase1',
        phaseTimer: 45,
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
  
  // Trigger reaction round when phase changes to 'reaction'
  useEffect(() => {
    if (livePhase === 'reaction' && isHost && !isGenerating) {
      // Small delay to let the UI update
      const timer = setTimeout(() => {
        runReactionRound()
      }, 1000)
      return () => clearTimeout(timer)
    }
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
  }, [livePhase, isHost, currentRoundPrompt.title])
  
  // Timer is now started immediately when phase1 begins - no animation-based delay needed
  
  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [playerChat])
  
  // Show phase announcement when phase changes
  useEffect(() => {
    // Don't show announcement for starting-stats, phase1 (has round prompt banner), or ended
    const skipAnnouncement = ['starting-stats', 'ended', 'waiting', 'phase1']
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
  const getPhaseAnnouncement = () => {
    switch (announcementPhase) {
      case 'reaction':
        return { title: 'FIRST IMPRESSIONS', subtitle: `Meeting ${selectedDater?.name || 'Maya'}`, icon: '👋', description: 'Watch them meet for the first time!' }
      case 'phase1':
        // Use current round prompt if available
        return { 
          title: currentRoundPrompt.title || 'ROUND ' + (cycleCount + 1), 
          subtitle: '', 
          icon: '✨', 
          description: currentRoundPrompt.subtitle || 'Submit your answer!' 
        }
      case 'answer-selection':
        return { title: 'SELECTING', subtitle: 'Answer', icon: '🎲', description: 'Picking an answer...' }
      case 'phase3':
        return { title: 'PHASE 3', subtitle: 'Watch the Date', icon: '👀', description: 'See how they react!' }
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
          text: "Your goal is simple: get the highest compatibility score with your date. Watch the meter at the top — that's your target!",
          highlight: 'compatibility'
        }
      case 2:
        return {
          title: 'How to Play',
          text: "When your date asks a question, type in any answer you think will impress them. After 30 seconds, everyone votes for their favorite answer. The winning answer becomes a permanent fact about your avatar!",
          highlight: null
        }
      case 3:
        return {
          title: "Let's Go!",
          text: "After 5 questions have been answered, the date ends and you'll see your final compatibility score. Good luck — try not to say anything too weird!",
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
  }, [selectedDater, isHost, partyClient, roomCode])
  
  // Round prompts - Title + Subtitle (Question) for each round
  // These are shown as interstitials during Phase 1 instead of the dater asking
  
  // FIRST ROUND ONLY - must be one of these 3
  const FIRST_ROUND_PROMPTS = [
    { title: "Green Flag", subtitle: "What's something small that makes you think 'this person gets it'?" },
    { title: "Ick", subtitle: "What's a small thing that turns you off?" },
    { title: "Dealbreaker", subtitle: "What's something that would make you immediately lose interest in someone?" },
  ]
  
  // ADDITIONAL prompts available for rounds 2-5 (plus any unused from first round pool)
  const ADDITIONAL_PROMPTS = [
    { title: "Hot Take", subtitle: "What's your most controversial opinion about dating or relationships?" },
    { title: "Unpopular Opinion", subtitle: "What do you believe about relationships that most people would disagree with?" },
    { title: "Love Language", subtitle: "How do you show someone you care about them?" },
    { title: "Desert Island Date", subtitle: "You're stranded together—what one item do you bring?" },
    { title: "Time Traveler", subtitle: "First date in any time period—when and where?" },
    { title: "Superpower Romance", subtitle: "What superpower would make you the best partner?" },
    { title: "Lottery Winner", subtitle: "You win $10 million. How does your dating life change?" },
    { title: "Secret Talent", subtitle: "What's your hidden skill that would impress a date?" },
    { title: "Embarrassing Moment", subtitle: "What's your most mortifying dating story?" },
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
  
  const handlePhaseEnd = async () => {
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
        console.log('📋 Processing suggestions for answer selection:', suggestedAttributes)
        const answers = suggestedAttributes
          .filter(attr => attr && (attr.text || typeof attr === 'string'))
          .map((attr, index) => ({
            id: index,
            text: typeof attr === 'string' ? attr : (attr.text || 'Unknown'),
            submittedBy: attr.username || 'Anonymous'
          }))
        
        // Start the answer selection sequence
        startAnswerSelection(answers)
        break
        
      // Phase 3 ends are handled by handleRoundComplete() after conversation finishes
    }
  }
  
  // Watch for first suggestion in Phase 1 when timer is at 0
  useEffect(() => {
    if (livePhase === 'phase1' && phaseTimer <= 0 && suggestedAttributes.length > 0) {
      // First suggestion came in while waiting - now we can proceed
      handlePhaseEnd()
    }
  }, [suggestedAttributes.length])
  
  // Get the winning attribute text (before applying it to the store)
  const getWinningAttributeText = () => {
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
  
  // State for pre-generated conversation
  const [preGeneratedConvo, setPreGeneratedConvo] = useState(null)
  const [isPreGenerating, setIsPreGenerating] = useState(false)
  
  // ============================================
  // PHASE 1: PRE-GENERATE ALL CONVERSATION
  // Front-load all LLM calls, store results
  // ============================================
  const preGenerateRoundConversation = async (currentAttribute) => {
    if (!isHost || !selectedDater) return null
    
    const attrToUse = currentAttribute || latestAttribute
    if (!attrToUse) return null
    
    console.log('🎬 PRE-GENERATING round conversation...')
    setIsPreGenerating(true)
    
    // Sync loading state to clients
    if (partyClient) {
      partyClient.syncState({ isPreGenerating: true })
    }
    
    const currentCycleForCheck = useGameStore.getState().cycleCount
    const maxCyclesForCheck = useGameStore.getState().maxCycles
    const isFinalRound = currentCycleForCheck >= maxCyclesForCheck - 1
    
    const questionContext = currentRoundPrompt.subtitle || 'Tell me about yourself'
    const framedAttribute = { answer: attrToUse, questionContext }
    
    const avatarWithNewAttr = {
      ...avatar,
      attributes: avatar.attributes.includes(attrToUse) 
        ? avatar.attributes 
        : [...avatar.attributes, attrToUse]
    }
    
    const getConversation = () => useGameStore.getState().dateConversation
    let currentStreak = { ...reactionStreak }
    
    // Store all exchanges here
    const exchanges = []
    
    try {
      // Decide who opens (50/50)
      const daterOpensFirst = Math.random() < 0.5
      console.log('📝 Pre-generating:', daterOpensFirst ? 'DATER opens' : 'AVATAR opens')
      
      // ===== EXCHANGE 1 =====
      let exchange1 = { daterOpener: null, avatarResponse: null, daterReaction: null, matchResult: null }
      
      if (daterOpensFirst) {
        // Dater opens
        exchange1.daterOpener = await getDaterConversationOpener(
          selectedDater, avatarWithNewAttr, getConversation().slice(-20),
          currentRoundPrompt.title, questionContext
        )
        exchange1.daterOpenerMood = 'happy'
        
        if (exchange1.daterOpener) {
          // Avatar responds to opener
          const avatarMood1 = getAvatarEmotionFromTraits()
          exchange1.avatarResponse = await getAvatarDateResponse(
            avatarWithNewAttr, selectedDater,
            [...getConversation().slice(-20), { speaker: 'dater', message: exchange1.daterOpener }],
            { answer: attrToUse, questionContext, daterOpener: exchange1.daterOpener },
            'respond-to-opener', avatarMood1
          )
          exchange1.avatarMood = avatarMood1
        }
      } else {
        // Avatar opens
        const avatarMood1 = getAvatarEmotionFromTraits()
        exchange1.avatarResponse = await getAvatarDateResponse(
          avatarWithNewAttr, selectedDater, getConversation().slice(-20),
          framedAttribute, 'paraphrase', avatarMood1
        )
        exchange1.avatarMood = avatarMood1
      }
      
      // Check sentiment for avatar's response
      if (exchange1.avatarResponse) {
        exchange1.matchResult = await checkAttributeMatch(exchange1.avatarResponse, daterValues, selectedDater, null)
        const sentimentHit1 = exchange1.matchResult.category || null
        
        // Build conversation history for next call
        const convoWithExchange1 = [...getConversation().slice(-20)]
        if (exchange1.daterOpener) convoWithExchange1.push({ speaker: 'dater', message: exchange1.daterOpener })
        if (exchange1.avatarResponse) convoWithExchange1.push({ speaker: 'avatar', message: exchange1.avatarResponse })
        
        // Dater reacts to avatar - pass current compatibility for weighted response
        const currentCompat1 = useGameStore.getState().compatibility
        exchange1.daterReaction = await getDaterDateResponse(
          selectedDater, avatarWithNewAttr, convoWithExchange1,
          attrToUse, sentimentHit1, currentStreak, isFinalRound, false, currentCompat1
        )
        exchange1.daterMood = getDaterEmotionFromSentiment(sentimentHit1, currentCompat1)
        exchange1.sentimentHit = sentimentHit1
        exchange1.scoringMultiplier = 1.0
        
        // Update streak for next exchange
        if (sentimentHit1) {
          const isPositive = sentimentHit1 === 'loves' || sentimentHit1 === 'likes'
          if (isPositive) currentStreak = { positive: currentStreak.positive + 1, negative: 0 }
          else currentStreak = { positive: 0, negative: currentStreak.negative + 1 }
        }
      }
      exchanges.push(exchange1)
      
      // ===== EXCHANGE 2 =====
      const convoAfterEx1 = [...getConversation().slice(-20)]
      if (exchange1.daterOpener) convoAfterEx1.push({ speaker: 'dater', message: exchange1.daterOpener })
      if (exchange1.avatarResponse) convoAfterEx1.push({ speaker: 'avatar', message: exchange1.avatarResponse })
      if (exchange1.daterReaction) convoAfterEx1.push({ speaker: 'dater', message: exchange1.daterReaction })
      
      const avatarMood2 = getAvatarEmotionFromContext(exchange1.sentimentHit)
      const avatarResponse2 = await getAvatarDateResponse(
        avatarWithNewAttr, selectedDater, convoAfterEx1,
        attrToUse, 'react', avatarMood2
      )
      
      let exchange2 = { avatarResponse: avatarResponse2, avatarMood: avatarMood2, daterReaction: null, matchResult: null }
      
      if (avatarResponse2) {
        exchange2.matchResult = await checkAttributeMatch(avatarResponse2, daterValues, selectedDater, null)
        const sentimentHit2 = exchange2.matchResult.category || null
        
        const convoWithEx2 = [...convoAfterEx1, { speaker: 'avatar', message: avatarResponse2 }]
        // Dater reacts - pass current compatibility for weighted response
        const currentCompat2 = useGameStore.getState().compatibility
        exchange2.daterReaction = await getDaterDateResponse(
          selectedDater, avatarWithNewAttr, convoWithEx2,
          exchange2.matchResult.matchedValue, sentimentHit2, currentStreak, isFinalRound, false, currentCompat2
        )
        exchange2.daterMood = getDaterEmotionFromSentiment(sentimentHit2, currentCompat2)
        exchange2.sentimentHit = sentimentHit2
        exchange2.scoringMultiplier = 0.25
        
        if (sentimentHit2) {
          const isPositive = sentimentHit2 === 'loves' || sentimentHit2 === 'likes'
          if (isPositive) currentStreak = { positive: currentStreak.positive + 1, negative: 0 }
          else currentStreak = { positive: 0, negative: currentStreak.negative + 1 }
        }
      }
      exchanges.push(exchange2)
      
      // ===== EXCHANGE 3 =====
      const convoAfterEx2 = [...convoAfterEx1]
      if (exchange2.avatarResponse) convoAfterEx2.push({ speaker: 'avatar', message: exchange2.avatarResponse })
      if (exchange2.daterReaction) convoAfterEx2.push({ speaker: 'dater', message: exchange2.daterReaction })
      
      const avatarMood3 = getAvatarEmotionFromContext(exchange2.sentimentHit)
      const avatarResponse3 = await getAvatarDateResponse(
        avatarWithNewAttr, selectedDater, convoAfterEx2,
        attrToUse, 'connect', avatarMood3
      )
      
      let exchange3 = { avatarResponse: avatarResponse3, avatarMood: avatarMood3, daterReaction: null, matchResult: null }
      
      if (avatarResponse3) {
        exchange3.matchResult = await checkAttributeMatch(avatarResponse3, daterValues, selectedDater, null)
        const sentimentHit3 = exchange3.matchResult.category || null
        
        const convoWithEx3 = [...convoAfterEx2, { speaker: 'avatar', message: avatarResponse3 }]
        // Dater reacts - pass current compatibility for weighted response
        const currentCompat3 = useGameStore.getState().compatibility
        exchange3.daterReaction = await getDaterDateResponse(
          selectedDater, avatarWithNewAttr, convoWithEx3,
          exchange3.matchResult.matchedValue, sentimentHit3, currentStreak, isFinalRound, false, currentCompat3
        )
        exchange3.daterMood = getDaterEmotionFromSentiment(sentimentHit3, currentCompat3)
        exchange3.sentimentHit = sentimentHit3
        exchange3.scoringMultiplier = 0.10
      }
      exchanges.push(exchange3)
      
      console.log('✅ Pre-generation complete! Exchanges:', exchanges.length)
      
      const preGenData = {
        attribute: attrToUse,
        isFinalRound,
        exchanges,
        avatarWithNewAttr
      }
      
      setIsPreGenerating(false)
      if (partyClient) {
        partyClient.syncState({ isPreGenerating: false, preGeneratedConvo: preGenData })
      }
      
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
    
    console.log('▶️ PLAYING BACK pre-generated conversation...')
    const { attribute, exchanges, avatarWithNewAttr } = preGenData
    
    for (let i = 0; i < exchanges.length; i++) {
      const exchange = exchanges[i]
      console.log(`▶️ Playing exchange ${i + 1}/${exchanges.length}`)
      
      // Play dater opener (only exchange 1 might have this)
      if (exchange.daterOpener) {
        setDaterEmotion(exchange.daterOpenerMood || 'happy')
        setDaterBubble(exchange.daterOpener)
        addDateMessage('dater', exchange.daterOpener)
        await syncConversationToPartyKit(undefined, exchange.daterOpener, undefined)
        if (partyClient) partyClient.syncState({ daterEmotion: exchange.daterOpenerMood || 'happy' })
        // Wait for audio to complete before next message
        await waitForAllAudio()
        await new Promise(r => setTimeout(r, 500)) // Brief pause between speakers
      }
      
      // Play avatar response
      if (exchange.avatarResponse) {
        setAvatarEmotion(exchange.avatarMood || 'neutral')
        setAvatarBubble(exchange.avatarResponse)
        addDateMessage('avatar', exchange.avatarResponse)
        await syncConversationToPartyKit(exchange.avatarResponse, undefined, undefined)
        if (partyClient) partyClient.syncState({ avatarEmotion: exchange.avatarMood || 'neutral' })
        // Wait for audio to complete before next message
        await waitForAllAudio()
        await new Promise(r => setTimeout(r, 500)) // Brief pause between speakers
      }
      
      // Play dater reaction
      if (exchange.daterReaction) {
        setDaterEmotion(exchange.daterMood || 'neutral')
        setDaterBubble(exchange.daterReaction)
        addDateMessage('dater', exchange.daterReaction)
        await syncConversationToPartyKit(undefined, exchange.daterReaction, undefined)
        if (partyClient) partyClient.syncState({ daterEmotion: exchange.daterMood || 'neutral' })
        
        // Show reaction feedback IMMEDIATELY when dater starts speaking (not before!)
        // Apply scoring at the same time
        if (exchange.sentimentHit && exchange.matchResult) {
          // Show reaction text NOW - when dater is speaking
          showReactionFeedback(exchange.sentimentHit, exchange.matchResult.matchedValue, exchange.matchResult.shortLabel)
          
          // Apply scoring
          const wasAlreadyExposed = exposeValue(exchange.matchResult.category, exchange.matchResult.matchedValue, exchange.matchResult.shortLabel)
          if (wasAlreadyExposed) triggerGlow(exchange.matchResult.shortLabel)
          
          const baseChanges = { loves: 25, likes: 10, dislikes: -10, dealbreakers: -25 }
          const change = Math.round(baseChanges[exchange.sentimentHit] * (exchange.scoringMultiplier || 1))
          if (change !== 0) {
            const newCompat = adjustCompatibility(change)
            if (partyClient) partyClient.syncState({ compatibility: newCompat })
            setCompatibilityHistory(prev => [...prev, {
              attribute,
              topic: exchange.matchResult.shortLabel || exchange.matchResult.matchedValue,
              category: exchange.sentimentHit,
              change,
              daterValue: exchange.matchResult.matchedValue,
              reason: exchange.matchResult.reason || ''
            }])
          }
        }
        
        await syncConversationToPartyKit(undefined, undefined, true)
        
        // Wait for dater's audio to complete before next exchange
        await waitForAllAudio()
        
        // Pause between exchanges
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
      
      if (preGenData) {
        // PHASE 2: Playback smoothly
        await playbackConversation(preGenData)
      }
      
      // Wait for all audio to finish before ending the round
      console.log('⏳ Waiting for final audio to complete...')
      await waitForAllAudio()
      console.log('✅ All audio complete')
      
      // Handle round completion
      const currentCycleForCheck = useGameStore.getState().cycleCount
      const maxCyclesForCheck = useGameStore.getState().maxCycles
      const isFinalRound = currentCycleForCheck >= maxCyclesForCheck - 1
      
      if (isFinalRound) {
        await new Promise(r => setTimeout(r, 2000))
        const currentCompatibility = useGameStore.getState().compatibility
        await generateFinalSummary(currentCompatibility)
      }
      
      await handleRoundComplete()
      
    } catch (error) {
      console.error('Conversation error:', error)
      setDaterBubble("Well, that was... something.")
    }
    
    setIsGenerating(false)
  }
  
  // Generate Maya's final summary statement based on compatibility
  const generateFinalSummary = async (compatibilityScore) => {
    const daterName = selectedDater?.name || 'Maya'
    const avatarName = avatar?.name || 'you'
    
    // Determine sentiment based on compatibility
    let sentiment, instruction
    if (compatibilityScore >= 80) {
      sentiment = 'very positive'
      instruction = `You had an AMAZING time! You're totally smitten. Hint that you want to see them again, maybe even tonight. Be flirty and enthusiastic.`
    } else if (compatibilityScore >= 60) {
      sentiment = 'positive'
      instruction = `You had a good time overall. You'd be open to another date. Be warm but not over-the-top.`
    } else if (compatibilityScore >= 40) {
      sentiment = 'mixed'
      instruction = `You're on the fence. There were some good moments but also some concerns. Be polite but noncommittal about future plans.`
    } else if (compatibilityScore >= 20) {
      sentiment = 'negative'  
      instruction = `This date was rough. You're trying to be polite but you're definitely not feeling it. Make a polite excuse to wrap things up.`
    } else {
      sentiment = 'very negative'
      instruction = `This was a DISASTER. You can barely hide how ready you are to leave. Be clearly done with this date while maintaining basic politeness.`
    }
    
    const prompt = `You are ${daterName} wrapping up a first date with ${avatarName}.

COMPATIBILITY LEVEL: ${compatibilityScore}% (${sentiment})

${instruction}

RULES:
- This is your FINAL statement to close out the date
- Summarize how you felt WITHOUT mentioning percentages or scores
- Reference 1-2 specific things from the date if possible (from the conversation)
- Keep it SHORT - 1-2 sentences MAX
- NO action descriptors (*smiles*, etc) - dialogue only
- End on a note that matches the sentiment: hopeful, neutral, or relieved it's over

Examples for different sentiments:
- Very Positive: "Honestly? This was the best date I've had in forever. When can I see you again?"
- Positive: "Well, this was really nice. We should definitely do this again sometime."
- Mixed: "So... this was interesting. I'll, um, think about it."
- Negative: "Okay well, I should probably get going. It was... nice meeting you."
- Very Negative: "Yeah, I'm gonna call it here. Good luck with... everything."

Generate ${daterName}'s final closing statement:`

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': import.meta.env.VITE_ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 150,
          messages: [{ role: 'user', content: prompt }]
        })
      })
      
      const data = await response.json()
      const finalStatement = data.content?.[0]?.text?.trim() || ''
      
      if (finalStatement) {
        console.log(`🎬 Maya's final summary (${compatibilityScore}%):`, finalStatement)
        
        // Show Maya's final statement
        const daterMood = compatibilityScore >= 60 ? 'happy' : compatibilityScore >= 40 ? 'neutral' : 'uncomfortable'
        setDaterEmotion(daterMood)
        setDaterBubble(finalStatement)
        addDateMessage('dater', finalStatement)
        await syncConversationToPartyKit(undefined, finalStatement, undefined)
        
        // Speak the final statement
        await speak(finalStatement, 'dater')
        
        // Give players time to read/hear it
        await new Promise(resolve => setTimeout(resolve, 3000))
      }
    } catch (error) {
      console.error('Error generating final summary:', error)
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
    
    // IMPORTANT: Get CURRENT compatibility from store (not closure value!)
    const currentCompatibility = useGameStore.getState().compatibility
    console.log(`Round ${newRoundCount}/${currentMaxCycles} complete, compatibility: ${currentCompatibility}, cycleCount: ${currentCycleCount} -> ${newRoundCount}`)
    
    // Check if we should trigger Plot Twist (after Round 3, i.e., newRoundCount === 3)
    if (newRoundCount === 3 && !currentPlotTwistCompleted) {
      console.log('🎭 Triggering Plot Twist after Round 3!')
      startPlotTwist()
      return
    }
    
    if (newRoundCount >= currentMaxCycles) {
      // Game over! Generate Maya's final summary before showing results
      await generateFinalSummary(currentCompatibility)
      
      setLivePhase('ended')
      if (partyClient) {
        partyClient.syncState( { phase: 'ended', compatibility: currentCompatibility, cycleCount: newRoundCount })
      }
      // Extend timeout to let players read the breakdown
      setTimeout(() => setPhase('results'), 15000)
    } else {
      // Start new round - show round prompt interstitial (not dater question)
      setRoundPromptAnimationComplete(false)
      setLivePhase('phase1')
      setPhaseTimer(45) // Start timer immediately
      
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
            numberedAttributes: []
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
  const advancePlotTwistToInput = () => {
    if (!isHost) return
    
    const newPlotTwist = {
      ...useGameStore.getState().plotTwist,
      subPhase: 'input',
      timer: 22, // was 15
    }
    setPlotTwist(newPlotTwist)
    
    // Sync to PartyKit
    if (partyClient) {
      partyClient.syncState({ plotTwist: newPlotTwist })
    }
    
    // Start the 15 second timer
    startPlotTwistTimer()
  }
  
  // Start the plot twist input timer
  const startPlotTwistTimer = () => {
    if (plotTwistTimerRef.current) {
      clearInterval(plotTwistTimerRef.current)
    }
    
    plotTwistTimerRef.current = setInterval(() => {
      const currentPlotTwist = useGameStore.getState().plotTwist
      const newTimer = currentPlotTwist.timer - 1
      
      if (newTimer <= 0) {
        clearInterval(plotTwistTimerRef.current)
        // Timer ended - move to reveal phase
        advancePlotTwistToReveal()
      } else {
        const updatedPlotTwist = { ...currentPlotTwist, timer: newTimer }
        setPlotTwist(updatedPlotTwist)
        
        // Sync timer every 5 seconds to reduce traffic
        if (newTimer % 5 === 0 && partyClient) {
          partyClient.syncState({ plotTwist: updatedPlotTwist })
        }
      }
    }, 1000)
  }
  
  // Submit a plot twist answer (any player)
  const submitPlotTwistAnswer = (answer) => {
    if (!answer.trim() || hasSubmittedPlotTwist) return
    
    setHasSubmittedPlotTwist(true)
    setPlotTwistInput('')
    
    // Submit via PartyKit
    if (partyClient) {
      partyClient.submitPlotTwistAnswer(playerId, username, answer.trim())
    }
    
    console.log(`🎭 Submitted plot twist answer: "${answer}"`)
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
    
    const newPlotTwist = {
      ...currentPlotTwist,
      subPhase: 'spinning',
      answers: answers,
      slices: slices,
      spinAngle: 0,
      winningSlice: null
    }
    setPlotTwist(newPlotTwist)
    
    // Sync to PartyKit
    if (partyClient) {
      partyClient.syncState({ plotTwist: newPlotTwist })
    }
    
    // Start wheel spin after brief pause
    setTimeout(() => {
      startPlotTwistWheelSpin(slices)
    }, 500)
  }
  
  // Start the plot twist wheel spinning animation
  const startPlotTwistWheelSpin = (slices) => {
    if (!isHost) return
    
    if (!slices || slices.length === 0) {
      finishPlotTwist()
      return
    }
    
    // Pick random winner (equal weight for all)
    const winnerIndex = Math.floor(Math.random() * slices.length)
    const winningSlice = slices[winnerIndex]
    
    // Calculate the angle to stop at (middle of winning slice)
    const winningMidAngle = (winningSlice.startAngle + winningSlice.endAngle) / 2
    // Arrow points up (0 degrees), so we need to rotate to put winning slice at top
    const fullRotations = 5 + Math.floor(Math.random() * 3) // 5-7 full spins
    const finalAngle = (fullRotations * 360) + (360 - winningMidAngle)
    
    console.log('🎭 Plot Twist wheel spinning to', finalAngle, 'degrees, winner:', winningSlice.label)
    
    // Animate the spin with ease-in-out
    let startTime = null
    const duration = 5000 // 5 seconds
    const startAngle = 0
    
    const animateSpin = (timestamp) => {
      if (!startTime) startTime = timestamp
      const elapsed = timestamp - startTime
      const progress = Math.min(elapsed / duration, 1)
      
      // Ease-in-out cubic
      let eased
      if (progress < 0.5) {
        eased = 4 * progress * progress * progress
      } else {
        eased = 1 - Math.pow(-2 * progress + 2, 3) / 2
      }
      
      const currentAngle = startAngle + (finalAngle * eased)
      
      setPlotTwist(prev => ({ ...prev, spinAngle: currentAngle }))
      
      // Sync less frequently
      if (partyClient && Math.floor(elapsed / 200) !== Math.floor((elapsed - 16) / 200)) {
        const currentPlotTwistState = useGameStore.getState().plotTwist
        partyClient.syncState({ plotTwist: { ...currentPlotTwistState, spinAngle: currentAngle } })
      }
      
      if (progress < 1) {
        plotTwistAnimationRef.current = requestAnimationFrame(animateSpin)
      } else {
        // Spin complete - declare winner
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
    
    console.log(`🎭 Plot Twist Winner: "${winner.answer}" by ${winner.username}`)
    
    const currentPlotTwist = useGameStore.getState().plotTwist
    const newPlotTwist = {
      ...currentPlotTwist,
      subPhase: 'winner',
      winningAnswer: winner,
      animationIndex: winnerIndex,
    }
    setPlotTwist(newPlotTwist)
    
    if (partyClient) {
      partyClient.syncState({ plotTwist: newPlotTwist })
    }
    
    // Show winner for 3 seconds, then generate summary
    setTimeout(() => {
      generatePlotTwistSummaryPhase(winner)
    }, 3000)
  }
  
  // Generate and show the plot twist summary before the dater's reaction
  const generatePlotTwistSummaryPhase = async (winner) => {
    if (!isHost) return
    
    console.log('🎭 Generating plot twist summary...')
    
    const avatarName = avatar?.name || 'Your Avatar'
    const daterName = selectedDater?.name || 'Maya'
    
    // Generate the dramatic summary
    const summary = await generatePlotTwistSummary(avatarName, daterName, winner.answer)
    
    // Update to summary phase with the generated text
    const currentPlotTwist = useGameStore.getState().plotTwist
    const newPlotTwist = {
      ...currentPlotTwist,
      subPhase: 'summary',
      summary: summary,
      winningAnswer: winner, // Store winner for when host advances
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
    if (currentPlotTwist.winningAnswer) {
      generatePlotTwistReaction(currentPlotTwist.winningAnswer)
    }
  }
  
  // Generate LLM reaction to the plot twist - THIS IS A KEY MOMENT!
  // Maya should really express herself here - multiple exchanges, more emotional
  const generatePlotTwistReaction = async (winner) => {
    if (!isHost) return
    
    // IMPORTANT: Switch to phase3 to close the overlay and show the date window
    // This lets players see the conversation happening
    setLivePhase('phase3')
    setPhaseTimer(0)
    
    const currentCompatibility = useGameStore.getState().compatibility
    const currentCycleCount = useGameStore.getState().cycleCount
    
    if (partyClient) {
      partyClient.syncState({ 
        phase: 'phase3', 
        phaseTimer: 0,
        compatibility: currentCompatibility,
        cycleCount: currentCycleCount,
        // Clear the plot twist overlay state
        plotTwist: { ...useGameStore.getState().plotTwist, subPhase: 'done' }
      })
    }
    
    setIsGenerating(true)
    
    try {
      // Create context for the plot twist scenario - emphasize this is IMPORTANT
      const plotTwistContext = `PLOT TWIST SCENARIO: Someone else just started hitting on ${selectedDater?.name || 'your date'}! 
The avatar's response to this situation: "${winner.answer}"
This is a DRAMATIC, PIVOTAL moment - react with FULL emotion to what the avatar did!`
      
      // ============ EXCHANGE 1: Maya's FIRST big reaction ============
      console.log('🎭 Plot Twist Exchange 1: Maya reacts to what happened')
      const plotTwistCompat = useGameStore.getState().compatibility
      const daterReaction1 = await getDaterDateResponse(
        selectedDater,
        avatar,
        useGameStore.getState().dateConversation || [],
        plotTwistContext,
        null, // no sentiment hit for plot twist
        { positive: 0, negative: 0 },
        false,
        false, // not first impressions
        plotTwistCompat // Pass current compatibility
      )
      
      // Dater is probably shocked/excited during plot twist!
      const plotTwistDaterMood = winner.answer.toLowerCase().includes('punch') ||
                                 winner.answer.toLowerCase().includes('fight') ||
                                 winner.answer.toLowerCase().includes('hit') ? 'horrified' :
                                 winner.answer.toLowerCase().includes('nothing') ||
                                 winner.answer.toLowerCase().includes('ignore') ? 'uncomfortable' :
                                 winner.answer.toLowerCase().includes('flirt') ||
                                 winner.answer.toLowerCase().includes('kiss') ? 'attracted' : 'excited'
      setDaterEmotion(plotTwistDaterMood)
      setDaterBubble(daterReaction1)
      addDateMessage('dater', daterReaction1)
      syncConversationToPartyKit(undefined, daterReaction1)
      if (partyClient && isHost) {
        partyClient.syncState({ daterEmotion: plotTwistDaterMood })
      }
      
      // Wait for Maya to finish speaking - this is important!
      await waitForAllAudio()
      await new Promise(resolve => setTimeout(resolve, 2000))
      
      // ============ EXCHANGE 2: Avatar responds to Maya's reaction ============
      console.log('🎭 Plot Twist Exchange 2: Avatar responds')
      
      // During plot twist, avatar is likely excited or nervous depending on what they did
      const plotTwistAvatarMood = winner.answer.toLowerCase().includes('nothing') ? 'nervous' : 
                                  winner.answer.toLowerCase().includes('punch') ||
                                  winner.answer.toLowerCase().includes('fight') ? 'confident' : 'excited'
      
      const avatarResponse = await getAvatarDateResponse(
        avatar,
        selectedDater,
        useGameStore.getState().dateConversation || [],
        daterReaction1,
        'react',
        plotTwistAvatarMood // Pass emotional state for plot twist reaction
      )
      
      const avatarMood = plotTwistAvatarMood
      setAvatarEmotion(avatarMood)
      setAvatarBubble(avatarResponse)
      addDateMessage('avatar', avatarResponse)
      syncConversationToPartyKit(avatarResponse, undefined)
      if (partyClient && isHost) {
        partyClient.syncState({ avatarEmotion: avatarMood })
      }
      
      // Wait for Avatar to finish
      await waitForAllAudio()
      await new Promise(resolve => setTimeout(resolve, 2000))
      
      // ============ EXCHANGE 3: Maya continues processing - final thoughts ============
      console.log('🎭 Plot Twist Exchange 3: Maya continues her emotional processing')
      const continueContext = `Continue reacting to the PLOT TWIST. 
The avatar just ${winner.answer}. You already said: "${daterReaction1}"
Now continue processing your emotions - what does this mean for you and this date?
Are you more or less interested? Has this changed everything?
Give your final thoughts on this dramatic moment.`
      
      const daterReaction2 = await getDaterDateResponse(
        selectedDater,
        avatar,
        useGameStore.getState().dateConversation || [],
        continueContext,
        null,
        { positive: 0, negative: 0 },
        false,
        false, // not first impressions
        plotTwistCompat // Pass current compatibility
      )
      
      // Update dater's emotion for final thoughts - could shift based on processing
      const finalPlotTwistMood = winner.answer.toLowerCase().includes('nothing') ? 'uncomfortable' :
                                 winner.answer.toLowerCase().includes('punch') ||
                                 winner.answer.toLowerCase().includes('fight') ? 'worried' : 'happy'
      setDaterEmotion(finalPlotTwistMood)
      setDaterBubble(daterReaction2)
      addDateMessage('dater', daterReaction2)
      syncConversationToPartyKit(undefined, daterReaction2)
      if (partyClient && isHost) {
        partyClient.syncState({ daterEmotion: finalPlotTwistMood })
      }
      
      // Avatar reacts to Maya's final feelings
      const avatarFinalMood = finalPlotTwistMood === 'happy' ? 'happy' : 
                              finalPlotTwistMood === 'worried' ? 'nervous' : 'worried'
      setAvatarEmotion(avatarFinalMood)
      if (partyClient && isHost) {
        partyClient.syncState({ avatarEmotion: avatarFinalMood })
      }
      
      // Wait for all audio to complete before transitioning
      console.log('⏳ Waiting for plot twist audio to complete...')
      await waitForAllAudio()
      console.log('✅ Plot twist audio complete')
      
      // Longer pause to let the moment sink in - this is important!
      await new Promise(resolve => setTimeout(resolve, 4000))
      
    } catch (error) {
      console.error('Error generating plot twist reaction:', error)
      setDaterBubble("Well, THAT was unexpected! I... I don't even know what to say right now.")
      await waitForAllAudio()
      await new Promise(resolve => setTimeout(resolve, 3000))
    }
    
    setIsGenerating(false)
    finishPlotTwist()
  }
  
  // Finish plot twist and continue to next round
  const finishPlotTwist = () => {
    if (!isHost) return
    
    console.log('🎭 Plot Twist complete - continuing to Round 4')
    
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
    setPhaseTimer(45) // Start timer immediately
    
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
    
    console.log('🎰 Starting answer selection with', answers.length, 'answers')
    
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
      console.log('🤖 Grouping similar answers... question:', question, 'answers:', answers)
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
    const duration = 6000 // 6 seconds for longer, more dramatic spin
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
    
    // Show winner popup and apply the attribute
    setWinnerText(winningText)
    setShowWinnerPopup(true)
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
        showWinnerPopup: true,
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
    
    // After 3 seconds, hide popup and start conversation
    setTimeout(() => {
      setShowWinnerPopup(false)
      if (partyClient) {
        partyClient.syncState({ showWinnerPopup: false })
      }
      setTimeout(() => generateDateConversation(winningText), 100)
    }, 3000)
  }
  
  // ============================================
  // END ANSWER SELECTION FUNCTIONS
  // ============================================
  
  const handleChatSubmit = async (e) => {
    e.preventDefault()
    if (!chatInput.trim()) return
    
    const message = chatInput.trim()
    console.log('📝 handleChatSubmit called:', { message, livePhase, username, playerId, hasPartyClient: !!partyClient })
    
    // Helper to truncate long messages
    const truncate = (text, max = 40) => text.length > max ? text.slice(0, max) + '...' : text
    
    // In Phase 1, treat messages as attribute suggestions
    if (livePhase === 'phase1') {
      console.log('📝 Phase 1 - submitting attribute suggestion')
      
      // Submit via PartyKit if available, otherwise local only
      if (partyClient) {
        console.log('📝 Submitting via PartyKit:', { text: message, username, odId: playerId })
        partyClient.submitAttribute(message, username, playerId)
        // Also show in local chat immediately for feedback
        addPlayerChatMessage(username, `💡 ${truncate(message, 35)}`)
      } else {
        console.log('📝 No partyClient, submitting locally')
        submitAttributeSuggestion(message, username)
        addPlayerChatMessage(username, `💡 ${truncate(message, 35)}`)
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
  
  const formatTime = (seconds) => {
    return `0:${seconds.toString().padStart(2, '0')}`
  }
  
  const getPhaseTitle = () => {
    switch (livePhase) {
      case 'reaction': return { line1: '👋 FIRST', line2: 'Impressions', line3: '' }
      case 'phase1': return { line1: 'PHASE 1', line2: 'Submit', line3: 'Answers' }
      case 'answer-selection': return { line1: '🎲', line2: 'Selecting', line3: 'Answer' }
      case 'phase3': return { line1: 'PHASE 3', line2: 'Watch', line3: 'the Date' }
      case 'plot-twist': return { line1: '🎭 PLOT', line2: 'Twist!', line3: '' }
      case 'ended': return { line1: 'DONE', line2: 'Date', line3: 'Over' }
      default: return { line1: '', line2: '', line3: '' }
    }
  }
  
  const getPhaseInstructions = () => {
    switch (livePhase) {
      case 'reaction': return 'Watch them meet!'
      case 'phase1': 
        if (phaseTimer <= 0 && suggestedAttributes.length === 0) {
          return '⏳ Waiting for an answer...'
        }
        return 'Submit an answer!'
      case 'answer-selection': return 'Selecting an answer...'
      case 'phase3': return 'Chat with other players'
      case 'plot-twist': return 'What do you do?'
      default: return ''
    }
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
                  <h1 className="starting-stats-title">🎲 Create Your Dater</h1>
                  <div className="starting-stats-progress">
                    Question {(startingStats.questionAssignments?.findIndex(
                      a => a.playerId === startingStats.activePlayerId && 
                           a.questionType === startingStats.currentQuestionType
                    ) || 0) + 1} of {startingStats.questionAssignments?.length || 6}
                  </div>
                </div>
                
                <div className="starting-stats-timer-bar">
                  <div 
                    className="starting-stats-timer-fill"
                    style={{ width: `${(startingStatsTimer / 15) * 100}%` }}
                  />
                  <span className="starting-stats-timer-text">{startingStatsTimer}s</span>
                </div>
                
                {/* Show who's answering and the question */}
                <div className="starting-stats-question-area">
                  <div className="question-type-badge">
                    {startingStats.currentQuestionType === 'physical' && '👤 Your Physical Trait'}
                    {startingStats.currentQuestionType === 'emotional' && '💭 Your Emotional State'}
                    {startingStats.currentQuestionType === 'name' && '📛 Your Name'}
                  </div>
                  
                  <div className="active-player-indicator">
                    {startingStats.activePlayerId === playerId ? (
                      <span className="your-turn">✨ Your Turn!</span>
                    ) : (
                      <span className="waiting-for">{startingStats.activePlayerName || 'Someone'} is answering...</span>
                    )}
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
                            ? "e.g., 'has glowing red eyes'" 
                            : startingStats.currentQuestionType === 'emotional'
                            ? "e.g., 'nervous and sweaty'"
                            : "e.g., 'Gerald'"
                        }
                        disabled={hasSubmittedStartingStat}
                        autoFocus
                      />
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
                
                {/* Show submitted answers */}
                {startingStats.answers && startingStats.answers.length > 0 && (
                  <div className="starting-stats-answers">
                    <h3 className="answers-title">Avatar So Far:</h3>
                    <div className="answers-list">
                      {startingStats.answers.map((answer, i) => (
                        <div key={i} className={`answer-item answer-${answer.questionType}`}>
                          <span className="answer-type">
                            {answer.questionType === 'physical' && '👤'}
                            {answer.questionType === 'emotional' && '💭'}
                            {answer.questionType === 'name' && '📛'}
                          </span>
                          <span className="answer-text">{answer.answer}</span>
                          <span className="answer-by">- {answer.playerName}</span>
                        </div>
                      ))}
                    </div>
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
                
                <div className="plot-twist-timer-bar">
                  <div 
                    className="plot-twist-timer-fill"
                    style={{ width: `${(plotTwist.timer / 15) * 100}%` }}
                  />
                  <span className="plot-twist-timer-text">{plotTwist.timer}s</span>
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
                    <span>Answer submitted! Waiting for others...</span>
                  </div>
                )}
                
                <div className="plot-twist-answer-count">
                  {plotTwist.answers?.length || 0} / {players.length} players answered
                </div>
              </div>
            )}
            
            {/* Spinning Phase - Wheel selection (replaces reveal and animation) */}
            {plotTwist.subPhase === 'spinning' && (
              <div className="plot-twist-wheel-phase">
                <div className="plot-twist-badge spinning">🎭 CHOOSING...</div>
                <h2 className="spinning-text">Spinning the wheel...</h2>
                
                {/* The Wheel */}
                {plotTwist.slices && plotTwist.slices.length > 0 && (
                  <div className="wheel-container plot-twist-wheel">
                    <div className="wheel-arrow">▼</div>
                    <svg 
                      className="answer-wheel" 
                      viewBox="0 0 200 200"
                      style={{ transform: `rotate(${plotTwist.spinAngle || 0}deg)` }}
                    >
                      {plotTwist.slices.map((slice, index) => {
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
            
            {/* Winner Phase - Announce the winner */}
            {plotTwist.subPhase === 'winner' && plotTwist.winningAnswer && (
              <motion.div 
                className="plot-twist-winner"
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', damping: 10 }}
              >
                <div className="winner-confetti">🎉</div>
                <div className="plot-twist-badge winner">🏆 WINNER!</div>
                <div className="winner-answer-card">
                  <span className="winner-answer">"{plotTwist.winningAnswer.answer}"</span>
                  <span className="winner-by">by {plotTwist.winningAnswer.username}</span>
                </div>
              </motion.div>
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
                  {plotTwist.summary || 'Something dramatic happened...'}
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
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 1.5 }}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      See {selectedDater?.name || 'Maya'}'s Reaction →
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
              <h1 className="end-game-title">
                {compatibility >= 70 ? '💕 Great Date!' : 
                 compatibility >= 40 ? '😐 It Was... Okay' : 
                 '💔 Total Disaster'}
              </h1>
              <div className="end-game-compatibility">
                <span className="compat-final">{compatibility}%</span>
                <span className="compat-label">Compatibility</span>
              </div>
              
              {/* Breakdown of what happened */}
              <div className="end-game-breakdown">
                <h2>What Happened:</h2>
                <div className="breakdown-list">
                  {isGeneratingBreakdown ? (
                    <p className="no-impacts">Recapping the date...</p>
                  ) : breakdownSentences.length > 0 ? (
                    breakdownSentences.map((sentence, index) => (
                      <motion.div 
                        key={index}
                        className="breakdown-item conversational"
                        initial={{ x: -20, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        transition={{ delay: 0.5 + (index * 0.3) }}
                      >
                        <span className="breakdown-text">{sentence}</span>
                      </motion.div>
                    ))
                  ) : compatibilityHistory.length === 0 ? (
                    <p className="no-impacts">The date was uneventful...</p>
                  ) : (
                    <p className="no-impacts">Loading recap...</p>
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
      <div className={`live-header ${showTutorial && getTutorialContent().highlight === 'compatibility' ? 'tutorial-highlight' : ''}`}>
        <div className="header-row header-centered">
          {/* Centered: Round indicator + Phase description */}
          <div 
            className="header-center-content"
            onClick={() => {
              if (isHost) setShowLLMDebug(!showLLMDebug)
              setShowSentimentDebug(!showSentimentDebug)
            }}
            style={{ cursor: 'pointer' }}
            title="Tap to toggle debug info"
          >
            <div className="round-indicator">
              <span className="round-label">{livePhase === 'reaction' ? 'Intro' : livePhase === 'plot-twist' ? 'Plot Twist' : 'Round'}</span>
              <span className="round-value">
                {livePhase === 'reaction' ? '👋' : livePhase === 'plot-twist' ? '🎭' : `${cycleCount + 1}/${maxCycles}`}
              </span>
            </div>
            <div className="header-cta">
              <span className="cta-line1">{getPhaseTitle().line1}</span>
              <span className="cta-line2">{getPhaseTitle().line2}</span>
              <span className="cta-line3">{getPhaseTitle().line3}</span>
            </div>
          </div>
        </div>
        
        {/* Hidden Info Popup (Round count + Dater Values) */}
        <AnimatePresence>
          {showDaterValuesPopup && (
            <motion.div 
              className="dater-values-popup"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              onClick={() => setShowDaterValuesPopup(false)}
            >
              <div className="popup-round-info">
                📊 Round {cycleCount + 1} of {maxCycles}
              </div>
              <h4>🕵️ {selectedDater?.name}'s Hidden Values</h4>
              <div className="values-grid">
                <div className="value-column loves">
                  <span className="value-header">❤️ Loves</span>
                  {(daterValues?.loves || []).map((v, i) => <span key={i}>{v}</span>)}
                </div>
                <div className="value-column likes">
                  <span className="value-header">👍 Likes</span>
                  {(daterValues?.likes || []).map((v, i) => <span key={i}>{v}</span>)}
                </div>
                <div className="value-column dislikes">
                  <span className="value-header">👎 Dislikes</span>
                  {(daterValues?.dislikes || []).map((v, i) => <span key={i}>{v}</span>)}
                </div>
                <div className="value-column dealbreakers">
                  <span className="value-header">💀 Dealbreakers</span>
                  {(daterValues?.dealbreakers || []).map((v, i) => <span key={i}>{v}</span>)}
                </div>
              </div>
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
      
      {/* Reaction Feedback - Shows when date reacts to something */}
      <AnimatePresence>
        {reactionFeedback && (
          <motion.div 
            className={`reaction-feedback ${reactionFeedback.category}`}
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
          >
            {reactionFeedback.text}
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Sentiment Categories - Hidden by default, shown via phase label toggle */}
      {showSentimentDebug && (
        <div className="sentiment-bar">
          <div className="sentiment-category loves">
            <span className="category-label">✨ Loves</span>
            <div className="category-items">
              {(sentimentCategories?.loves || []).map((item, i) => (
                <span 
                  key={i} 
                  className={`sentiment-item ${glowingValues?.includes(item) ? 'glowing glowing-love' : ''}`}
                >
                  {item}
                </span>
              ))}
            </div>
          </div>
          <div className="sentiment-category likes">
            <span className="category-label">💛 Likes</span>
            <div className="category-items">
              {(sentimentCategories?.likes || []).map((item, i) => (
                <span 
                  key={i} 
                  className={`sentiment-item ${glowingValues?.includes(item) ? 'glowing glowing-like' : ''}`}
                >
                  {item}
                </span>
              ))}
            </div>
          </div>
          <div className="sentiment-category dislikes">
            <span className="category-label">😬 Dislikes</span>
            <div className="category-items">
              {(sentimentCategories?.dislikes || []).map((item, i) => (
                <span 
                  key={i} 
                  className={`sentiment-item ${glowingValues?.includes(item) ? 'glowing glowing-dislike' : ''}`}
                >
                  {item}
                </span>
              ))}
            </div>
          </div>
          <div className="sentiment-category dealbreakers">
            <span className="category-label">💔 Nope</span>
            <div className="category-items">
              {(sentimentCategories?.dealbreakers || []).map((item, i) => (
                <span 
                  key={i} 
                  className={`sentiment-item ${glowingValues?.includes(item) ? 'glowing glowing-dealbreaker' : ''}`}
                >
                  {item}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
      
      {/* Date Screen - Characters with Speech Bubbles */}
      <div className="date-screen">
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
        
        {/* Round Prompt Banner - Starts centered, animates to top */}
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
                {livePhase === 'phase1' && phaseTimer > 0 && (
                  <div className="round-prompt-timer">{formatTime(phaseTimer)}</div>
                )}
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
                
                {answerSelection.subPhase === 'winner' && answerSelection.winningSlice && (
                  <h2 className="winner-text">🎉 {answerSelection.winningSlice.label}!</h2>
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
                      {answerSelection.slices.map((slice, index) => {
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
                
                {/* Legend showing grouped answers */}
                {answerSelection.subPhase === 'winner' && answerSelection.winningSlice && (
                  <div className="wheel-winner-details">
                    <p className="winner-contributors">
                      Submitted by: {answerSelection.winningSlice.originalAnswers.map(a => a.submittedBy).join(', ')}
                    </p>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        
        {/* Winner Popup - Centered Modal */}
        <AnimatePresence>
          {showWinnerPopup && (
            <motion.div 
              className="winner-popup-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <motion.div 
                className="winner-popup"
                initial={{ scale: 0.5, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.8, opacity: 0 }}
                transition={{ type: "spring", damping: 15 }}
              >
                <span className="winner-emoji">🎉</span>
                <span className="winner-label">Winner!</span>
                <span className="winner-text">{winnerText}</span>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
        
        {/* Pre-generation Loading Indicator */}
        <AnimatePresence>
          {isPreGenerating && (
            <motion.div
              className="pre-generating-indicator"
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <span className="loading-heart">💕</span>
              <span className="loading-text">The conversation is heating up...</span>
            </motion.div>
          )}
        </AnimatePresence>
        
        {/* Conversation Bubbles Area - Both bubbles visible */}
        <div className="conversation-bubbles">
          <div className="bubble-column avatar-column">
            <AnimatePresence mode="wait">
              {avatarBubble && avatarBubbleReady && (
                <motion.div 
                  key={avatarBubble}
                  className="speech-bubble avatar-bubble"
                  initial={{ scale: 0.9, opacity: 0, y: 10 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  exit={{ scale: 0.9, opacity: 0, y: -10 }}
                >
                  <AnimatedText text={avatarBubble} emotion={avatarEmotion} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          
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
        
        {/* Characters - portraits change based on emotional state */}
        <div className="characters-container">
          <div className="character avatar-character">
            {portraitsReady ? (
              <img 
                src={getAvatarPortraitCached(avatarEmotion)}
                alt="You" 
                className="character-image"
              />
            ) : (
              <div className="character-image character-loading">🎭</div>
            )}
            <span className="character-name">{avatar?.name || 'Your Date'}</span>
          </div>
          
          <div className="character dater-character">
            {portraitsReady ? (
              <img 
                src={getMayaPortraitCached(daterEmotion)}
                alt={selectedDater?.name || 'Maya'} 
                className="character-image"
              />
            ) : (
              <div className="character-image character-loading">💕</div>
            )}
            <span className="character-name">{selectedDater?.name || 'Maya'}</span>
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
        {/* Debug: Show suggestion count during phase1 */}
        {livePhase === 'phase1' && (
          <div style={{ position: 'absolute', bottom: '5px', left: '5px', fontSize: '10px', color: 'rgba(255,255,255,0.3)' }}>
            Suggestions: {suggestedAttributes?.length || 0}
          </div>
        )}
      </div>
      
      {/* Chat Module */}
      <div className="chat-module">
        <div className="chat-header">
          <span className="chat-title">💬 Player Chat</span>
          <span className="chat-hint">{getPhaseInstructions()}</span>
        </div>
        
        <div className="chat-messages">
          {(playerChat || []).slice(-20).map((msg) => (
            <div 
              key={msg.id} 
              className={`chat-message ${msg.username === username ? 'own-message' : ''}`}
            >
              <span className="chat-username">{msg.username}:</span>
              <span className="chat-text">{msg.message}</span>
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>
        
        <form className="chat-input-form" onSubmit={handleChatSubmit}>
          <input
            type="text"
            className="chat-input"
            placeholder={livePhase === 'phase1' ? 'Type your answer...' : 'Chat...'}
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            maxLength={100}
          />
          <button type="submit" className="chat-send-btn">
            {livePhase === 'phase1' ? '✨' : '💬'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default LiveDateScene
