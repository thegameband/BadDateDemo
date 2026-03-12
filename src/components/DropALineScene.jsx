import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { evaluatePickupLine, generatePickupLineComeback } from '../services/llmService'
import {
  speakAndWait,
  setVoice,
  preloadSpeech,
  speakPreloaded,
  stopAllAudio,
} from '../services/ttsService'
import { playSfxCue, setMusicMode } from '../services/audioService'
import { DROP_A_LINE_LOCATION_PHRASES } from '../data/dropALineLocations'
import './DropALineScene.css'

const PAUSE_AFTER_SUBMIT_MS = 1000
const SCORE_ANIMATION_MS = 2500
const FINAL_SLAM_LEAD_MS = 220
const STAMP_REPLAY_DELAY_MS = 1000
const SUCCESS_THRESHOLD = 75
const COMEBACK_VO_TIMEOUT_MS = 12000

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
  const [isShareBusy, setIsShareBusy] = useState(false)
  const [shareStatus, setShareStatus] = useState('')
  const submitTimeoutRef = useRef(null)
  const replayTimeoutRef = useRef(null)
  const shareCaptureRef = useRef(null)
  const preloadedComebackRef = useRef(null)
  const resultSfxPlayedRef = useRef(false)

  const dropALineImages = payload?.dater?.dropALineImages
  const daterName = payload?.dater?.name ?? 'Someone'
  const locationPhrase =
    (payload?.location && DROP_A_LINE_LOCATION_PHRASES[payload.location]) ?? payload?.location ?? 'somewhere'
  const possessive = getPossessive(payload?.dater?.pronouns ?? payload?.dater?.dropALineProfile?.pronouns)
  const sceneImageUrl = useMemo(() => {
    if (!dropALineImages) return payload?.dater?.dropALineCharacterImage ?? null
    if (phase === 'comeback' || phase === 'reveal' || phase === 'stamp') {
      const score = evaluation?.score ?? 0
      return score >= SUCCESS_THRESHOLD ? dropALineImages.happy : dropALineImages.disappointed
    }
    return dropALineImages.start
  }, [dropALineImages, phase, evaluation?.score, payload?.dater?.dropALineCharacterImage])
  const hasImage = Boolean(sceneImageUrl)
  const finalScore = evaluation?.score ?? 0

  useEffect(() => {
    void setMusicMode('rizzCraft')
    return () => {
      void setMusicMode(null)
    }
  }, [])

  const buildShareImage = useCallback(async () => {
    if (!evaluation || !shareCaptureRef.current) return null
    if (typeof document !== 'undefined' && document.fonts?.ready) {
      await document.fonts.ready
    }
    const html2canvas = (await import('html2canvas')).default
    const canvas = await html2canvas(shareCaptureRef.current, {
      backgroundColor: null,
      scale: 2,
      useCORS: true,
      logging: false,
    })
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob((result) => {
        if (!result) {
          reject(new Error('Failed to render share image.'))
          return
        }
        resolve(result)
      }, 'image/png', 0.95)
    })
    const safeDater = String(daterName || 'date').toLowerCase().replace(/[^a-z0-9]+/g, '-')
    const fileName = `${safeDater}-pickup-line-${evaluation.score}.png`
    return { blob, fileName }
  }, [evaluation, daterName])

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
      setShareStatus('')
      resultSfxPlayedRef.current = false
      preloadedComebackRef.current = null
      if (submitTimeoutRef.current) clearTimeout(submitTimeoutRef.current)
      submitTimeoutRef.current = setTimeout(async () => {
        const narratorPromise = speakAndWait(line, 'narrator')
        const result = await evaluatePickupLine(line, payload?.dater, payload?.location)
        const comeback = await generatePickupLineComeback(
          line,
          payload?.dater,
          payload?.location,
          result?.score ?? 0
        )
        preloadedComebackRef.current = preloadSpeech(comeback, 'dater')
        await narratorPromise
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

  useEffect(() => {
    if (!payload?.dater?.voiceId) return
    const isMale = (payload?.dater?.pronouns ?? '').toLowerCase().includes('he')
    setVoice('dater', payload.dater.voiceId, isMale)
  }, [payload?.dater])

  // Speak the comeback and wait for VO before revealing score/breakdown.
  useEffect(() => {
    if (phase !== 'comeback' || !comebackText) return
    let cancelled = false
    const withTimeout = (promise, ms) =>
      Promise.race([
        promise,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`VO timeout after ${ms}ms`)), ms)
        ),
      ])

    const run = async () => {
      try {
        const preloaded = preloadedComebackRef.current ? await preloadedComebackRef.current : null
        preloadedComebackRef.current = null
        if (preloaded?.audioUrl) {
          await withTimeout(speakPreloaded(preloaded, { waitForEnd: true }), COMEBACK_VO_TIMEOUT_MS)
        } else {
          await withTimeout(speakAndWait(comebackText, 'dater'), COMEBACK_VO_TIMEOUT_MS)
        }
      } catch {
        // Hard fail-safe: never let VO lock the scene.
        stopAllAudio()
        try {
          await withTimeout(speakAndWait(comebackText, 'dater'), 5000)
        } catch {
          // Continue even if fallback VO fails.
        }
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

  useEffect(() => {
    if (phase !== 'stamp' || !evaluation || resultSfxPlayedRef.current) return
    const isGoodResult = evaluation.score >= SUCCESS_THRESHOLD
    void playSfxCue(isGoodResult ? 'resultGood' : 'resultBad')
    resultSfxPlayedRef.current = true
  }, [phase, evaluation])

  const handleShare = useCallback(async () => {
    if (!evaluation || !shareCaptureRef.current || isShareBusy) return
    setIsShareBusy(true)
    setShareStatus('')
    try {
      const shareImage = await buildShareImage()
      if (!shareImage) return
      const { blob, fileName } = shareImage
      const file = new File([blob], fileName, { type: 'image/png' })

      const canNativeShare =
        typeof navigator !== 'undefined' &&
        typeof navigator.share === 'function' &&
        typeof navigator.canShare === 'function' &&
        navigator.canShare({ files: [file] })

      if (canNativeShare) {
        await navigator.share({
          files: [file],
          title: 'Hard Launch',
          text: `I scored ${evaluation.score}% with ${daterName}.`,
        })
        setShareStatus('Shared!')
      } else {
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = fileName
        document.body.appendChild(link)
        link.click()
        link.remove()
        URL.revokeObjectURL(url)
        setShareStatus('Saved to your device.')
      }
    } catch (error) {
      if (error?.name === 'AbortError') {
        setShareStatus('')
      } else {
        setShareStatus('Share failed. Please try again.')
      }
    } finally {
      setIsShareBusy(false)
    }
  }, [evaluation, isShareBusy, buildShareImage, shareCaptureRef, daterName])

  const handleDownload = useCallback(async () => {
    if (!evaluation || !shareCaptureRef.current || isShareBusy) return
    setIsShareBusy(true)
    setShareStatus('')
    try {
      const shareImage = await buildShareImage()
      if (!shareImage) return
      const { blob, fileName } = shareImage
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = fileName
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
      setShareStatus('Downloaded!')
    } catch {
      setShareStatus('Download failed. Please try again.')
    } finally {
      setIsShareBusy(false)
    }
  }, [evaluation, isShareBusy, buildShareImage, shareCaptureRef])

  return (
    <div
      className={`drop-a-line-scene${!hasImage ? ' drop-a-line-scene-no-image' : ''}${
        isDimmed ? ' drop-a-line-scene-dimmed' : ''
      }`}
    >
      <div
        className="drop-a-line-scene-backdrop"
        style={{ backgroundImage: sceneImageUrl ? `url(${sceneImageUrl})` : undefined }}
      />
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
          {phase === 'stamp' && (
            <motion.div
              className={`drop-a-line-scene-stamp ${success ? 'drop-a-line-scene-stamp-success' : 'drop-a-line-scene-stamp-rejected'}`}
              initial={{ scale: 0.2, rotate: -10, opacity: 0 }}
              animate={{ scale: 1, rotate: -6, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 260, damping: 15 }}
            >
              {success ? `Got ${possessive} Number!` : 'REJECTED!'}
            </motion.div>
          )}
          {showReplay && (
            <motion.div
              className="drop-a-line-scene-replay-wrap"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              <div className="drop-a-line-scene-actions">
                <button
                  type="button"
                  className="drop-a-line-scene-replay"
                  onClick={onReplay ?? onBack}
                >
                  Replay
                </button>
                <button
                  type="button"
                  className="drop-a-line-scene-share"
                  onClick={handleShare}
                  disabled={isShareBusy}
                >
                  {isShareBusy ? 'Preparing...' : 'Share'}
                </button>
                <button
                  type="button"
                  className="drop-a-line-scene-download"
                  onClick={handleDownload}
                  disabled={isShareBusy}
                >
                  {isShareBusy ? 'Preparing...' : 'Download'}
                </button>
              </div>
              {shareStatus && <p className="drop-a-line-scene-share-status">{shareStatus}</p>}
            </motion.div>
          )}
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
              <p className="drop-a-line-scene-submitted-label">Your Line</p>
              <p className="drop-a-line-scene-submitted-line">"{pickupLine.trim()}"</p>
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
              <p className="drop-a-line-scene-submitted-label">Your Line</p>
              <p className="drop-a-line-scene-submitted-line">"{pickupLine.trim()}"</p>
              <p className="drop-a-line-scene-comeback-label">{daterName}:</p>
              <p className="drop-a-line-scene-comeback-bubble">{comebackText}</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="drop-a-line-share-capture-root" aria-hidden>
        <div ref={shareCaptureRef} className="drop-a-line-share-capture">
          <div
            className="drop-a-line-share-backdrop"
            style={{ backgroundImage: sceneImageUrl ? `url(${sceneImageUrl})` : undefined }}
          />
          <div className="drop-a-line-share-overlay" />
          <div className="drop-a-line-share-top">
            <p className="drop-a-line-share-line-title">Pickup Line</p>
            <p className="drop-a-line-share-line">"{pickupLine.trim()}"</p>
          </div>
          <div
            className={`drop-a-line-share-stamp ${
              success ? 'drop-a-line-share-stamp-success' : 'drop-a-line-share-stamp-rejected'
            }`}
          >
            {success ? `Got ${possessive} Number!` : 'REJECTED!'} {finalScore}%
          </div>
          <div className="drop-a-line-share-bottom">
            <p className="drop-a-line-share-response-label">{daterName}</p>
            <p className="drop-a-line-share-response">{comebackText}</p>
          </div>
        </div>
      </div>

    </div>
  )
}
