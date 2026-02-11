import { useGameStore } from '../store/gameStore'
import './DaterBioPage.css'

/**
 * Dater Bio Page: shown after Play, before the 3 questions.
 * Shows dater image + age, gender, occupation, hobbies (from personality) and START THE DATE.
 * Design: Play → Dater Bio Page → START THE DATE → 3 questions → date.
 */
function DaterBioPage() {
  const selectedDater = useGameStore((state) => state.selectedDater)
  const setPhase = useGameStore((state) => state.setPhase)
  const startLiveDate = useGameStore((state) => state.startLiveDate)

  const handleStartDate = () => {
    setPhase('live-date')
    startLiveDate(null, false, true) // no tutorial, with starting stats (3 questions)
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
