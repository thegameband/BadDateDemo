import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useGameStore } from '../store/gameStore'
import { 
  getDaterDateResponse, 
  getAvatarDateResponse, 
  getFallbackDateDialogue 
} from '../services/llmService'
import './DateScene.css'

/**
 * Determine which compatibility factor should be affected based on conversation content
 * @param {string} response - The response text
 * @param {string} avatarMessage - The Avatar's previous message (for context)
 * @returns {string} - One of: 'physical', 'interests', 'values', 'tastes', 'intelligence'
 */
function determineAffectedFactor(response, avatarMessage = '') {
  const combined = (response + ' ' + avatarMessage).toLowerCase()
  
  // Physical attraction keywords
  const physicalKeywords = [
    'attractive', 'cute', 'hot', 'handsome', 'beautiful', 'gorgeous', 'pretty',
    'eyes', 'smile', 'body', 'look', 'looking', 'appearance', 'tall', 'short',
    'outfit', 'dressed', 'wearing', 'hair', 'face', 'sexy', 'ugly', 'hideous',
    'spider', 'monster', 'tentacle', 'gross', 'disgusting'
  ]
  
  // Interests keywords
  const interestsKeywords = [
    'hobby', 'hobbies', 'fun', 'enjoy', 'like to', 'love to', 'into',
    'music', 'movies', 'books', 'games', 'sports', 'travel', 'cooking',
    'hiking', 'art', 'painting', 'reading', 'netflix', 'weekend', 'free time',
    'activities', 'passion', 'favorite'
  ]
  
  // Values keywords
  const valuesKeywords = [
    'believe', 'think', 'feel about', 'important', 'matter', 'value',
    'family', 'religion', 'politics', 'honesty', 'loyalty', 'trust',
    'moral', 'ethics', 'right', 'wrong', 'should', 'shouldn\'t',
    'kids', 'marriage', 'future', 'goals', 'dreams', 'career'
  ]
  
  // Tastes keywords  
  const tastesKeywords = [
    'food', 'restaurant', 'eat', 'drink', 'coffee', 'wine', 'beer',
    'music taste', 'genre', 'style', 'fashion', 'decor', 'aesthetic',
    'prefer', 'favorite', 'best', 'worst', 'love', 'hate', 'can\'t stand',
    'delicious', 'gross', 'amazing', 'terrible'
  ]
  
  // Intelligence keywords
  const intelligenceKeywords = [
    'smart', 'intelligent', 'clever', 'brilliant', 'genius', 'dumb', 'stupid',
    'education', 'school', 'college', 'university', 'degree', 'harvard', 'yale',
    'read', 'learn', 'know', 'understand', 'think', 'philosophy', 'science',
    'interesting', 'fascinating', 'curious', 'question', 'discuss', 'debate',
    'witty', 'humor', 'joke', 'pun'
  ]
  
  // Count matches for each category
  const counts = {
    physical: physicalKeywords.filter(k => combined.includes(k)).length,
    interests: interestsKeywords.filter(k => combined.includes(k)).length,
    values: valuesKeywords.filter(k => combined.includes(k)).length,
    tastes: tastesKeywords.filter(k => combined.includes(k)).length,
    intelligence: intelligenceKeywords.filter(k => combined.includes(k)).length,
  }
  
  // Find the factor with the most matches
  const maxCount = Math.max(...Object.values(counts))
  
  if (maxCount === 0) {
    // No clear category - pick randomly with slight bias toward interests
    const factors = ['physical', 'interests', 'interests', 'values', 'tastes', 'intelligence']
    return factors[Math.floor(Math.random() * factors.length)]
  }
  
  // Return the factor with the most matches (first one if tie)
  for (const [factor, count] of Object.entries(counts)) {
    if (count === maxCount) return factor
  }
  
  return 'interests' // fallback
}

/**
 * Evaluate the Dater's response to determine compatibility change
 * Returns { score, factor }: score is positive = good, negative = bad, 0 = neutral
 * 
 * @param {string} response - The Dater's response text
 * @param {number} reactionsLeft - How many heightened reactions remain (2 = first reaction, 1 = second, 0 = normal)
 * @param {string} avatarMessage - The Avatar's previous message (for context)
 */
