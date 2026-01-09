import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useGameStore } from '../store/gameStore'
import './ChatPhase.css'

// Simulated Dater responses based on personality
const generateDaterResponse = (dater, playerMessage) => {
  const lowerMsg = playerMessage.toLowerCase()
  const { hiddenAttributes } = dater
  
  // Simple keyword matching for demo
  if (lowerMsg.includes('job') || lowerMsg.includes('work') || lowerMsg.includes('do for')) {
    return `I'm a ${hiddenAttributes.job}! It keeps me pretty busy but I love it. What about you?`
  }
  if (lowerMsg.includes('weekend') || lowerMsg.includes('free time') || lowerMsg.includes('fun')) {
    return `On weekends? Honestly, I'm usually into ${hiddenAttributes.interests.slice(0, 2).join(' or ')}. What's your ideal weekend look like?`
  }
  if (lowerMsg.includes('pet') || lowerMsg.includes('dog') || lowerMsg.includes('cat') || lowerMsg.includes('animal')) {
    if (hiddenAttributes.interests.includes('dogs')) {
      return "I'm such a dog person! 🐕 Do you have any pets?"
    }
    if (hiddenAttributes.interests.includes('cats')) {
      return "Cats are my spirit animal tbh 🐱 Are you a pet person?"
    }
    return "I love animals! Don't have any right now but definitely want some in the future."
  }
  if (lowerMsg.includes('music') || lowerMsg.includes('listen')) {
    if (hiddenAttributes.interests.includes('music')) {
      return "Music is LIFE. I'm always discovering new artists. What kind of music are you into?"
    }
    return "I like a bit of everything, honestly. Depends on my mood!"
  }
  if (lowerMsg.includes('food') || lowerMsg.includes('eat') || lowerMsg.includes('restaurant')) {
    return "Omg I love trying new restaurants! What's your go-to cuisine?"
  }
  if (lowerMsg.includes('deal breaker') || lowerMsg.includes('dealbreaker') || lowerMsg.includes('hate') || lowerMsg.includes('can\'t stand')) {
    return `Hmm good question... I'd say ${hiddenAttributes.dealbreakers[0]} is a big one for me. You?`
  }
  if (lowerMsg.includes('looking for') || lowerMsg.includes('ideal') || lowerMsg.includes('type')) {
    return `I really value someone who's ${hiddenAttributes.idealPartner.slice(0, 2).join(' and ')}. But honestly, chemistry is everything!`
  }
  
  // Default responses
  const defaults = [
    "Haha that's such a good question! 😄",
    "Honestly? I've never thought about it that way before!",
    "Ooh interesting... tell me more about yourself though!",
    `${hiddenAttributes.personality.split('.')[0]}... but I'm curious about you!`,
    "Love that energy! What else should I know about you?",
  ]
  
  return defaults[Math.floor(Math.random() * defaults.length)]
}

function ChatPhase() {
  const { selectedDater, chatMessages, addChatMessage, startDate } = useGameStore()
  const [inputValue, setInputValue] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const messagesEndRef = useRef(null)
  const greetingSentRef = useRef(false)
  
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }
  
  useEffect(() => {
    scrollToBottom()
  }, [chatMessages])
  
  // Initial greeting from Dater
  useEffect(() => {
    if (chatMessages.length === 0 && !greetingSentRef.current) {
      greetingSentRef.current = true
      setTimeout(() => {
        addChatMessage(`Hey! 👋 Nice to match with you! I'm ${selectedDater.name}. What brings you to Bad Date tonight?`, false)
      }, 1000)
    }
  }, [])
  
  const handleSendMessage = (e) => {
    e.preventDefault()
    if (!inputValue.trim()) return
    
    const playerMsg = inputValue.trim()
    addChatMessage(playerMsg, true)
    setInputValue('')
    
    // Simulate Dater typing
    setIsTyping(true)
    setTimeout(() => {
      setIsTyping(false)
      const response = generateDaterResponse(selectedDater, playerMsg)
      addChatMessage(response, false)
    }, 1500 + Math.random() * 1000)
  }
  
  return (
    <div className="chat-phase">
      <div className="chat-container">
        <div className="chat-header">
          <div className="chat-profile">
            <img src={selectedDater.photo} alt={selectedDater.name} />
            <div className="profile-info">
              <h3>{selectedDater.name}</h3>
              <span className="online-status">
                <span className="status-dot" /> Online
              </span>
            </div>
          </div>
          <div className="chat-actions">
            <motion.button
              className="btn btn-primary"
              onClick={startDate}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              🚀 Start the Date!
            </motion.button>
          </div>
        </div>
        
        <div className="chat-messages">
          <div className="chat-intro">
            <span className="match-badge">🎉 It's a Match!</span>
            <p>Chat with {selectedDater.name} to learn more about them before your date. The more you discover, the better you can shape your avatar!</p>
          </div>
          
          <AnimatePresence>
            {chatMessages.map((msg) => (
              <motion.div
                key={msg.id}
                className={`message ${msg.sender === 'player' ? 'sent' : 'received'}`}
                initial={{ opacity: 0, y: 20, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
              >
                {msg.sender !== 'player' && (
                  <img src={selectedDater.photo} alt="" className="message-avatar" />
                )}
                <div className="message-content">
                  <p>{msg.text}</p>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          
          {isTyping && (
            <motion.div 
              className="message received typing-indicator"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <img src={selectedDater.photo} alt="" className="message-avatar" />
              <div className="message-content">
                <div className="typing-dots">
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            </motion.div>
          )}
          
          <div ref={messagesEndRef} />
        </div>
        
        <form className="chat-input-area" onSubmit={handleSendMessage}>
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder={`Ask ${selectedDater.name} something...`}
            autoFocus
          />
          <motion.button
            type="submit"
            className="send-btn"
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            disabled={!inputValue.trim()}
          >
            ➤
          </motion.button>
        </form>
      </div>
      
      <div className="chat-tips">
        <h4>💡 Pro Tips</h4>
        <ul>
          <li>Ask about their job, interests, and dealbreakers</li>
          <li>Discover what they're looking for in a partner</li>
          <li>Use this intel to shape your avatar later!</li>
        </ul>
      </div>
    </div>
  )
}

export default ChatPhase

