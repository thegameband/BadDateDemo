import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useGameStore } from '../store/gameStore'
import './Matchmaking.css'

function Matchmaking() {
  const { 
    daters, 
    currentDaterIndex, 
    votes, 
    topThreeDaters, 
    showingTopThree,
    swipeDater,
    selectFinalDater 
  } = useGameStore()
  
  const [swipeDirection, setSwipeDirection] = useState(null)
  const currentDater = daters[currentDaterIndex]
  
  const handleSwipe = (direction) => {
    setSwipeDirection(direction)
    setTimeout(() => {
      swipeDater(currentDater.id, direction)
      setSwipeDirection(null)
    }, 300)
  }
  
  if (showingTopThree) {
    return (
      <div className="matchmaking top-three-view">
        <motion.div 
          className="top-three-header"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <h2>🏆 Your Top 3 Matches!</h2>
          <p>Choose your date for tonight</p>
        </motion.div>
        
        <div className="top-three-grid">
          {topThreeDaters.map((dater, index) => (
            <motion.div
              key={dater.id}
              className="top-three-card"
              initial={{ opacity: 0, y: 50, scale: 0.8 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ delay: index * 0.15 }}
              whileHover={{ y: -10, scale: 1.02 }}
              onClick={() => selectFinalDater(dater.id)}
            >
              <div className="rank-badge">{index + 1}</div>
              <div className="card-photo">
                <img src={dater.photo} alt={dater.name} />
              </div>
              <div className="card-info">
                <h3>{dater.name}, {dater.age}</h3>
                <p className="tagline">{dater.tagline}</p>
                <div className="vote-count">
                  <span className="votes-yes">💚 {votes[dater.id]?.yes || 0}</span>
                </div>
              </div>
              <button className="btn btn-primary select-btn">
                Choose {dater.name}
              </button>
            </motion.div>
          ))}
        </div>
        
        <p className="instruction-text">
          Type <span className="key">1</span>, <span className="key">2</span>, or <span className="key">3</span> to select
        </p>
      </div>
    )
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
                {swipeDirection === 'right' ? '💚 YES' : '❌ NOPE'}
              </motion.div>
            )}
            
            <div className="dater-photo">
              <img src={currentDater.photo} alt={currentDater.name} />
            </div>
            
            <div className="dater-info">
              <h2 className="dater-name">
                {currentDater.name}, <span>{currentDater.age}</span>
              </h2>
              <p className="dater-tagline">{currentDater.tagline}</p>
              
              <div className="dater-traits">
                {currentDater.visibleTraits.map((trait, i) => (
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
        <p>
          Type <span className="key">Yes</span> or <span className="key">Swipe Right</span> to like
        </p>
        <p>
          Type <span className="key">No</span> or <span className="key">Swipe Left</span> to pass
        </p>
      </div>
      
      <div className="progress-indicator">
        <span>Card {currentDaterIndex + 1} of {daters.length}</span>
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

