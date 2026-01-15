import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useGameStore } from '../store/gameStore'
import './LiveLobby.css'

function LiveLobby() {
  const setPhase = useGameStore((state) => state.setPhase)
  const setUsername = useGameStore((state) => state.setUsername)
  const createLiveRoom = useGameStore((state) => state.createLiveRoom)
  const joinLiveRoom = useGameStore((state) => state.joinLiveRoom)
  
  const [showJoinModal, setShowJoinModal] = useState(false)
  const [joinCode, setJoinCode] = useState('')
  const [username, setUsernameLocal] = useState('')
  const [error, setError] = useState('')
  
  const generateRoomCode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    let code = ''
    for (let i = 0; i < 6; i++) {
      code += chars[Math.floor(Math.random() * chars.length)]
    }
    return code
  }
  
  const handleCreate = () => {
    const roomCode = generateRoomCode()
    const playerName = username.trim() || `Player${Math.floor(Math.random() * 1000)}`
    setUsername(playerName)
    createLiveRoom(roomCode, playerName)
    setPhase('live-game-lobby')
  }
  
  const handleJoin = () => {
    if (!joinCode.trim()) {
      setError('Please enter a room code')
      return
    }
    
    const guestName = username.trim() || `Player${Math.floor(Math.random() * 1000)}`
    setUsername(guestName)
    const success = joinLiveRoom(joinCode.trim().toUpperCase(), guestName)
    if (success) {
      setPhase('live-game-lobby')
    } else {
      setError('Room not found. Check your code.')
    }
  }
  
  return (
    <div className="live-lobby">
      <motion.div 
        className="live-lobby-card"
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.4 }}
      >
        <div className="live-lobby-header">
          <button 
            className="back-btn"
            onClick={() => setPhase('lobby')}
          >
            ← Back
          </button>
          <h2 className="live-lobby-title">
            <span className="title-icon">📺</span>
            Live Mode
          </h2>
          <p className="live-lobby-subtitle">Play with friends in real-time!</p>
        </div>
        
        {/* Username Input */}
        <div className="username-section">
          <label className="input-label">Your Name</label>
          <input
            type="text"
            className="username-input"
            placeholder="Enter your name..."
            value={username}
            onChange={(e) => setUsernameLocal(e.target.value)}
            maxLength={15}
          />
        </div>
        
        {/* Main Action Buttons */}
        <div className="main-buttons">
          <motion.button
            className="mode-btn create-btn"
            onClick={handleCreate}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <span className="btn-icon">✨</span>
            <span className="btn-text">Create Date</span>
          </motion.button>
          
          <motion.button
            className="mode-btn join-btn"
            onClick={() => setShowJoinModal(true)}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <span className="btn-icon">🔗</span>
            <span className="btn-text">Join Date</span>
          </motion.button>
        </div>
        
        <div className="live-info">
          <div className="info-item">
            <span className="info-icon">👥</span>
            <span>2-20 players</span>
          </div>
          <div className="info-item">
            <span className="info-icon">⏱️</span>
            <span>~10 min per game</span>
          </div>
        </div>
      </motion.div>
      
      {/* Join Modal */}
      <AnimatePresence>
        {showJoinModal && (
          <motion.div 
            className="join-modal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowJoinModal(false)}
          >
            <motion.div 
              className="join-modal"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3>Join a Date</h3>
              <p>Enter the room code shared by the host</p>
              
              <input
                type="text"
                className="code-input"
                placeholder="ENTER CODE"
                value={joinCode}
                onChange={(e) => {
                  setJoinCode(e.target.value.toUpperCase())
                  setError('')
                }}
                maxLength={6}
                autoFocus
              />
              
              {error && (
                <motion.div 
                  className="error-message"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                >
                  {error}
                </motion.div>
              )}
              
              <div className="modal-buttons">
                <button 
                  className="cancel-btn"
                  onClick={() => setShowJoinModal(false)}
                >
                  Cancel
                </button>
                <motion.button
                  className="btn btn-primary confirm-btn"
                  onClick={handleJoin}
                  disabled={!joinCode.trim()}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  Join 🚀
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default LiveLobby