function evaluateDaterSentiment(response, reactionsLeft = 0, avatarMessage = '') {
  const lower = response.toLowerCase()
  
  // Determine which factor this affects
  const factor = determineAffectedFactor(response, avatarMessage)
  
  // Determine multiplier based on how recent the attribute was added
  // First reaction after attribute: 3x impact (BIG swing)
  // Second reaction: 1.5x impact (still notable)
  // Normal conversation: 0.5x impact (slow drip)
  let multiplier
  if (reactionsLeft === 2) {
    multiplier = 3.0 // First response after attribute - HUGE impact
  } else if (reactionsLeft === 1) {
    multiplier = 1.5 // Second response - moderate impact
  } else {
    multiplier = 0.5 // Normal conversation - slow drip
  }
  
  // Strong positive signals
  const strongPositive = [
    'love', 'amazing', 'perfect', 'incredible', 'fantastic', 'wonderful',
    'exactly what', 'dream', 'can\'t believe', 'so happy', 'best', 'wow',
    'marry', 'soulmate', 'connection', 'chemistry', '😍', '❤️', '💕'
  ]
  
  // Mild positive signals
  const mildPositive = [
    'nice', 'cool', 'great', 'like that', 'appreciate', 'sweet', 'cute',
    'fun', 'enjoy', 'glad', 'happy', 'good', 'awesome', 'interesting',
    'tell me more', 'fascinating', 'intriguing', '😊', '🥰'
  ]
  
  // Strong negative signals
  const strongNegative = [
    'deal breaker', 'dealbreaker', 'can\'t', 'won\'t work', 'absolutely not',
    'horrified', 'disgusted', 'appalled', 'what the', 'excuse me', 'seriously?',
    'spider', 'criminal', 'prison', 'hate', 'despise', 'never', 'leave',
    'uncomfortable', 'scared', 'afraid', 'yikes', '😱', '🤮', '😨'
  ]
  
  // Mild negative signals
  const mildNegative = [
    'hmm', 'oh...', 'really?', 'um', 'uh', 'not sure', 'concerning',
    'weird', 'strange', 'odd', 'unusual', 'skeptical', 'hesitant',
    'pause', 'wait', 'hold on', '😬', '🤔', '😅'
  ]
  
  // Confused/neutral signals (slight negative - uncertainty isn't great)
  const confused = [
    'what?', 'huh?', 'sorry?', 'come again', 'didn\'t catch', 'confused'
  ]
  
  // Calculate base sentiment score
  let baseScore = 0
  
  // Check strong signals first (BUFFED positive, NERFED negative for easier gameplay)
  for (const word of strongPositive) {
    if (lower.includes(word)) {
      baseScore += 12 // Was 8, now 12
      break // Only count once per category
    }
  }
  
  for (const word of strongNegative) {
    if (lower.includes(word)) {
      baseScore -= 6 // Was -10, now -6 (softer penalty)
      break
    }
  }
  
  // Check mild signals
  for (const word of mildPositive) {
    if (lower.includes(word)) {
      baseScore += 5 // Was 3, now 5
      break
    }
  }
  
  for (const word of mildNegative) {
    if (lower.includes(word)) {
      baseScore -= 2 // Was -4, now -2 (softer penalty)
      break
    }
  }
  
  for (const word of confused) {
    if (lower.includes(word)) {
      baseScore -= 1 // Was -2, now -1 (softer penalty)
      break
    }
  }
  
  // Exclamation marks suggest strong emotion (amplify existing sentiment)
  const exclamationCount = (response.match(/!/g) || []).length
  if (exclamationCount > 0 && baseScore !== 0) {
    baseScore = Math.round(baseScore * (1 + exclamationCount * 0.15))
  }
  
  // Question marks in dater response often show interest
  const questionCount = (response.match(/\?/g) || []).length
  if (questionCount > 0 && baseScore >= 0) {
    baseScore += questionCount
  }
  
  // Apply the multiplier based on attribute timing
  let score = Math.round(baseScore * multiplier)
  
  // Add some randomness for natural variation
  if (score === 0) {
    // Neutral exchanges now lean slightly positive (easier gameplay)
    score = Math.floor(Math.random() * 4) // 0 to +3 (was -1 to +1)
  } else {
    // Add ±15% variance to non-zero scores
    const variance = Math.floor(Math.abs(score) * 0.2)
    score += Math.floor(Math.random() * (variance * 2 + 1)) - variance
  }
  
  return { score, factor }
}

