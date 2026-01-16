import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useGameStore } from '../store/gameStore'
import { getDaterDateResponse, getAvatarDateResponse, generateDaterValues, checkAttributeMatch } from '../services/llmService'
import { 
  isFirebaseAvailable, 
  subscribeToGameState, 
  subscribeToChat,
  submitAttribute as firebaseSubmitAttribute,
  submitVote as firebaseSubmitVote,
  sendChatMessage,
  updateGameState,
  clearSuggestions,
  clearVotes
} from '../services/firebase'
import './LiveDateScene.css'

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
  const setPlayerChat = useGameStore((state) => state.setPlayerChat)
  const setCompatibility = useGameStore((state) => state.setCompatibility)
  const setNumberedAttributes = useGameStore((state) => state.setNumberedAttributes)
  const showTutorial = useGameStore((state) => state.showTutorial)
  const tutorialStep = useGameStore((state) => state.tutorialStep)
  const setShowTutorial = useGameStore((state) => state.setShowTutorial)
  const setTutorialStep = useGameStore((state) => state.setTutorialStep)
  
  const [chatInput, setChatInput] = useState('')
  const [avatarBubble, setAvatarBubble] = useState('')
  const [daterBubble, setDaterBubble] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [userVote, setUserVote] = useState(null)
  const [showDaterValuesPopup, setShowDaterValuesPopup] = useState(false)
  const [usingFallback, setUsingFallback] = useState(false)
  const [showWinnerPopup, setShowWinnerPopup] = useState(false)
  const [winnerText, setWinnerText] = useState('')
  const [timerStarted, setTimerStarted] = useState(false) // Timer only runs after first submission
  const [showPhaseAnnouncement, setShowPhaseAnnouncement] = useState(false)
  const [announcementPhase, setAnnouncementPhase] = useState('')
  
  const chatEndRef = useRef(null)
  const phaseTimerRef = useRef(null)
  const lastPhaseRef = useRef('')
  
  // Handle tutorial advancement (host only, syncs to Firebase)
  const handleAdvanceTutorial = async () => {
    if (!isHost) return
    
    if (tutorialStep < 3) {
      const newStep = tutorialStep + 1
      setTutorialStep(newStep)
      // Sync to Firebase
      if (firebaseReady && roomCode) {
        await updateGameState(roomCode, { tutorialStep: newStep })
      }
    } else {
      // Tutorial complete - start the game
      setShowTutorial(false)
      setTutorialStep(0)
      setLivePhase('phase1')
      setTimerStarted(false) // Timer waits for first submission
      // Sync to Firebase
      if (firebaseReady && roomCode) {
        await updateGameState(roomCode, { 
          showTutorial: false, 
          tutorialStep: 0, 
          livePhase: 'phase1',
          timerStarted: false
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
  
  // Firebase state variable
  const [firebaseReady] = useState(isFirebaseAvailable())
  
  // Subscribe to Firebase game state (for all players to receive updates)
  useEffect(() => {
    if (!firebaseReady || !roomCode) return
    
    console.log('🔥 Setting up Firebase subscriptions for room:', roomCode, 'isHost:', isHost)
    
    // Subscribe to game state changes
    const unsubscribeGame = subscribeToGameState(roomCode, (gameState) => {
      if (!gameState) return
      
      console.log('🔥 Game state update:', gameState)
      
      // Sync suggestions from Firebase (for all players)
      if (gameState.suggestedAttributes) {
        const suggestionsArray = Object.values(gameState.suggestedAttributes)
        console.log('🔥 Syncing suggestions:', suggestionsArray)
        setSuggestedAttributes(suggestionsArray)
      } else {
        // Clear suggestions if none exist
        setSuggestedAttributes([])
      }
      
      // Sync numbered attributes for voting (for all players)
      if (gameState.numberedAttributes) {
        console.log('🔥 Syncing numbered attributes:', gameState.numberedAttributes)
        // Ensure each attribute has a votes array (Firebase might strip empty arrays)
        const numberedWithVotes = gameState.numberedAttributes.map(attr => ({
          ...attr,
          votes: attr.votes || []
        }))
        setNumberedAttributes(numberedWithVotes)
      }
      
      // Sync compatibility (so all players see the same score)
      if (typeof gameState.compatibility === 'number') {
        setCompatibility(gameState.compatibility)
      }
      
      // Sync winning attribute
      if (gameState.winningAttribute) {
        setWinnerText(gameState.winningAttribute)
      }
      
      // All players should follow phase/timer from Firebase
      if (gameState.livePhase) {
        console.log('🔥 Syncing phase:', gameState.livePhase)
        setLivePhase(gameState.livePhase)
      }
      // Timer sync logic:
      // - Host NEVER accepts timer from Firebase (host is source of truth)
      // - Non-hosts only accept timer on phase changes (when timer resets to 30)
      if (typeof gameState.phaseTimer === 'number' && !isHost) {
        // Only accept timer of 30 (fresh phase) when timer hasn't started
        // This prevents mid-countdown resets while still allowing phase transitions
        if (!timerStarted && gameState.phaseTimer === 30) {
          setPhaseTimer(30)
        }
      }
      
      // Sync tutorial state (so all players see the same tutorial step)
      if (typeof gameState.showTutorial === 'boolean') {
        setShowTutorial(gameState.showTutorial)
      }
      if (typeof gameState.tutorialStep === 'number') {
        setTutorialStep(gameState.tutorialStep)
      }
      
      // Sync timer started state (so timer begins for all when first submission happens)
      if (typeof gameState.timerStarted === 'boolean') {
        setTimerStarted(gameState.timerStarted)
      }
      
      // Sync current question (so all players see the same question)
      if (gameState.currentQuestion && !isHost) {
        setDaterBubble(gameState.currentQuestion)
        // Only add to conversation if it's not already there
        if (dateConversation.length === 0 || dateConversation[dateConversation.length - 1]?.text !== gameState.currentQuestion) {
          addDateMessage('dater', gameState.currentQuestion)
        }
      }
    })
    
    // Subscribe to chat
    const unsubscribeChat = subscribeToChat(roomCode, (chatMessages) => {
      setPlayerChat(chatMessages)
    })
    
    return () => {
      unsubscribeGame()
      unsubscribeChat()
    }
  }, [firebaseReady, roomCode, isHost, setSuggestedAttributes, setCompatibility, setLivePhase, setPhaseTimer, setPlayerChat, setNumberedAttributes, setShowTutorial, setTutorialStep])
  
  // Track timer value in a ref for the interval to access
  const phaseTimerValueRef = useRef(phaseTimer)
  useEffect(() => {
    phaseTimerValueRef.current = phaseTimer
  }, [phaseTimer])
  
  // Phase timer countdown - only host runs the timer, others sync from Firebase
  // Timer only starts after first submission in Phase 1/2
  useEffect(() => {
    // Only the host should run the timer
    if (!isHost && firebaseReady) return
    
    // For Phase 1 and Phase 2, wait until timer is started (first submission)
    // For Phase 3, always run
    const shouldRunTimer = 
      (livePhase === 'phase3') || 
      ((livePhase === 'phase1' || livePhase === 'phase2') && timerStarted)
    
    if (shouldRunTimer) {
      phaseTimerRef.current = setInterval(async () => {
        const currentTime = phaseTimerValueRef.current
        const newTime = currentTime - 1
        if (newTime >= 0) {
          setPhaseTimer(newTime)
          // Sync timer to Firebase for other players (every 5 seconds to reduce writes)
          if (firebaseReady && roomCode && isHost && newTime % 5 === 0) {
            await updateGameState(roomCode, { phaseTimer: newTime })
          }
        }
      }, 1000)
      
      return () => {
        if (phaseTimerRef.current) {
          clearInterval(phaseTimerRef.current)
        }
      }
    }
  }, [livePhase, isHost, firebaseReady, roomCode, setPhaseTimer, timerStarted])
  
  // Handle phase transitions when timer hits 0
  useEffect(() => {
    // Only trigger once when timer reaches 0
    if (phaseTimer === 0 && (livePhase === 'phase1' || livePhase === 'phase2')) {
      console.log('⏰ Timer hit 0, triggering phase end for:', livePhase)
      handlePhaseEnd()
    }
  }, [phaseTimer, livePhase])
  
  // Start Phase 1 - Dater asks Avatar about themselves
  // Only HOST generates questions; non-hosts receive via Firebase
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
          if (firebaseReady && roomCode) {
            await updateGameState(roomCode, { 
              livePhase: 'phase1', 
              phaseTimer: 30,
              compatibility: 50,
              currentQuestion: openingLine
            })
          }
        }
        // Non-hosts will receive the question via Firebase subscription
      }
    }
    initPhase1()
  }, [livePhase, isHost, firebaseReady, roomCode])
  
  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [playerChat])
  
  // Show phase announcement when phase changes
  useEffect(() => {
    if (livePhase && livePhase !== lastPhaseRef.current && livePhase !== 'ended') {
      lastPhaseRef.current = livePhase
      setAnnouncementPhase(livePhase)
      setShowPhaseAnnouncement(true)
      
      // Hide after 2 seconds
      const timer = setTimeout(() => {
        setShowPhaseAnnouncement(false)
      }, 2000)
      
      return () => clearTimeout(timer)
    }
  }, [livePhase])
  
  // Get phase announcement content
  const getPhaseAnnouncement = () => {
    switch (announcementPhase) {
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
  
  // Generate dater values when the game starts
  useEffect(() => {
    const initDaterValues = async () => {
      if (selectedDater && (!daterValues.loves.length || daterValues.loves.length === 0)) {
        console.log('Generating dater values for', selectedDater.name)
        const values = await generateDaterValues(selectedDater)
        setDaterValues(values)
        console.log('Dater values set:', values)
      }
    }
    initDaterValues()
  }, [selectedDater])
  
  // Questions the Dater asks to prompt attribute suggestions
  const promptQuestions = [
    "Tell me something about yourself that would surprise me.",
    "What's the most spontaneous thing you've ever done?",
    "I'm curious - what are you looking for in a partner?",
    "What do you think makes a good connection?",
    "So what do you like to do for fun?",
    "What's your favorite way to spend a weekend?",
    "If you could travel anywhere tomorrow, where would you go?",
    "What's something you're really passionate about?",
    "Do you have any hidden talents?",
  ]
  
  // Track which questions have been used this session
  const usedQuestionsRef = useRef(new Set())
  
  const getOpeningLine = () => {
    // Get unused questions
    const unusedQuestions = promptQuestions.filter((_, i) => !usedQuestionsRef.current.has(i))
    
    // If all used, reset
    if (unusedQuestions.length === 0) {
      usedQuestionsRef.current.clear()
      const idx = Math.floor(Math.random() * promptQuestions.length)
      usedQuestionsRef.current.add(idx)
      return promptQuestions[idx]
    }
    
    // Pick a random unused question
    const randomUnused = unusedQuestions[Math.floor(Math.random() * unusedQuestions.length)]
    const idx = promptQuestions.indexOf(randomUnused)
    usedQuestionsRef.current.add(idx)
    return randomUnused
  }
  
  const handlePhaseEnd = async () => {
    if (phaseTimerRef.current) {
      clearInterval(phaseTimerRef.current)
    }
    
    // Only host controls phase transitions
    if (!isHost && firebaseReady) return
    
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
        setTimerStarted(false) // Reset timer - wait for first vote
        
        // Sync to Firebase - include numbered attributes
        if (firebaseReady && roomCode) {
          await updateGameState(roomCode, { 
            livePhase: 'phase2', 
            phaseTimer: 30,
            numberedAttributes: numbered,
            timerStarted: false
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
          
          // Sync to Firebase
          if (firebaseReady && roomCode) {
            await updateGameState(roomCode, { livePhase: 'phase3', phaseTimer: 0, winningAttribute: winningAttr })
            await clearSuggestions(roomCode)
            await clearVotes(roomCode)
          }
          
          // After 2.5 seconds, hide popup and start conversation
          setTimeout(() => {
            setShowWinnerPopup(false)
            setTimeout(() => generateDateConversation(winningAttr), 300)
          }, 2500)
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
  const generateDateConversation = async (currentAttribute) => {
    if (isGenerating || !selectedDater) return
    
    const attrToUse = currentAttribute || latestAttribute
    if (!attrToUse) {
      console.log('No attribute to respond to')
      return
    }
    
    setIsGenerating(true)
    
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
      // Helper to check match and apply scoring
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
            if (firebaseReady && roomCode) {
              await updateGameState(roomCode, { compatibility: newCompat })
            }
          }
        }
        return matchResult.category // Return the category so Dater can react appropriately
      }
      
      // ============ EXCHANGE 1: Avatar answers with new attribute (1x scoring) ============
      console.log('--- Exchange 1: Avatar answers with new attribute ---')
      
      const avatarResponse1 = await getAvatarDateResponse(
        avatarWithNewAttr,  // Use avatar with guaranteed new attribute
        selectedDater,
        dateConversation.slice(-6),
        attrToUse,
        'answer' // Mode: answering a question with the new attribute
      )
      
      if (avatarResponse1) {
        setAvatarBubble(avatarResponse1)
        addDateMessage('avatar', avatarResponse1)
        
        await new Promise(resolve => setTimeout(resolve, 2500))
        
        // Check match FIRST to know how Dater should react
        const sentimentHit1 = await checkAndScore(avatarResponse1, 1) // Full scoring
        
        // Dater reacts - informed by what sentiment was hit
        const daterReaction1 = await getDaterDateResponse(
          selectedDater,
          avatarWithNewAttr,
          [...dateConversation.slice(-6), { speaker: 'avatar', message: avatarResponse1 }],
          attrToUse,
          sentimentHit1 // Pass the category so Dater reacts appropriately
        )
        
        if (daterReaction1) {
          setDaterBubble(daterReaction1)
          addDateMessage('dater', daterReaction1)
        }
        
        await new Promise(resolve => setTimeout(resolve, 3000))
        
        // ============ EXCHANGE 2: Avatar continues (0.25x scoring) ============
        console.log('--- Exchange 2: Avatar continues conversation ---')
        
        const avatarResponse2 = await getAvatarDateResponse(
          avatarWithNewAttr,
          selectedDater,
          [...dateConversation.slice(-4), { speaker: 'avatar', message: avatarResponse1 }, { speaker: 'dater', message: daterReaction1 }],
          null, // No new attribute
          'continue' // Mode: continuing conversation using all attributes
        )
        
        if (avatarResponse2) {
          setAvatarBubble(avatarResponse2)
          addDateMessage('avatar', avatarResponse2)
          
          await new Promise(resolve => setTimeout(resolve, 2500))
          
          // Check match FIRST
          const sentimentHit2 = await checkAndScore(avatarResponse2, 0.25) // 25% scoring
          
          // Dater reacts - informed by sentiment
          const daterReaction2 = await getDaterDateResponse(
            selectedDater,
            avatarWithNewAttr,
            [...dateConversation.slice(-4), { speaker: 'avatar', message: avatarResponse2 }],
            null,
            sentimentHit2
          )
          
          if (daterReaction2) {
            setDaterBubble(daterReaction2)
            addDateMessage('dater', daterReaction2)
          }
          
          await new Promise(resolve => setTimeout(resolve, 3000))
          
          // ============ EXCHANGE 3: Avatar continues again (0.10x scoring) ============
          console.log('--- Exchange 3: Avatar continues again ---')
          
          const avatarResponse3 = await getAvatarDateResponse(
            avatarWithNewAttr,
            selectedDater,
            [...dateConversation.slice(-4), { speaker: 'avatar', message: avatarResponse2 }, { speaker: 'dater', message: daterReaction2 }],
            null,
            'continue'
          )
          
          if (avatarResponse3) {
            setAvatarBubble(avatarResponse3)
            addDateMessage('avatar', avatarResponse3)
            
            await new Promise(resolve => setTimeout(resolve, 2500))
            
            // Check match FIRST
            const sentimentHit3 = await checkAndScore(avatarResponse3, 0.10) // 10% scoring
            
            // Dater reacts - informed by sentiment
            const daterReaction3 = await getDaterDateResponse(
              selectedDater,
              avatarWithNewAttr,
              [...dateConversation.slice(-4), { speaker: 'avatar', message: avatarResponse3 }],
              null,
              sentimentHit3
            )
            
            if (daterReaction3) {
              setDaterBubble(daterReaction3)
              addDateMessage('dater', daterReaction3)
            }
          }
        }
      }
      
      // After all 3 exchanges, check round count and transition
      await new Promise(resolve => setTimeout(resolve, 2000))
      handleRoundComplete()
      
    } catch (error) {
      console.error('Error generating conversation:', error)
    }
    
    setIsGenerating(false)
  }
  
  // Handle round completion - check if we continue or end
  const handleRoundComplete = async () => {
    const newRoundCount = cycleCount + 1
    incrementCycle()
    
    console.log(`Round ${newRoundCount}/${maxCycles} complete`)
    
    if (newRoundCount >= maxCycles) {
      // Game over!
      setLivePhase('ended')
      if (firebaseReady && roomCode) {
        await updateGameState(roomCode, { livePhase: 'ended', compatibility })
      }
      setTimeout(() => setPhase('results'), 2000)
    } else {
      // Start new round - Dater asks another question (host only generates)
      setLivePhase('phase1')
      setPhaseTimer(30)
      setTimerStarted(false) // Reset timer - wait for first suggestion
      
      // Only host generates the next question
      if (isHost) {
        const nextQuestion = getOpeningLine()
        setDaterBubble(nextQuestion)
        setAvatarBubble('')
        addDateMessage('dater', nextQuestion)
        
        // Sync to Firebase including the question
        if (firebaseReady && roomCode) {
          await updateGameState(roomCode, { 
            livePhase: 'phase1', 
            phaseTimer: 30, 
            compatibility,
            timerStarted: false,
            currentQuestion: nextQuestion
          })
        }
      }
      // Non-hosts will receive the question via Firebase subscription
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
      
      // Start the timer on first submission
      if (!timerStarted) {
        setTimerStarted(true)
        if (firebaseReady && roomCode) {
          await updateGameState(roomCode, { timerStarted: true })
        }
      }
      
      // Submit to Firebase if available, otherwise local only
      if (firebaseReady && roomCode) {
        await firebaseSubmitAttribute(roomCode, suggestion)
        await sendChatMessage(roomCode, { username, message: `💡 ${truncate(message, 35)}` })
      } else {
        submitAttributeSuggestion(message, username)
        addPlayerChatMessage(username, `💡 ${truncate(message, 35)}`)
      }
    } 
    // In Phase 2, check if it's a vote
    else if (livePhase === 'phase2') {
      const num = parseInt(message)
      if (!isNaN(num) && num >= 1 && num <= numberedAttributes.length) {
        // Start the timer on first vote
        if (!timerStarted) {
          setTimerStarted(true)
          if (firebaseReady && roomCode) {
            await updateGameState(roomCode, { timerStarted: true })
          }
        }
        
        // Submit vote to Firebase if available
        if (firebaseReady && roomCode && playerId) {
          await firebaseSubmitVote(roomCode, playerId, num)
          await sendChatMessage(roomCode, { username, message: `Vote: #${num}` })
        } else {
          voteForNumberedAttribute(num, username)
          addPlayerChatMessage(username, `Vote: #${num}`)
        }
        setUserVote(num)
      } else {
        if (firebaseReady && roomCode) {
          await sendChatMessage(roomCode, { username, message: truncate(message) })
        } else {
          addPlayerChatMessage(username, truncate(message))
        }
      }
    }
    // Phase 3 - just regular chat
    else {
      if (firebaseReady && roomCode) {
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
      case 'phase1': return { line1: 'PHASE 1', line2: 'Submit', line3: 'Answers' }
      case 'phase2': return { line1: 'PHASE 2', line2: 'Vote', line3: '' }
      case 'phase3': return { line1: 'PHASE 3', line2: 'Watch', line3: 'the Date' }
      case 'ended': return { line1: 'DONE', line2: 'Date', line3: 'Over' }
      default: return { line1: '', line2: '', line3: '' }
    }
  }
  
  const getPhaseInstructions = () => {
    switch (livePhase) {
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
          
          {/* Right: Timer */}
          <div 
            className="header-timer"
            onClick={() => setShowDaterValuesPopup(!showDaterValuesPopup)}
            style={{ cursor: 'pointer' }}
            title="Tap to see hidden info"
          >
            {phaseTimer > 0 && <span className="timer-value">{formatTime(phaseTimer)}</span>}
            {livePhase === 'phase3' && <span className="timer-value">💬</span>}
            {phaseTimer <= 0 && livePhase !== 'phase3' && <span className="timer-value">⏳</span>}
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
                  {daterValues.loves.map((v, i) => <span key={i}>{v}</span>)}
                </div>
                <div className="value-column likes">
                  <span className="value-header">👍 Likes</span>
                  {daterValues.likes.map((v, i) => <span key={i}>{v}</span>)}
                </div>
                <div className="value-column dislikes">
                  <span className="value-header">👎 Dislikes</span>
                  {daterValues.dislikes.map((v, i) => <span key={i}>{v}</span>)}
                </div>
                <div className="value-column dealbreakers">
                  <span className="value-header">💀 Dealbreakers</span>
                  {daterValues.dealbreakers.map((v, i) => <span key={i}>{v}</span>)}
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
            {sentimentCategories.loves.map((item, i) => (
              <span 
                key={i} 
                className={`sentiment-item ${glowingValues.includes(item) ? 'glowing glowing-love' : ''}`}
              >
                {item}
              </span>
            ))}
          </div>
        </div>
        <div className="sentiment-category likes">
          <span className="category-label">💛 Likes</span>
          <div className="category-items">
            {sentimentCategories.likes.map((item, i) => (
              <span 
                key={i} 
                className={`sentiment-item ${glowingValues.includes(item) ? 'glowing glowing-like' : ''}`}
              >
                {item}
              </span>
            ))}
          </div>
        </div>
        <div className="sentiment-category dislikes">
          <span className="category-label">😬 Dislikes</span>
          <div className="category-items">
            {sentimentCategories.dislikes.map((item, i) => (
              <span 
                key={i} 
                className={`sentiment-item ${glowingValues.includes(item) ? 'glowing glowing-dislike' : ''}`}
              >
                {item}
              </span>
            ))}
          </div>
        </div>
        <div className="sentiment-category dealbreakers">
          <span className="category-label">💔 Nope</span>
          <div className="category-items">
            {sentimentCategories.dealbreakers.map((item, i) => (
              <span 
                key={i} 
                className={`sentiment-item ${glowingValues.includes(item) ? 'glowing glowing-dealbreaker' : ''}`}
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
                {numberedAttributes.map((attr) => (
                  <motion.div 
                    key={attr.number}
                    className={`vote-option ${userVote === attr.number ? 'voted' : ''}`}
                    onClick={async () => {
                      // Start the timer on first vote
                      if (!timerStarted) {
                        setTimerStarted(true)
                        if (firebaseReady && roomCode) {
                          await updateGameState(roomCode, { timerStarted: true })
                        }
                      }
                      
                      if (firebaseReady && roomCode && playerId) {
                        await firebaseSubmitVote(roomCode, playerId, attr.number)
                        await sendChatMessage(roomCode, { username, message: `Vote: #${attr.number}` })
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
        {livePhase === 'phase1' && suggestedAttributes.length > 0 && (
          <div className="suggestions-display">
            {suggestedAttributes.slice(-5).map((attr, i) => (
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
          {playerChat.slice(-20).map((msg) => (
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
