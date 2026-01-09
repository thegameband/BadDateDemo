import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useGameStore } from '../store/gameStore'
import { 
  getDaterDateResponse, 
  getAvatarDateResponse, 
  getFallbackDateDialogue 
} from '../services/llmService'
import './DateScene.css'

function DateScene() {
  const {
    phase,
    selectedDater,
    avatar,
    dateConversation,
    submittedAttributes,
    appliedAttributes,
    hotSeatPlayer,
    compatibility,
    addDateMessage,
    submitAttribute,
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
  const conversationRef = useRef(null)
  const conversationIntervalRef = useRef(null)
  const lastSpeakerRef = useRef(null)
  const conversationActiveRef = useRef(true)
  const greetingSentRef = useRef(false)
  
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
      // Get FRESH conversation from store (avoid stale closure)
      const currentConversation = useGameStore.getState().dateConversation
      const currentAvatar = useGameStore.getState().avatar
      
      // Alternate speakers, starting with dater
      const nextSpeaker = lastSpeakerRef.current === 'dater' ? 'avatar' : 'dater'
      
      let response = null
      
      if (nextSpeaker === 'dater') {
        // Get Dater's response via LLM
        response = await getDaterDateResponse(selectedDater, currentAvatar, currentConversation)
      } else {
        // Get Avatar's response via LLM
        response = await getAvatarDateResponse(currentAvatar, selectedDater, currentConversation)
      }
      
      if (response && conversationActiveRef.current) {
        addDateMessage(nextSpeaker, response)
        lastSpeakerRef.current = nextSpeaker
        
        // Update compatibility based on conversation (simplified for demo)
        if (nextSpeaker === 'dater') {
          // Check if dater's response suggests positive or negative reaction
          const lowerResponse = response.toLowerCase()
          if (lowerResponse.includes('love') || lowerResponse.includes('amazing') || 
              lowerResponse.includes('perfect') || lowerResponse.includes('wow')) {
            updateCompatibility(Math.floor(Math.random() * 5) + 3)
          } else if (lowerResponse.includes('hmm') || lowerResponse.includes('interesting') ||
                     lowerResponse.includes('really?') || lowerResponse.includes('oh...')) {
            updateCompatibility(Math.floor(Math.random() * 5) - 2)
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
      
      await new Promise(r => setTimeout(r, 1500))
      if (!isMounted) return
      
      // Double-check no messages were added while we waited
      const currentMessages = useGameStore.getState().dateConversation
      if (currentMessages.length > 0) return
      
      const greeting = `So... here we are! I have to say, ${avatar.name}, you seem really interesting. What made you want to meet up tonight?`
      addDateMessage('dater', greeting)
      lastSpeakerRef.current = 'dater'
      
      // Avatar responds after a short delay
      await new Promise(r => setTimeout(r, 2500))
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
    
    // Set up continuous conversation - runs every 5-8 seconds
    const runConversation = async () => {
      if (conversationActiveRef.current && isMounted) {
        await generateNextTurn()
      }
    }
    
    // Start conversation loop after initial exchange
    const startDelay = setTimeout(() => {
      conversationIntervalRef.current = setInterval(runConversation, 5000 + Math.random() * 3000)
    }, 6000)
    
    return () => {
      isMounted = false
      conversationActiveRef.current = false
      clearTimeout(startDelay)
      if (conversationIntervalRef.current) {
        clearInterval(conversationIntervalRef.current)
      }
    }
  }, []) // Only run on mount
  
  // React to newly applied attributes with a special conversation beat
  useEffect(() => {
    if (appliedAttributes.length > 0 && phase === 'applying') {
      const latestAttributes = appliedAttributes.slice(-3)
      
      // Give the avatar something to say based on new attributes
      setTimeout(async () => {
        const attributeReveal = latestAttributes[Math.floor(Math.random() * latestAttributes.length)]
        
        // Get LLM response for avatar revealing this attribute
        const avatarResponse = await getAvatarDateResponse(
          { ...avatar, attributes: [...avatar.attributes] },
          selectedDater,
          [...dateConversation, { speaker: 'dater', message: "Tell me more about yourself..." }]
        )
        
        if (avatarResponse) {
          addDateMessage('avatar', avatarResponse)
          lastSpeakerRef.current = 'avatar'
          
          // Dater reacts after a delay
          setTimeout(async () => {
            const daterReaction = await getDaterDateResponse(
              selectedDater,
              { ...avatar, attributes: [...avatar.attributes] },
              [...dateConversation, { speaker: 'avatar', message: avatarResponse }]
            )
            
            if (daterReaction) {
              addDateMessage('dater', daterReaction)
              lastSpeakerRef.current = 'dater'
              
              // Adjust compatibility based on reaction
              const lowerReaction = daterReaction.toLowerCase()
              if (lowerReaction.includes('!') && (lowerReaction.includes('love') || lowerReaction.includes('amazing'))) {
                updateCompatibility(8)
              } else if (lowerReaction.includes('...') || lowerReaction.includes('oh')) {
                updateCompatibility(-5)
              }
            }
          }, 3000)
        }
      }, 2000)
    }
  }, [appliedAttributes.length, phase])
  
  // Timer tick
  useEffect(() => {
    const timer = setInterval(tickTimer, 1000)
    return () => clearInterval(timer)
  }, [tickTimer])
  
  // Transition to hot seat after applying
  useEffect(() => {
    if (phase === 'applying') {
      setTimeout(() => {
        selectRandomHotSeat()
        setPhase('hotseat')
      }, 6000)
    }
  }, [phase, selectRandomHotSeat, setPhase])
  
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
            {avatar.attributes.length > 0 && (
              <div className="character-attributes">
                {avatar.attributes.slice(-4).map((attr, i) => (
                  <motion.span 
                    key={i}
                    className="attr-tag"
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: i * 0.1 }}
                  >
                    {attr}
                  </motion.span>
                ))}
              </div>
            )}
          </motion.div>
          
          {/* VS */}
          <div className="vs-badge">
            <motion.span 
              className="animate-heartbeat"
              animate={{ 
                scale: compatibility > 70 ? [1, 1.2, 1] : [1, 1.05, 1],
                color: compatibility > 70 ? '#06d6a0' : compatibility > 40 ? '#ff4d6d' : '#9d4edd'
              }}
              transition={{ duration: 1, repeat: Infinity }}
            >
              {compatibility > 70 ? '💕' : compatibility > 40 ? '💗' : '💔'}
            </motion.span>
          </div>
          
          {/* Dater */}
          <motion.div 
            className="character dater-character"
            initial={{ x: 100, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
          >
            <div className="character-image">
              <img src={selectedDater.photo} alt={selectedDater.name} />
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
                maxLength={50}
              />
              <button type="submit" className="btn btn-primary">
                Submit
              </button>
            </form>
            
            <div className="submitted-list">
              <h4>Submitted ({submittedAttributes.length}/6)</h4>
              {submittedAttributes.map((attr) => (
                <motion.div 
                  key={attr.id}
                  className="submitted-attr"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                >
                  {attr.text}
                </motion.div>
              ))}
              
              {submittedAttributes.length >= 4 && (
                <button 
                  className="btn btn-secondary"
                  onClick={() => setPhase('voting')}
                >
                  Ready to Vote! →
                </button>
              )}
            </div>
            
            <div className="conversation-reminder">
              <p>👀 Keep watching the conversation for more intel!</p>
            </div>
          </motion.div>
        )}
        
        {/* Voting Phase */}
        {phase === 'voting' && (
          <motion.div 
            className="sidebar-panel voting-panel"
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
          >
            <h3>🗳️ Vote for Attributes</h3>
            <p className="panel-desc">
              Pick up to 3 attributes to apply to your avatar!
            </p>
            
            <div className="voting-list">
              {submittedAttributes.map((attr) => (
                <motion.button
                  key={attr.id}
                  className={`vote-option ${votedAttributes.has(attr.id) ? 'voted' : ''}`}
                  onClick={() => handleVote(attr.id)}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  disabled={votedAttributes.has(attr.id) || (votedAttributes.size >= 3 && !votedAttributes.has(attr.id))}
                >
                  <span className="vote-text">{attr.text}</span>
                  <span className="vote-count">{attr.votes} 👍</span>
                </motion.button>
              ))}
            </div>
            
            <motion.button
              className="btn btn-success finish-vote-btn"
              onClick={handleFinishVoting}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              Apply Top Attributes! ✨
            </motion.button>
            
            <div className="conversation-reminder">
              <p>👀 The date continues while you vote!</p>
            </div>
          </motion.div>
        )}
        
        {/* Applying Phase */}
        {phase === 'applying' && (
          <motion.div 
            className="sidebar-panel applying-panel"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            <div className="applying-animation">
              <motion.span
                animate={{ rotate: 360 }}
                transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
              >
                ✨
              </motion.span>
            </div>
            <h3>Transforming Avatar...</h3>
            <p>Watch how {selectedDater.name} reacts!</p>
            
            <div className="applied-attrs">
              {appliedAttributes.slice(-3).map((attr, i) => (
                <motion.div
                  key={i}
                  className="applied-attr"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.3 }}
                >
                  ✓ {attr}
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
        
        {/* Hot Seat Phase */}
        {phase === 'hotseat' && (
          <motion.div 
            className="sidebar-panel hotseat-panel"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            <div className="hotseat-spotlight">
              <motion.div
                className="spotlight-ring"
                animate={{ 
                  boxShadow: [
                    '0 0 20px var(--accent-coral)',
                    '0 0 60px var(--accent-coral)',
                    '0 0 20px var(--accent-coral)',
                  ]
                }}
                transition={{ duration: 1.5, repeat: Infinity }}
              />
              <span className="fire-icon">🔥</span>
            </div>
            
            <h3>HOT SEAT!</h3>
            <p className="hotseat-player">
              <strong>{hotSeatPlayer?.name || 'Player 1'}</strong> is in control!
            </p>
            <p className="panel-desc">
              Add ANY attribute instantly. No voting. Pure power.
            </p>
            
            <form onSubmit={handleHotSeatSubmit} className="hotseat-form">
              <input
                type="text"
                value={hotSeatInput}
                onChange={(e) => setHotSeatInput(e.target.value)}
                placeholder="Your moment of power..."
                autoFocus
                maxLength={50}
              />
              <button type="submit" className="btn btn-chaos">
                🔥 Apply Now!
              </button>
            </form>
            
            <div className="conversation-reminder">
              <p>👀 Watch {selectedDater.name}'s reaction live!</p>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  )
}

export default DateScene
