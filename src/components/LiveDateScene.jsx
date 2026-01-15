import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useGameStore } from '../store/gameStore'
import { getDaterDateResponse, getAvatarDateResponse, generateDaterValues, checkAttributeMatch } from '../services/llmService'
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
  const daterValues = useGameStore((state) => state.daterValues)
  const glowingValues = useGameStore((state) => state.glowingValues)
  
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
  
  const [chatInput, setChatInput] = useState('')
  const [avatarBubble, setAvatarBubble] = useState('')
  const [daterBubble, setDaterBubble] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [userVote, setUserVote] = useState(null)
  const [showDaterValuesPopup, setShowDaterValuesPopup] = useState(false)
  const [usingFallback, setUsingFallback] = useState(false)
  
  const chatEndRef = useRef(null)
  const phaseTimerRef = useRef(null)
  
  // Check if API key is available
  useEffect(() => {
    const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY
    if (!apiKey) {
      setUsingFallback(true)
      console.warn('⚠️ No API key found - using fallback responses')
    }
  }, [])
  
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
      setDaterBubble(openingLine)
      setAvatarBubble('') // Clear avatar bubble
      addDateMessage('dater', openingLine)
    }
  }, [livePhase])
  
  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [playerChat])
  
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
    
    switch (livePhase) {
      case 'phase1':
        // Check if anyone submitted an attribute
        if (suggestedAttributes.length === 0) {
          // No suggestions - keep timer at 0 and wait
          console.log('Waiting for at least one attribute suggestion...')
          return // Don't transition, stay in Phase 1
        }
        // Move to Phase 2 - voting
        processAttributesForVoting()
        setLivePhase('phase2')
        setPhaseTimer(10)
        setUserVote(null)
        break
        
      case 'phase2':
        // Move to Phase 3 - apply winner and run full conversation
        const winningAttr = getWinningAttributeText()
        applyWinningAttribute()
        setLivePhase('phase3')
        setPhaseTimer(0) // No timer for phase 3 - conversation controls timing
        // Start the full conversation flow
        if (winningAttr) {
          setTimeout(() => generateDateConversation(winningAttr), 500)
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
  
  // Apply scoring with multiplier - uses dater's reaction to inform matching
  const applyScoring = async (avatarMessage, daterReaction, multiplier = 1) => {
    // Pass the dater's reaction so matching can consider if they reacted positively or negatively
    const matchResult = await checkAttributeMatch(avatarMessage, daterValues, selectedDater, daterReaction)
    
    if (matchResult.category) {
      console.log(`Attribute matched (${multiplier}x):`, matchResult)
      
      // Check if already exposed
      const wasAlreadyExposed = exposeValue(matchResult.category, matchResult.matchedValue, matchResult.shortLabel)
      
      if (wasAlreadyExposed) {
        triggerGlow(matchResult.shortLabel)
      }
      
      // Apply compatibility change with multiplier
      const baseChanges = {
        loves: 25,
        likes: 10,
        dislikes: -10,
        dealbreakers: -25,
      }
      const change = Math.round(baseChanges[matchResult.category] * multiplier)
      if (change !== 0) {
        adjustCompatibility(change)
        console.log(`Compatibility ${change > 0 ? '+' : ''}${change}% (${matchResult.category}: ${matchResult.shortLabel}, ${multiplier}x)`)
      }
    }
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
        
        // Dater reacts - FULL SCORING (1x)
        const daterReaction1 = await getDaterDateResponse(
          selectedDater,
          avatarWithNewAttr,
          [...dateConversation.slice(-6), { speaker: 'avatar', message: avatarResponse1 }],
          attrToUse
        )
        
        if (daterReaction1) {
          setDaterBubble(daterReaction1)
          addDateMessage('dater', daterReaction1)
          // Score based on avatar's message AND dater's reaction
          await applyScoring(avatarResponse1, daterReaction1, 1) // Full scoring
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
          
          // Dater reacts - REDUCED SCORING (0.25x)
          const daterReaction2 = await getDaterDateResponse(
            selectedDater,
            avatarWithNewAttr,
            [...dateConversation.slice(-4), { speaker: 'avatar', message: avatarResponse2 }],
            null
          )
          
          if (daterReaction2) {
            setDaterBubble(daterReaction2)
            addDateMessage('dater', daterReaction2)
            await applyScoring(avatarResponse2, daterReaction2, 0.25) // 25% scoring
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
            
            // Dater reacts - MINIMAL SCORING (0.10x)
            const daterReaction3 = await getDaterDateResponse(
              selectedDater,
              avatarWithNewAttr,
              [...dateConversation.slice(-4), { speaker: 'avatar', message: avatarResponse3 }],
              null
            )
            
            if (daterReaction3) {
              setDaterBubble(daterReaction3)
              addDateMessage('dater', daterReaction3)
              await applyScoring(avatarResponse3, daterReaction3, 0.10) // 10% scoring
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
  const handleRoundComplete = () => {
    const newRoundCount = cycleCount + 1
    incrementCycle()
    
    console.log(`Round ${newRoundCount}/${maxCycles} complete`)
    
    if (newRoundCount >= maxCycles) {
      // Game over!
      setLivePhase('ended')
      setTimeout(() => setPhase('results'), 2000)
    } else {
      // Start new round - Dater asks another question
      setLivePhase('phase1')
      setPhaseTimer(15)
      const nextQuestion = getOpeningLine()
      setDaterBubble(nextQuestion)
      setAvatarBubble('')
      addDateMessage('dater', nextQuestion)
    }
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
      case 'phase1': 
        if (phaseTimer <= 0 && suggestedAttributes.length === 0) {
          return '⏳ Waiting for someone to suggest an attribute...'
        }
        return 'Type an attribute for the Avatar!'
      case 'phase2': return 'Enter a number to vote!'
      case 'phase3': return 'Chat with other players'
      default: return ''
    }
  }
  
  return (
    <div className="live-date-scene">
      {/* Fallback Mode Warning */}
      {usingFallback && (
        <div className="fallback-warning">
          ⚠️ NO API KEY - Using fallback responses (LLM not connected)
        </div>
      )}
      
      {/* Header Section - Compact horizontal layout */}
      <div className="live-header">
        <div className="header-row">
          {/* Left: Call to Action */}
          <div className="header-cta">
            <span className="cta-label">{getPhaseTitle()}</span>
          </div>
          
          {/* Center: Compatibility Meter */}
          <div className="compatibility-display">
            <div className="compat-meter">
              <div 
                className="compat-fill" 
                style={{ width: `${compatibility}%` }}
              />
            </div>
            <span className="compat-value">{compatibility}%</span>
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
          {livePhase === 'phase3' && winningAttribute && !isGenerating && !avatarBubble && !daterBubble && (
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
