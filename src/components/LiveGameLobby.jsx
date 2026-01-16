import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { QRCodeSVG } from 'qrcode.react'
import { useGameStore } from '../store/gameStore'
import { 
  isFirebaseAvailable, 
  subscribeToPlayers, 
  subscribeToRoom,
  updateGameState,
  leaveRoom 
} from '../services/firebase'
import './LiveGameLobby.css'

function LiveGameLobby() {
  const setPhase = useGameStore((state) => state.setPhase)
  const startLiveDate = useGameStore((state) => state.startLiveDate)
  const selectedDater = useGameStore((state) => state.selectedDater)
  const setSelectedDater = useGameStore((state) => state.setSelectedDater)
  const roomCode = useGameStore((state) => state.roomCode)
  const isHost = useGameStore((state) => state.isHost)
  const players = useGameStore((state) => state.players)
  const setPlayers = useGameStore((state) => state.setPlayers)
  const username = useGameStore((state) => state.username)
  const playerId = useGameStore((state) => state.playerId)
  
  const [copied, setCopied] = useState(false)
  const [firebaseReady] = useState(isFirebaseAvailable())
  const [showTutorial, setShowTutorial] = useState(false)
  
  // Subscribe to real-time player updates
  useEffect(() => {
    if (!firebaseReady || !roomCode) return
    
    // Subscribe to players
    const unsubscribePlayers = subscribeToPlayers(roomCode, (playersList) => {
      setPlayers(playersList)
    })
    
    // Subscribe to room for dater info and game state
    const unsubscribeRoom = subscribeToRoom(roomCode, (roomData) => {
      if (roomData?.dater && !selectedDater) {
        setSelectedDater(roomData.dater)
      }
      
      // Check if game has started (for non-hosts)
      if (roomData?.gameState?.phase === 'live-date') {
        setPhase('live-date')
      }
    })
    
    return () => {
      unsubscribePlayers()
      unsubscribeRoom()
    }
  }, [firebaseReady, roomCode, setPlayers, setSelectedDater, selectedDater, setPhase])
  
  const copyCode = () => {
    navigator.clipboard.writeText(roomCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  
  const handleStart = async () => {
    if (firebaseReady) {
      // Update Firebase to signal game start to all players
      await updateGameState(roomCode, { phase: 'live-date', showTutorial })
    }
    startLiveDate(null, showTutorial)
  }
  
  const handleBack = async () => {
    if (firebaseReady && playerId) {
      await leaveRoom(roomCode, playerId)
    }
    setPhase('live-lobby')
  }
  
  return (
    <div className="live-game-lobby">
      <div className="lobby-left">
        <div className="room-info-card">
          <div className="room-header">
            <button className="back-btn" onClick={handleBack}>
              ← Leave
            </button>
            <div className="room-code-section">
              <span className="room-label">Room Code</span>
              <div className="room-code" onClick={copyCode}>
                <span className="code-text">{roomCode}</span>
                <span className="copy-icon">{copied ? '✓' : '📋'}</span>
              </div>
              {copied && <span className="copied-toast">Copied!</span>}
            </div>
          </div>
          
          {/* QR Code to join this room */}
          <div className="qr-section">
            <p className="qr-label">Scan to join</p>
            <div className="qr-code-container">
              <QRCodeSVG 
                value={`https://bad-date-demo.vercel.app?room=${roomCode}`}
                size={100}
                bgColor="#ffffff"
                fgColor="#000000"
                level="M"
              />
            </div>
          </div>
          
          <div className="dater-preview">
            <h3 className="preview-title">Your Date</h3>
            {selectedDater && (
              <motion.div 
                className="dater-card-mini"
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
              >
                <img 
                  src={selectedDater.photo} 
                  alt={selectedDater.name}
                  className="dater-photo"
                />
                <div className="dater-info">
                  <h4 className="dater-name">{selectedDater.name}, {selectedDater.age}</h4>
                  <p className="dater-tagline">{selectedDater.tagline}</p>
                  <span className="dater-archetype">{selectedDater.archetype}</span>
                </div>
              </motion.div>
            )}
          </div>
        </div>
      </div>
      
      <div className="lobby-right">
        <div className="players-card">
          <h3 className="players-title">
            <span className="title-icon">👥</span>
            Players ({players.length}/20)
          </h3>
          
          <div className="players-list">
            <AnimatePresence>
              {players.map((player, index) => (
                <motion.div
                  key={player.id}
                  className={`player-item ${player.isHost ? 'is-host' : ''} ${player.id === playerId ? 'is-you' : ''}`}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ delay: index * 0.05 }}
                >
                  <span className="player-avatar">
                    {player.username?.charAt(0)?.toUpperCase() || '?'}
                  </span>
                  <span className="player-name">{player.username || 'Loading...'}</span>
                  {player.isHost && <span className="host-badge">👑 Host</span>}
                  {player.id === playerId && !player.isHost && (
                    <span className="you-badge">You</span>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
          
          <div className="waiting-area">
            {players.length < 2 ? (
              <p className="waiting-text">
                <span className="waiting-dots">⏳</span>
                Waiting for more players...
              </p>
            ) : (
              <p className="ready-text">
                <span className="ready-icon">✨</span>
                Ready to start!
              </p>
            )}
          </div>
          
          {isHost ? (
            <>
              <label className="tutorial-checkbox">
                <input 
                  type="checkbox" 
                  checked={showTutorial}
                  onChange={(e) => setShowTutorial(e.target.checked)}
                />
                <span className="checkbox-label">Show Tutorial</span>
                <span className="checkbox-hint">Recommended for new players</span>
              </label>
              <motion.button
                className="btn btn-primary start-btn"
                onClick={handleStart}
                disabled={players.length < 1}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                Start Date 🎬
              </motion.button>
            </>
          ) : (
            <div className="waiting-for-host">
              <span className="pulse-dot"></span>
              Waiting for host to start...
            </div>
          )}
        </div>
        
        <div className="game-rules">
          <h4>How Live Mode Works</h4>
          <div className="rules-list">
            <div className="rule">
              <span className="rule-num">1</span>
              <span>Suggest attributes for the Avatar</span>
            </div>
            <div className="rule">
              <span className="rule-num">2</span>
              <span>Vote for your favorite suggestions</span>
            </div>
            <div className="rule">
              <span className="rule-num">3</span>
              <span>Watch the chaos unfold!</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default LiveGameLobby
