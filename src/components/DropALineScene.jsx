import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { generateSceneImage } from '../services/geminiImageService'
import { evaluatePickupLine } from '../services/llmService'
import { DROP_A_LINE_LOCATION_PHRASES } from '../data/dropALineLocations'
import './DropALineScene.css'

const PAUSE_AFTER_SUBMIT_MS = 1000
const SCORE_ANIMATION_MS = 1500
const RESULT_DISPLAY_MS = 2500
const WRAPUP_ITEM_STAGGER_MS = 180
const SUCCESS_THRESHOLD = 75

function getPossessive(pronouns) {
  const p = (pronouns || '').toLowerCase()
  if (p.startsWith('he')) return 'his'
  if (p.startsWith('she')) return 'her'
  return 'their'
}

/**
 * Full-screen 9:16 portrait scene for writing a pickup line.
 * Props: payload { dater, location }, onBack(), onReplay()
 */
export default function DropALineScene({ payload, onBack, onReplay }) {
  const [sceneImage, setSceneImage] = useState(null)
  const [loadingImage, setLoadingImage] = useState(true)
  const [sceneError, setSceneError] = useState(null)
  const [pickupLine, setPickupLine] = useState('')
  const [phase, setPhase] = useState('input') // 'input' | 'evaluating' | 'score' | 'result' | 'wrapup'
  const [displayPercent, setDisplayPercent] = useState(0)
  const [evaluation, setEvaluation] = useState(null) // { score, breakdown }
  const resultTimeoutRef = useRef(null)
  const submitTimeoutRef = useRef(null)
  const [showReplay, setShowReplay] = useState(false)

  useEffect(() => {
    if (!payload?.dater || !payload?.location) {
      setLoadingImage(false)
      return
    }
    let cancelled = false
    setLoadingImage(true)
    setSceneImage(null)
    setSceneError(null)
    generateSceneImage(payload.dater, payload.location).then(({ dataUrl, error }) => {
      if (!cancelled) {
        setSceneImage(dataUrl ?? null)
        setSceneError(error ?? null)
        setLoadingImage(false)
      }
    })
    return () => { cancelled = true }
  }, [payload?.dater, payload?.location])

  const handleSubmit = useCallback(
    (e) => {
      e.preventDefault()
      const line = pickupLine.trim()
      if (!line) return
      setPhase('evaluating')
      if (submitTimeoutRef.current) clearTimeout(submitTimeoutRef.current)
      submitTimeoutRef.current = setTimeout(async () => {
        const result = await evaluatePickupLine(line, payload?.dater, payload?.location)
        setEvaluation(result)
        setDisplayPercent(0)
        setPhase('score')
      }, PAUSE_AFTER_SUBMIT_MS)
    },
    [pickupLine, payload?.dater, payload?.location]
  )

  useEffect(() => () => {
    if (submitTimeoutRef.current) clearTimeout(submitTimeoutRef.current)
    if (resultTimeoutRef.current) clearTimeout(resultTimeoutRef.current)
  }, [])

  // Animate percentage from 0 to score
  useEffect(() => {
    if (phase !== 'score' || evaluation == null) return
    const target = evaluation.score
    const start = performance.now()
    const tick = (now) => {
      const elapsed = now - start
      const t = Math.min(1, elapsed / SCORE_ANIMATION_MS)
      const easeOut = 1 - (1 - t) * (1 - t)
      setDisplayPercent(Math.round(easeOut * target))
      if (t < 1) requestAnimationFrame(tick)
      else {
        setPhase('result')
        resultTimeoutRef.current = setTimeout(() => setPhase('wrapup'), RESULT_DISPLAY_MS)
      }
    }
    requestAnimationFrame(tick)
    return () => {
      if (resultTimeoutRef.current) clearTimeout(resultTimeoutRef.current)
    }
  }, [phase, evaluation])

  const success = evaluation != null && evaluation.score >= SUCCESS_THRESHOLD
  const possessive = getPossessive(payload?.dater?.pronouns ?? payload?.dater?.dropALineProfile?.pronouns)
  const daterName = payload?.dater?.name ?? 'Someone'
  const locationPhrase =
    (payload?.location && DROP_A_LINE_LOCATION_PHRASES[payload.location]) ?? payload?.location ?? 'somewhere'
  const hasImage = Boolean(sceneImage)

  const breakdownCount = evaluation?.breakdown?.length ?? 0
  const replayDelay = breakdownCount * (WRAPUP_ITEM_STAGGER_MS / 1000) + 0.5
  useEffect(() => {
    if (phase !== 'wrapup') return
    const t = setTimeout(() => setShowReplay(true), replayDelay * 1000)
    return () => clearTimeout(t)
  }, [phase, replayDelay])

  return (
    <div className={`drop-a-line-scene${!hasImage && !loadingImage ? ' drop-a-line-scene-no-image' : ''}`}>
      <div
        className="drop-a-line-scene-backdrop"
        style={{ backgroundImage: hasImage ? `url(${sceneImage})` : undefined }}
      />
      {loadingImage && <div className="drop-a-line-scene-loading" />}
      {sceneError && !loadingImage && (
        <p className="drop-a-line-scene-debug" aria-live="polite">
          Scene art: {sceneError}
        </p>
      )}

      <div className="drop-a-line-scene-top">
        {phase === 'input' && (
          <button type="button" className="drop-a-line-scene-back" onClick={onBack} aria-label="Back">
            ← Back
          </button>
        )}
        {phase === 'input' && (
          <div className="drop-a-line-scene-title-wrap">
            <h2 className="drop-a-line-scene-title">
              You see {daterName} at {locationPhrase}.
            </h2>
            <p className="drop-a-line-scene-subtitle">Give your best Pickup Line</p>
          </div>
        )}
      </div>

      <div className="drop-a-line-scene-bottom">
        <AnimatePresence mode="wait">
          {phase === 'input' && (
            <motion.div
              key="input"
              className="drop-a-line-scene-panel"
              initial={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <form onSubmit={handleSubmit} className="drop-a-line-scene-form">
                <input
                  type="text"
                  className="drop-a-line-scene-input"
                  placeholder="Your pickup line…"
                  value={pickupLine}
                  onChange={(e) => setPickupLine(e.target.value)}
                  maxLength={200}
                  autoComplete="off"
                />
                <button type="submit" className="drop-a-line-scene-submit">
                  Submit
                </button>
              </form>
            </motion.div>
          )}

          {phase === 'evaluating' && (
            <motion.div
              key="evaluating"
              className="drop-a-line-scene-panel drop-a-line-scene-evaluating"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <p className="drop-a-line-scene-evaluating-text">Evaluating your line…</p>
            </motion.div>
          )}

          {(phase === 'score' || phase === 'result') && (
            <motion.div
              key="score-result"
              className="drop-a-line-scene-panel drop-a-line-scene-score-panel"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.25 }}
            >
              <div className="drop-a-line-scene-percent-wrap">
                <motion.span
                  className="drop-a-line-scene-percent"
                  key={displayPercent}
                  initial={{ opacity: 0.8, scale: 1.05 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.1 }}
                >
                  {displayPercent}%
                </motion.span>
              </div>
              {phase === 'result' && (
                <motion.p
                  className={`drop-a-line-scene-result ${success ? 'drop-a-line-scene-result-success' : 'drop-a-line-scene-result-rejected'}`}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2, duration: 0.3 }}
                >
                  {success ? `Got ${possessive} number!` : 'Rejected!'}
                </motion.p>
              )}
            </motion.div>
          )}

          {phase === 'wrapup' && (
            <motion.div
              key="wrapup"
              className="drop-a-line-scene-panel drop-a-line-scene-wrapup"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.2 }}
            >
              <h3 className="drop-a-line-scene-wrapup-title">Wrap Up</h3>
              <ul className="drop-a-line-scene-wrapup-list" aria-live="polite">
                {evaluation?.breakdown?.map((item, i) => (
                  <motion.li
                    key={i}
                    className={`drop-a-line-scene-wrapup-item ${item.positive ? 'positive' : 'negative'}`}
                    initial={{ opacity: 0, scale: 0.3, x: -20 }}
                    animate={{ opacity: 1, scale: 1, x: 0 }}
                    transition={{
                      delay: i * (WRAPUP_ITEM_STAGGER_MS / 1000),
                      type: 'spring',
                      stiffness: 260,
                      damping: 20,
                    }}
                  >
                    <span className="drop-a-line-scene-wrapup-symbol">{item.positive ? '+' : '−'}</span>
                    <span>{item.text}</span>
                  </motion.li>
                ))}
              </ul>
              {showReplay && (
                <motion.div
                  className="drop-a-line-scene-replay-wrap"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  <button
                    type="button"
                    className="drop-a-line-scene-replay"
                    onClick={onReplay ?? onBack}
                  >
                    Replay
                  </button>
                </motion.div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
