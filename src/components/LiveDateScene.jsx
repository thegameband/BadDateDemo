import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useGameStore } from '../store/gameStore'
import { getDaterDateResponse, getAvatarDateResponse } from '../services/llmService'
import './LiveDateScene.css'

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
  const updateCompatibilityFactor = useGameStore((state) => state.updateCompatibilityFactor)
  
  const [chatInput, setChatInput] = useState('')
  const [currentBubble, setCurrentBubble] = useState({ speaker: null, text: '' })
  const [isGenerating, setIsGenerating] = useState(false)
  const [userVote, setUserVote] = useState(null)
  
  const chatEndRef = useRef(null)
  const phaseTimerRef = useRef(null)
  
  // Phase timer countdown
  useEffect(() => {
    if (livePhase === 'phase1' || livePhase === 'phase2' || livePhase === 'phase3') {
      phaseTimerRef.current = setInterval(() => {
        tickPhaseTimer()
      }, 1000)
      
      return () => {
        if (phaseTimerRef.current) {
          clearInterval(phaseTimerRef.current)
        }
      }
    }
  }, [livePhase, tickPhaseTimer])
  
  // Handle phase transitions when timer hits 0
  useEffect(() => {
    if (phaseTimer <= 0) {
      handlePhaseEnd()
    }
  }, [phaseTimer])
  
  // Start Phase 1 - Dater asks Avatar about themselves
  useEffect(() => {
    if (livePhase === 'phase1' && dateConversation.length === 0) {
      // Dater's opening question
      const openingLine = getOpeningLine()
      setCurrentBubble({ speaker: 'dater', text: openingLine })
      addDateMessage('dater', openingLine)
    }
  }, [livePhase])
  
  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [playerChat])
  
  const getOpeningLine = () => {
    const lines = [
      "So... tell me something about yourself!",
      "I'd love to know more about you. What's your deal?",
      "Let's get to know each other. What makes you, you?",
      "Okay, I'm curious - what should I know about you?",
      "First impressions matter, so... who are you really?",
    ]
    return lines[Math.floor(Math.random() * lines.length)]
  }
  
  const handlePhaseEnd = async () => {
    if (phaseTimerRef.current) {
      clearInterval(phaseTimerRef.current)
    }
    
    switch (livePhase) {
      case 'phase1':
        // Move to Phase 2 - voting
        processAttributesForVoting()
        setLivePhase('phase2')
        setPhaseTimer(10)
        setUserVote(null)
        break
        
      case 'phase2':
        // Move to Phase 3 - apply winner and continue date
        applyWinningAttribute()
        setLivePhase('phase3')
        setPhaseTimer(30)
        // Start the conversation
        setTimeout(() => generateDateConversation(), 500)
        break
        
      case 'phase3':
        // Check if game should end
        const newCycleCount = cycleCount + 1
        incrementCycle()
        
        if (newCycleCount >= maxCycles) {
          // Game over!
          setLivePhase('ended')
          setTimeout(() => setPhase('results'), 2000)
        } else {
          // Start new cycle
          setLivePhase('phase1')
          setPhaseTimer(15)
          // Dater asks another question
          const followUpLine = getFollowUpLine()
          setCurrentBubble({ speaker: 'dater', text: followUpLine })
          addDateMessage('dater', followUpLine)
        }
        break
    }
  }
  
  const getFollowUpLine = () => {
    const lines = [
      "Interesting... what else should I know?",
      "Okay, tell me more about yourself.",
      "That's... something. Anything else?",
      "I feel like there's more to you. Spill.",
      "What other surprises do you have?",
    ]
    return lines[Math.floor(Math.random() * lines.length)]
  }
  
  const generateDateConversation = async () => {
    if (isGenerating || !selectedDater || !latestAttribute) return
    setIsGenerating(true)
    
    try {
      // Avatar responds to having the new attribute
      const avatarResponse = await getAvatarDateResponse(
        avatar,
        selectedDater,
        dateConversation.slice(-6),
        latestAttribute
      )
      
      setCurrentBubble({ speaker: 'avatar', text: avatarResponse })
      addDateMessage('avatar', avatarResponse)
      
      // Wait a moment, then dater reacts
      await new Promise(resolve => setTimeout(resolve, 2500))
      
      // Get dater's reaction
      const daterResponse = await getDaterDateResponse(
        selectedDater,
        avatar,
        [...dateConversation.slice(-6), { speaker: 'avatar', message: avatarResponse }]
      )
      
      setCurrentBubble({ speaker: 'dater', text: daterResponse.message })
      addDateMessage('dater', daterResponse.message)
      
      // Update compatibility based on sentiment
      if (daterResponse.sentiment !== 0) {
        const factor = daterResponse.factor || 'random'
        updateCompatibilityFactor(factor, daterResponse.sentiment, daterResponse.reason)
        
        // Add to sentiment categories based on sentiment
        if (latestAttribute) {
          if (daterResponse.sentiment >= 8) {
            addSentimentItem('loves', latestAttribute)
          } else if (daterResponse.sentiment > 0) {
            addSentimentItem('likes', latestAttribute)
          } else if (daterResponse.sentiment > -8) {
            addSentimentItem('dislikes', latestAttribute)
          } else {
            addSentimentItem('dealbreakers', latestAttribute)
          }
        }
      }
      
    } catch (error) {
      console.error('Error generating conversation:', error)
    }
    
    setIsGenerating(false)
  }
  
  const handleChatSubmit = (e) => {
    e.preventDefault()
    if (!chatInput.trim()) return
    
    const message = chatInput.trim()
    
    // In Phase 1, treat messages as attribute suggestions
    if (livePhase === 'phase1') {
      submitAttributeSuggestion(message, username)
      addPlayerChatMessage(username, `[ATTRIBUTE] ${message}`)
    } 
    // In Phase 2, check if it's a vote
    else if (livePhase === 'phase2') {
      const num = parseInt(message)
      if (!isNaN(num) && num >= 1 && num <= numberedAttributes.length) {
        voteForNumberedAttribute(num, username)
        setUserVote(num)
        addPlayerChatMessage(username, `Voted for #${num}`)
      } else {
        addPlayerChatMessage(username, message)
      }
    }
    // Phase 3 - just regular chat
    else {
      addPlayerChatMessage(username, message)
    }
    
    setChatInput('')
  }
  
  const formatTime = (seconds) => {
    return `0:${seconds.toString().padStart(2, '0')}`
  }
  
  const getPhaseTitle = () => {
    switch (livePhase) {
      case 'phase1': return 'SUGGEST ATTRIBUTES'
      case 'phase2': return 'VOTE FOR YOUR FAVORITE'
      case 'phase3': return 'WATCH THE DATE'
      case 'ended': return 'DATE COMPLETE'
      default: return ''
    }
  }
  
  const getPhaseInstructions = () => {
    switch (livePhase) {
      case 'phase1': return 'Type an attribute for the Avatar!'
      case 'phase2': return 'Enter a number to vote!'
      case 'phase3': return 'Chat with other players'
      default: return ''
    }
  }
  
  return (
    <div className="live-date-scene">
      {/* Header Section */}
      <div className="live-header">
        <div className="phase-timer">
          <span className="timer-label">{getPhaseTitle()}</span>
          <span className="timer-value">{formatTime(phaseTimer)}</span>
          <span className="cycle-count">Round {cycleCount + 1}/{maxCycles}</span>
        </div>
        
        <div className="date-participants">
          <div className="participant avatar-side">
            <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=PlayerAvatar&backgroundColor=c0aede" alt="You" className="participant-photo" />
            <span className="participant-name">You</span>
          </div>
          
          <div className="compatibility-display">
            <div className="compat-meter">
              <div 
                className="compat-fill" 
                style={{ width: `${compatibility}%` }}
              />
            </div>
            <span className="compat-value">{compatibility}%</span>
          </div>
          
          <div className="participant dater-side">
            <img src={selectedDater?.photo} alt={selectedDater?.name} className="participant-photo" />
            <span className="participant-name">{selectedDater?.name}</span>
          </div>
        </div>
      </div>
      
      {/* Sentiment Categories */}
      <div className="sentiment-bar">
        <div className="sentiment-category loves">
          <span className="category-label">✨ Loves</span>
          <div className="category-items">
            {sentimentCategories.loves.map((item, i) => (
              <span key={i} className="sentiment-item">{item}</span>
            ))}
          </div>
        </div>
        <div className="sentiment-category likes">
          <span className="category-label">💛 Likes</span>
          <div className="category-items">
            {sentimentCategories.likes.map((item, i) => (
              <span key={i} className="sentiment-item">{item}</span>
            ))}
          </div>
        </div>
        <div className="sentiment-category dislikes">
          <span className="category-label">😬 Dislikes</span>
          <div className="category-items">
            {sentimentCategories.dislikes.map((item, i) => (
              <span key={i} className="sentiment-item">{item}</span>
            ))}
          </div>
        </div>
        <div className="sentiment-category dealbreakers">
          <span className="category-label">💔 Nope</span>
          <div className="category-items">
            {sentimentCategories.dealbreakers.map((item, i) => (
              <span key={i} className="sentiment-item">{item}</span>
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
              <h3>Vote for an Attribute!</h3>
              <div className="voting-options">
                {numberedAttributes.map((attr) => (
                  <motion.div 
                    key={attr.number}
                    className={`vote-option ${userVote === attr.number ? 'voted' : ''}`}
                    onClick={() => {
                      voteForNumberedAttribute(attr.number, username)
                      setUserVote(attr.number)
                      addPlayerChatMessage(username, `Voted for #${attr.number}`)
                    }}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <span className="vote-number">{attr.number}</span>
                    <span className="vote-text">{attr.text}</span>
                    <span className="vote-count">{attr.votes.length} votes</span>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        
        {/* Winning Attribute Announcement */}
        <AnimatePresence>
          {livePhase === 'phase3' && winningAttribute && !isGenerating && currentBubble.speaker === null && (
            <motion.div 
              className="winner-announcement"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
            >
              <span className="winner-label">🎉 Winner!</span>
              <span className="winner-text">{winningAttribute.text}</span>
            </motion.div>
          )}
        </AnimatePresence>
        
        {/* Characters */}
        <div className="characters-container">
          <div className="character avatar-character">
            <img 
              src="https://api.dicebear.com/7.x/avataaars/svg?seed=PlayerAvatar&backgroundColor=c0aede" 
              alt="You" 
              className="character-image"
            />
            <AnimatePresence>
              {currentBubble.speaker === 'avatar' && (
                <motion.div 
                  className="speech-bubble avatar-bubble"
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0, opacity: 0 }}
                >
                  {currentBubble.text}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          
          <div className="character dater-character">
            <img 
              src={selectedDater?.photo} 
              alt={selectedDater?.name} 
              className="character-image"
            />
            <AnimatePresence>
              {currentBubble.speaker === 'dater' && (
                <motion.div 
                  className="speech-bubble dater-bubble"
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0, opacity: 0 }}
                >
                  {currentBubble.text}
                </motion.div>
              )}
            </AnimatePresence>
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
            placeholder={livePhase === 'phase1' ? 'Suggest an attribute...' : livePhase === 'phase2' ? 'Enter a number to vote...' : 'Chat...'}
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
