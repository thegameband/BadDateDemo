import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useGameStore } from '../store/gameStore'
import { getDaterDateResponse, getAvatarDateResponse, generateDaterValues, checkAttributeMatch, runAttributePromptChain } from '../services/llmService'
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
  const [isGenerating, setIsGenerating] = useState(false)
  const [userVote, setUserVote] = useState(null)
  const [showDaterValuesPopup, setShowDaterValuesPopup] = useState(false)
  const [usingFallback, setUsingFallback] = useState(false)
  const [showWinnerPopup, setShowWinnerPopup] = useState(false)
  const [winnerText, setWinnerText] = useState('')
  // Timer starts immediately when phase begins (no waiting for submissions)
  const [showPhaseAnnouncement, setShowPhaseAnnouncement] = useState(false)
  const [announcementPhase, setAnnouncementPhase] = useState('')
  const [reactionStreak, setReactionStreak] = useState({ positive: 0, negative: 0 }) // Track escalation
  
  // Starting Stats Mode state
  const [startingStatsInput, setStartingStatsInput] = useState('')
  const [startingStatsTimer, setStartingStatsTimer] = useState(15)
  const [hasSubmittedStartingStat, setHasSubmittedStartingStat] = useState(false)
  const startingStatsTimerRef = useRef(null)
  const lastActivePlayerRef = useRef(null)
  
  const chatEndRef = useRef(null)
  const phaseTimerRef = useRef(null)
  const lastPhaseRef = useRef('')
  const allVotedTriggeredRef = useRef(false) // Prevent multiple auto-advance triggers
  
  // Starting Stats question definitions
  const STARTING_STATS_QUESTIONS = [
    { type: 'physical', question: "What physical attribute would you like your date to have?" },
    { type: 'physical', question: "What physical attribute would you like your date to have?" },
    { type: 'physical', question: "What physical attribute would you like your date to have?" },
    { type: 'emotional', question: "What emotional state is your date in?" },
    { type: 'emotional', question: "What emotional state is your date in?" },
    { type: 'name', question: "What should we name your date?" },
  ]
  
  // Helper to sync conversation state via PartyKit (host only)
  const syncConversationToFirebase = async (avatarText, daterText, syncSentiments = false) => {
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
  }
  
  // Handle tutorial advancement (host only, syncs to Firebase)
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
      setLivePhase('phase1')
      // Sync to PartyKit
      if (partyClient) {
        partyClient.syncState( { 
          showTutorial: false, 
          tutorialStep: 0, 
          livePhase: 'phase1'
        })
      }
    }
  }
  
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
      
      // Sync suggestions
      if (state.suggestedAttributes) {
        console.log('🎉 Syncing suggestions:', state.suggestedAttributes)
        setSuggestedAttributes(state.suggestedAttributes)
      } else {
        setSuggestedAttributes([])
      }
      
      // Sync numbered attributes for voting
      if (state.numberedAttributes) {
        const numberedArray = state.numberedAttributes
        const votesMap = state.votes || {}
        const totalVotes = Object.keys(votesMap).length
        
        const numberedWithVotes = numberedArray.filter(attr => attr).map(attr => {
          const votersForThis = Object.entries(votesMap)
            .filter(([_, voteNum]) => voteNum === attr.number)
            .map(([odId, _]) => odId)
          
          return {
            ...attr,
            votes: votersForThis
          }
        })
        
        setNumberedAttributes(numberedWithVotes)
        
        // Auto-advance to Phase 3 if all players have voted (host only)
        if (isHost && state.phase === 'phase2' && players.length > 0 && totalVotes >= players.length && !allVotedTriggeredRef.current) {
          console.log('🎯 All players have voted! Auto-advancing to Phase 3')
          allVotedTriggeredRef.current = true
          
          const sortedByVotes = [...numberedWithVotes].sort((a, b) => b.votes.length - a.votes.length)
          const winningAttr = sortedByVotes[0]?.text || null
          
          if (winningAttr) {
            console.log('🏆 Winner:', winningAttr)
            setTimeout(async () => {
              const currentCompatibility = useGameStore.getState().compatibility
              
              setWinnerText(winningAttr)
              setShowWinnerPopup(true)
              applyWinningAttribute()
              setLivePhase('phase3')
              setPhaseTimer(0)
              
              // Sync via PartyKit
              if (partyClient) {
                partyClient.setPhase('phase3', 0)
                partyClient.setWinningAttribute(winningAttr)
                partyClient.setCompatibility(currentCompatibility)
                partyClient.clearSuggestions()
                partyClient.clearVotes()
              }
              
              setTimeout(() => {
                setShowWinnerPopup(false)
                setTimeout(() => generateDateConversation(winningAttr), 300)
              }, 5000)
            }, 500)
          }
        }
      }
      
      // Sync compatibility
      if (typeof state.compatibility === 'number') {
        setCompatibility(state.compatibility)
      }
      
      // Sync winning attribute and show popup
      if (state.winningAttribute) {
        const previousWinnerText = winnerText
        setWinnerText(state.winningAttribute)
        
        if (!isHost && state.winningAttribute !== previousWinnerText && state.phase === 'phase3') {
          console.log('🏆 Non-host showing winner popup:', state.winningAttribute)
          setShowWinnerPopup(true)
          setTimeout(() => setShowWinnerPopup(false), 5000)
        }
      }
      
      // Sync phase
      if (state.phase) {
        console.log('🎉 Syncing phase:', state.phase)
        setLivePhase(state.phase)
        
        if (state.phase === 'ended' && !isHost) {
          console.log('🏁 Game ended - transitioning non-host to results')
          setTimeout(() => setPhase('results'), 2000)
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
      
      // Sync current question (non-hosts)
      if (state.daterBubble && !isHost) {
        setDaterBubble(state.daterBubble)
        const lastMessage = dateConversation[dateConversation.length - 1]
        if (dateConversation.length === 0 || lastMessage?.message !== state.daterBubble) {
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
      }
      } catch (error) {
        console.error('🎉 Error processing PartyKit state update:', error)
      }
    })
    
    return () => {
      unsubscribe()
    }
  }, [partyClient, roomCode, isHost, setSuggestedAttributes, setCompatibility, setLivePhase, setPhaseTimer, setPlayerChat, setNumberedAttributes, setShowTutorial, setTutorialStep, setPlayers])
  
  // Track timer value in a ref for the interval to access
  const phaseTimerValueRef = useRef(phaseTimer)
  useEffect(() => {
    phaseTimerValueRef.current = phaseTimer
  }, [phaseTimer])
  
  // Phase timer countdown - only host runs the timer, others sync from PartyKit
  // Timer starts immediately when phase begins
  useEffect(() => {
    // Only the host should run the timer
    if (!isHost && partyClient) return
    
    // Run timer during Phase 1, Phase 2, and Phase 3
    const shouldRunTimer = livePhase === 'phase1' || livePhase === 'phase2' || livePhase === 'phase3'
    
    if (shouldRunTimer) {
      phaseTimerRef.current = setInterval(async () => {
        const currentTime = phaseTimerValueRef.current
        const newTime = currentTime - 1
        if (newTime >= 0) {
          setPhaseTimer(newTime)
          // Sync timer to Firebase for other players every second
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
    // Only trigger once when timer reaches 0
    if (phaseTimer === 0 && (livePhase === 'phase1' || livePhase === 'phase2')) {
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
      console.log('🎲 Firebase not ready or no room code')
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
    
    // Build question assignments based on available players
    const availablePlayers = [...players]
    const assignments = []
    const playerQuestionCount = {} // Track how many of each type each player has answered
    
    // Shuffle players for randomness
    const shuffledPlayers = availablePlayers.sort(() => Math.random() - 0.5)
    
    // Assign questions - 3 physical, 2 emotional, 1 name
    for (let i = 0; i < STARTING_STATS_QUESTIONS.length; i++) {
      const questionDef = STARTING_STATS_QUESTIONS[i]
      
      // Find a player who hasn't answered this type of question yet
      let assignedPlayer = null
      for (const player of shuffledPlayers) {
        const key = `${player.id}-${questionDef.type}`
        if (!playerQuestionCount[key]) {
          assignedPlayer = player
          playerQuestionCount[key] = true
          break
        }
      }
      
      // If all players have answered this type, skip this question
      if (!assignedPlayer && shuffledPlayers.length > 0) {
        // If fewer than 6 players, just cycle through but skip duplicates
        console.log(`⏭️ Skipping question ${i} (${questionDef.type}) - all players have answered this type`)
        continue
      }
      
      if (assignedPlayer) {
        assignments.push({
          questionIndex: i,
          playerId: assignedPlayer.id,
          playerName: assignedPlayer.username,
          questionType: questionDef.type,
          question: questionDef.question,
        })
      }
    }
    
    // Make sure we have at least one assignment
    if (assignments.length === 0) {
      console.error('🎲 No question assignments created! Players:', players)
      // Fallback: skip to phase1
      setLivePhase('phase1')
      setPhaseTimer(30)
      if (partyClient) {
        partyClient.syncState( { livePhase: 'phase1', phaseTimer: 30 })
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
      timer: 15,
      answers: [],
    }
    
    setStartingStats(newStartingStats)
    setStartingStatsTimer(15)
    setHasSubmittedStartingStat(false)
    setStartingStatsInput('')
    lastActivePlayerRef.current = firstAssignment.playerId
    
    // Sync to PartyKit
    partyClient.syncState( { 
      startingStats: newStartingStats,
      livePhase: 'starting-stats' // Ensure phase is synced
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
    if (!isHost) return
    
    // Guard: check phase is still starting-stats
    const currentPhase = useGameStore.getState().livePhase
    if (currentPhase !== 'starting-stats') {
      console.log('⏭️ moveToNextStartingStatsQuestion skipped - phase is:', currentPhase)
      return
    }
    
    const currentStats = useGameStore.getState().startingStats
    if (!currentStats) return
    
    const assignments = currentStats.questionAssignments || []
    
    // Use currentQuestionIndex if available, otherwise find by active player
    let currentIndex = currentStats.currentQuestionIndex
    if (typeof currentIndex !== 'number' || currentIndex < 0) {
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
      timer: 15,
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
    
    // Sync to PartyKit
    if (partyClient) {
      partyClient.syncState({ startingStats: newStats })
    }
    
    console.log('📝 Starting Stats answer submitted:', newAnswer)
    
    // If host, move to next question immediately
    if (isHost) {
      // Use setTimeout(0) to ensure state updates are processed first
      setTimeout(() => {
        const phase = useGameStore.getState().livePhase
        if (phase === 'starting-stats') {
          moveToNextStartingStatsQuestion()
        }
      }, 0)
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
    
    console.log('🎉 Starting Stats complete! Applying attributes...')
    
    const currentStats = useGameStore.getState().startingStats
    const answers = currentStats.answers || []
    
    // Extract attributes by type
    const physicalAttrs = answers.filter(a => a.questionType === 'physical').map(a => a.answer)
    const emotionalAttrs = answers.filter(a => a.questionType === 'emotional').map(a => a.answer)
    const nameAnswer = answers.find(a => a.questionType === 'name')
    
    // Combine all attributes
    const allAttributes = [
      ...physicalAttrs,
      ...emotionalAttrs.map(e => `emotionally ${e}`),
    ]
    
    // Set avatar name if provided
    if (nameAnswer) {
      setAvatarName(nameAnswer.answer)
    }
    
    // Add all attributes to the avatar
    const currentAvatar = useGameStore.getState().avatar
    const updatedAvatar = {
      ...currentAvatar,
      name: nameAnswer?.answer || currentAvatar.name,
      attributes: [...(currentAvatar.attributes || []), ...allAttributes],
    }
    useGameStore.setState({ avatar: updatedAvatar })
    
    // Transition to REACTION ROUND - dater reacts to all starting stats
    setLivePhase('reaction')
    setPhaseTimer(0) // No timer for reaction round - it's driven by conversation
    
    // Sync to PartyKit
    if (partyClient) {
      partyClient.syncState( {
        livePhase: 'reaction',
        phaseTimer: 0,
        avatar: updatedAvatar,
        startingStatsComplete: true,
        initialStartingStatsAttributes: allAttributes,
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
        false
      )
      
      if (daterReaction1) {
        setDaterBubble(daterReaction1)
        addDateMessage('dater', daterReaction1)
        await syncConversationToFirebase(undefined, daterReaction1, false)
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
          }
        }
      }
      await syncConversationToFirebase(undefined, undefined, true)
      
      // SHORTER DELAY - quick back and forth
      await new Promise(resolve => setTimeout(resolve, 1500))
      
      // === STEP 2: Avatar responds, EMPHASIZING their EMOTIONAL state ===
      console.log('💭 Avatar responding with emotional state:', emotionalList)
      
      const avatarIntro = await getAvatarDateResponse(
        currentAvatar,
        selectedDater,
        [{ speaker: 'dater', message: daterReaction1 }],
        emotionalList, // Pass emotional attributes as the focus
        'introduce-emotional' // Special mode emphasizing emotional state
      )
      
      if (avatarIntro) {
        setAvatarBubble(avatarIntro)
        addDateMessage('avatar', avatarIntro)
        await syncConversationToFirebase(avatarIntro, undefined, false)
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
          }
        }
      }
      await syncConversationToFirebase(undefined, undefined, true)
      
      await new Promise(resolve => setTimeout(resolve, 2000))
      
      // === STEP 3: Dater responds to what the Avatar said ===
      console.log('💬 Dater responding to avatar')
      
      const daterReaction2 = await getDaterDateResponse(
        selectedDater,
        currentAvatar,
        [
          { speaker: 'dater', message: daterReaction1 },
          { speaker: 'avatar', message: avatarIntro }
        ],
        null,
        null,
        reactionStreak,
        false
      )
      
      if (daterReaction2) {
        setDaterBubble(daterReaction2)
        addDateMessage('dater', daterReaction2)
        await syncConversationToFirebase(undefined, daterReaction2, false)
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
    console.log('✅ Reaction round complete, starting Phase 1')
    
    // Generate the opening question for Phase 1
    const openingLine = getOpeningLine()
    
    // Get current compatibility to preserve it
    const currentCompatibility = useGameStore.getState().compatibility
    console.log('💯 Preserving compatibility:', currentCompatibility)
    
    setLivePhase('phase1')
    setPhaseTimer(30)
    setDaterBubble(openingLine)
    setAvatarBubble('') // Clear avatar bubble
    addDateMessage('dater', openingLine)
    
    if (partyClient) {
      partyClient.syncState( {
        livePhase: 'phase1',
        phaseTimer: 30,
        reactionRoundComplete: true,
        currentQuestion: openingLine,
        daterBubble: openingLine,
        avatarBubble: '',
        compatibility: currentCompatibility, // IMPORTANT: Preserve compatibility!
      })
    }
    
    console.log('❓ Dater asks:', openingLine)
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
  
  // Start Phase 1 - Dater asks Avatar about themselves
  // Only HOST generates questions; non-hosts receive via PartyKit
  useEffect(() => {
    const initPhase1 = async () => {
      if (livePhase === 'phase1' && dateConversation.length === 0) {
        // Only host generates the question
        if (isHost) {
          const openingLine = getOpeningLine()
          setDaterBubble(openingLine)
          setAvatarBubble('') // Clear avatar bubble
          addDateMessage('dater', openingLine)
          
          // Sync question and state to Firebase for other players
          // NOTE: Don't reset compatibility here - it's already set in startLiveDate
          if (partyClient) {
            partyClient.syncState( { 
              livePhase: 'phase1', 
              phaseTimer: 30,
              currentQuestion: openingLine,
              daterBubble: openingLine, // Sync dater bubble to match question
              avatarBubble: '' // Clear avatar bubble
            })
          }
        }
        // Non-hosts will receive the question via PartyKit subscription
      }
    }
    initPhase1()
  }, [livePhase, isHost, partyClient, roomCode])
  
  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [playerChat])
  
  // Show phase announcement when phase changes
  useEffect(() => {
    // Don't show announcement for starting-stats (it has its own overlay) or ended
    const skipAnnouncement = ['starting-stats', 'ended', 'waiting']
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
        return { title: 'FIRST IMPRESSIONS', subtitle: 'Meeting Your Date', icon: '👋', description: 'Watch them meet for the first time!' }
      case 'phase1':
        return { title: 'PHASE 1', subtitle: 'Submit Answers', icon: '✨', description: 'Type an answer for your Avatar!' }
      case 'phase2':
        return { title: 'PHASE 2', subtitle: 'Vote', icon: '🗳️', description: 'Pick the best answer!' }
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
  
  // Questions for the FIRST round only (simple, open-ended icebreakers)
  const firstRoundQuestions = [
    "Tell me something about yourself that would surprise me.",
    "What do you like to do for fun?",
    "What are you looking for in a partner?",
  ]
  
  // ALL questions available for rounds 2-5
  const laterRoundQuestions = [
    "Tell me something about yourself that would surprise me.",
    "What's the most spontaneous thing you've ever done?",
    "What are you looking for in a partner?",
    "What do you think makes a good connection?",
    "What do you like to do for fun?",
    "What's your favorite way to spend a weekend?",
    "If you could travel anywhere tomorrow, where would you go?",
    "What's something you're really passionate about?",
    "Do you have any hidden talents?",
  ]
  
  // Track which questions have been used this session
  const usedQuestionsRef = useRef(new Set())
  
  const getOpeningLine = () => {
    // Use first round questions for round 1, all questions for later rounds
    const isFirstRound = cycleCount === 0
    const questionPool = isFirstRound ? firstRoundQuestions : laterRoundQuestions
    
    // Get unused questions from the appropriate pool
    const unusedQuestions = questionPool.filter(q => !usedQuestionsRef.current.has(q))
    
    // If all used, reset and pick from pool
    if (unusedQuestions.length === 0) {
      usedQuestionsRef.current.clear()
      const randomQuestion = questionPool[Math.floor(Math.random() * questionPool.length)]
      usedQuestionsRef.current.add(randomQuestion)
      return randomQuestion
    }
    
    // Pick a random unused question
    const randomQuestion = unusedQuestions[Math.floor(Math.random() * unusedQuestions.length)]
    usedQuestionsRef.current.add(randomQuestion)
    return randomQuestion
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
        // Move to Phase 2 - voting
        // Create numbered attributes from suggestions (with safeguards)
        console.log('📋 Processing suggestions for voting:', suggestedAttributes)
        const numbered = suggestedAttributes
          .filter(attr => attr && (attr.text || typeof attr === 'string'))
          .map((attr, index) => ({
            number: index + 1,
            text: typeof attr === 'string' ? attr : (attr.text || 'Unknown'),
            submittedBy: attr.username || 'Anonymous',
            votes: []
          }))
        setNumberedAttributes(numbered)
        setLivePhase('phase2')
        setPhaseTimer(30)
        setUserVote(null)
        allVotedTriggeredRef.current = false // Reset for new voting round
        
        // Sync to PartyKit - include numbered attributes AND compatibility
        if (partyClient) {
          partyClient.syncState( { 
            livePhase: 'phase2', 
            phaseTimer: 30,
            numberedAttributes: numbered,
            compatibility: currentCompatibility // PRESERVE!
          })
        }
        break
        
      case 'phase2':
        // Move to Phase 3 - show winner popup first, then run conversation
        const winningAttr = getWinningAttributeText()
        if (winningAttr) {
          // Show the winner popup
          setWinnerText(winningAttr)
          setShowWinnerPopup(true)
          applyWinningAttribute()
          setLivePhase('phase3')
          setPhaseTimer(0)
          
          // Sync to PartyKit - include compatibility
          if (partyClient) {
            partyClient.syncState( { 
              livePhase: 'phase3', 
              phaseTimer: 0, 
              winningAttribute: winningAttr,
              compatibility: currentCompatibility // PRESERVE!
            })
            await clearSuggestions(roomCode)
            await clearVotes(roomCode)
          }
          
          // After 5 seconds, hide popup and start conversation
          setTimeout(() => {
            setShowWinnerPopup(false)
            setTimeout(() => generateDateConversation(winningAttr), 300)
          }, 5000)
        }
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
  
  // Generate the full Phase 3 conversation flow
  // Exchange 1: Avatar answers question (1x scoring)
  // Exchange 2: Avatar continues conversation (0.25x scoring)
  // Exchange 3: Avatar continues again (0.10x scoring)
  // ONLY HOST should run this - non-hosts receive updates via PartyKit
  const generateDateConversation = async (currentAttribute) => {
    if (!isHost) {
      console.log('Non-host skipping generateDateConversation')
      return
    }
    if (isGenerating || !selectedDater) return
    
    const attrToUse = currentAttribute || latestAttribute
    if (!attrToUse) {
      console.log('No attribute to respond to')
      return
    }
    
    setIsGenerating(true)
    
    // Check if this is the final round (cycleCount is 0-indexed, so last round is maxCycles - 1)
    const isFinalRound = cycleCount >= maxCycles - 1
    console.log(`🏁 Round ${cycleCount + 1}/${maxCycles} - Final round: ${isFinalRound}`)
    
    // IMPORTANT: Create avatar with the new attribute included
    // (React state might not have updated yet due to async nature)
    const avatarWithNewAttr = {
      ...avatar,
      attributes: avatar.attributes.includes(attrToUse) 
        ? avatar.attributes 
        : [...avatar.attributes, attrToUse]
    }
    
    console.log('🎯 generateDateConversation called with:', {
      attrToUse,
      avatarAttributes: avatarWithNewAttr.attributes,
      hasNewAttr: avatarWithNewAttr.attributes.includes(attrToUse)
    })
    
    try {
      // Track current streak for escalation
      let currentStreak = { ...reactionStreak }
      
      // Helper to check match, apply scoring, and update streak
      const checkAndScore = async (avatarMessage, multiplier) => {
        const matchResult = await checkAttributeMatch(avatarMessage, daterValues, selectedDater, null)
        if (matchResult.category) {
          console.log(`Attribute matched (${multiplier}x):`, matchResult)
          const wasAlreadyExposed = exposeValue(matchResult.category, matchResult.matchedValue, matchResult.shortLabel)
          if (wasAlreadyExposed) {
            triggerGlow(matchResult.shortLabel)
          }
          const baseChanges = { loves: 25, likes: 10, dislikes: -10, dealbreakers: -25 }
          const change = Math.round(baseChanges[matchResult.category] * multiplier)
          if (change !== 0) {
            const newCompat = adjustCompatibility(change)
            console.log(`Compatibility ${change > 0 ? '+' : ''}${change}% (${matchResult.category}: ${matchResult.shortLabel}, ${multiplier}x)`)
            // Sync compatibility to Firebase
            if (partyClient) {
              partyClient.syncState( { compatibility: newCompat })
            }
          }
          
          // Update streak for escalating reactions
          const isPositive = matchResult.category === 'loves' || matchResult.category === 'likes'
          if (isPositive) {
            currentStreak = { positive: currentStreak.positive + 1, negative: 0 }
          } else {
            currentStreak = { positive: 0, negative: currentStreak.negative + 1 }
          }
          console.log(`🔥 Reaction streak updated:`, currentStreak)
        }
        return matchResult.category // Return the category so Dater can react appropriately
      }
      
      // Helper to get fresh conversation history (React state may be stale in async function)
      const getConversation = () => useGameStore.getState().dateConversation
      
      // ============ EXCHANGE 1: Avatar answers with new attribute (1x scoring) ============
      // Using the new PROMPT CHAIN SYSTEM for modular, cleaner prompts
      console.log('--- Exchange 1: Avatar answers with new attribute (PROMPT CHAIN) ---')
      
      // Get the last thing the dater said for context
      const lastDaterMessage = getConversation()
        .slice(-10)
        .reverse()
        .find(msg => msg.speaker === 'dater')?.message || ''
      
      // Run the full prompt chain: Avatar responds, then Dater reacts
      const { avatarResponse: avatarResponse1, daterResponse: daterReaction1, visibility } = await runAttributePromptChain(
        avatarWithNewAttr,
        selectedDater,
        attrToUse,
        getConversation().slice(-10)
      )
      
      console.log('🔗 Prompt chain result:', { avatarResponse1, daterReaction1, visibility })
      
      if (avatarResponse1) {
        setAvatarBubble(avatarResponse1)
        addDateMessage('avatar', avatarResponse1)
        await syncConversationToFirebase(avatarResponse1, undefined, undefined)
        
        await new Promise(resolve => setTimeout(resolve, 2500))
        
        // Check match FIRST to know how Dater should react
        const sentimentHit1 = await checkAndScore(avatarResponse1, 1) // Full scoring
        // Sync sentiment categories after scoring
        await syncConversationToFirebase(undefined, undefined, true)
        
        // Use the dater reaction from the prompt chain
        if (daterReaction1) {
          setDaterBubble(daterReaction1)
          addDateMessage('dater', daterReaction1)
          await syncConversationToFirebase(undefined, daterReaction1, undefined)
        }
        
        await new Promise(resolve => setTimeout(resolve, 3000))
        
        // ============ EXCHANGE 2: Avatar responds to Dater's reaction (0.25x scoring) ============
        console.log('--- Exchange 2: Avatar responds to Dater reaction ---')
        
        const avatarResponse2 = await getAvatarDateResponse(
          avatarWithNewAttr,
          selectedDater,
          getConversation().slice(-10), // Fresh state already includes recent messages
          attrToUse, // Pass the latest attribute for context
          'react' // Mode: responding to what the Dater just said
        )
        
        if (avatarResponse2) {
          setAvatarBubble(avatarResponse2)
          addDateMessage('avatar', avatarResponse2)
          await syncConversationToFirebase(avatarResponse2, undefined, undefined)
          
          await new Promise(resolve => setTimeout(resolve, 2500))
          
          // Check match FIRST
          const sentimentHit2 = await checkAndScore(avatarResponse2, 0.25) // 25% scoring
          await syncConversationToFirebase(undefined, undefined, true)
          
          // Dater reacts - informed by sentiment and escalating streak
          const daterReaction2 = await getDaterDateResponse(
            selectedDater,
            avatarWithNewAttr,
            getConversation().slice(-10), // Fresh state already includes recent messages
            null,
            sentimentHit2,
            currentStreak, // Pass streak for escalating reactions
            isFinalRound // Pass if this is the last round for finality
          )
          
          if (daterReaction2) {
            setDaterBubble(daterReaction2)
            addDateMessage('dater', daterReaction2)
            await syncConversationToFirebase(undefined, daterReaction2, undefined)
          }
          
          await new Promise(resolve => setTimeout(resolve, 3000))
          
          // ============ EXCHANGE 3: Avatar connects all traits (0.10x scoring) ============
          console.log('--- Exchange 3: Avatar connects all previous traits ---')
          
          const avatarResponse3 = await getAvatarDateResponse(
            avatarWithNewAttr,
            selectedDater,
            getConversation().slice(-10), // Fresh state already includes recent messages
            attrToUse, // Pass latest attribute for context
            'connect' // Mode: draw connections between ALL traits
          )
          
          if (avatarResponse3) {
            setAvatarBubble(avatarResponse3)
            addDateMessage('avatar', avatarResponse3)
            await syncConversationToFirebase(avatarResponse3, undefined, undefined)
            
            await new Promise(resolve => setTimeout(resolve, 2500))
            
            // Check match FIRST
            const sentimentHit3 = await checkAndScore(avatarResponse3, 0.10) // 10% scoring
            await syncConversationToFirebase(undefined, undefined, true)
            
            // Dater reacts - informed by sentiment and escalating streak
            const daterReaction3 = await getDaterDateResponse(
              selectedDater,
              avatarWithNewAttr,
              getConversation().slice(-10), // Fresh state already includes recent messages
              null,
              sentimentHit3,
              currentStreak, // Pass streak for escalating reactions
              isFinalRound // Pass if this is the last round for finality
            )
            
            if (daterReaction3) {
              setDaterBubble(daterReaction3)
              addDateMessage('dater', daterReaction3)
              await syncConversationToFirebase(undefined, daterReaction3, undefined)
            }
          }
        }
      }
      
      // Save the updated streak for next round
      setReactionStreak(currentStreak)
      console.log('🔥 Final streak for this round:', currentStreak)
      
      // After all 3 exchanges, give players 15 seconds to read the conversation before transitioning
      // This delay is NOT shown on the timer - it's a "reading time" pause
      console.log('💬 Conversation complete - 15 second reading pause before next phase')
      await new Promise(resolve => setTimeout(resolve, 15000))
      handleRoundComplete()
      
    } catch (error) {
      console.error('Error generating conversation:', error)
    }
    
    setIsGenerating(false)
  }
  
  // Handle round completion - check if we continue or end
  // ONLY HOST should run this - non-hosts receive state via PartyKit
  const handleRoundComplete = async () => {
    if (!isHost) {
      console.log('Non-host skipping handleRoundComplete')
      return
    }
    const newRoundCount = cycleCount + 1
    incrementCycle()
    
    console.log(`Round ${newRoundCount}/${maxCycles} complete`)
    
    if (newRoundCount >= maxCycles) {
      // Game over!
      setLivePhase('ended')
      if (partyClient) {
        partyClient.syncState( { livePhase: 'ended', compatibility })
      }
      setTimeout(() => setPhase('results'), 2000)
    } else {
      // Start new round - Dater asks another question (host only generates)
      setLivePhase('phase1')
      setPhaseTimer(30)
      
      // Only host generates the next question
      if (isHost) {
        const nextQuestion = getOpeningLine()
        setDaterBubble(nextQuestion)
        setAvatarBubble('')
        addDateMessage('dater', nextQuestion)
        
        // Clear previous round's suggestions
        setSuggestedAttributes([])
        setNumberedAttributes([])
        
        // Sync to PartyKit including the question and cleared state
        if (partyClient) {
          partyClient.syncState( { 
            livePhase: 'phase1', 
            phaseTimer: 30, 
            compatibility,
            currentQuestion: nextQuestion,
            daterBubble: nextQuestion, // Sync dater bubble to match question
            avatarBubble: '', // Clear avatar bubble for new round
            cycleCount: newRoundCount,
            suggestedAttributes: null, // Clear in Firebase
            numberedAttributes: null
          })
          await clearSuggestions(roomCode)
          await clearVotes(roomCode)
        }
      }
      // Non-hosts will receive the question via PartyKit subscription
    }
  }
  
  const handleChatSubmit = async (e) => {
    e.preventDefault()
    if (!chatInput.trim()) return
    
    const message = chatInput.trim()
    
    // Helper to truncate long messages
    const truncate = (text, max = 40) => text.length > max ? text.slice(0, max) + '...' : text
    
    // In Phase 1, treat messages as attribute suggestions
    if (livePhase === 'phase1') {
      const suggestion = {
        id: Date.now(),
        text: message,
        username: username
      }
      
      // Submit via PartyKit if available, otherwise local only
      if (partyClient) {
        partyClient.submitAttribute(message, username, playerId)
      } else {
        submitAttributeSuggestion(message, username)
        addPlayerChatMessage(username, `💡 ${truncate(message, 35)}`)
      }
    } 
    // In Phase 2, check if it's a vote
    else if (livePhase === 'phase2') {
      const num = parseInt(message)
      if (!isNaN(num) && num >= 1 && num <= numberedAttributes.length) {
        // Submit vote via PartyKit if available
        if (partyClient && playerId) {
          partyClient.vote(playerId, num)
        } else {
          voteForNumberedAttribute(num, username)
          addPlayerChatMessage(username, `Vote: #${num}`)
        }
        setUserVote(num)
      } else {
        if (partyClient) {
          await sendChatMessage(roomCode, { username, message: truncate(message) })
        } else {
          addPlayerChatMessage(username, truncate(message))
        }
      }
    }
    // Phase 3 - just regular chat
    else {
      if (partyClient) {
        await sendChatMessage(roomCode, { username, message: truncate(message) })
      } else {
        addPlayerChatMessage(username, truncate(message))
      }
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
      case 'phase2': return { line1: 'PHASE 2', line2: 'Vote', line3: '' }
      case 'phase3': return { line1: 'PHASE 3', line2: 'Watch', line3: 'the Date' }
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
      case 'phase2': return 'Vote for the best answer!'
      case 'phase3': return 'Chat with other players'
      default: return ''
    }
  }
  
  return (
    <div className="live-date-scene">
      {/* Phase Announcement Overlay */}
      <AnimatePresence>
        {showPhaseAnnouncement && (
          <motion.div 
            className="phase-announcement-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <motion.div 
              className="phase-announcement-card"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              transition={{ duration: 0.3, delay: 0.1 }}
            >
              <span className="phase-icon">{getPhaseAnnouncement().icon}</span>
              <h2 className="phase-title">{getPhaseAnnouncement().title}</h2>
              <h3 className="phase-subtitle">{getPhaseAnnouncement().subtitle}</h3>
              <p className="phase-description">{getPhaseAnnouncement().description}</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      
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
                  <h1 className="starting-stats-title">🎲 Create Your Date</h1>
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
                    {startingStats.currentQuestionType === 'physical' && '👤 Physical Attribute'}
                    {startingStats.currentQuestionType === 'emotional' && '💭 Emotional State'}
                    {startingStats.currentQuestionType === 'name' && '📛 Name Your Date'}
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
      
      {/* Fallback Mode Warning */}
      {usingFallback && (
        <div className="fallback-warning">
          ⚠️ NO API KEY - Using fallback responses (LLM not connected)
        </div>
      )}
      
      {/* Header Section - Compact horizontal layout */}
      <div className={`live-header ${showTutorial && getTutorialContent().highlight === 'compatibility' ? 'tutorial-highlight' : ''}`}>
        <div className="header-row">
          {/* Left: Call to Action */}
          <div className="header-cta">
            <span className="cta-line1">{getPhaseTitle().line1}</span>
            <span className="cta-line2">{getPhaseTitle().line2}</span>
            <span className="cta-line3">{getPhaseTitle().line3}</span>
          </div>
          
          {/* Center: Compatibility Meter */}
          <div className="compatibility-display">
            <div className="compat-meter">
              <div 
                className="compat-fill" 
                style={{ width: `${compatibility}%` }}
              />
            </div>
            <span className="compat-value">❤️ {compatibility}%</span>
          </div>
          
          {/* Right: Round + Timer */}
          <div className="header-right">
            <div className="round-indicator">
              <span className="round-label">{livePhase === 'reaction' ? 'Intro' : 'Round'}</span>
              <span className="round-value">
                {livePhase === 'reaction' ? '👋' : `${cycleCount + 1}/${maxCycles}`}
              </span>
            </div>
            <div 
              className="header-timer"
              onClick={() => setShowDaterValuesPopup(!showDaterValuesPopup)}
              style={{ cursor: 'pointer' }}
              title="Tap to see hidden info"
            >
              {phaseTimer > 0 && <span className="timer-value">{formatTime(phaseTimer)}</span>}
              {(livePhase === 'phase3' || livePhase === 'reaction') && <span className="timer-value">💬</span>}
              {phaseTimer <= 0 && livePhase !== 'phase3' && livePhase !== 'reaction' && <span className="timer-value">⏳</span>}
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
      </div>
      
      {/* Sentiment Categories */}
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
      
      {/* Date Screen - Characters with Speech Bubbles */}
      <div className="date-screen">
        {/* Phase 2 Overlay - Voting */}
        <AnimatePresence>
          {livePhase === 'phase2' && numberedAttributes.length > 0 && (
            <motion.div 
              className="voting-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <h3>Vote for an Answer!</h3>
              <div className="voting-options">
                {(numberedAttributes || []).map((attr) => (
                  <motion.div 
                    key={attr.number}
                    className={`vote-option ${userVote === attr.number ? 'voted' : ''}`}
                    onClick={async () => {
                      if (partyClient && playerId) {
                        partyClient.vote(playerId, attr.number)
                      } else {
                        voteForNumberedAttribute(attr.number, username)
                        addPlayerChatMessage(username, `Vote: #${attr.number}`)
                      }
                      setUserVote(attr.number)
                    }}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <span className="vote-number">{attr.number}</span>
                    <span className="vote-text">{attr.text}</span>
                    <span className="vote-count">{attr.votes?.length || 0} votes</span>
                  </motion.div>
                ))}
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
        
        {/* Conversation Bubbles Area - Both bubbles visible */}
        <div className="conversation-bubbles">
          <div className="bubble-column avatar-column">
            <AnimatePresence mode="wait">
              {avatarBubble && (
                <motion.div 
                  key={avatarBubble}
                  className="speech-bubble avatar-bubble"
                  initial={{ scale: 0.9, opacity: 0, y: 10 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  exit={{ scale: 0.9, opacity: 0, y: -10 }}
                >
                  {avatarBubble}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          
          <div className="bubble-column dater-column">
            <AnimatePresence mode="wait">
              {daterBubble && (
                <motion.div 
                  key={daterBubble}
                  className="speech-bubble dater-bubble"
                  initial={{ scale: 0.9, opacity: 0, y: 10 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  exit={{ scale: 0.9, opacity: 0, y: -10 }}
                >
                  {daterBubble}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
        
        {/* Characters */}
        <div className="characters-container">
          <div className="character avatar-character">
            <img 
              src="https://api.dicebear.com/7.x/avataaars/svg?seed=PlayerAvatar&backgroundColor=c0aede" 
              alt="You" 
              className="character-image"
            />
          </div>
          
          <div className="character dater-character">
            <img 
              src={selectedDater?.photo} 
              alt={selectedDater?.name} 
              className="character-image"
            />
          </div>
        </div>
        
        {/* Phase 1 suggestions display */}
        {livePhase === 'phase1' && (suggestedAttributes?.length || 0) > 0 && (
          <div className="suggestions-display">
            {(suggestedAttributes || []).slice(-5).map((attr, i) => (
              <motion.span 
                key={attr.id} 
                className="suggestion-chip"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
              >
                {attr.text}
              </motion.span>
            ))}
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
            placeholder={livePhase === 'phase1' ? 'Type your answer...' : livePhase === 'phase2' ? 'Enter # to vote...' : 'Chat...'}
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            maxLength={100}
          />
          <button type="submit" className="chat-send-btn">
            {livePhase === 'phase1' ? '✨' : livePhase === 'phase2' ? '🗳️' : '💬'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default LiveDateScene
