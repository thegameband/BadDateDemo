import { useGameStore } from '../store/gameStore'
import { motion } from 'framer-motion'
import './GameHeader.css'

function GameHeader() {
  const { phase, compatibility, dateTimer, selectedDater, avatar } = useGameStore()
  
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
  
  // Compatibility bar color
  const getCompatColor = () => {
    if (compatibility >= 70) return '#06d6a0'
    if (compatibility >= 40) return '#ffd166'
    return '#ff4d6d'
  }
  
  return (
    <header className="game-header">
      {/* Desktop: Logo */}
      <div className="header-left desktop-only">
        <motion.div 
          className="logo"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
        >
          <span className="logo-icon">💔</span>
          <span className="logo-text">Bad Date</span>
        </motion.div>
      </div>
      
      {/* Mobile: Avatar + Compat + Dater (only during date) */}
      {showDateUI && selectedDater && (
        <div className="header-mobile-date mobile-only">
          <div className="mobile-avatar">
            <img src={avatar?.photo || '/avatar-placeholder.png'} alt="You" />
            <span>{avatar?.name || 'You'}</span>
          </div>
          
          <div className="mobile-compat">
            <span className="mobile-compat-value">{compatibility}%</span>
            <div className="mobile-compat-bar">
              <div 
                className="mobile-compat-fill" 
                style={{ width: `${compatibility}%`, background: getCompatColor() }}
              />
            </div>
          </div>
          
          <div className="mobile-dater">
            <img src={selectedDater.photo} alt={selectedDater.name} />
            <span>{selectedDater.name}</span>
          </div>
        </div>
      )}
      
      {/* Desktop: Phase label and dating status */}
      <motion.div 
        className="header-center desktop-only"
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
          <motion.div 
            className="timer timer-large"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            <span className="timer-icon">⏱️</span>
            <span className="timer-value">{formatTime(dateTimer)}</span>
          </motion.div>
        )}
      </div>
    </header>
  )
}

export default GameHeader

