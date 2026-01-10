import { motion } from 'framer-motion'
import { useRef, useState } from 'react'
import html2canvas from 'html2canvas'
import { useGameStore } from '../store/gameStore'
import './Results.css'

function Results() {
  const { 
    compatibility, 
    selectedDater, 
    avatar, 
    appliedAttributes,
    dateConversation,
    resetGame 
  } = useGameStore()
  
  const shareCardRef = useRef(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [showShareCard, setShowShareCard] = useState(false)
  
  const isWin = compatibility >= 80
  const isGreatMatch = compatibility >= 95
  const isTerrible = compatibility <= 20
  
  const getResultTitle = () => {
    if (isGreatMatch) return "💒 PERFECT MATCH!"
    if (isWin) return "😘 They're Into You!"
    if (isTerrible) return "💀 Absolute Disaster"
    if (compatibility >= 50) return "😬 Awkward Silence..."
    return "❌ Total Rejection"
  }
  
  const getResultDescription = () => {
    if (isGreatMatch) {
      return `${selectedDater.name} is already texting their friends about you. Vegas wedding incoming? 💍`
    }
    if (isWin) {
      return `You did it! ${selectedDater.name} definitely wants a second date. The chemistry was real! ✨`
    }
    if (isTerrible) {
      return `${selectedDater.name} has already blocked you on every platform. They're telling this story at parties for years.`
    }
    if (compatibility >= 50) {
      return `It wasn't terrible, but ${selectedDater.name} is giving you the "I'll text you" that never comes.`
    }
    return `${selectedDater.name} excused themselves to the bathroom 20 minutes ago. They're not coming back.`
  }
  
  const getEndingScene = () => {
    if (isGreatMatch) return "🌅 Walking hand-in-hand into the sunset..."
    if (isWin) return "💋 A sweet goodnight kiss at the door."
    if (isTerrible) return "🚕 They called an Uber from the table."
    if (compatibility >= 50) return "🤝 An awkward handshake goodbye."
    return "🏃 Speed-walking in the opposite direction."
  }
  
  const handleShareDate = async () => {
    setShowShareCard(true)
    setIsGenerating(true)
    
    // Wait for the card to render
    await new Promise(resolve => setTimeout(resolve, 100))
    
    if (shareCardRef.current) {
      try {
        const canvas = await html2canvas(shareCardRef.current, {
          backgroundColor: '#1a1a2e',
          scale: 2,
          useCORS: true,
          allowTaint: true,
        })
        
        // Convert to blob and download
        canvas.toBlob((blob) => {
          const url = URL.createObjectURL(blob)
          const link = document.createElement('a')
          link.download = `bad-date-${selectedDater.name.toLowerCase()}-${Date.now()}.png`
          link.href = url
          link.click()
          URL.revokeObjectURL(url)
          setIsGenerating(false)
        }, 'image/png')
      } catch (error) {
        console.error('Error generating image:', error)
        setIsGenerating(false)
      }
    }
  }
  
  // Get the most interesting messages for the share card (limit to 8)
  const getHighlightMessages = () => {
    if (dateConversation.length <= 8) return dateConversation
    // Take first 2, last 2, and 4 from the middle
    const first = dateConversation.slice(0, 2)
    const last = dateConversation.slice(-2)
    const middleStart = Math.floor(dateConversation.length / 2) - 2
    const middle = dateConversation.slice(middleStart, middleStart + 4)
    return [...first, ...middle, ...last]
  }
  
  return (
    <div className={`results ${isWin ? 'win' : 'lose'}`}>
      <div className="results-background">
        {isWin ? (
          [...Array(20)].map((_, i) => (
            <motion.span
              key={i}
              className="confetti"
              initial={{ 
                y: -20, 
                x: Math.random() * window.innerWidth,
                rotate: 0,
                opacity: 1 
              }}
              animate={{ 
                y: window.innerHeight + 100,
                rotate: Math.random() * 720 - 360,
                opacity: 0
              }}
              transition={{
                duration: 3 + Math.random() * 2,
                repeat: Infinity,
                delay: Math.random() * 2,
                ease: 'linear'
              }}
            >
              {['💕', '❤️', '✨', '💖', '🎉'][Math.floor(Math.random() * 5)]}
            </motion.span>
          ))
        ) : (
          [...Array(10)].map((_, i) => (
            <motion.span
              key={i}
              className="confetti"
              initial={{ 
                y: -20, 
                x: Math.random() * window.innerWidth,
                opacity: 0.6 
              }}
              animate={{ 
                y: window.innerHeight + 100,
                opacity: 0
              }}
              transition={{
                duration: 4 + Math.random() * 2,
                repeat: Infinity,
                delay: Math.random() * 3,
                ease: 'linear'
              }}
            >
              {['💔', '😬', '🙈', '❌'][Math.floor(Math.random() * 4)]}
            </motion.span>
          ))
        )}
      </div>
      
      <motion.div 
        className="results-card"
        initial={{ opacity: 0, scale: 0.8, y: 50 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 200, damping: 20 }}
      >
        <motion.div 
          className="compatibility-result"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.3, type: 'spring', stiffness: 300 }}
        >
          <div className={`compat-circle ${isWin ? 'success' : 'fail'}`}>
            <span className="compat-value">{compatibility}%</span>
            <span className="compat-label">Compatible</span>
          </div>
        </motion.div>
        
        <motion.h1 
          className="result-title"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          {getResultTitle()}
        </motion.h1>
        
        <motion.p 
          className="result-description"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7 }}
        >
          {getResultDescription()}
        </motion.p>
        
        <motion.div 
          className="ending-scene"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.9 }}
        >
          <p>{getEndingScene()}</p>
        </motion.div>
        
        <motion.div 
          className="date-summary"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.1 }}
        >
          <h3>Date Recap</h3>
          
          <div className="summary-row">
            <div className="summary-item">
              <img src={selectedDater.photo} alt={selectedDater.name} />
              <div>
                <strong>{selectedDater.name}</strong>
                <span>{selectedDater.tagline}</span>
              </div>
            </div>
            
            <span className="summary-vs">💕</span>
            
            <div className="summary-item">
              <img 
                src="https://api.dicebear.com/7.x/avataaars/svg?seed=Avatar&backgroundColor=b6e3f4" 
                alt="Avatar" 
              />
              <div>
                <strong>{avatar.name}</strong>
                <span>{avatar.occupation}</span>
              </div>
            </div>
          </div>
          
          {appliedAttributes.length > 0 && (
            <div className="applied-summary">
              <h4>Avatar Became:</h4>
              <div className="attr-list">
                {appliedAttributes.map((attr, i) => (
                  <span key={i} className="attr-badge">{attr}</span>
                ))}
              </div>
            </div>
          )}
        </motion.div>
        
        <motion.div 
          className="results-buttons"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.3 }}
        >
          <motion.button
            className="btn btn-secondary share-btn"
            onClick={handleShareDate}
            disabled={isGenerating}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            {isGenerating ? '⏳ Generating...' : '📸 Share Date'}
          </motion.button>
          
          <motion.button
            className="btn btn-primary play-again-btn"
            onClick={resetGame}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            🔄 Play Again
          </motion.button>
        </motion.div>
      </motion.div>
      
      {/* Hidden share card for image capture */}
      {showShareCard && (
        <div className="share-card-container">
          <div ref={shareCardRef} className="share-card">
            <div className="share-header">
              <h2>💔 BAD DATE 💔</h2>
              <div className="share-compat">
                <span className={`compat-badge ${isWin ? 'win' : 'lose'}`}>
                  {compatibility}% Compatible
                </span>
              </div>
            </div>
            
            <div className="share-profiles">
              <div className="share-profile">
                <img src={selectedDater.photo} alt={selectedDater.name} />
                <strong>{selectedDater.name}</strong>
              </div>
              <span className="share-heart">{isWin ? '💕' : '💔'}</span>
              <div className="share-profile">
                <img 
                  src="https://api.dicebear.com/7.x/avataaars/svg?seed=Avatar&backgroundColor=b6e3f4" 
                  alt="Avatar" 
                />
                <strong>{avatar.name}</strong>
              </div>
            </div>
            
            {appliedAttributes.length > 0 && (
              <div className="share-attributes">
                <span className="attr-label">Avatar was:</span>
                <div className="attr-tags">
                  {appliedAttributes.slice(0, 5).map((attr, i) => (
                    <span key={i} className="attr-tag">{attr}</span>
                  ))}
                </div>
              </div>
            )}
            
            <div className="share-conversation">
              <h3>💬 Highlights</h3>
              <div className="share-messages">
                {getHighlightMessages().map((msg, i) => (
                  <div 
                    key={i} 
                    className={`share-msg ${msg.speaker === 'avatar' ? 'avatar' : 'dater'}`}
                  >
                    <span className="msg-name">
                      {msg.speaker === 'avatar' ? avatar.name : selectedDater.name}:
                    </span>
                    <span className="msg-text">{msg.message}</span>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="share-footer">
              <span className="share-result">{getResultTitle()}</span>
              <span className="share-url">bad-date-demo.vercel.app</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Results

