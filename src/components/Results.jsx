import { motion } from 'framer-motion' // eslint-disable-line no-unused-vars -- motion used as JSX
import { useMemo } from 'react'
import { useGameStore } from '../store/gameStore'
import './Results.css'

function Results() {
  const { 
    compatibility, 
    selectedDater, 
    avatar, 
    dateConversation,
    resetGame,
    liveMode
  } = useGameStore()
  const qualityHits = useGameStore(s => s.qualityHits) || []
  
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
  
  /* eslint-disable react-hooks/purity -- stable random confetti per mount */
  const winConfettiConfigs = useMemo(() => [...Array(20)].map(() => ({
    x: Math.random() * (typeof window !== 'undefined' ? window.innerWidth : 400),
    rotate: Math.random() * 720 - 360,
    duration: 3 + Math.random() * 2,
    delay: Math.random() * 2,
    emoji: ['💕', '❤️', '✨', '💖', '🎉'][Math.floor(Math.random() * 5)]
  })), [])
  const loseConfettiConfigs = useMemo(() => [...Array(10)].map(() => ({
    x: Math.random() * (typeof window !== 'undefined' ? window.innerWidth : 400),
    duration: 4 + Math.random() * 2,
    delay: Math.random() * 3,
    emoji: ['💔', '😬', '🙈', '❌'][Math.floor(Math.random() * 4)]
  })), [])
  /* eslint-enable react-hooks/purity */
  
  return (
    <div className={`results ${isWin ? 'win' : 'lose'} ${liveMode ? 'live-mode-results' : ''}`}>
      <div className="results-background">
        {isWin ? (
          winConfettiConfigs.map((cfg, i) => (
            <motion.span
              key={i}
              className="confetti"
              initial={{ y: -20, x: cfg.x, rotate: 0, opacity: 1 }}
              animate={{ y: (typeof window !== 'undefined' ? window.innerHeight : 600) + 100, rotate: cfg.rotate, opacity: 0 }}
              transition={{ duration: cfg.duration, repeat: Infinity, delay: cfg.delay, ease: 'linear' }}
            >
              {cfg.emoji}
            </motion.span>
          ))
        ) : (
          loseConfettiConfigs.map((cfg, i) => (
            <motion.span
              key={i}
              className="confetti"
              initial={{ y: -20, x: cfg.x, opacity: 0.6 }}
              animate={{ y: (typeof window !== 'undefined' ? window.innerHeight : 600) + 100, opacity: 0 }}
              transition={{ duration: cfg.duration, repeat: Infinity, delay: cfg.delay, ease: 'linear' }}
            >
              {cfg.emoji}
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
          
        </motion.div>
        
        <div className="quality-report">
          <h3 className="quality-report-title">Date Report Card</h3>

          {qualityHits.filter(h => h.type === 'positive').length > 0 && (
            <div className="quality-report-section">
              <span className="quality-report-section-label">Qualities Spotted</span>
              <div className="quality-chip-list">
                {qualityHits.filter(h => h.type === 'positive').map(h => (
                  <span key={h.id} className="quality-chip positive">{h.name}</span>
                ))}
              </div>
            </div>
          )}

          {qualityHits.filter(h => h.type === 'dealbreaker').length > 0 && (
            <div className="quality-report-section">
              <span className="quality-report-section-label">Red Flags</span>
              <div className="quality-chip-list">
                {qualityHits.filter(h => h.type === 'dealbreaker').map(h => (
                  <span key={h.id} className="quality-chip dealbreaker">{h.name}</span>
                ))}
              </div>
            </div>
          )}

          {qualityHits.length === 0 && (
            <p className="quality-report-empty">No major qualities were triggered during this date.</p>
          )}
        </div>

        <motion.div 
          className="results-buttons"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.3 }}
        >
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
      
    </div>
  )
}

export default Results

