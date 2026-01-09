import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useGameStore } from '../store/gameStore'
import { getDaterChatResponse, getFallbackDaterResponse, extractTraitFromResponse } from '../services/llmService'
import './ChatPhase.css'

function ChatPhase() {
  const { selectedDater, chatMessages, addChatMessage, startDate, discoveredTraits, addDiscoveredTrait } = useGameStore()
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
  
  // Initial greeting from Dater - asks what they want to know
  useEffect(() => {
    if (chatMessages.length === 0 && !greetingSentRef.current) {
      greetingSentRef.current = true
      setTimeout(() => {
        addChatMessage(`Hey! 👋 So, what do you want to know about me? Ask away!`, false)
      }, 1000)
    }
  }, [])
  
  const handleSendMessage = async (e) => {
    e.preventDefault()
    if (!inputValue.trim() || isTyping) return
    
    const playerMsg = inputValue.trim()
    addChatMessage(playerMsg, true)
    setInputValue('')
    
    // Show typing indicator
    setIsTyping(true)
    
    // Try LLM response first, fallback to hardcoded
    try {
      // Build conversation history for LLM
      const conversationHistory = [
        ...chatMessages,
        { text: playerMsg, isPlayer: true }
      ]
      
      const llmResponse = await getDaterChatResponse(selectedDater, conversationHistory)
      
      if (llmResponse) {
        setIsTyping(false)
        addChatMessage(llmResponse, false)
        
        // Extract a specific, diverse trait from the response
        const trait = await extractTraitFromResponse(playerMsg, llmResponse, discoveredTraits)
        if (trait) {
          addDiscoveredTrait(trait)
        }
      } else {
        // Fallback to hardcoded responses
        setTimeout(async () => {
          setIsTyping(false)
          const fallbackResponse = getFallbackDaterResponse(selectedDater, playerMsg)
          addChatMessage(fallbackResponse, false)
          
          // Extract trait from fallback too
          const trait = await extractTraitFromResponse(playerMsg, fallbackResponse, discoveredTraits)
          if (trait) {
            addDiscoveredTrait(trait)
          }
        }, 1000)
      }
    } catch (error) {
      console.error('Error getting LLM response:', error)
      // Fallback
      setTimeout(() => {
        setIsTyping(false)
        const fallbackResponse = getFallbackDaterResponse(selectedDater, playerMsg)
        addChatMessage(fallbackResponse, false)
      }, 1000)
    }
  }
  
  return (
    <div className="chat-phase">
      <div className="chat-container">
        <div className="chat-header">
          <div className="chat-profile">
            <img src={selectedDater.photo} alt={selectedDater.name} />
            <div className="profile-info">
              <h3>{selectedDater.name}, {selectedDater.age}</h3>
              <span className="profile-archetype">{selectedDater.archetype}</span>
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
        
        {/* Concise character card */}
        <div className="character-card">
          <div className="card-row">
            <span className="card-label">📍</span>
            <span>{selectedDater.hometown}</span>
          </div>
          <div className="card-row">
            <span className="card-label">💫</span>
            <span>{selectedDater.tagline}</span>
          </div>
          
          {/* Discovered traits - revealed through conversation */}
          <div className="discovered-traits">
            <span className="discovered-label">🔍 Discovered:</span>
            {discoveredTraits.length === 0 ? (
              <span className="no-traits-yet">Ask questions to learn more...</span>
            ) : (
              <div className="trait-chips">
                <AnimatePresence>
                  {discoveredTraits.map((trait, i) => (
                    <motion.span
                      key={trait}
                      className="discovered-chip"
                      initial={{ opacity: 0, scale: 0.5, y: 10 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      transition={{ type: 'spring', stiffness: 400, delay: i * 0.05 }}
                    >
                      {trait}
                    </motion.span>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </div>
        </div>
        
        <div className="chat-messages">
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
            placeholder={`Ask ${selectedDater.name} a question...`}
            autoFocus
            disabled={isTyping}
          />
          <motion.button
            type="submit"
            className="send-btn"
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            disabled={!inputValue.trim() || isTyping}
          >
            ➤
          </motion.button>
        </form>
      </div>
      
      <div className="chat-tips">
        <h4>🔍 Interrogate Your Date</h4>
        <ul>
          <li>Ask about their background & upbringing</li>
          <li>Discover their values and beliefs</li>
          <li>Find out their dealbreakers</li>
          <li>Learn what they're looking for</li>
        </ul>
        
        <div className="api-status">
          {import.meta.env.VITE_ANTHROPIC_API_KEY ? (
            <span className="status-active">🤖 AI-Powered</span>
          ) : (
            <span className="status-fallback">📝 Demo Mode</span>
          )}
        </div>
      </div>
    </div>
  )
}

export default ChatPhase
