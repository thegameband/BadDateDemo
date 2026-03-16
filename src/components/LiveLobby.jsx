import { useState, useEffect, useRef, useMemo } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion' // eslint-disable-line no-unused-vars -- motion used as JSX
import { useGameStore, SCORING_MODES, DATER_RESPONSE_MODES } from '../store/gameStore'
import { PartyGameClient, generateRoomCode, generatePlayerId } from '../services/partyClient'
import PartySocket from 'partysocket'
import { setTTSEnabled, isTTSEnabled, getVoiceVolume, setVoiceVolume } from '../services/ttsService'
import { formatDb, getMusicVolume, setMusicMode, setMusicVolume, getSfxVolume, setSfxVolume } from '../services/audioService'
import { fetchRuntimeCapabilities, getCachedRuntimeCapabilities } from '../services/runtimeCapabilities'
import { fetchRosesDebugTaglines, saveRosesDebugTaglines } from '../services/rosesApi'
import DropALineReels from './DropALineReels'
import DropALineProfile from './DropALineProfile'
import DropALineScene from './DropALineScene'
import DropALineDied from './DropALineDied'
import SpeedDateMode from './SpeedDateMode'
import RosesMode from './RosesMode'
import AudioManager from './AudioManager'
import ModeOnboarding from './ModeOnboarding'
import { useWebHaptics } from 'web-haptics/react'
import './DropALineReels.css'
import './DropALineProfile.css'
import './DropALineScene.css'
import './LiveLobby.css'
import './AudioManager.css'

// PartyKit host - update after deployment
const PARTYKIT_HOST = import.meta.env.VITE_PARTYKIT_HOST || 'localhost:1999'

// Game version - increment with each deployment
const GAME_VERSION = '0.05.85'
const RIZZ_CRAFT_MODE_LABEL = 'Rizz-craft'
const BAD_DATE_FTUE_KEY = 'ftue_bad-date_seen'
const BAD_DATE_FTUE_SLIDES = [
  {
    title: 'Welcome to Hard Launch',
    image: '/images/ftue/hard-launch-1.png',
    text: "You've just been cast on the hottest reality dating show on TV \u2014 Hard Launch. Paired with a random Dater, you'll each be grilled by our host \u2014 and you'll need to bring the heat.",
  },
  {
    title: 'Love Connection',
    image: '/images/ftue/hard-launch-2.png',
    text: '5 questions, 1 chance. Spark a real connection with your answers in order to lock down that second date.',
  },
  {
    title: 'Ratings, Ratings, Ratings',
    image: '/images/ftue/hard-launch-3.png',
    text: "But remember to be entertaining \u2014 this is television, after all. Connection alone won't cut it. Be bold, be memorable, or the show gets canceled.",
  },
  {
    title: "Go Get 'Em!",
    image: '/images/ftue/hard-launch-4.png',
    text: 'Top out both your chemistry and ratings meters to Hard Launch your relationship!',
  },
]
const RIZZ_CRAFT_FTUE_KEY = 'ftue_rizz-craft_seen'
const RIZZ_CRAFT_FTUE_SLIDES = [
  {
    title: 'Welcome to Rizz-craft',
    image: '/images/ftue/rizz-craft-1.png',
    text: 'One stranger. One location. One shot at the perfect pickup line.',
  },
  {
    title: 'Do Your Homework',
    image: '/images/ftue/rizz-craft-2.png',
    text: "Study your Dater\u2019s profile closely \u2014 their personality, their quirks, their dealbreakers.",
  },
  {
    title: 'One Line to Rule Them All',
    image: '/images/ftue/rizz-craft-3.png',
    text: 'You get exactly one pickup line. Make it clever \u2014 or watch it crash and burn in spectacular fashion.',
  },
]
const RANDOM_NAMES = ['Alex', 'Sam', 'Jordan', 'Taylor', 'Morgan', 'Casey', 'Riley', 'Avery', 'Quinn', 'Rowan', 'Sage', 'Finley', 'Dakota', 'Reese', 'Emery', 'Charlie', 'Skyler', 'River', 'Blake', 'Drew']
const getRandomFallbackName = () => RANDOM_NAMES[Math.floor(Math.random() * RANDOM_NAMES.length)]

