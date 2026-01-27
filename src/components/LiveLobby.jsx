import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useGameStore } from '../store/gameStore'
import { PartyGameClient, generateRoomCode, generatePlayerId } from '../services/partyClient'
import PartySocket from 'partysocket'
import './LiveLobby.css'

// PartyKit host - update after deployment
const PARTYKIT_HOST = import.meta.env.VITE_PARTYKIT_HOST || 'localhost:1999'

// Game version - increment with each deployment
const GAME_VERSION = '0.01.44'

// Main game entry screen - Bad Date

function LiveLobby() {
  const setPhase = useGameStore((state) => state.setPhase)
  const setUsername = useGameStore((state) => state.setUsername)
  const setRoomCode = useGameStore((state) => state.setRoomCode)
  const setIsHost = useGameStore((state) => state.setIsHost)
  const setPlayerId = useGameStore((state) => state.setPlayerId)
  const setSelectedDater = useGameStore((state) => state.setSelectedDater)
  const setPlayers = useGameStore((state) => state.setPlayers)
  const setPartyClient = useGameStore((state) => state.setPartyClient)
  const daters = useGameStore((state) => state.daters)
  const [view, setView] = useState('main') // 'main', 'host', 'join'
  const [availableRooms, setAvailableRooms] = useState([])
  const [username, setUsernameLocal] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [partyKitReady, setPartyKitReady] = useState(true) // PartyKit is always "ready"
  const [showAdminModal, setShowAdminModal] = useState(false)
  const [adminStatus, setAdminStatus] = useState('')
  
  // Registry connection for room discovery
  const registryRef = useRef(null)
  
  // Connect to the registry room for room discovery
  useEffect(() => {
    if (view === 'join') {
      console.log('🔍 Connecting to room registry...')
      
      const registry = new PartySocket({
        host: PARTYKIT_HOST,
        room: 'roomregistry',
        party: 'roomregistry',
      })
      
      registry.addEventListener('message', (event) => {
        const data = JSON.parse(event.data)
        if (data.type === 'ROOMS_LIST') {
          console.log('📋 Available rooms:', data.rooms)
          setAvailableRooms(data.rooms || [])
        }
      })
      
      registry.addEventListener('open', () => {
        console.log('✅ Connected to room registry')
        // Request room list
        registry.send(JSON.stringify({ type: 'GET_ROOMS' }))
      })
      
      registryRef.current = registry
      
      return () => {
        registry.close()
        registryRef.current = null
      }
    }
  }, [view])
  
  const handleCreate = async () => {
    setIsLoading(true)
    setError('')
    
    const roomCode = generateRoomCode()
    const playerName = username.trim() || `Player${Math.floor(Math.random() * 1000)}`
    const odId = generatePlayerId()
    // Always use Maya for now (id: 2)
    const randomDater = daters.find(d => d.name === 'Maya') || daters[0]
    
    try {
      // Create PartyKit client and connect to room
      const client = new PartyGameClient(roomCode)
      
      // Wait for connection
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Connection timeout')), 5000)
        
        const checkConnection = () => {
          if (client.isConnected()) {
            clearTimeout(timeout)
            resolve()
          } else {
            setTimeout(checkConnection, 100)
          }
        }
        checkConnection()
      })
      
      // Join as host
      client.join(odId, playerName)
      client.setDater(randomDater)
      
      // Register room with the registry
      const registry = new PartySocket({
        host: PARTYKIT_HOST,
        room: 'roomregistry',
        party: 'roomregistry',
      })
      
      registry.addEventListener('open', () => {
        registry.send(JSON.stringify({
          type: 'REGISTER_ROOM',
          room: {
            code: roomCode,
            host: playerName,
            daterName: randomDater?.name || 'Mystery Date',
            playerCount: 1
          }
        }))
        // Don't close immediately - let the message be sent
        setTimeout(() => registry.close(), 500)
      })
      
      // Update local state
      setUsername(playerName)
      setRoomCode(roomCode)
      setIsHost(true)
      setPlayerId(odId)
      setSelectedDater(randomDater)
      setPlayers([{ id: odId, odId, username: playerName, isHost: true }])
      setPartyClient(client)
      setPhase('live-game-lobby')
      
    } catch (err) {
      console.error('Failed to create room:', err)
      setError('Failed to create room. Try again.')
    }
    
    setIsLoading(false)
  }
  
  const handleJoinRoom = async (roomCode) => {
    if (!username.trim()) {
      setError('Please enter your name first')
      return
    }
    
    setIsLoading(true)
    setError('')
    
    const playerName = username.trim()
    const odId = generatePlayerId()
    
    try {
      // Create PartyKit client and connect to room
      const client = new PartyGameClient(roomCode)
      
      // Wait for connection and initial state
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Connection timeout')), 5000)
        
        const unsubscribe = client.onStateChange((state) => {
          clearTimeout(timeout)
          unsubscribe()
          
          // Get dater from room state
          if (state?.dater) {
            setSelectedDater(state.dater)
          }
          
          resolve()
        })
      })
      
      // Join as player
      client.join(odId, playerName)
      
      // Update local state
      setUsername(playerName)
      setRoomCode(roomCode)
      setIsHost(false)
      setPlayerId(odId)
      setPartyClient(client)
      setPhase('live-game-lobby')
      
    } catch (err) {
      console.error('Failed to join room:', err)
      setError('Failed to join room. It may no longer exist.')
    }
    
    setIsLoading(false)
  }
  
  // Admin: Delete all rooms (clears registry)
  const handleDeleteAllRooms = async () => {
    setAdminStatus('Deleting...')
    
    try {
      const registry = new PartySocket({
        host: PARTYKIT_HOST,
        room: 'roomregistry',
        party: 'roomregistry',
      })
      
      await new Promise((resolve) => {
        registry.addEventListener('open', () => {
          registry.send(JSON.stringify({ type: 'CLEAR_ALL_ROOMS' }))
          setTimeout(() => {
            registry.close()
            resolve()
          }, 500)
        })
      })
      
      setAdminStatus('✅ All rooms cleared')
      setAvailableRooms([])
    } catch (err) {
      setAdminStatus(`❌ Error: ${err.message}`)
    }
    
    // Clear status after 3 seconds
    setTimeout(() => setAdminStatus(''), 3000)
  }

  // Main view - Choose Host or Join
  if (view === 'main') {
    return (
      <div className="live-lobby main-lobby">
        {/* Version number */}
        <div className="version-number">v{GAME_VERSION}</div>
        
        {/* Floating hearts background */}
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
          className="live-lobby-card main-card"
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.4 }}
        >
          {/* Game Title */}
          <motion.div 
            className="title-container"
            initial={{ scale: 0.8 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
          >
            <h1 className="game-title">
              <span className="title-bad">Bad</span>
              <span 
                className="title-heart clickable-heart"
                onClick={() => setShowAdminModal(true)}
                title="Admin Menu"
              >
                💔
              </span>
              <span className="title-date">Date</span>
            </h1>
            <p className="game-tagline">Where love goes hilariously wrong</p>
          </motion.div>
          
          {/* Admin Modal */}
          <AnimatePresence>
            {showAdminModal && (
              <motion.div 
                className="admin-modal-overlay"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowAdminModal(false)}
              >
                <motion.div 
                  className="admin-modal"
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.9, opacity: 0 }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="admin-modal-header">
                    <h3>🔧 Admin Menu</h3>
                    <button 
                      className="admin-close-btn"
                      onClick={() => setShowAdminModal(false)}
                    >
                      ✕
                    </button>
                  </div>
                  
                  <div className="admin-modal-content">
                    <p className="admin-warning">⚠️ These actions cannot be undone</p>
                    
                    <motion.button
                      className="admin-action-btn danger"
                      onClick={handleDeleteAllRooms}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <span className="btn-icon">🗑️</span>
                      <span>Delete All Rooms</span>
                    </motion.button>
                    
                    {adminStatus && (
                      <motion.div 
                        className="admin-status"
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                      >
                        {adminStatus}
                      </motion.div>
                    )}
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
          
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
              autoFocus
            />
          </div>
          
          {error && (
            <motion.div 
              className="error-message-inline"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              {error}
            </motion.div>
          )}
          
          {/* Main Action Buttons */}
          <div className="main-buttons">
            <motion.button
              className="mode-btn create-btn"
              onClick={handleCreate}
              disabled={isLoading}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <span className="btn-icon">✨</span>
              <span className="btn-text">{isLoading ? 'Creating...' : 'Create a Date'}</span>
            </motion.button>
            
            <motion.button
              className="mode-btn join-btn"
              onClick={() => setView('join')}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <span className="btn-icon">🔗</span>
              <span className="btn-text">Join a Date</span>
            </motion.button>
          </div>
          
          <div className="live-info">
            <div className="info-item">
              <span className="info-icon">👥</span>
              <span>1-20 players</span>
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

  // Host view - Create room (kept for backwards compatibility, not currently used)
  if (view === 'host') {
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
              onClick={() => setView('main')}
            >
              ← Back
            </button>
            <h2 className="live-lobby-title">
              <span className="title-icon">✨</span>
              Host a Date
            </h2>
            <p className="live-lobby-subtitle">Create a room for others to join</p>
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
          
          {error && (
            <motion.div 
              className="error-message-inline"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              {error}
            </motion.div>
          )}
          
          <motion.button
            className="mode-btn create-btn full-width"
            onClick={handleCreate}
            disabled={isLoading}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <span className="btn-icon">🎬</span>
            <span className="btn-text">{isLoading ? 'Creating...' : 'Create Room'}</span>
          </motion.button>
          
          <p className="host-hint">
            Once created, other players can see and join your room from the "Join a Date" screen.
          </p>
        </motion.div>
      </div>
    )
  }

  // Join view - Room browser
  if (view === 'join') {
    return (
      <div className="live-lobby">
        <motion.div 
          className="live-lobby-card room-browser-card"
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.4 }}
        >
          <div className="live-lobby-header">
            <button 
              className="back-btn"
              onClick={() => setView('main')}
            >
              ← Back
            </button>
            <h2 className="live-lobby-title">
              <span className="title-icon">🔗</span>
              Join a Date
            </h2>
            <p className="live-lobby-subtitle">Select a room to join</p>
          </div>
          
          {/* Username Input */}
          <div className="username-section">
            <label className="input-label">Your Name</label>
            <input
              type="text"
              className="username-input"
              placeholder="Enter your name first..."
              value={username}
              onChange={(e) => {
                setUsernameLocal(e.target.value)
                setError('')
              }}
              maxLength={15}
            />
          </div>
          
          {error && (
            <motion.div 
              className="error-message-inline"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              {error}
            </motion.div>
          )}
          
          {/* Room List */}
          <div className="room-browser">
            <div className="room-browser-header">
              <span>Available Rooms</span>
              <span className="room-count">{availableRooms.length} room{availableRooms.length !== 1 ? 's' : ''}</span>
            </div>
            
            <div className="room-list">
              {availableRooms.length === 0 ? (
                <div className="no-rooms">
                  <span className="no-rooms-icon">🔍</span>
                  <p>No rooms available</p>
                  <p className="no-rooms-hint">Ask a friend to host, or create your own!</p>
                </div>
              ) : (
                <AnimatePresence>
                  {availableRooms.map((room, index) => (
                    <motion.button
                      key={room.code}
                      className="room-item"
                      onClick={() => handleJoinRoom(room.code)}
                      disabled={isLoading || !username.trim()}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                      transition={{ delay: index * 0.05 }}
                      whileHover={{ scale: 1.02, backgroundColor: 'rgba(255,255,255,0.1)' }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <div className="room-info">
                        <div className="room-host">
                          <span className="host-icon">👑</span>
                          <span className="host-name">{room.host}'s Room</span>
                        </div>
                        <div className="room-details">
                          <span className="room-dater">💕 Dating: {room.daterName}</span>
                          <span className="room-players">👥 {room.playerCount}/20</span>
                        </div>
                      </div>
                      <div className="join-arrow">→</div>
                    </motion.button>
                  ))}
                </AnimatePresence>
              )}
            </div>
          </div>
          
          {!username.trim() && availableRooms.length > 0 && (
            <p className="join-hint">Enter your name above to join a room</p>
          )}
        </motion.div>
      </div>
    )
  }

  return null
}

export default LiveLobby
