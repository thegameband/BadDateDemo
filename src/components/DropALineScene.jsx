import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { evaluatePickupLine, generatePickupLineComeback } from '../services/llmService'
import { speak, waitForAllAudio } from '../services/ttsService'
import { DROP_A_LINE_LOCATION_PHRASES, DROP_A_LINE_LOCATION_IMAGES } from '../data/dropALineLocations'
import './DropALineScene.css'

const PAUSE_AFTER_SUBMIT_MS = 1000
const SCORE_ANIMATION_MS = 2500
const FINAL_SLAM_LEAD_MS = 220
const STAMP_REPLAY_DELAY_MS = 1000
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
  const [pickupLine, setPickupLine] = useState('')
  const [phase, setPhase] = useState('input') // 'input' | 'evaluating' | 'comeback' | 'reveal' | 'stamp'
  const [displayPercent, setDisplayPercent] = useState(0)
  const [evaluation, setEvaluation] = useState(null) // { score, breakdown }
  const [comebackText, setComebackText] = useState('')
  const [showReplay, setShowReplay] = useState(false)
  const submitTimeoutRef = useRef(null)
  const replayTimeoutRef = useRef(null)

  const backgroundImageUrl = payload?.location ? DROP_A_LINE_LOCATION_IMAGES[payload.location] : null
  const characterImageUrl = payload?.dater?.dropALineCharacterImage ?? null
  const hasImage = Boolean(backgroundImageUrl)

  const handleSubmit = useCallback(
    (e) => {
      e.preventDefault()
      const line = pickupLine.trim()
      if (!line) return
      setPhase('evaluating')
      setShowReplay(false)
      setDisplayPercent(0)
      setEvaluation(null)
      setComebackText('')
      if (submitTimeoutRef.current) clearTimeout(submitTimeoutRef.current)
      submitTimeoutRef.current = setTimeout(async () => {
        const result = await evaluatePickupLine(line, payload?.dater, payload?.location)
        const comeback = await generatePickupLineComeback(
          line,
          payload?.dater,
          payload?.location,
          result?.score ?? 0
        )
        setEvaluation(result)
        setComebackText(comeback)
        setPhase('comeback')
      }, PAUSE_AFTER_SUBMIT_MS)
    },
    [pickupLine, payload?.dater, payload?.location]
  )

  useEffect(() => () => {
    if (submitTimeoutRef.current) clearTimeout(submitTimeoutRef.current)
    if (replayTimeoutRef.current) clearTimeout(replayTimeoutRef.current)
  }, [])

  // Speak the comeback and wait for VO before revealing score/breakdown.
  useEffect(() => {
    if (phase !== 'comeback' || !comebackText) return
    let cancelled = false
    const run = async () => {
      try {
        await speak(comebackText, 'dater')
        await waitForAllAudio()
      } catch {
        // Continue even if VO fails.
      }
      if (!cancelled) {
        setDisplayPercent(0)
        setPhase('reveal')
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [phase, comebackText])

  // Animate percentage from 0 to score during reveal.
  useEffect(() => {
    if (phase !== 'reveal' || evaluation == null) return
    const target = evaluation.score
    const start = performance.now()
    let rafId = null
    const tick = (now) => {
      const elapsed = now - start
      const t = Math.min(1, elapsed / SCORE_ANIMATION_MS)
      const easeOut = 1 - (1 - t) * (1 - t)
      setDisplayPercent(Math.round(easeOut * target))
      if (t < 1) {
        rafId = requestAnimationFrame(tick)
      } else {
        setPhase('stamp')
      }
    }
    rafId = requestAnimationFrame(tick)
    return () => {
      if (rafId) cancelAnimationFrame(rafId)
    }
  }, [phase, evaluation])

  const success = evaluation != null && evaluation.score >= SUCCESS_THRESHOLD
  const possessive = getPossessive(payload?.dater?.pronouns ?? payload?.dater?.dropALineProfile?.pronouns)
  const daterName = payload?.dater?.name ?? 'Someone'
  const locationPhrase =
    (payload?.location && DROP_A_LINE_LOCATION_PHRASES[payload.location]) ?? payload?.location ?? 'somewhere'

  const breakdownCount = evaluation?.breakdown?.length ?? 0
  const slamStaggerMs =
    breakdownCount > 0
      ? Math.max(90, (SCORE_ANIMATION_MS - FINAL_SLAM_LEAD_MS) / breakdownCount)
      : 0
  const isDimmed = phase === 'reveal' || phase === 'stamp'

  useEffect(() => {
    if (phase !== 'stamp') return
    replayTimeoutRef.current = setTimeout(() => setShowReplay(true), STAMP_REPLAY_DELAY_MS)
    return () => {
      if (replayTimeoutRef.current) clearTimeout(replayTimeoutRef.current)
    }
  }, [phase])

  return (
    <div
      className={`drop-a-line-scene${!hasImage ? ' drop-a-line-scene-no-image' : ''}${
        isDimmed ? ' drop-a-line-scene-dimmed' : ''
      }`}
    >
      <div
        className="drop-a-line-scene-backdrop"
        style={{ backgroundImage: backgroundImageUrl ? `url(${backgroundImageUrl})` : undefined }}
      />
      {characterImageUrl && (
        <img
          src={characterImageUrl}
          alt=""
          className="drop-a-line-scene-character"
          role="presentation"
        />
      )}
      {isDimmed && (
        <motion.div
          className="drop-a-line-scene-dimmer"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
        />
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

      {(phase === 'reveal' || phase === 'stamp') && (
        <div className="drop-a-line-scene-reveal-layer">
          <motion.div
            className="drop-a-line-scene-reveal-score"
            key={displayPercent}
            initial={{ opacity: 0.75, scale: 1.05 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.12 }}
          >
            {displayPercent}%
          </motion.div>
          <ul className="drop-a-line-scene-reveal-items" aria-live="polite">
            {evaluation?.breakdown?.map((item, i) => (
              <motion.li
                key={i}
                className={`drop-a-line-scene-wrapup-item ${item.positive ? 'positive' : 'negative'}`}
                initial={{ opacity: 0, scale: 0.35, x: -24, y: 18 }}
                animate={{ opacity: 1, scale: 1, x: 0, y: 0 }}
                transition={{
                  delay: ((i + 1) * slamStaggerMs) / 1000,
                  type: 'spring',
                  stiffness: 280,
                  damping: 18,
                }}
              >
                <span className="drop-a-line-scene-wrapup-symbol">{item.positive ? '+' : '−'}</span>
                <span>{item.text}</span>
              </motion.li>
            ))}
          </ul>
        </div>
      )}

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

          {phase === 'comeback' && (
            <motion.div
              key="comeback"
              className="drop-a-line-scene-panel drop-a-line-scene-comeback"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
            >
              <p className="drop-a-line-scene-comeback-label">{daterName}:</p>
              <p className="drop-a-line-scene-comeback-bubble">{comebackText}</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {phase === 'stamp' && (
        <div className="drop-a-line-scene-stamp-layer">
          <motion.div
            className={`drop-a-line-scene-stamp ${success ? 'drop-a-line-scene-stamp-success' : 'drop-a-line-scene-stamp-rejected'}`}
            initial={{ scale: 0.2, rotate: -10, opacity: 0 }}
            animate={{ scale: 1, rotate: -6, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 260, damping: 15 }}
          >
            {success ? `Got ${possessive} Number!` : 'REJECTED!'}
          </motion.div>
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
        </div>
      )}
    </div>
  )
}
