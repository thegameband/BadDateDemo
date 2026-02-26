import { useMemo, useState } from 'react'
import { motion } from 'framer-motion' // eslint-disable-line no-unused-vars -- motion used as JSX
import { useGameStore, SCORING_MODES } from '../store/gameStore'
import './ScoringModeSelect.css'

const MODE_OPTIONS = [
  {
    id: SCORING_MODES.LIKES_MINUS_DISLIKES,
    title: 'Likes Minus Dislikes',
    subtitle: 'Hit likes, avoid dislikes. Final score is clamped to 0-5.',
  },
  {
    id: SCORING_MODES.LIKES_MINUS_DISLIKES_CHAOS,
    title: 'Likes + CHAOS Multiplier',
    subtitle: 'Mode 1 scoring plus per-answer chaos (1-10). Base score is clamped to 0-5, then multiplied from 0.5x to 3x.',
  },
  {
    id: SCORING_MODES.BINGO_BLIND_LOCKOUT,
    title: 'Bad Date Bingo (Blind + Lockouts)',
    subtitle: 'Hidden 4x4 board. Cells reveal and become filled or locked in real-time.',
  },
  {
    id: SCORING_MODES.BINGO_ACTIONS_OPEN,
    title: 'Bad Date Bingo (Open Actions)',
    subtitle: 'Visible 4x4 action board. Fill cells by getting your date to perform actions.',
  },
]

function ScoringModeSelect() {
  const selectedDater = useGameStore((state) => state.selectedDater)
  const setPhase = useGameStore((state) => state.setPhase)
  const setScoringMode = useGameStore((state) => state.setScoringMode)
  const initializeScoringForDater = useGameStore((state) => state.initializeScoringForDater)
  const currentMode = useGameStore((state) => state.scoring?.selectedMode)
  const [selectedMode, setSelectedMode] = useState(currentMode || SCORING_MODES.LIKES_MINUS_DISLIKES)

  const daterName = useMemo(() => selectedDater?.name || 'your date', [selectedDater?.name])

  const handleContinue = () => {
    setScoringMode(selectedMode)
    initializeScoringForDater(selectedDater)
    setPhase('dater-bio')
  }

  const handleBack = () => {
    setPhase('live-lobby')
  }

  return (
    <div className="scoring-mode-select">
      <motion.div
        className="scoring-mode-card"
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1>Choose Scoring Mode</h1>
        <p className="mode-subtitle">
          Pick how this date with <strong>{daterName}</strong> will be scored.
        </p>

        <div className="mode-list">
          {MODE_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              className={`mode-option ${selectedMode === option.id ? 'selected' : ''}`}
              onClick={() => setSelectedMode(option.id)}
            >
              <span className="mode-title">{option.title}</span>
              <span className="mode-text">{option.subtitle}</span>
            </button>
          ))}
        </div>

        <div className="mode-actions">
          <button type="button" className="btn-secondary" onClick={handleBack}>
            Back
          </button>
          <button type="button" className="btn-primary" onClick={handleContinue}>
            Continue
          </button>
        </div>
      </motion.div>
    </div>
  )
}

export default ScoringModeSelect
