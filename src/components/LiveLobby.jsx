import { useState, useEffect, useRef, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion' // eslint-disable-line no-unused-vars -- motion used as JSX
import { useGameStore } from '../store/gameStore'
import { PartyGameClient, generateRoomCode, generatePlayerId } from '../services/partyClient'
import PartySocket from 'partysocket'
import { setTTSEnabled, isTTSEnabled } from '../services/ttsService'
import './LiveLobby.css'

// PartyKit host - update after deployment
const PARTYKIT_HOST = import.meta.env.VITE_PARTYKIT_HOST || 'localhost:1999'

// Game version - increment with each deployment
const GAME_VERSION = '0.02.68'

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
  const setLiveMode = useGameStore((state) => state.setLiveMode)
  const daters = useGameStore((state) => state.daters)
  const [view, setView] = useState('main') // 'main', 'multiplayer', 'host', 'join', 'qr-join'
  const [availableRooms, setAvailableRooms] = useState([])
  const [username, setUsernameLocal] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [_partyKitReady, _setPartyKitReady] = useState(true) // PartyKit is always "ready"
  const [showAdminModal, setShowAdminModal] = useState(false)
  const [adminStatus, setAdminStatus] = useState('')
  const [qrRoomCode, setQrRoomCode] = useState(null) // Room code from QR scan
  const [selectedDaterName, setSelectedDaterName] = useState('Adam') // Debug: which dater to use
  const [voEnabled, setVoEnabled] = useState(() => isTTSEnabled())
  const [showDaterPicker, setShowDaterPicker] = useState(false)
  
  // Registry connection for room discovery
  const registryRef = useRef(null)
  
  // Stable random values for floating hearts (computed once per mount)
  /* eslint-disable react-hooks/purity -- Math.random intentional inside useMemo for stable values */
  const heartConfigs = useMemo(() => [...Array(8)].map(() => ({
    x: `${Math.random() * 100}vw`,
    rotateInitial: Math.random() * 360,
    rotateAnimate: Math.random() * 360 + 180,
    duration: 8 + Math.random() * 4,
    delay: Math.random() * 5,
    emoji: ['💔', '💕', '❤️', '💘', '💗', '💖', '💝'][Math.floor(Math.random() * 7)]
  })), [])
  const mainHeartConfigs = useMemo(() => [...Array(12)].map(() => ({
    x: `${Math.random() * 100}vw`,
    rotateInitial: Math.random() * 360,
    rotateAnimate: Math.random() * 360 + 180,
    duration: 8 + Math.random() * 4,
    delay: Math.random() * 5,
    emoji: ['💔', '💕', '❤️', '💘', '💗', '💖', '💝'][Math.floor(Math.random() * 7)]
  })), [])
  /* eslint-enable react-hooks/purity */
  
  // Check for room code in URL (from QR scan)
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search)
    const roomFromUrl = urlParams.get('room')
    
    if (roomFromUrl) {
      console.log('🔗 Room code from URL:', roomFromUrl)
      setQrRoomCode(roomFromUrl)
      setView('qr-join')
      
      // Clean up the URL (remove the ?room= parameter)
      window.history.replaceState({}, document.title, window.location.pathname)
    }
  }, [])
  
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
  
  // Single-player: Play → Dater Bio Page → START THE DATE → 3 questions → date
  const handlePlayNow = () => {
    const playerName = username.trim() || `Player${Math.floor(Math.random() * 1000)}`
    const odId = generatePlayerId()
    const dater = daters.find((d) => d.name === selectedDaterName) || daters[0]
    setUsername(playerName)
    setSelectedDater(dater)
    setIsHost(true)
    setPlayerId(odId)
    setPlayers([{ id: odId, odId, username: playerName, isHost: true }])
    setPartyClient(null)
    setRoomCode(null)
    setLiveMode(true)
    setPhase('dater-bio') // Show Dater Bio Page; user taps START THE DATE to begin 3 questions then date
  }

  const handleCreate = async () => {
    setIsLoading(true)
    setError('')
    
    const roomCode = generateRoomCode()
    const playerName = username.trim() || `Player${Math.floor(Math.random() * 1000)}`
    const odId = generatePlayerId()
    // Use debug-selected dater
    const randomDater = daters.find(d => d.name === selectedDaterName) || daters[0]
    
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

  // QR Join view - Streamlined join from QR code scan
  if (view === 'qr-join' && qrRoomCode) {
    return (
      <div className="live-lobby qr-join-lobby">
        {/* Version number */}
        <div className="version-number">v{GAME_VERSION}</div>
        
        {/* Floating hearts background */}
        <div className="lobby-background">
          <div className="floating-hearts">
            {heartConfigs.map((cfg, i) => (
              <motion.span
                key={i}
                className="floating-heart"
                initial={{
                  y: '100vh',
                  x: cfg.x,
                  opacity: 0,
                  rotate: cfg.rotateInitial
                }}
                animate={{
                  y: '-20vh',
                  opacity: [0, 1, 1, 0],
                  rotate: cfg.rotateAnimate
                }}
                transition={{
                  duration: cfg.duration,
                  repeat: Infinity,
                  delay: cfg.delay,
                  ease: 'linear'
                }}
              >
                {cfg.emoji}
              </motion.span>
            ))}
          </div>
        </div>
        
        <motion.div 
          className="live-lobby-card qr-join-card"
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.4 }}
        >
          {/* Title */}
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
            <p className="game-tagline">You've been invited to join a date!</p>
          </motion.div>
          
          {/* Name input and join button */}
          <motion.div 
            className="qr-join-form"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <div className="input-group">
              <label className="input-label">What's your name?</label>
              <input
                type="text"
                className="name-input"
                placeholder="Enter your name..."
                value={username}
                onChange={(e) => setUsernameLocal(e.target.value)}
                maxLength={20}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && username.trim()) {
                    handleJoinRoom(qrRoomCode)
                  }
                }}
              />
            </div>
            
            {error && (
              <motion.p 
                className="error-message"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                {error}
              </motion.p>
            )}
            
            <motion.button
              className="join-date-btn"
              onClick={() => handleJoinRoom(qrRoomCode)}
              disabled={isLoading || !username.trim()}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              {isLoading ? (
                <>
                  <span className="loading-spinner">💕</span>
                  Joining...
                </>
              ) : (
                <>
                  <span className="btn-icon">💘</span>
                  Join Date
                </>
              )}
            </motion.button>
            
            <button 
              className="back-link"
              onClick={() => {
                setQrRoomCode(null)
                setView('main')
              }}
            >
              ← Go to main menu instead
            </button>
          </motion.div>
        </motion.div>
      </div>
    )
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
            {mainHeartConfigs.map((cfg, i) => (
              <motion.span
                key={i}
                className="floating-heart"
                initial={{
                  y: '100vh',
                  x: cfg.x,
                  opacity: 0,
                  rotate: cfg.rotateInitial
                }}
                animate={{
                  y: '-20vh',
                  opacity: [0, 1, 1, 0],
                  rotate: cfg.rotateAnimate
                }}
                transition={{
                  duration: cfg.duration,
                  repeat: Infinity,
                  delay: cfg.delay,
                  ease: 'linear'
                }}
              >
                {cfg.emoji}
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
                title="Debug Menu"
              >
                💔
              </span>
              <span className="title-date">Date</span>
            </h1>
            <p className="game-tagline">Where love goes hilariously wrong</p>
          </motion.div>
          
          {/* Debug Menu */}
          <AnimatePresence>
            {showAdminModal && (
              <motion.div 
                className="admin-modal-overlay"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => { setShowAdminModal(false); setShowDaterPicker(false) }}
              >
                <motion.div 
                  className="admin-modal debug-menu"
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.9, opacity: 0 }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="admin-modal-header">
                    <h3>🔧 Debug Menu</h3>
                    <button 
                      className="admin-close-btn"
                      onClick={() => { setShowAdminModal(false); setShowDaterPicker(false) }}
                    >
                      ✕
                    </button>
                  </div>
                  
                  <div className="admin-modal-content debug-menu-content">
                    {/* Section: Change Dater */}
                    <div className="debug-section">
                      <div className="debug-section-label">Dater</div>
                      <motion.button
                        className="debug-action-btn"
                        onClick={() => setShowDaterPicker(!showDaterPicker)}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        <span className="btn-icon">🎭</span>
                        <span>Change Dater</span>
                        <span className="debug-current-value">{selectedDaterName}</span>
                      </motion.button>
                      
                      <AnimatePresence>
                        {showDaterPicker && (
                          <motion.div
                            className="dater-picker-grid"
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                          >
                            {daters.map((d) => (
                              <motion.button
                                key={d.id}
                                className={`dater-picker-card ${selectedDaterName === d.name ? 'selected' : ''}`}
                                onClick={() => {
                                  setSelectedDaterName(d.name)
                                  setShowDaterPicker(false)
                                }}
                                whileHover={{ scale: 1.03 }}
                                whileTap={{ scale: 0.97 }}
                              >
                                <div className="dater-card-avatar">
                                  {d.photo && d.photo.startsWith('/images') ? (
                                    <img src={d.photo} alt={d.name} className="dater-card-img" />
                                  ) : (
                                    <span className="dater-card-emoji">🎭</span>
                                  )}
                                </div>
                                <div className="dater-card-info">
                                  <div className="dater-card-name">{d.name}</div>
                                  <div className="dater-card-archetype">{d.archetype}</div>
                                </div>
                                {selectedDaterName === d.name && (
                                  <span className="dater-card-check">✓</span>
                                )}
                              </motion.button>
                            ))}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                    
                    {/* Section: Voice Over toggle */}
                    <div className="debug-section">
                      <div className="debug-section-label">Audio</div>
                      <button
                        className="debug-action-btn debug-toggle-btn"
                        onClick={() => {
                          const next = !voEnabled
                          setVoEnabled(next)
                          setTTSEnabled(next)
                        }}
                      >
                        <span className="btn-icon">🔊</span>
                        <span>Voice Over</span>
                        <span className={`debug-toggle ${voEnabled ? 'on' : 'off'}`}>
                          {voEnabled ? 'ON' : 'OFF'}
                        </span>
                      </button>
                    </div>
                    
                    {/* Section: Multiplayer Mode */}
                    <div className="debug-section">
                      <div className="debug-section-label">Modes</div>
                      <motion.button
                        className="debug-action-btn"
                        onClick={() => { setShowAdminModal(false); setShowDaterPicker(false); setView('multiplayer') }}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        <span className="btn-icon">📺</span>
                        <span>Multiplayer Mode – Archive</span>
                      </motion.button>
                    </div>
                    
                    {/* Section: Admin Actions */}
                    <div className="debug-section">
                      <div className="debug-section-label">Admin</div>
                      <motion.button
                        className="debug-action-btn danger"
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
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
          
          {error && (
            <motion.div 
              className="error-message-inline"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              {error}
            </motion.div>
          )}
          
          {/* Main Action: Play Now (single-player) */}
          <div className="main-buttons">
            <motion.button
              className="mode-btn play-now-btn"
              onClick={handlePlayNow}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <span className="btn-icon">🎮</span>
              <span className="btn-text">Play Now</span>
            </motion.button>
          </div>
          
          <div className="live-info">
            <div className="info-item">
              <span className="info-icon">👤</span>
              <span>Single player</span>
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

  // Multiplayer Mode – Archive (Create / Join)
  if (view === 'multiplayer') {
    return (
      <div className="live-lobby">
        <div className="version-number">v{GAME_VERSION}</div>
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
              <span className="title-icon">📺</span>
              Multiplayer Mode – Archive
            </h2>
            <p className="live-lobby-subtitle">Create or join a room (1–20 players)</p>
          </div>
          
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
          
          <div className="main-buttons archive-buttons">
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
              onClick={() => setView('multiplayer')}
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
