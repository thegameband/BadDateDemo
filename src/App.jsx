import { useEffect } from 'react'
import { useGameStore } from './store/gameStore'
import Lobby from './components/Lobby'
import Matchmaking from './components/Matchmaking'
import ChatPhase from './components/ChatPhase'
import DateScene from './components/DateScene'
import Results from './components/Results'
import GameHeader from './components/GameHeader'
import './App.css'

function App() {
  const phase = useGameStore((state) => state.phase)
  
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
      default:
        return <Lobby />
    }
  }
  
  return (
    <div className="app">
      {phase !== 'lobby' && <GameHeader />}
      <main className="main-content">
        {renderPhase()}
      </main>
    </div>
  )
}

export default App
