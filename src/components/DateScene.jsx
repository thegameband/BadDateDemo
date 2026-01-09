import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useGameStore } from '../store/gameStore'
import './DateScene.css'

// Simulated date conversation
const dateDialogues = [
  { speaker: 'dater', text: "So... here we are! I have to say, you seem interesting." },
  { speaker: 'avatar', text: "Thanks! I've been looking forward to this." },
  { speaker: 'dater', text: "What made you swipe right on me?" },
  { speaker: 'avatar', text: "Something about your profile just... clicked, you know?" },
  { speaker: 'dater', text: "I love that. So tell me about yourself!" },
]

function DateScene() {
  const {
    phase,
    selectedDater,
    avatar,
    dateConversation,
    submittedAttributes,
    appliedAttributes,
    hotSeatPlayer,
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
  const conversationRef = useRef(null)
  const dialogueIndexRef = useRef(0)
  
  // Auto-scroll conversation
  useEffect(() => {
    if (conversationRef.current) {
      conversationRef.current.scrollTop = conversationRef.current.scrollHeight
    }
  }, [dateConversation])
  
  // Initial conversation and timer
  useEffect(() => {
    // Start initial dialogue
    const startDialogue = () => {
      if (dialogueIndexRef.current < dateDialogues.length && dateConversation.length < dateDialogues.length) {
        const dialogue = dateDialogues[dialogueIndexRef.current]
        addDateMessage(dialogue.speaker, dialogue.text)
        dialogueIndexRef.current++
      }
    }
    
    const dialogueTimer = setInterval(startDialogue, 2500)
    startDialogue() // Start immediately
    
    return () => clearInterval(dialogueTimer)
  }, [])
  
  // Timer tick
  useEffect(() => {
    const timer = setInterval(tickTimer, 1000)
    return () => clearInterval(timer)
  }, [])
  
  // Handle attribute-related conversation
  useEffect(() => {
    if (appliedAttributes.length > 0 && phase === 'applying') {
      const lastAttribute = appliedAttributes[appliedAttributes.length - 1]
      
      setTimeout(() => {
        addDateMessage('avatar', `By the way, ${lastAttribute.toLowerCase()}...`)
        
        // Dater reacts
        setTimeout(() => {
          const reactions = [
            "Oh wow, really? That's... interesting!",
            "Haha, I didn't expect that! Tell me more!",
            "Wait, seriously? That changes things...",
            "Okay, I have SO many questions now!",
          ]
          addDateMessage('dater', reactions[Math.floor(Math.random() * reactions.length)])
          
          // Update compatibility randomly for demo
          updateCompatibility(Math.floor(Math.random() * 21) - 10)
        }, 2000)
      }, 1500)
    }
  }, [appliedAttributes.length, phase])
  
  // Transition to hot seat after applying
  useEffect(() => {
    if (phase === 'applying') {
      setTimeout(() => {
        selectRandomHotSeat()
        setPhase('hotseat')
      }, 5000)
    }
  }, [phase])
  
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
                alt="Your Avatar" 
              />
            </div>
            <div className="character-info">
              <h3>{avatar.name}</h3>
              <span>{avatar.age} • {avatar.occupation}</span>
            </div>
            {avatar.attributes.length > 0 && (
              <div className="character-attributes">
                {avatar.attributes.slice(-3).map((attr, i) => (
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
            <span className="animate-heartbeat">💕</span>
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
        
        {/* Conversation */}
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
            <h3>🎭 Shape Your Avatar</h3>
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
            <p>Your avatar is absorbing new traits!</p>
            
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
          </motion.div>
        )}
      </div>
    </div>
  )
}

export default DateScene

