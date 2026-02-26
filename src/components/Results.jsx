import { motion } from 'framer-motion' // eslint-disable-line no-unused-vars -- motion used as JSX
import { useGameStore, SCORING_MODES } from '../store/gameStore'
import './Results.css'

const clampChaosValue = (value) => {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return 1
  return Math.max(1, Math.min(10, numeric))
}

const getChaosFillPercent = (value) => {
  const clamped = clampChaosValue(value)
  return ((clamped - 1) / 9) * 100
}

const getChaosTierLabel = (value) => {
  const clamped = clampChaosValue(value)
  if (clamped < 3) return 'Steady'
  if (clamped < 5) return 'Spicy'
  if (clamped < 7) return 'Wild'
  if (clamped < 9) return 'Unhinged'
  return 'Nuclear'
}

function Results() {
  const selectedDater = useGameStore((state) => state.selectedDater)
  const avatar = useGameStore((state) => state.avatar)
  const scoring = useGameStore((state) => state.scoring)
  const getScoringSummary = useGameStore((state) => state.getScoringSummary)
  const finalDateDecision = useGameStore((state) => state.finalDateDecision)
  const resetGame = useGameStore((state) => state.resetGame)
  const isLiveMode = useGameStore((state) => state.isLiveMode)

  const scoringSummary = getScoringSummary()
  const mode = scoringSummary?.mode || SCORING_MODES.LIKES_MINUS_DISLIKES
  const isChaosMode = mode === SCORING_MODES.LIKES_MINUS_DISLIKES_CHAOS
  const isLikesMode = mode === SCORING_MODES.LIKES_MINUS_DISLIKES || isChaosMode

  const likesHit = scoring?.likesMinusDislikes?.likesHit || []
  const dislikesHit = scoring?.likesMinusDislikes?.dislikesHit || []
  const blindCells = scoring?.bingoBlindLockout?.cells || []
  const actionCells = scoring?.bingoActionsOpen?.cells || []

  const isBlindBingo = mode === SCORING_MODES.BINGO_BLIND_LOCKOUT
  const boardCells = isBlindBingo ? blindCells : actionCells

  const decisionLabel = finalDateDecision?.decision === 'yes'
    ? 'Second Date: Yes'
    : finalDateDecision?.decision === 'no'
      ? 'Second Date: No'
      : 'Second Date: Pending'

  const decisionClass = finalDateDecision?.decision === 'yes' ? 'yes' : finalDateDecision?.decision === 'no' ? 'no' : 'pending'

  return (
    <div className={`results scoring-results ${isLiveMode ? 'live-mode-results' : ''}`}>
      <motion.div
        className="results-card"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="result-title">{selectedDater?.name || 'Your Date'} Results</h1>
        <p className="result-subtitle">{avatar?.name || 'You'} vs {selectedDater?.name || 'your date'}</p>

        {isLikesMode ? (
          <div className="score-hero">
            <div className="hero-value">
              {isChaosMode
                ? Number(scoringSummary?.multipliedScore ?? 0).toFixed(2).replace(/\.00$/, '')
                : `${scoringSummary?.scoreOutOf5 ?? 0}/5`}
            </div>
            <div className="hero-label">{isChaosMode ? 'Likes x CHAOS' : 'Likes Minus Dislikes'}</div>
            <div className="hero-stats">
              Likes {scoringSummary?.likesCount ?? 0} • Dislikes {scoringSummary?.dislikesCount ?? 0}
              {isChaosMode
                ? ` • Base ${scoringSummary?.scoreOutOf5 ?? 0}/5 • Multiplier x${Number(scoringSummary?.chaosMultiplier ?? 1).toFixed(2)}`
                : ''}
            </div>
            {isChaosMode ? (
              <div className="results-chaos-meter">
                <span className="results-chaos-label">Chaos Meter</span>
                <span className="results-chaos-track">
                  <span
                    className="results-chaos-fill"
                    style={{ width: `${getChaosFillPercent(scoringSummary?.chaosAverage ?? 1)}%` }}
                  />
                </span>
                <span className="results-chaos-tier">{getChaosTierLabel(scoringSummary?.chaosAverage ?? 1)}</span>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="score-hero">
            <div className="hero-value">{scoringSummary?.bingoCount ?? 0}</div>
            <div className="hero-label">Bingos</div>
            <div className="hero-stats">
              Filled {scoringSummary?.filledCount ?? 0}/16
              {isBlindBingo ? ` • Locked ${scoringSummary?.lockedCount ?? 0}/16` : ''}
            </div>
          </div>
        )}

        <div className={`decision-card ${decisionClass}`}>
          <h2>{decisionLabel}</h2>
          {finalDateDecision?.assessment ? <p>{finalDateDecision.assessment}</p> : null}
          {finalDateDecision?.verdict ? <p>{finalDateDecision.verdict}</p> : null}
        </div>

        {isLikesMode ? (
          <div className="result-columns">
            <div className="result-column liked">
              <h3>What They Liked</h3>
              {likesHit.length > 0 ? (
                likesHit.map((item, index) => <span key={`${item}-${index}`} className="result-chip liked">{item}</span>)
              ) : (
                <p className="empty-copy">No likes were triggered.</p>
              )}
            </div>
            <div className="result-column disliked">
              <h3>What Backfired</h3>
              {dislikesHit.length > 0 ? (
                dislikesHit.map((item, index) => <span key={`${item}-${index}`} className="result-chip disliked">{item}</span>)
              ) : (
                <p className="empty-copy">No dislikes were triggered.</p>
              )}
            </div>
          </div>
        ) : (
          <div className="board-section">
            <h3>{isBlindBingo ? 'Final Bingo Board (Revealed)' : 'Action Bingo Board'}</h3>
            <div className="results-board">
              {boardCells.slice(0, 16).map((cell, index) => {
                const statusClass = isBlindBingo
                  ? (cell.status === 'filled' ? 'filled' : cell.status === 'locked' ? 'locked' : 'unresolved')
                  : (cell.status === 'filled' ? 'filled' : 'open')
                return (
                  <div key={cell.id || `cell-${index}`} className={`results-cell ${statusClass}`}>
                    <span className="cell-label">{cell.label || `Cell ${index + 1}`}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        <div className="results-buttons">
          <button className="btn btn-primary play-again-btn" onClick={resetGame}>Play Again</button>
        </div>
      </motion.div>
    </div>
  )
}

export default Results
