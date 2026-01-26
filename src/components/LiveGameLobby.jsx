import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { QRCodeSVG } from 'qrcode.react'
import { useGameStore } from '../store/gameStore'
import PartySocket from 'partysocket'
import './LiveGameLobby.css'

// PartyKit host
const PARTYKIT_HOST = import.meta.env.VITE_PARTYKIT_HOST || 'localhost:1999'

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
  const partyClient = useGameStore((state) => state.partyClient)
  
  const setShowAttributesByDefault = useGameStore((state) => state.setShowAttributesByDefault)
  
  const [copied, setCopied] = useState(false)
  const [showTutorial, setShowTutorial] = useState(false)
  const [startingStatsMode, setStartingStatsMode] = useState(true) // Default ON
  const [showAttributes, setShowAttributes] = useState(false) // Default OFF
  
  // Subscribe to PartyKit state updates
  useEffect(() => {
    if (!partyClient) {
      console.warn('No PartyKit client available')
      return
    }
    
    console.log('📡 Setting up PartyKit state subscription in lobby')
    
    const unsubscribe = partyClient.onStateChange((state) => {
      console.log('📡 Lobby received state update:', state)
      
      // Update players list
      if (state.players) {
        setPlayers(state.players.map(p => ({
          id: p.odId,
          odId: p.odId,
          username: p.username,
          isHost: p.isHost
        })))
      }
      
      // Update dater if set
      if (state.dater && !selectedDater) {
        setSelectedDater(state.dater)
      }
      
      // Check if game has started (for non-hosts)
      if (state.phase !== 'lobby') {
        console.log('🎮 Game started! Transitioning to live-date...')
        
        // Sync state to local store before transitioning
        if (typeof state.showTutorial === 'boolean') {
          useGameStore.getState().setShowTutorial(state.showTutorial)
        }
        if (typeof state.tutorialStep === 'number') {
          useGameStore.getState().setTutorialStep(state.tutorialStep)
        }
        if (state.phase) {
          useGameStore.getState().setLivePhase(state.phase)
        }
        if (typeof state.startingStatsMode === 'boolean') {
          useGameStore.setState({ startingStatsMode: state.startingStatsMode })
        }
        if (state.startingStats) {
          useGameStore.getState().setStartingStats(state.startingStats)
        }
        
        // Transition to game
        setPhase('live-date')
      }
    })
    
    return () => {
      unsubscribe()
    }
  }, [partyClient, setPlayers, setSelectedDater, selectedDater, setPhase])
  
  // Update registry with player count when players change
  useEffect(() => {
    if (isHost && roomCode && players.length > 0) {
      const registry = new PartySocket({
        host: PARTYKIT_HOST,
        room: 'roomregistry',
        party: 'roomregistry'
      })
      
      registry.addEventListener('open', () => {
        registry.send(JSON.stringify({
          type: 'UPDATE_ROOM',
          code: roomCode,
          playerCount: players.length
        }))
        setTimeout(() => registry.close(), 500)
      })
    }
  }, [isHost, roomCode, players.length])
  
  const copyCode = () => {
    navigator.clipboard.writeText(roomCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  
  const handleStart = async () => {
    if (!partyClient) {
      console.error('No PartyKit client!')
      return
    }
    
    console.log('🚀 Starting game...')
    
    // Start the game via PartyKit
    partyClient.startGame(showTutorial, startingStatsMode)
    
    // Remove room from registry (game has started)
    const registry = new PartySocket({
      host: PARTYKIT_HOST,
      room: 'roomregistry',
      party: 'roomregistry'
    })
    
    registry.addEventListener('open', () => {
      registry.send(JSON.stringify({
        type: 'REMOVE_ROOM',
        code: roomCode
      }))
      setTimeout(() => registry.close(), 500)
    })
    
    // Update local state
    setShowAttributesByDefault(showAttributes) // Save the show attributes setting
    startLiveDate(null, showTutorial, startingStatsMode)
  }
  
  const handleBack = async () => {
    if (partyClient) {
      partyClient.leave(playerId)
      partyClient.disconnect()
    }
    
    // Remove room from registry if host leaves
    if (isHost) {
      const registry = new PartySocket({
        host: PARTYKIT_HOST,
        room: 'roomregistry',
        party: 'roomregistry'
      })
      
      registry.addEventListener('open', () => {
        registry.send(JSON.stringify({
          type: 'REMOVE_ROOM',
          code: roomCode
        }))
        setTimeout(() => registry.close(), 500)
      })
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
            <div className="room-join-row">
              <div className="room-code-section">
                <span className="room-label">Room Code</span>
                <div className="room-code" onClick={copyCode}>
                  <span className="code-text">{roomCode}</span>
                  <span className="copy-icon">{copied ? '✓' : '📋'}</span>
                </div>
                {copied && <span className="copied-toast">Copied!</span>}
              </div>
              
              {/* QR Code to join this room */}
              <div className="qr-section">
                <div className="qr-code-container">
                  <QRCodeSVG 
                    value={`https://bad-date-demo.vercel.app?room=${roomCode}`}
                    size={80}
                    bgColor="#ffffff"
                    fgColor="#000000"
                    level="M"
                  />
                </div>
                <p className="qr-label">Scan to join</p>
              </div>
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
                  key={player.id || player.odId}
                  className={`player-item ${player.isHost ? 'is-host' : ''} ${(player.id === playerId || player.odId === playerId) ? 'is-you' : ''}`}
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
                  {(player.id === playerId || player.odId === playerId) && !player.isHost && (
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
              <div className="game-options">
                <label className="tutorial-checkbox">
                  <input 
                    type="checkbox" 
                    checked={showTutorial}
                    onChange={(e) => setShowTutorial(e.target.checked)}
                  />
                  <span className="checkbox-label">Show Tutorial</span>
                  <span className="checkbox-hint">Recommended for new players</span>
                </label>
                <label className="tutorial-checkbox">
                  <input 
                    type="checkbox" 
                    checked={startingStatsMode}
                    onChange={(e) => setStartingStatsMode(e.target.checked)}
                  />
                  <span className="checkbox-label">🎲 Starting Stats</span>
                  <span className="checkbox-hint">Players create the avatar together</span>
                </label>
                <label className="tutorial-checkbox">
                  <input 
                    type="checkbox" 
                    checked={showAttributes}
                    onChange={(e) => setShowAttributes(e.target.checked)}
                  />
                  <span className="checkbox-label">👁️ Show Attributes</span>
                  <span className="checkbox-hint">Debug mode - shows sentiment categories</span>
                </label>
              </div>
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
