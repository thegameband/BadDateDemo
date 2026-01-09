import { useState, useEffect } from 'react'
import { motion, AnimatePresence, useMotionValue, useTransform } from 'framer-motion'
import { useGameStore } from '../store/gameStore'
import './Matchmaking.css'

function Matchmaking() {
  const { daters, currentDaterIndex, swipeDater } = useGameStore()
  const [swipeDirection, setSwipeDirection] = useState(null)
  const [isDragging, setIsDragging] = useState(false)
  
  const currentDater = daters[currentDaterIndex]
  
  // Motion values for drag
  const x = useMotionValue(0)
  const rotate = useTransform(x, [-200, 0, 200], [-25, 0, 25])
  
  // Reset x position when dater changes
  useEffect(() => {
    x.set(0)
  }, [currentDaterIndex, x])
  
  // Transform for swipe indicators
  const likeOpacity = useTransform(x, [0, 100], [0, 1])
  const nopeOpacity = useTransform(x, [-100, 0], [1, 0])
  
  const handleSwipe = (direction) => {
    setSwipeDirection(direction)
    setTimeout(() => {
      swipeDater(currentDater.id, direction)
      setSwipeDirection(null)
      x.set(0) // Reset position
    }, 300)
  }
  
  const handleDragEnd = (event, info) => {
    setIsDragging(false)
    const swipeThreshold = 100
    
    if (info.offset.x > swipeThreshold) {
      handleSwipe('right')
    } else if (info.offset.x < -swipeThreshold) {
      handleSwipe('left')
    } else {
      // Snap back to center
      x.set(0)
    }
  }
  
  return (
    <div className="matchmaking">
      <div className="swipe-container">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentDater.id}
            className={`dater-card ${swipeDirection ? `swiping-${swipeDirection}` : ''} ${isDragging ? 'dragging' : ''}`}
            style={{ x, rotate }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={1}
            onDragStart={() => setIsDragging(true)}
            onDragEnd={handleDragEnd}
            initial={{ opacity: 0, scale: 0.8, y: 50, x: 0 }}
            animate={{ 
              opacity: 1,
              scale: 1, 
              y: 0,
              x: swipeDirection === 'left' ? -400 : swipeDirection === 'right' ? 400 : 0,
            }}
            exit={{ opacity: 0, scale: 0.8, x: swipeDirection === 'left' ? -400 : 400 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            whileTap={{ cursor: 'grabbing' }}
          >
            {/* Live swipe indicators while dragging */}
            <motion.div 
              className="swipe-indicator right"
              style={{ opacity: likeOpacity }}
            >
              💚 MATCH!
            </motion.div>
            <motion.div 
              className="swipe-indicator left"
              style={{ opacity: nopeOpacity }}
            >
              ❌ PASS
            </motion.div>
            
            <div className="dater-photo">
              <img src={currentDater.photo} alt={currentDater.name} draggable={false} />
            </div>
            
            <div className="dater-info">
              <h2 className="dater-name">
                {currentDater.name}, <span>{currentDater.age}</span>
              </h2>
              <p className="dater-archetype">{currentDater.archetype}</p>
              <p className="dater-tagline">{currentDater.tagline}</p>
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
          💘 <strong>Drag the card or tap the buttons!</strong>
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
