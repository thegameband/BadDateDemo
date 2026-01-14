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
              {['💔', '💕', '❤️', '💘', '💗', '💖', '💝'][Math.floor(Math.random() * 7)]}
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
          <p>Choose your adventure:</p>
        </motion.div>
        
        <motion.div 
          className="mode-selection"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
        >
          <motion.button
            className="mode-card solo-mode"
            onClick={() => setPhase('matchmaking')}
            whileHover={{ scale: 1.02, y: -4 }}
            whileTap={{ scale: 0.98 }}
          >
            <div className="mode-icon">🎭</div>
            <div className="mode-info">
              <h3 className="mode-title">Solo Mode</h3>
              <p className="mode-description">
                Swipe, chat, and shape your avatar's terrible date on your own.
              </p>
              <div className="mode-features">
                <span>💘 Pick your date</span>
                <span>💬 Chat for intel</span>
                <span>🎨 Add attributes</span>
              </div>
            </div>
            <div className="mode-arrow">→</div>
          </motion.button>
          
          <motion.button
            className="mode-card live-mode"
            onClick={() => setPhase('live-lobby')}
            whileHover={{ scale: 1.02, y: -4 }}
            whileTap={{ scale: 0.98 }}
          >
            <div className="mode-icon">📺</div>
            <div className="mode-info">
              <h3 className="mode-title">Live Mode</h3>
              <p className="mode-description">
                Play with up to 20 friends! Vote on attributes together in real-time.
              </p>
              <div className="mode-features">
                <span>👥 2-20 players</span>
                <span>🗳️ Vote on traits</span>
                <span>⏱️ Timed phases</span>
              </div>
            </div>
            <div className="mode-arrow">→</div>
          </motion.button>
        </motion.div>
        
        <motion.p 
          className="player-count"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
        >
          💕 Solo or multiplayer • 💖 ~10-15 min sessions
        </motion.p>
      </motion.div>
    </div>
  )
}

export default Lobby

