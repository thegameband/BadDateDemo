import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useGameStore } from '../store/gameStore'
import './Matchmaking.css'

function Matchmaking() {
  const { daters, currentDaterIndex, swipeDater } = useGameStore()
  const [swipeDirection, setSwipeDirection] = useState(null)
  
  const currentDater = daters[currentDaterIndex]
  
  const handleSwipe = (direction) => {
    setSwipeDirection(direction)
    setTimeout(() => {
      swipeDater(currentDater.id, direction)
      setSwipeDirection(null)
    }, 300)
  }
  
  return (
    <div className="matchmaking">
      <div className="swipe-container">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentDater.id}
            className={`dater-card ${swipeDirection ? `swiping-${swipeDirection}` : ''}`}
            initial={{ opacity: 0, scale: 0.8, y: 50 }}
            animate={{ 
              opacity: 1, 
              scale: 1, 
              y: 0,
              x: swipeDirection === 'left' ? -300 : swipeDirection === 'right' ? 300 : 0,
              rotate: swipeDirection === 'left' ? -20 : swipeDirection === 'right' ? 20 : 0,
            }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          >
            {swipeDirection && (
              <motion.div 
                className={`swipe-indicator ${swipeDirection}`}
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
              >
                {swipeDirection === 'right' ? '💚 MATCH!' : '❌ PASS'}
              </motion.div>
            )}
            
            <div className="dater-photo">
              <img src={currentDater.photo} alt={currentDater.name} />
            </div>
            
            <div className="dater-info">
              <h2 className="dater-name">
                {currentDater.name}, <span>{currentDater.age}</span>
              </h2>
              <p className="dater-archetype">{currentDater.archetype}</p>
              <p className="dater-tagline">{currentDater.tagline}</p>
              
              <div className="dater-traits">
                {currentDater.talkingTraits.slice(0, 3).map((trait, i) => (
                  <span key={i} className="trait-tag">{trait}</span>
                ))}
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
        
        <div className="swipe-buttons">
          <motion.button
            className="swipe-btn nope"
            onClick={() => handleSwipe('left')}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
          >
            <span>✕</span>
          </motion.button>
          
          <motion.button
            className="swipe-btn like"
            onClick={() => handleSwipe('right')}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
          >
            <span>♥</span>
          </motion.button>
        </div>
      </div>
      
      <div className="swipe-instructions">
        <p className="instant-match-notice">
          💘 <strong>Swipe right to instantly match!</strong>
        </p>
        <p>
          Type <span className="key">Yes</span> or <span className="key">Swipe Right</span> to match
        </p>
        <p>
          Type <span className="key">No</span> or <span className="key">Swipe Left</span> to pass
        </p>
      </div>
      
      <div className="progress-indicator">
        <span>Candidate {currentDaterIndex + 1} of {daters.length}</span>
        <div className="progress-dots">
          {daters.map((_, i) => (
            <span 
              key={i} 
              className={`dot ${i === currentDaterIndex ? 'active' : ''} ${i < currentDaterIndex ? 'seen' : ''}`}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

export default Matchmaking
