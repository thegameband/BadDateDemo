import { motion } from 'framer-motion'
import { useGameStore } from '../store/gameStore'
import './Lobby.css'

function Lobby() {
  const setPhase = useGameStore((state) => state.setPhase)
  
  return (
    <div className="lobby">
      <div className="lobby-background">
        <div className="floating-hearts">
          {[...Array(12)].map((_, i) => (
            <motion.span
              key={i}
              className="floating-heart"
              initial={{ 
                y: '100vh', 
                x: `${Math.random() * 100}vw`,
                opacity: 0,
                rotate: Math.random() * 360
              }}
              animate={{ 
                y: '-20vh',
                opacity: [0, 1, 1, 0],
                rotate: Math.random() * 360 + 180
              }}
              transition={{
                duration: 8 + Math.random() * 4,
                repeat: Infinity,
                delay: Math.random() * 5,
                ease: 'linear'
              }}
            >
              {['💔', '💕', '❤️', '💘', '😬', '🙈', '😅'][Math.floor(Math.random() * 7)]}
            </motion.span>
          ))}
        </div>
      </div>
      
      <motion.div 
        className="lobby-content"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
      >
        <motion.div 
          className="title-container"
          initial={{ scale: 0.8 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
        >
          <h1 className="game-title">
            <span className="title-bad">Bad</span>
            <span className="title-heart">💔</span>
            <span className="title-date">Date</span>
          </h1>
          <p className="game-tagline handwritten">
            Where love goes hilariously wrong
          </p>
        </motion.div>
        
        <motion.div 
          className="lobby-description"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
        >
          <p>
            Work together (or against each other) to craft the perfect 
            <span className="highlight"> terrible </span> 
            date. Swipe, chat, and shape your avatar's personality as you 
            watch the chaos unfold in real-time.
          </p>
        </motion.div>
        
        <motion.div 
          className="lobby-features"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
        >
          <div className="feature">
            <span className="feature-icon">👆</span>
            <span>Swipe to pick your date</span>
          </div>
          <div className="feature">
            <span className="feature-icon">🕵️</span>
            <span>Chat to gather intel</span>
          </div>
          <div className="feature">
            <span className="feature-icon">🎭</span>
            <span>Shape who you become</span>
          </div>
          <div className="feature">
            <span className="feature-icon">😈</span>
            <span>Watch it all go wrong</span>
          </div>
        </motion.div>
        
        <motion.button
          className="btn btn-primary start-button"
          onClick={() => setPhase('matchmaking')}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8 }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          Start Swiping
        </motion.button>
        
        <motion.p 
          className="player-count"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
        >
          🎮 2-200 players • ⏱️ ~15 min sessions
        </motion.p>
      </motion.div>
    </div>
  )
}

export default Lobby

