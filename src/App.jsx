import { useEffect } from 'react'
import { useGameStore } from './store/gameStore'
import Lobby from './components/Lobby'
import Matchmaking from './components/Matchmaking'
import ChatPhase from './components/ChatPhase'
import DateScene from './components/DateScene'
import Results from './components/Results'
import GameHeader from './components/GameHeader'
import LiveLobby from './components/LiveLobby'
import LiveGameLobby from './components/LiveGameLobby'
import LiveDateScene from './components/LiveDateScene'
import './App.css'

function App() {
  const phase = useGameStore((state) => state.phase)
  const isLiveMode = useGameStore((state) => state.isLiveMode)
  
  // Debug: Add ?mobile=true to URL to force mobile layout
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('mobile') === 'true') {
      document.body.classList.add('force-mobile')
      console.log('🔧 Debug: Mobile layout forced via ?mobile=true')
    } else {
      document.body.classList.remove('force-mobile')
    }
  }, [])
  
  const renderPhase = () => {
    switch (phase) {
      case 'lobby':
        return <Lobby />
      case 'matchmaking':
        return <Matchmaking />
      case 'chatting':
        return <ChatPhase />
      case 'smalltalk':
      case 'voting':
      case 'applying':
      case 'hotseat':
        return <DateScene />
      case 'results':
        return <Results />
      // Live Mode phases
      case 'live-lobby':
        return <LiveLobby />
      case 'live-game-lobby':
        return <LiveGameLobby />
      case 'live-date':
        return <LiveDateScene />
      default:
        return <Lobby />
    }
  }
  
  // Determine if we should show the header
  const showHeader = phase !== 'lobby' && phase !== 'live-lobby'
  // For Live Date, we use a custom header in the component
  const showGameHeader = showHeader && phase !== 'live-date'
  
  return (
    <div className={`app ${isLiveMode && phase === 'live-date' ? 'live-mode' : ''}`}>
      {showGameHeader && <GameHeader />}
      <main className={`main-content ${phase === 'live-date' ? 'live-main' : ''}`}>
        {renderPhase()}
      </main>
    </div>
  )
}

export default App