// Main game entry screen - Hard Launch

function LiveLobby() {
  const { trigger: triggerHaptic } = useWebHaptics()
  const setPhase = useGameStore((state) => state.setPhase)
  const setUsername = useGameStore((state) => state.setUsername)
  const setRoomCode = useGameStore((state) => state.setRoomCode)
  const setIsHost = useGameStore((state) => state.setIsHost)
  const setPlayerId = useGameStore((state) => state.setPlayerId)
  const setSelectedDater = useGameStore((state) => state.setSelectedDater)
  const setPlayers = useGameStore((state) => state.setPlayers)
  const setPartyClient = useGameStore((state) => state.setPartyClient)
  const setLiveMode = useGameStore((state) => state.setLiveMode)
  const setScoringMode = useGameStore((state) => state.setScoringMode)
  const initializeScoringForDater = useGameStore((state) => state.initializeScoringForDater)
  const llmProvider = useGameStore((state) => state.llmProvider)
  const setLlmProvider = useGameStore((state) => state.setLlmProvider)
  const daterResponseMode = useGameStore((state) => state.daterResponseMode)
  const setDaterResponseMode = useGameStore((state) => state.setDaterResponseMode)
  const daters = useGameStore((state) => state.daters)
  const [view, setView] = useState('main') // 'main', 'speed-date', 'drop-a-line', 'roses', 'multiplayer', 'host', 'join', 'qr-join'
  const [availableRooms, setAvailableRooms] = useState([])
  const [username, setUsernameLocal] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [_partyKitReady, _setPartyKitReady] = useState(true) // PartyKit is always "ready"
  const [showAdminModal, setShowAdminModal] = useState(false)
  const [adminStatus, setAdminStatus] = useState('')
  const [showTaglineEditor, setShowTaglineEditor] = useState(false)
  const [taglineEditorEntries, setTaglineEditorEntries] = useState([])
  const [taglineEditorFilter, setTaglineEditorFilter] = useState('')
  const [taglineEditorLoading, setTaglineEditorLoading] = useState(false)
  const [taglineEditorSaving, setTaglineEditorSaving] = useState(false)
  const [qrRoomCode, setQrRoomCode] = useState(null) // Room code from QR scan
  const [selectedDaterName, setSelectedDaterName] = useState('Adam') // Debug: which dater to use
  const [voEnabled, setVoEnabled] = useState(() => isTTSEnabled())
  const [musicVol, setMusicVol] = useState(() => getMusicVolume())
  const [sfxVol, setSfxVol] = useState(() => getSfxVolume())
  const [voiceVol, setVoiceVol] = useState(() => getVoiceVolume())
  const [showAudioManager, setShowAudioManager] = useState(false)
  const [showDaterPicker, setShowDaterPicker] = useState(false)
  const [debugScoringMode, setDebugScoringMode] = useState(SCORING_MODES.LIKES_MINUS_DISLIKES_CHAOS)
  const [dropALineEnabled, setDropALineEnabled] = useState(() => {
    const stored = localStorage.getItem('dropALineEnabled')
    if (stored == null) return true
    return stored === 'true'
  })
  const [dropALineScreen, setDropALineScreen] = useState('reels') // 'reels' | 'profile' | 'scene' | 'died'
  const [dropALinePayload, setDropALinePayload] = useState(null) // { dater, location }
  const [forceReelPairing, setForceReelPairing] = useState(null) // { daterName, location } | null
  const [showFtue, setShowFtue] = useState(null)
  const [runtimeCapabilities, setRuntimeCapabilities] = useState(() => getCachedRuntimeCapabilities())

  const filteredTaglineEntries = useMemo(() => {
    const query = String(taglineEditorFilter || '').trim().toLowerCase()
    if (!query) return taglineEditorEntries
    return taglineEditorEntries.filter((entry) => {
      const haystack = [
        entry?.name,
        entry?.occupation,
        entry?.introTagline,
      ].join(' ').toLowerCase()
      return haystack.includes(query)
    })
  }, [taglineEditorEntries, taglineEditorFilter])
  const hasOpenAiKey = Boolean(runtimeCapabilities.openai)
  const hasAnthropicKey = Boolean(runtimeCapabilities.anthropic)
  const prefersReducedMotion = useReducedMotion()
  
  // Registry connection for room discovery
  const registryRef = useRef(null)
  
  // Stable random values for floating hearts (computed once per mount)
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

  useEffect(() => {
    let mounted = true
    fetchRuntimeCapabilities().then((capabilities) => {
      if (mounted) {
        setRuntimeCapabilities(capabilities)
      }
    })
    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    if (view === 'drop-a-line' && dropALineScreen === 'scene') return
    void setMusicMode('lobby')
  }, [view, dropALineScreen])
  
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
  const startBadDateSession = () => {
    void triggerHaptic('heavy')
    const playerName = username.trim() || getRandomFallbackName()
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
    setScoringMode(debugScoringMode)
    initializeScoringForDater(dater)
    setPhase('dater-bio')
  }

  const handlePlayNow = () => {
    if (localStorage.getItem(BAD_DATE_FTUE_KEY) !== 'true') {
      setShowFtue('bad-date')
      return
    }
    startBadDateSession()
  }

  const completeBadDateFtue = () => {
    localStorage.setItem(BAD_DATE_FTUE_KEY, 'true')
    setShowFtue(null)
    startBadDateSession()
  }

  const handleSelectMode = (nextView) => {
    void triggerHaptic('heavy')
    if (nextView === 'drop-a-line' && localStorage.getItem(RIZZ_CRAFT_FTUE_KEY) !== 'true') {
      setShowFtue('rizz-craft')
      return
    }
    setView(nextView)
  }

  const completeRizzCraftFtue = () => {
    localStorage.setItem(RIZZ_CRAFT_FTUE_KEY, 'true')
    setShowFtue(null)
    setView('drop-a-line')
  }

  const handleCreate = async () => {
    setIsLoading(true)
    setError('')
    
    const roomCode = generateRoomCode()
    const playerName = username.trim() || getRandomFallbackName()
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

  const loadRosesTaglineEditor = async () => {
    setTaglineEditorLoading(true)
    setAdminStatus('Loading Roses taglines...')
    try {
      const response = await fetchRosesDebugTaglines()
      setTaglineEditorEntries(Array.isArray(response?.entries) ? response.entries : [])
      setShowTaglineEditor(true)
      setAdminStatus(`Loaded ${Number(response?.entries?.length || 0)} taglines.`)
    } catch (error) {
      setAdminStatus(`❌ Error: ${error.message}`)
    } finally {
      setTaglineEditorLoading(false)
    }
  }

  const handleTaglineEntryChange = (playerId, value) => {
    setTaglineEditorEntries((prev) => prev.map((entry) => (
      String(entry?.playerId || '') === String(playerId)
        ? { ...entry, introTagline: value }
        : entry
    )))
  }

  const handleSaveRosesTaglines = async () => {
    setTaglineEditorSaving(true)
    setAdminStatus('Saving Roses taglines...')
    try {
      const response = await saveRosesDebugTaglines(taglineEditorEntries)
      setAdminStatus(`Saved ${Number(response?.savedCount || 0)} taglines.`)
    } catch (error) {
      setAdminStatus(`❌ Error: ${error.message}`)
    } finally {
      setTaglineEditorSaving(false)
    }
  }

  // QR Join view - Streamlined join from QR code scan
  if (view === 'qr-join' && qrRoomCode) {
    return (
      <div className="live-lobby qr-join-lobby phone-frame">
        {/* Version number */}
        <div className="version-number">v{GAME_VERSION}</div>
        
        {/* Floating hearts background */}
        <div className="lobby-background">
          <div className="floating-hearts">
            {(prefersReducedMotion ? heartConfigs.slice(0, 4) : heartConfigs).map((cfg, i) => (
              prefersReducedMotion ? (
                <span
                  key={i}
                  className="floating-heart floating-heart-static"
                  style={{ left: cfg.x, top: `${12 + i * 18}%` }}
                >
                  {cfg.emoji}
                </span>
              ) : (
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
              )
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
            transition={{ delay: 0.2, duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
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
      <div className="live-lobby main-lobby phone-frame">
        {/* Version number */}
        <div className="version-number">v{GAME_VERSION}</div>
        
        {/* Floating hearts background */}
        <div className="lobby-background">
          <div className="floating-hearts">
            {(prefersReducedMotion ? mainHeartConfigs.slice(0, 5) : mainHeartConfigs).map((cfg, i) => (
              prefersReducedMotion ? (
                <span
                  key={i}
                  className="floating-heart floating-heart-static"
                  style={{ left: cfg.x, top: `${10 + i * 14}%` }}
                >
                  {cfg.emoji}
                </span>
              ) : (
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
              )
            ))}
          </div>
        </div>
        
        {showFtue === 'bad-date' ? (
          <ModeOnboarding
            slides={BAD_DATE_FTUE_SLIDES}
            onComplete={completeBadDateFtue}
            onSkip={completeBadDateFtue}
          />
        ) : showFtue === 'rizz-craft' ? (
          <ModeOnboarding
            slides={RIZZ_CRAFT_FTUE_SLIDES}
            onComplete={completeRizzCraftFtue}
            onSkip={completeRizzCraftFtue}
          />
        ) : (
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
            transition={{ delay: 0.2, duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
          >
            <h1 className="game-title">
              <span className="title-bad">Bad</span>
              <button
                type="button"
                className="title-heart clickable-heart"
                onClick={() => setShowAdminModal(true)}
                title="Open debug menu"
                aria-label="Open debug menu"
              >
                💔
              </button>
              <span className="title-date">Date</span>
            </h1>
            <p className="game-tagline">Be funny, be charming, be literally anything!</p>
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
                    
                    {/* Section: Volume */}
                    <div className="debug-section">
                      <div className="debug-section-label">Volume</div>

                      <label className="debug-volume-row">
                        <span>Music</span>
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.01"
                          value={musicVol}
                          onChange={(e) => {
                            const value = Number.parseFloat(e.target.value)
                            setMusicVol(value)
                            setMusicVolume(value)
                          }}
                        />
                        <span>{formatDb(musicVol)}</span>
                      </label>

                      <label className="debug-volume-row">
                        <span>SFX</span>
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.01"
                          value={sfxVol}
                          onChange={(e) => {
                            const value = Number.parseFloat(e.target.value)
                            setSfxVol(value)
                            setSfxVolume(value)
                          }}
                        />
                        <span>{formatDb(sfxVol)}</span>
                      </label>

                      <label className="debug-volume-row">
                        <span>Voice</span>
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.01"
                          value={voiceVol}
                          onChange={(e) => {
                            const value = Number.parseFloat(e.target.value)
                            setVoiceVol(value)
                            setVoiceVolume(value)
                          }}
                        />
                        <span>{formatDb(voiceVol)}</span>
                      </label>
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

                    {/* Section: LLM Provider */}
                    <div className="debug-section">
                      <div className="debug-section-label">LLM Provider</div>
                      <div className="dater-picker-grid">
                        {[
                          { id: 'openai', label: 'OpenAI', available: hasOpenAiKey },
                          { id: 'anthropic', label: 'Anthropic', available: hasAnthropicKey },
                          { id: 'auto', label: 'Auto', available: hasOpenAiKey || hasAnthropicKey },
                        ].map((option) => (
                          <motion.button
                            key={option.id}
                            className={`dater-picker-card ${llmProvider === option.id ? 'selected' : ''}`}
                            onClick={() => setLlmProvider(option.id)}
                            whileHover={{ scale: 1.03 }}
                            whileTap={{ scale: 0.97 }}
                          >
                            <div className="dater-card-info">
                              <div className="dater-card-name">{option.label}</div>
                              <div className="dater-card-archetype">
                                {option.available ? 'Available on server' : 'Not configured'}
                              </div>
                            </div>
                            {llmProvider === option.id && (
                              <span className="dater-card-check">✓</span>
                            )}
                          </motion.button>
                        ))}
                      </div>
                    </div>

                    {/* Section: Dater Response Mode */}
                    <div className="debug-section">
                      <div className="debug-section-label">Dater Response Mode</div>
                      <div className="dater-picker-grid">
                        {[
                          {
                            id: DATER_RESPONSE_MODES.MAIN,
                            label: 'Main',
                            subtitle: 'Current Main setup',
                          },
                          {
                            id: DATER_RESPONSE_MODES.EXPERIMENTAL,
                            label: 'Experimental',
                            subtitle: 'Natural + punchy voice changes',
                          },
                        ].map((option) => (
                          <motion.button
                            key={option.id}
                            className={`dater-picker-card ${daterResponseMode === option.id ? 'selected' : ''}`}
                            onClick={() => setDaterResponseMode(option.id)}
                            whileHover={{ scale: 1.03 }}
                            whileTap={{ scale: 0.97 }}
                          >
                            <div className="dater-card-info">
                              <div className="dater-card-name">{option.label}</div>
                              <div className="dater-card-archetype">{option.subtitle}</div>
                            </div>
                            {daterResponseMode === option.id && (
                              <span className="dater-card-check">✓</span>
                            )}
                          </motion.button>
                        ))}
                      </div>
                    </div>

                    {/* Section: Scoring Mode */}
                    <div className="debug-section">
                      <div className="debug-section-label">Scoring Mode</div>
                      <div className="dater-picker-grid">
                        {[
                          { id: SCORING_MODES.LIKES_MINUS_DISLIKES, label: 'Option 1', subtitle: 'Likes Minus Dislikes' },
                          { id: SCORING_MODES.LIKES_MINUS_DISLIKES_CHAOS, label: 'Option 2', subtitle: 'Compatibility + Ratings' },
                          { id: SCORING_MODES.BINGO_BLIND_LOCKOUT, label: 'Option 3', subtitle: 'Bingo (Blind + Lockouts)' },
                          { id: SCORING_MODES.BINGO_ACTIONS_OPEN, label: 'Option 4', subtitle: 'Bingo (Open Actions)' },
                        ].map((option) => (
                          <motion.button
                            key={option.id}
                            className={`dater-picker-card ${debugScoringMode === option.id ? 'selected' : ''}`}
                            onClick={() => setDebugScoringMode(option.id)}
                            whileHover={{ scale: 1.03 }}
                            whileTap={{ scale: 0.97 }}
                          >
                            <div className="dater-card-info">
                              <div className="dater-card-name">{option.label}</div>
                              <div className="dater-card-archetype">{option.subtitle}</div>
                            </div>
                            {debugScoringMode === option.id && (
                              <span className="dater-card-check">✓</span>
                            )}
                          </motion.button>
                        ))}
                      </div>
                    </div>
                    
                    {/* Section: Multiplayer Mode */}
                    <div className="debug-section">
                      <div className="debug-section-label">Modes</div>
                      <motion.button
                        className="debug-action-btn"
                        onClick={() => {
                          setShowAdminModal(false)
                          setShowDaterPicker(false)
                          handleSelectMode('multiplayer')
                        }}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        <span className="btn-icon">📺</span>
                        <span>Multiplayer Mode – Archive</span>
                      </motion.button>
                    </div>

                    {/* Section: Experiments */}
                    <div className="debug-section">
                      <div className="debug-section-label">Experiments</div>
                      <button
                        className="debug-action-btn debug-toggle-btn"
                        onClick={() => {
                          const next = !dropALineEnabled
                          setDropALineEnabled(next)
                          localStorage.setItem('dropALineEnabled', String(next))
                        }}
                      >
                        <span className="btn-icon">🎣</span>
                        <span>{RIZZ_CRAFT_MODE_LABEL}</span>
                        <span className={`debug-toggle ${dropALineEnabled ? 'on' : 'off'}`}>
                          {dropALineEnabled ? 'ON' : 'OFF'}
                        </span>
                      </button>
                    </div>
                    
                    {/* Section: Reset Tutorials */}
                    <div className="debug-section">
                      <div className="debug-section-label">Tutorials</div>
                      <motion.button
                        className="debug-action-btn"
                        onClick={() => {
                          localStorage.removeItem(BAD_DATE_FTUE_KEY)
                          localStorage.removeItem(RIZZ_CRAFT_FTUE_KEY)
                          setAdminStatus('Tutorials reset!')
                        }}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        <span className="btn-icon">📖</span>
                        <span>Reset Tutorials (FTUE)</span>
                      </motion.button>
                    </div>

                    {/* Section: Skip To */}
                    <div className="debug-section">
                      <div className="debug-section-label">Skip To</div>
                      <motion.button
                        className="debug-action-btn"
                        onClick={() => {
                          setShowAdminModal(false)
                          setShowDaterPicker(false)
                          useGameStore.setState({ debugSkipToPlotTwist: true })
                          startBadDateSession()
                        }}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        <span className="btn-icon">🎭</span>
                        <span>Test: Jump to Plot Twist</span>
                      </motion.button>
                    </div>

                    {/* Section: Admin Actions */}
                    <div className="debug-section">
                      <div className="debug-section-label">Admin</div>
                      <motion.button
                        className="debug-action-btn"
                        onClick={() => {
                          if (showTaglineEditor) {
                            setShowTaglineEditor(false)
                            return
                          }
                          void loadRosesTaglineEditor()
                        }}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        <span className="btn-icon">✍️</span>
                        <span>Edit All Roses Taglines</span>
                      </motion.button>

                      {showTaglineEditor && (
                        <div className="tagline-editor-panel">
                          <div className="tagline-editor-actions">
                            <input
                              type="text"
                              className="tagline-editor-filter"
                              placeholder="Filter characters..."
                              value={taglineEditorFilter}
                              onChange={(e) => setTaglineEditorFilter(e.target.value)}
                            />
                            <button
                              type="button"
                              className="debug-action-btn"
                              onClick={() => void loadRosesTaglineEditor()}
                              disabled={taglineEditorLoading || taglineEditorSaving}
                            >
                              {taglineEditorLoading ? 'Loading...' : 'Reload'}
                            </button>
                            <button
                              type="button"
                              className="debug-action-btn"
                              onClick={() => void handleSaveRosesTaglines()}
                              disabled={taglineEditorLoading || taglineEditorSaving}
                            >
                              {taglineEditorSaving ? 'Saving...' : 'Save Taglines'}
                            </button>
                          </div>

                          <div className="tagline-editor-list">
                            {filteredTaglineEntries.map((entry) => (
                              <div key={entry.playerId} className="tagline-editor-row">
                                <div className="tagline-editor-meta">
                                  <strong>{entry.name}</strong>
                                  <span>{entry.occupation || 'No occupation'}</span>
                                </div>
                                <textarea
                                  value={entry.introTagline || ''}
                                  onChange={(e) => handleTaglineEntryChange(entry.playerId, e.target.value)}
                                  maxLength={90}
                                  rows={3}
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

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
          <AudioManager
            isOpen={showAudioManager}
            onClose={() => setShowAudioManager(false)}
            currentMode="lobby"
            musicVol={musicVol}
            sfxVol={sfxVol}
            voiceVol={voiceVol}
            onMusicVolumeChange={(value) => {
              setMusicVol(value)
              setMusicVolume(value)
            }}
            onSfxVolumeChange={(value) => {
              setSfxVol(value)
              setSfxVolume(value)
            }}
            onVoiceVolumeChange={(value) => {
              setVoiceVol(value)
              setVoiceVolume(value)
            }}
          />
          
          {error && (
            <motion.div 
              className="error-message-inline"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              {error}
            </motion.div>
          )}
          
          {/* Main Action buttons */}
          <div className="main-buttons-stack">
            <div className="main-buttons main-buttons-top">
              <motion.button
                className="mode-btn play-now-btn"
                onClick={handlePlayNow}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <span className="btn-icon">🎮</span>
                <span className="btn-text">Hard Launch</span>
              </motion.button>
              {dropALineEnabled && (
                <motion.button
                  className="mode-btn drop-a-line-btn"
                  onClick={() => handleSelectMode('drop-a-line')}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <span className="btn-icon">🎣</span>
                  <span className="btn-text">{RIZZ_CRAFT_MODE_LABEL}</span>
                </motion.button>
              )}
            </div>
            <div className="main-buttons main-buttons-bottom">
              <motion.button
                className="mode-btn speed-date-btn"
                onClick={() => handleSelectMode('speed-date')}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <span className="btn-icon">⚡</span>
                <span className="btn-text">Speed Date</span>
              </motion.button>
              <motion.button
                className="mode-btn roses-btn"
                onClick={() => handleSelectMode('roses')}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <span className="btn-icon">🌹</span>
                <span className="btn-text">Roses</span>
              </motion.button>
            </div>
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
        )}
        {!showFtue && !showAudioManager && (
          <div className="main-audio-manager-launch">
            <motion.button
              className="main-audio-manager-btn"
              onClick={() => setShowAudioManager(true)}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <span className="btn-icon">🎚️</span>
              <span className="btn-text">Audio Manager</span>
            </motion.button>
          </div>
        )}
      </div>
    )
  }

  if (view === 'speed-date') {
    return (
      <div className="phone-frame">
        <div className="version-number">v{GAME_VERSION}</div>
        <SpeedDateMode
          daters={daters}
          onBack={() => setView('main')}
        />
      </div>
    )
  }

  if (view === 'roses') {
    return (
      <div className="phone-frame">
        <div className="version-number">v{GAME_VERSION}</div>
        <RosesMode onBack={() => setView('main')} />
      </div>
    )
  }

  // Drop a Line (Pick Up Mode – reels → profile → scene)
  // Rizz-craft mode (reels → profile → scene)
  if (view === 'drop-a-line') {
    const handleBackToMain = () => {
      setDropALineScreen('reels')
      setDropALinePayload(null)
      setForceReelPairing(null)
      setView('main')
    }
    if (dropALineScreen === 'profile') {
      return (
        <div className="phone-frame">
          <div className="version-number">v{GAME_VERSION}</div>
          <DropALineProfile
            payload={dropALinePayload}
            onContinue={() => setDropALineScreen('scene')}
            onBack={() => setDropALineScreen('reels')}
            onJump={() => setDropALineScreen('died')}
          />
        </div>
      )
    }
    if (dropALineScreen === 'died') {
      return (
        <div className="phone-frame">
          <div className="version-number">v{GAME_VERSION}</div>
          <DropALineDied
            onTryAgain={() => {
              const daterName = dropALinePayload?.dater?.name
              const location = dropALinePayload?.location
              if (daterName && location) {
                setForceReelPairing({ daterName, location })
              }
              setDropALineScreen('reels')
            }}
          />
        </div>
      )
    }
    if (dropALineScreen === 'scene') {
      const handleReplay = () => {
        setDropALineScreen('reels')
        setDropALinePayload(null)
        setForceReelPairing(null)
      }
      return (
        <div className="phone-frame">
          <div className="version-number">v{GAME_VERSION}</div>
          <DropALineScene
            payload={dropALinePayload}
            onBack={handleBackToMain}
            onReplay={handleReplay}
          />
        </div>
      )
    }
    return (
      <motion.div
        className="drop-a-line-reels-screen phone-frame"
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.4 }}
      >
        <div className="version-number">v{GAME_VERSION}</div>
        <div className="drop-a-line-reels-header">
          <button
            className="back-btn"
            onClick={handleBackToMain}
          >
            ← Back
          </button>
          <h2 className="live-lobby-title">
            <span className="title-icon">🎣</span>
            {RIZZ_CRAFT_MODE_LABEL}
          </h2>
        </div>
        <div className="drop-a-line-how-to-play">
          <h3 className="drop-a-line-how-to-play-title">How to Play</h3>
          <p className="drop-a-line-how-to-play-text">
            The love of your life is standing in front of you. You have one shot to craft the perfect
            pickup line in order to get their number. Make them fall in love with you- but don&apos;t be
            boring!
          </p>
        </div>
        <div className="drop-a-line-reels-center">
          <DropALineReels
            daters={daters}
            forcePairing={forceReelPairing}
            onForcePairingConsumed={() => setForceReelPairing(null)}
            onContinue={(payload) => {
              setDropALinePayload(payload)
              setDropALineScreen('profile')
              const charSrc = payload?.dater?.dropALineCharacterImage ?? null
              if (charSrc) { const img = new Image(); img.src = charSrc }
            }}
          />
        </div>
      </motion.div>
    )
  }

  // Multiplayer Mode – Archive (Create / Join)
  if (view === 'multiplayer') {
    return (
      <div className="live-lobby phone-frame">
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
      <div className="live-lobby phone-frame">
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
      <div className="live-lobby phone-frame">
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
