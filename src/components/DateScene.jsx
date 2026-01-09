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
 * Evaluate the Dater's response to determine compatibility change
 * Returns a number: positive = good, negative = bad, 0 = neutral
 */
function evaluateDaterSentiment(response, isReactingToAttribute = false) {
  const lower = response.toLowerCase()
  
  // Strong positive signals (bigger impact)
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
  
  // Strong negative signals (bigger impact)
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
  
  // Calculate sentiment score
  let score = 0
  
  // Check strong signals first
  for (const word of strongPositive) {
    if (lower.includes(word)) {
      score += isReactingToAttribute ? 12 : 8
      break // Only count once per category
    }
  }
  
  for (const word of strongNegative) {
    if (lower.includes(word)) {
      score -= isReactingToAttribute ? 15 : 10
      break
    }
  }
  
  // Check mild signals
  for (const word of mildPositive) {
    if (lower.includes(word)) {
      score += isReactingToAttribute ? 5 : 3
      break
    }
  }
  
  for (const word of mildNegative) {
    if (lower.includes(word)) {
      score -= isReactingToAttribute ? 6 : 4
      break
    }
  }
  
  for (const word of confused) {
    if (lower.includes(word)) {
      score -= 2
      break
    }
  }
  
  // Exclamation marks suggest strong emotion (amplify existing sentiment)
  const exclamationCount = (response.match(/!/g) || []).length
  if (exclamationCount > 0 && score !== 0) {
    score = Math.round(score * (1 + exclamationCount * 0.15))
  }
  
  // Question marks in dater response often show interest
  const questionCount = (response.match(/\?/g) || []).length
  if (questionCount > 0 && score >= 0) {
    score += questionCount * 2
  }
  
  // Add some randomness for natural variation
  if (score === 0) {
    // Even neutral exchanges should have small fluctuations
    score = Math.floor(Math.random() * 5) - 2 // -2 to +2
  } else {
    // Add ±20% variance to non-zero scores
    const variance = Math.floor(Math.abs(score) * 0.2)
    score += Math.floor(Math.random() * (variance * 2 + 1)) - variance
  }
  
  return score
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
    addDateMessage,
    submitAttribute,
    consumeDaterReaction,
    voteForAttribute,
    applyTopAttributes,
    selectRandomHotSeat,
    applyHotSeatAttribute,
    setPhase,
    tickTimer,
    updateCompatibility,
  } = useGameStore()
  
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
        response = await getDaterDateResponse(selectedDater, currentAvatar, currentConversation, daterAttr)
        // Consume one heightened reaction after Dater speaks
        if (response && reactionsLeft > 0) {
          useGameStore.getState().consumeDaterReaction()
        }
      } else {
        // Get Avatar's response via LLM (with latest attribute to work in subtly)
        response = await getAvatarDateResponse(currentAvatar, selectedDater, currentConversation, currentLatestAttr)
      }
      
      if (response && conversationActiveRef.current) {
        addDateMessage(nextSpeaker, response)
        lastSpeakerRef.current = nextSpeaker
        
        // Update compatibility based on Dater's reactions
        if (nextSpeaker === 'dater') {
          const change = evaluateDaterSentiment(response, reactionsLeft > 0)
          if (change !== 0) {
            updateCompatibility(change)
          }
        }
      } else if (conversationActiveRef.current) {
        // Fallback to scripted dialogue - use expected speaker
        const fallback = getFallbackDateDialogue(nextSpeaker, currentAvatar, selectedDater)
        addDateMessage(fallback.speaker, fallback.message)
        lastSpeakerRef.current = fallback.speaker
      }
    } catch (error) {
      console.error('Error generating conversation:', error)
      // Fallback - use expected speaker
      const nextSpeaker = lastSpeakerRef.current === 'dater' ? 'avatar' : 'dater'
      const currentAvatar = useGameStore.getState().avatar
      const fallback = getFallbackDateDialogue(nextSpeaker, currentAvatar, selectedDater)
      if (conversationActiveRef.current) {
        addDateMessage(fallback.speaker, fallback.message)
        lastSpeakerRef.current = fallback.speaker
      }
    }
    
    setIsConversing(false)
  }, [selectedDater, addDateMessage, updateCompatibility, isConversing])
  
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
        
        const greeting = `So... here we are! I have to say, ${avatar.name}, you seem really interesting. What made you want to meet up tonight?`
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
          
          {/* Compatibility Meter */}
          <motion.div 
            className={`compatibility-meter ${compatibilityFlash || ''}`}
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
              {compatibility > 80 ? '💕' : compatibility > 60 ? '💗' : compatibility > 40 ? '💛' : compatibility > 20 ? '😬' : '💔'}
            </div>
          </motion.div>
          
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