/**
 * Generate a spontaneous non-verbal action for a character
 * Returns null most of the time (actions should be rare)
 * @param {string} speaker - 'avatar' or 'dater'
 * @param {number} compatibility - current compatibility score
 * @param {object} dater - the dater's data (for personality-based actions)
 */
function getSpontaneousAction(speaker, compatibility, dater) {
  // Only ~10% chance of a spontaneous action
  if (Math.random() > 0.10) return null
  
  // Actions for when things are going well
  const positiveActions = [
    '*laughs genuinely*',
    '*smiles warmly*',
    '*leans in with interest*',
    '*chuckles*',
    '*grins*',
    '*playfully raises an eyebrow*',
    '*nods appreciatively*',
  ]
  
  // Actions for when things are awkward/bad
  const negativeActions = [
    '*shifts uncomfortably*',
    '*clears throat*',
    '*takes a long sip of water*',
    '*glances at phone briefly*',
    '*fidgets with napkin*',
    '*forces a polite smile*',
    '*looks around the room*',
  ]
  
  // Neutral actions that work anytime
  const neutralActions = [
    '*takes a sip of drink*',
    '*adjusts in seat*',
    '*brushes hair aside*',
    '*taps fingers lightly on table*',
    '*sighs softly*',
    '*stretches slightly*',
  ]
  
  // Fun/quirky actions (rarer)
  const quirkyActions = [
    '*accidentally snorts while laughing*',
    '*burps quietly and looks embarrassed*',
    '*hiccups once*',
    '*yawns and quickly covers mouth*',
    '*stomach growls audibly*',
    '*sneezes suddenly*',
  ]
  
  // Pick action based on compatibility mood
  let actionPool
  const quirkyRoll = Math.random()
  
  if (quirkyRoll < 0.15) {
    // 15% of actions are quirky/funny
    actionPool = quirkyActions
  } else if (compatibility > 65) {
    actionPool = positiveActions
  } else if (compatibility < 35) {
    actionPool = negativeActions
  } else {
    actionPool = neutralActions
  }
  
  return actionPool[Math.floor(Math.random() * actionPool.length)]
}

