import { useEffect, useRef, useState } from 'react'
import { useGameStore } from '../store/gameStore'
import { speak } from '../services/ttsService'
import './DaterBioPage.css'

const RANDOM_NAMES = ['Alex', 'Sam', 'Jordan', 'Taylor', 'Morgan', 'Casey', 'Riley', 'Avery', 'Quinn', 'Rowan', 'Sage', 'Finley', 'Dakota', 'Reese', 'Emery', 'Charlie', 'Skyler', 'River', 'Blake', 'Drew']
const getRandomFallbackName = () => RANDOM_NAMES[Math.floor(Math.random() * RANDOM_NAMES.length)]

/**
 * Dater Bio Page: shown after Play, before the live date starts.
 * Shows dater image + age, gender, occupation, hobbies (from personality) and START THE DATE.
 */
function DaterBioPage() {
  const selectedDater = useGameStore((state) => state.selectedDater)
  const setPhase = useGameStore((state) => state.setPhase)
  const setUsername = useGameStore((state) => state.setUsername)
  const players = useGameStore((state) => state.players)
  const setPlayers = useGameStore((state) => state.setPlayers)
  const startLiveDate = useGameStore((state) => state.startLiveDate)
  const hasSpoken = useRef(false)
  const [defaultName] = useState(() => getRandomFallbackName())
  const [playerName, setPlayerName] = useState(defaultName)

  // Narrator announces the dater when the bio page loads
  useEffect(() => {
    if (selectedDater?.name && !hasSpoken.current) {
      hasSpoken.current = true
      speak(`Your date today is ${selectedDater.name}`, 'narrator')
    }
  }, [selectedDater])

  const handleStartDate = () => {
    const finalName = String(playerName || '').trim() || defaultName
    setUsername(finalName)
    if (Array.isArray(players) && players.length > 0) {
      setPlayers(players.map((player, index) => (
        index === 0 ? { ...player, username: finalName } : player
      )))
    }
    setPhase('live-date')
    startLiveDate(null, false, false) // no tutorial, no starting stats
  }

  if (!selectedDater) {
    return (
      <div className="dater-bio-page">
        <p>Loading your date…</p>
      </div>
    )
  }

  const { name, photo, age, pronouns, archetype, tagline, description } = selectedDater
  const occupation = description ? description.split('.')[0].trim() : archetype

  return (
    <div className="dater-bio-page">
      <div className="dater-bio-card">
        <h1 className="dater-bio-title">Your date today</h1>
        <div className="dater-bio-image-wrap">
          <img
            src={photo}
            alt={name}
            className="dater-bio-image"
          />
        </div>
        <h2 className="dater-bio-name">{name}</h2>
        <div className="dater-bio-meta">
          <span>{age}</span>
          <span> · </span>
          <span>{pronouns}</span>
        </div>
        <p className="dater-bio-occupation">{occupation}</p>
        {tagline && <p className="dater-bio-tagline">"{tagline}"</p>}
        <div className="dater-bio-name-field">
          <label htmlFor="dater-bio-player-name" className="dater-bio-name-label">
            Your name
          </label>
          <input
            id="dater-bio-player-name"
            type="text"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            maxLength={30}
            className={`dater-bio-name-input ${playerName.trim() === defaultName ? 'is-default' : ''}`}
            autoComplete="name"
            spellCheck={false}
          />
        </div>
        <button
          type="button"
          className="dater-bio-start-btn"
          onClick={handleStartDate}
        >
          START THE DATE
        </button>
      </div>
    </div>
  )
}

export default DaterBioPage
