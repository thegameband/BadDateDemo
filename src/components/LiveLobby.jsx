import { useState } from 'react'
import { motion } from 'framer-motion'
import { useGameStore } from '../store/gameStore'
import './LiveLobby.css'

function LiveLobby() {
  const setPhase = useGameStore((state) => state.setPhase)
  const setLiveMode = useGameStore((state) => state.setLiveMode)
  const setUsername = useGameStore((state) => state.setUsername)
  const createLiveRoom = useGameStore((state) => state.createLiveRoom)
  const joinLiveRoom = useGameStore((state) => state.joinLiveRoom)
  
  const [username, setUsernameLocal] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [activeTab, setActiveTab] = useState('create') // 'create' or 'join'
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
    if (!username.trim()) {
      setError('Please enter a username')
      return
    }
    
    const roomCode = generateRoomCode()
    setUsername(username.trim())
    createLiveRoom(roomCode, username.trim())
    setPhase('live-game-lobby')
  }
  
  const handleJoin = () => {
    if (!username.trim()) {
      setError('Please enter a username')
      return
    }
    if (!joinCode.trim()) {
      setError('Please enter a room code')
      return
    }
    
    setUsername(username.trim())
    const success = joinLiveRoom(joinCode.trim().toUpperCase(), username.trim())
    if (success) {
      setPhase('live-game-lobby')
    } else {
      setError('Room not found. Check your code.')
    }
  }
  
  const isFormValid = activeTab === 'create' 
    ? username.trim().length > 0 
    : username.trim().length > 0 && joinCode.trim().length > 0
  
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
        
        <div className="username-section">
          <label className="input-label">Your Display Name</label>
          <input
            type="text"
            className="username-input"
            placeholder="Enter your name..."
            value={username}
            onChange={(e) => {
              setUsernameLocal(e.target.value)
              setError('')
            }}
            maxLength={20}
          />
        </div>
        
        <div className="tab-selector">
          <button 
            className={`tab-btn ${activeTab === 'create' ? 'active' : ''}`}
            onClick={() => { setActiveTab('create'); setError('') }}
          >
            <span className="tab-icon">✨</span>
            Create Date
          </button>
          <button 
            className={`tab-btn ${activeTab === 'join' ? 'active' : ''}`}
            onClick={() => { setActiveTab('join'); setError('') }}
          >
            <span className="tab-icon">🔗</span>
            Join Date
          </button>
        </div>
        
        <motion.div 
          className="tab-content"
          key={activeTab}
          initial={{ opacity: 0, x: activeTab === 'create' ? -20 : 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.2 }}
        >
          {activeTab === 'create' ? (
            <div className="create-section">
              <p className="section-description">
                Start a new date and invite friends with a code. You'll be the host!
              </p>
              <motion.button
                className="btn btn-primary action-btn"
                onClick={handleCreate}
                disabled={!username.trim()}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                Create New Date 🎬
              </motion.button>
            </div>
          ) : (
            <div className="join-section">
              <p className="section-description">
                Enter the room code to join an existing date.
              </p>
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
              />
              <motion.button
                className="btn btn-primary action-btn"
                onClick={handleJoin}
                disabled={!isFormValid}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                Join Date 🚀
              </motion.button>
            </div>
          )}
        </motion.div>
        
        {error && (
          <motion.div 
            className="error-message"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            {error}
          </motion.div>
        )}
        
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
    </div>
  )
}

export default LiveLobby