function DateScene() {
  const {
    phase,
    selectedDater,
    avatar,
    dateConversation,
    submittedAttributes,
    appliedAttributes,
    latestAttribute,
    latestAttributeReactionsLeft,
    attributeCooldown,
    hotSeatPlayer,
    compatibility,
    timedBehaviors,
    pendingTimedEvent,
    compatibilityFactors,
    factorsActivated,
    conversationTurns,
    addDateMessage,
    submitAttribute,
    consumeDaterReaction,
    triggerTimedEvent,
    consumeTimedEvent,
    updateCompatibilityFactor,
    incrementConversationTurn,
    voteForAttribute,
    applyTopAttributes,
    selectRandomHotSeat,
    applyHotSeatAttribute,
    setPhase,
    tickTimer,
  } = useGameStore()
  
  const timedBehaviorIntervalsRef = useRef({})
  const [showDebugPanel, setShowDebugPanel] = useState(false)
  
  const [inputValue, setInputValue] = useState('')
  const [votedAttributes, setVotedAttributes] = useState(new Set())
  const [hotSeatInput, setHotSeatInput] = useState('')
  const [isConversing, setIsConversing] = useState(false)
  const [compatibilityFlash, setCompatibilityFlash] = useState(null) // 'positive' | 'negative' | null
  const prevCompatibilityRef = useRef(compatibility)
  const conversationRef = useRef(null)
  const conversationIntervalRef = useRef(null)
  const lastSpeakerRef = useRef(null)
  const conversationActiveRef = useRef(true)
  const greetingSentRef = useRef(false)
  
  // Track compatibility changes for flash animation
  useEffect(() => {
    if (compatibility !== prevCompatibilityRef.current) {
      const delta = compatibility - prevCompatibilityRef.current
      setCompatibilityFlash(delta > 0 ? 'positive' : 'negative')
      prevCompatibilityRef.current = compatibility
      
      // Clear flash after animation
      const timer = setTimeout(() => setCompatibilityFlash(null), 800)
      return () => clearTimeout(timer)
    }
  }, [compatibility])
  
  // Auto-scroll conversation
  useEffect(() => {
    if (conversationRef.current) {
      conversationRef.current.scrollTop = conversationRef.current.scrollHeight
    }
  }, [dateConversation])
  
  // Generate next conversation turn using LLM
  const generateNextTurn = useCallback(async () => {
    if (isConversing || !conversationActiveRef.current) return
    
    setIsConversing(true)
    
    try {
      // Get FRESH state from store (avoid stale closure)
      const currentConversation = useGameStore.getState().dateConversation
      const currentAvatar = useGameStore.getState().avatar
      const currentLatestAttr = useGameStore.getState().latestAttribute
      const reactionsLeft = useGameStore.getState().latestAttributeReactionsLeft
      
      // Alternate speakers, starting with dater
      const nextSpeaker = lastSpeakerRef.current === 'dater' ? 'avatar' : 'dater'
      
      let response = null
      
      if (nextSpeaker === 'dater') {
        // Get Dater's response via LLM (with heightened reaction only if reactions left)
        const daterAttr = reactionsLeft > 0 ? currentLatestAttr : null
        console.log(`🎭 DATER turn | reactionsLeft: ${reactionsLeft} | latestAttr: ${daterAttr}`)
        response = await getDaterDateResponse(selectedDater, currentAvatar, currentConversation, daterAttr)
        console.log(`🎭 DATER response:`, response ? response.substring(0, 80) + '...' : 'NULL/FAILED')
        // Consume one heightened reaction after Dater speaks
        if (response && reactionsLeft > 0) {
          useGameStore.getState().consumeDaterReaction()
        }
      } else {
        // Get Avatar's response via LLM (with latest attribute to work in subtly)
        console.log(`🤖 AVATAR turn | latestAttr: ${currentLatestAttr} | attributes:`, currentAvatar.attributes)
        response = await getAvatarDateResponse(currentAvatar, selectedDater, currentConversation, currentLatestAttr)
        console.log(`🤖 AVATAR response:`, response ? response.substring(0, 80) + '...' : 'NULL/FAILED')
      }
      
      if (response && conversationActiveRef.current) {
        // Check if we should add a spontaneous non-verbal action
        const currentCompat = useGameStore.getState().compatibility
        const spontaneousAction = getSpontaneousAction(nextSpeaker, currentCompat, selectedDater)
        
        if (spontaneousAction) {
          // Add the action, then the verbal response after a short delay
          addDateMessage(nextSpeaker, spontaneousAction)
          await new Promise(r => setTimeout(r, 1500))
          if (conversationActiveRef.current) {
            addDateMessage(nextSpeaker, response)
          }
        } else {
          addDateMessage(nextSpeaker, response)
        }
        
        lastSpeakerRef.current = nextSpeaker
        
        // Update compatibility based on Dater's reactions
        if (nextSpeaker === 'dater') {
          // Get the Avatar's last message for context
          const lastAvatarMsg = currentConversation.filter(m => m.speaker === 'avatar').pop()?.message || ''
          const { score, factor } = evaluateDaterSentiment(response, reactionsLeft, lastAvatarMsg)
          if (score !== 0) {
            useGameStore.getState().updateCompatibilityFactor(factor, score)
          }
          // Increment conversation turn counter (affects weight calculation)
          useGameStore.getState().incrementConversationTurn()
        }
      } else if (conversationActiveRef.current) {
        // LLM FAILED - show error instead of silent fallback
        console.error(`❌ LLM FAILED for ${nextSpeaker} - NO FALLBACK (debugging mode)`)
        addDateMessage(nextSpeaker, `[LLM ERROR: ${nextSpeaker} response failed - check console]`)
        lastSpeakerRef.current = nextSpeaker
      }
    } catch (error) {
      console.error('❌ CONVERSATION ERROR:', error)
      // Show error instead of silent fallback
      const nextSpeaker = lastSpeakerRef.current === 'dater' ? 'avatar' : 'dater'
      if (conversationActiveRef.current) {
        addDateMessage(nextSpeaker, `[ERROR: ${error.message || 'LLM call failed'} - check console]`)
        lastSpeakerRef.current = nextSpeaker
      }
    }
    
    setIsConversing(false)
  }, [selectedDater, addDateMessage, isConversing])
  
  // Start and maintain continuous conversation
  useEffect(() => {
    conversationActiveRef.current = true
    let isMounted = true
    let greetingStarted = false
    
    const startConversation = async () => {
      // Only start if no messages exist and we haven't started
      if (greetingStarted) return
      greetingStarted = true
      
        await new Promise(r => setTimeout(r, 2000))
        if (!isMounted) return
        
        // Double-check no messages were added while we waited
        const currentMessages = useGameStore.getState().dateConversation
        if (currentMessages.length > 0) return
        
        const greeting = `Well, this place is nice! I have to say, ${avatar.name}, you're not quite what I expected... in a good way, I think.`
        addDateMessage('dater', greeting)
        lastSpeakerRef.current = 'dater'
        
        // Avatar responds after a delay (slower for readability)
        await new Promise(r => setTimeout(r, 4000))
      if (!isMounted) return
      
      const avatarResponse = await getAvatarDateResponse(avatar, selectedDater, [
        { speaker: 'dater', message: greeting }
      ])
      
      if (avatarResponse && isMounted) {
        addDateMessage('avatar', avatarResponse)
        lastSpeakerRef.current = 'avatar'
      }
    }
    
    if (dateConversation.length === 0) {
      startConversation()
    }
    
    // Set up continuous conversation - runs every 8-12 seconds (slower for readability)
    const runConversation = async () => {
      if (conversationActiveRef.current && isMounted) {
        await generateNextTurn()
      }
    }
    
    // Start conversation loop after initial exchange
    const startDelay = setTimeout(() => {
      conversationIntervalRef.current = setInterval(runConversation, 8000 + Math.random() * 4000)
    }, 8000)
    
    return () => {
      isMounted = false
      conversationActiveRef.current = false
      clearTimeout(startDelay)
      if (conversationIntervalRef.current) {
        clearInterval(conversationIntervalRef.current)
      }
    }
  }, []) // Only run on mount
  
  // Attribute reactions are now handled naturally by the conversation loop
  // The latestAttribute is stored in the store and will be picked up on the next turn
  // Avatar incorporates it subtly, Dater reacts with heightened intensity
  
  // Timer tick
  useEffect(() => {
    const timer = setInterval(tickTimer, 1000)
    return () => clearInterval(timer)
  }, [tickTimer])
  
  // Set up intervals for timed behaviors (e.g., "farts every 10 seconds")
  useEffect(() => {
    // Set up new intervals for any behaviors we don't have yet
    timedBehaviors.forEach(behavior => {
      if (!timedBehaviorIntervalsRef.current[behavior.id]) {
        const getInterval = () => {
          if (behavior.randomRange) {
            const [min, max] = behavior.randomRange
            return min + Math.random() * (max - min)
          }
          return behavior.intervalMs
        }
        
        // First trigger after initial interval
        const setupNextTrigger = () => {
          const interval = getInterval()
          timedBehaviorIntervalsRef.current[behavior.id] = setTimeout(() => {
            triggerTimedEvent(behavior)
            setupNextTrigger() // Schedule next one
          }, interval)
        }
        
        setupNextTrigger()
      }
    })
    
    // Cleanup intervals for removed behaviors
    Object.keys(timedBehaviorIntervalsRef.current).forEach(id => {
      if (!timedBehaviors.find(b => b.id === parseInt(id))) {
        clearTimeout(timedBehaviorIntervalsRef.current[id])
        delete timedBehaviorIntervalsRef.current[id]
      }
    })
    
    return () => {
      // Cleanup all intervals on unmount
      Object.values(timedBehaviorIntervalsRef.current).forEach(clearTimeout)
      timedBehaviorIntervalsRef.current = {}
    }
  }, [timedBehaviors, triggerTimedEvent])
  
  // Handle pending timed events by injecting them into conversation
  useEffect(() => {
    if (pendingTimedEvent && !isConversing) {
      const action = pendingTimedEvent.action
      
      // Create an action message for the Avatar
      const actionMessage = `*${action}*`
      addDateMessage('avatar', actionMessage)
      
      // Mark this as the Avatar's turn so Dater responds next
      lastSpeakerRef.current = 'avatar'
      
      // Clear the pending event
      consumeTimedEvent()
      
      // Trigger an immediate Dater reaction
      setTimeout(() => {
        if (conversationActiveRef.current) {
          generateNextTurn()
        }
      }, 1500)
    }
  }, [pendingTimedEvent, isConversing, addDateMessage, consumeTimedEvent, generateNextTurn])
  
  // Single player: just return to smalltalk after applying (handled in store)
  
  const handleSubmitAttribute = (e) => {
    e.preventDefault()
    if (!inputValue.trim() || phase !== 'smalltalk') return
    submitAttribute(inputValue.trim())
    setInputValue('')
  }
  
  const handleVote = (attrId) => {
    if (votedAttributes.has(attrId) || votedAttributes.size >= 3) return
    voteForAttribute(attrId)
    setVotedAttributes(new Set([...votedAttributes, attrId]))
  }
  
  const handleHotSeatSubmit = (e) => {
    e.preventDefault()
    if (!hotSeatInput.trim()) return
    applyHotSeatAttribute(hotSeatInput.trim())
    setHotSeatInput('')
  }
  
  const handleFinishVoting = () => {
    applyTopAttributes()
    setVotedAttributes(new Set())
  }
  
  return (
    <div className="date-scene">
      {/* Main date view */}
      <div className="date-main">
        <div className="date-characters">
          {/* Avatar */}
          <motion.div 
            className="character avatar-character"
            initial={{ x: -100, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
          >
            <div className="character-image">
              <img 
                src="https://api.dicebear.com/7.x/avataaars/svg?seed=Avatar&backgroundColor=b6e3f4"
                alt="Avatar" 
              />
            </div>
            <div className="character-info">
              <h3>{avatar.name}</h3>
              <span>{avatar.age} • {avatar.occupation}</span>
            </div>
          </motion.div>
          
          {/* Compatibility Meter - Click to show debug panel */}
          <motion.div 
            className={`compatibility-meter ${compatibilityFlash || ''}`}
            onClick={() => setShowDebugPanel(!showDebugPanel)}
            style={{ cursor: 'pointer' }}
            animate={compatibilityFlash ? {
              scale: [1, 1.3, 1],
              boxShadow: compatibilityFlash === 'positive' 
                ? ['0 0 0px #06d6a0', '0 0 30px #06d6a0', '0 0 0px #06d6a0']
                : ['0 0 0px #ff4d6d', '0 0 30px #ff4d6d', '0 0 0px #ff4d6d']
            } : {}}
            transition={{ duration: 0.6, ease: 'easeOut' }}
          >
            <div className="compatibility-label">💗 Compatibility</div>
            <motion.div 
              className="compatibility-value"
              animate={compatibilityFlash ? {
                scale: [1, 1.2, 1],
                color: compatibilityFlash === 'positive' ? '#06d6a0' : '#ff4d6d'
              } : {}}
              transition={{ duration: 0.5 }}
            >
              {compatibility}%
            </motion.div>
            <div className="compatibility-bar">
              <motion.div 
                className="compatibility-fill"
                initial={{ width: '50%' }}
                animate={{ 
                  width: `${compatibility}%`,
                  backgroundColor: compatibility > 70 ? '#06d6a0' : compatibility > 40 ? '#ffd166' : '#ff4d6d'
                }}
                transition={{ duration: 0.5 }}
              />
            </div>
            <div className="compatibility-emoji">
              {compatibility > 80 ? '💕' : compatibility > 60 ? '💗' : compatibility > 40 ? '🙂' : compatibility > 20 ? '😬' : '💔'}
            </div>
          </motion.div>
          
          {/* Debug Panel - Hidden, accessible by clicking compatibility */}
          <AnimatePresence>
            {showDebugPanel && (
              <motion.div 
                className="compatibility-debug"
                initial={{ opacity: 0, y: -10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10, scale: 0.95 }}
                transition={{ duration: 0.2 }}
              >
                <div className="debug-header">
                  <span>🔧 Compatibility Debug</span>
                  <span className="debug-turn">Turn {conversationTurns}</span>
                </div>
                
                <div className="debug-factors">
                  <div className={`debug-factor ${factorsActivated.physicalAttraction ? 'activated' : 'inactive'}`}>
                    <span className="factor-emoji">👀</span>
                    <span className="factor-name">Physical</span>
                    <div className="factor-bar">
                      <div 
                        className="factor-fill physical" 
                        style={{ width: `${compatibilityFactors.physicalAttraction}%` }}
                      />
                    </div>
                    <span className="factor-value">{compatibilityFactors.physicalAttraction}</span>
                    <span className="factor-status">{factorsActivated.physicalAttraction ? '✓' : '10%'}</span>
                  </div>
                  
                  <div className={`debug-factor ${factorsActivated.similarInterests ? 'activated' : 'inactive'}`}>
                    <span className="factor-emoji">🎯</span>
                    <span className="factor-name">Interests</span>
                    <div className="factor-bar">
                      <div 
                        className="factor-fill interests" 
                        style={{ width: `${compatibilityFactors.similarInterests}%` }}
                      />
                    </div>
                    <span className="factor-value">{compatibilityFactors.similarInterests}</span>
                    <span className="factor-status">{factorsActivated.similarInterests ? '✓' : '10%'}</span>
                  </div>
                  
                  <div className={`debug-factor ${factorsActivated.similarValues ? 'activated' : 'inactive'}`}>
                    <span className="factor-emoji">⚖️</span>
                    <span className="factor-name">Values</span>
                    <div className="factor-bar">
                      <div 
                        className="factor-fill values" 
                        style={{ width: `${compatibilityFactors.similarValues}%` }}
                      />
                    </div>
                    <span className="factor-value">{compatibilityFactors.similarValues}</span>
                    <span className="factor-status">{factorsActivated.similarValues ? '✓' : '10%'}</span>
                  </div>
                  
                  <div className={`debug-factor ${factorsActivated.similarTastes ? 'activated' : 'inactive'}`}>
                    <span className="factor-emoji">🍽️</span>
                    <span className="factor-name">Tastes</span>
                    <div className="factor-bar">
                      <div 
                        className="factor-fill tastes" 
                        style={{ width: `${compatibilityFactors.similarTastes}%` }}
                      />
                    </div>
                    <span className="factor-value">{compatibilityFactors.similarTastes}</span>
                    <span className="factor-status">{factorsActivated.similarTastes ? '✓' : '10%'}</span>
                  </div>
                  
                  <div className={`debug-factor ${factorsActivated.similarIntelligence ? 'activated' : 'inactive'}`}>
                    <span className="factor-emoji">🧠</span>
                    <span className="factor-name">Intelligence</span>
                    <div className="factor-bar">
                      <div 
                        className="factor-fill intelligence" 
                        style={{ width: `${compatibilityFactors.similarIntelligence}%` }}
                      />
                    </div>
                    <span className="factor-value">{compatibilityFactors.similarIntelligence}</span>
                    <span className="factor-status">{factorsActivated.similarIntelligence ? '✓' : '10%'}</span>
                  </div>
                </div>
                
                <div className="debug-calculation">
                  <div className="calc-explanation">
                    <span>📊 Calculation:</span>
                    <span>Drop lowest → Average top 4</span>
                  </div>
                  <div className="calc-weights">
                    <span>Physical weight: {(2.5 - (1.5 * Math.min(conversationTurns / 10, 1))).toFixed(2)}x</span>
                    <span>Others weight: {(0.625 + (0.375 * Math.min(conversationTurns / 10, 1))).toFixed(2)}x</span>
                  </div>
                  <div className="calc-result">
                    <span>= {compatibility}% overall</span>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          
          {/* Dater - with mood based on compatibility */}
          <motion.div 
            className={`character dater-character ${
              compatibility > 75 ? 'mood-loving' : 
              compatibility > 55 ? 'mood-happy' : 
              compatibility > 35 ? 'mood-neutral' : 
              compatibility > 20 ? 'mood-concerned' : 'mood-upset'
            }`}
            initial={{ x: 100, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
          >
            <div className="character-image">
              <img src={selectedDater.photo} alt={selectedDater.name} />
              <motion.div 
                className="mood-indicator"
                key={compatibility > 75 ? 'loving' : compatibility > 55 ? 'happy' : compatibility > 35 ? 'neutral' : compatibility > 20 ? 'concerned' : 'upset'}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 400 }}
              >
                {compatibility > 75 ? '😍' : 
                 compatibility > 55 ? '😊' : 
                 compatibility > 35 ? '🤔' : 
                 compatibility > 20 ? '😬' : '😒'}
              </motion.div>
            </div>
            <div className="character-info">
              <h3>{selectedDater.name}</h3>
              <span>{selectedDater.age} • {selectedDater.tagline}</span>
            </div>
          </motion.div>
        </div>
        
        {/* Conversation - ALWAYS VISIBLE */}
        <div className="conversation-area" ref={conversationRef}>
          <AnimatePresence>
            {dateConversation.map((msg, i) => (
              <motion.div
                key={msg.id || i}
                className={`dialogue ${msg.speaker}`}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ type: 'spring', stiffness: 300 }}
              >
                <div className="dialogue-bubble">
                  <p>{msg.message}</p>
                </div>
                <span className="dialogue-speaker">
                  {msg.speaker === 'avatar' ? avatar.name : selectedDater.name}
                </span>
              </motion.div>
            ))}
          </AnimatePresence>
          
          {isConversing && (
            <motion.div 
              className="dialogue typing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <div className="dialogue-bubble">
                <div className="typing-dots">
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            </motion.div>
          )}
        </div>
        
        {/* Conversation status indicator */}
        <div className="conversation-status">
          <span className="pulse-dot" />
          <span>Conversation in progress...</span>
        </div>
      </div>
      
      {/* Sidebar - Phase specific */}
      <div className="date-sidebar">
        {/* Small Talk Phase - Attribute Submission */}
        {phase === 'smalltalk' && (
          <motion.div 
            className="sidebar-panel"
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
          >
            <h3>🎭 Shape the Avatar</h3>
            <p className="panel-desc">
              Submit attributes to add to your avatar. What kind of person are they?
            </p>
            
            <form onSubmit={handleSubmitAttribute} className="attribute-form">
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="e.g., 'went to Harvard', 'loves cats'..."
                disabled={attributeCooldown}
              />
              <button 
                type="submit" 
                className={`btn btn-primary ${attributeCooldown ? 'cooldown' : ''}`}
                disabled={attributeCooldown}
              >
                {attributeCooldown ? '⏳ Wait...' : 'Add Trait'}
              </button>
            </form>
            {attributeCooldown && (
              <p className="cooldown-hint">New trait available in a few seconds...</p>
            )}
            
            {/* Show applied attributes */}
            <div className="applied-list">
              <h4>Avatar's Traits</h4>
              {appliedAttributes.map((attr, idx) => (
                <motion.div 
                  key={idx}
                  className="applied-attr"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                >
                  ✓ {attr}
                </motion.div>
              ))}
              {appliedAttributes.length === 0 && (
                <p className="no-traits-hint">Add traits to shape who Avatar becomes!</p>
              )}
            </div>
            
            <div className="conversation-reminder">
              <p>👀 Keep watching the conversation for more intel!</p>
            </div>
          </motion.div>
        )}
        
        {/* Voting Phase - Removed for single player */}
        
        {/* Applying Phase - Brief feedback when trait is added */}
        {phase === 'applying' && (
          <motion.div 
            className="sidebar-panel applying-panel"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            <div className="applying-animation">
              <motion.span
                animate={{ scale: [1, 1.3, 1] }}
                transition={{ duration: 0.5, repeat: Infinity }}
              >
                ✨
              </motion.span>
            </div>
            <h3>Trait Added!</h3>
            <p className="latest-trait">"{appliedAttributes[appliedAttributes.length - 1]}"</p>
            <p>Watch how {selectedDater.name} reacts...</p>
          </motion.div>
        )}
        
        {/* Hot Seat Phase - Removed for single player */}
      </div>
    </div>
  )
}

export default DateScene
