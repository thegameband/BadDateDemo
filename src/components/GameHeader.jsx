import { useGameStore } from '../store/gameStore'
import { motion } from 'framer-motion'
import './GameHeader.css'

function GameHeader() {
  const { phase, compatibility, dateTimer, selectedDater } = useGameStore()
  
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }
  
  const getPhaseLabel = () => {
    switch (phase) {
      case 'matchmaking': return '💘 Find Your Match'
      case 'chatting': return '💬 Get to Know Them'
      case 'smalltalk': return '🗣️ Small Talk'
      case 'voting': return '🗳️ Vote on Attributes'
      case 'applying': return '✨ Transforming...'
      case 'hotseat': return '🔥 Hot Seat!'
      default: return ''
    }
  }
  
  const showDateUI = ['smalltalk', 'voting', 'applying', 'hotseat'].includes(phase)
  
  return (
    <header className="game-header">
      <div className="header-left">
        <motion.div 
          className="logo"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
        >
          <span className="logo-icon">💔</span>
          <span className="logo-text">Bad Date</span>
        </motion.div>
      </div>
      
      <motion.div 
        className="header-center"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <span className="phase-label">{getPhaseLabel()}</span>
        {selectedDater && phase !== 'matchmaking' && (
          <span className="dating-status">
            Dating: <strong>{selectedDater.name}</strong>
          </span>
        )}
      </motion.div>
      
      <div className="header-right">
        {showDateUI && (
          <>
            <motion.div 
              className="compatibility-meter"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
            >
              <span className="meter-label">💕 Match</span>
              <div className="meter-bar">
                <motion.div 
                  className="meter-fill"
                  initial={{ width: 0 }}
                  animate={{ width: `${compatibility}%` }}
                  style={{
                    background: compatibility >= 80 
                      ? 'var(--gradient-success)' 
                      : compatibility >= 50 
                        ? 'var(--gradient-love)'
                        : 'var(--gradient-chaos)'
                  }}
                />
              </div>
              <span className="meter-value">{compatibility}%</span>
            </motion.div>
            
            <motion.div 
              className="timer"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
            >
              <span className="timer-icon">⏱️</span>
              <span className="timer-value">{formatTime(dateTimer)}</span>
            </motion.div>
          </>
        )}
      </div>
    </header>
  )
}

export default GameHeader

