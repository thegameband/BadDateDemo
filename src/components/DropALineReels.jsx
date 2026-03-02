import { useState, useEffect, useMemo } from 'react'
import { motion } from 'framer-motion'
import { summarizeDatersForReel } from '../services/llmService'
import { DROP_A_LINE_LOCATIONS } from '../data/dropALineLocations'
import './DropALineReels.css'

const ROW_HEIGHT = 56
const SPIN_COPIES = 12
const SPIN_DURATION = 3

function ReelStrip({ options, finalIndex, onComplete }) {
  const stripItems = useMemo(() => {
    if (!options.length) return []
    const list = []
    for (let i = 0; i < SPIN_COPIES; i++) list.push(...options)
    return list
  }, [options])

  const finalY = useMemo(() => {
    if (!options.length) return 0
    const n = options.length
    const stopAt = (SPIN_COPIES - 1) * n + finalIndex
    return stopAt * ROW_HEIGHT
  }, [options.length, finalIndex])

  if (!options.length) return null

  return (
    <div className="drop-a-line-reel-window">
      <motion.div
        className="drop-a-line-reel-strip"
        initial={{ y: 0 }}
        animate={{ y: -finalY }}
        transition={{
          duration: SPIN_DURATION,
          ease: [0.2, 0.8, 0.2, 1],
        }}
        onAnimationComplete={onComplete}
      >
        {stripItems.map((text, i) => (
          <div key={i} className="drop-a-line-reel-row" style={{ height: ROW_HEIGHT }}>
            {text}
          </div>
        ))}
      </motion.div>
    </div>
  )
}

const MAX_REEL_CHARS = 50

function capReel(s) {
  const t = String(s || '').trim()
  return t.length > MAX_REEL_CHARS ? t.slice(0, MAX_REEL_CHARS) : t || '?'
}

export default function DropALineReels({ daters = [], onContinue }) {
  const [daterSummaries, setDaterSummaries] = useState([])
  const [loading, setLoading] = useState(true)
  const [spinning, setSpinning] = useState(true)
  const [finalDaterIndex, setFinalDaterIndex] = useState(0)
  const [finalLocationIndex, setFinalLocationIndex] = useState(0)
  const [showContinue, setShowContinue] = useState(false)
  const [reelsCompleteCount, setReelsCompleteCount] = useState(0)

  useEffect(() => {
    if (!Array.isArray(daters) || !daters.length) {
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    summarizeDatersForReel(daters)
      .then((summaries) => {
        if (!cancelled && summaries.length) setDaterSummaries(summaries.map(capReel))
      })
      .catch(() => {
        if (!cancelled) setDaterSummaries(daters.map((d) => capReel(d.archetype || d.description?.split('.')[0] || d.name)))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [daters])

  useEffect(() => {
    if (loading || daterSummaries.length === 0) return
    const n = daterSummaries.length
    const locN = DROP_A_LINE_LOCATIONS.length
    setFinalDaterIndex(Math.floor(Math.random() * n))
    setFinalLocationIndex(Math.floor(Math.random() * locN))
    setSpinning(true)
    setShowContinue(false)
    setReelsCompleteCount(0)
  }, [loading, daterSummaries.length])

  const handleReelComplete = () => {
    setReelsCompleteCount((c) => {
      const next = c + 1
      if (next >= 2) {
        setSpinning(false)
        setShowContinue(true)
      }
      return next
    })
  }

  const handleContinue = () => {
    const dater = daters[finalDaterIndex] ?? daters[0]
    const daterSummary = daterSummaries[finalDaterIndex] ?? ''
    const location = DROP_A_LINE_LOCATIONS[finalLocationIndex] ?? DROP_A_LINE_LOCATIONS[0]
    onContinue?.({ dater, daterSummary, location })
  }

  if (loading) {
    return (
      <div className="drop-a-line-reels drop-a-line-loading">
        <p>Loading characters…</p>
      </div>
    )
  }

  if (!daterSummaries.length) {
    return (
      <div className="drop-a-line-reels drop-a-line-loading">
        <p>No characters available.</p>
      </div>
    )
  }

  return (
    <div className="drop-a-line-reels">
      <div className="drop-a-line-reels-grid">
        <div className="drop-a-line-reel-column">
          <div className="drop-a-line-reel-title">Dater</div>
          <ReelStrip
            options={daterSummaries}
            finalIndex={finalDaterIndex}
            onComplete={handleReelComplete}
          />
        </div>
        <div className="drop-a-line-reel-column">
          <div className="drop-a-line-reel-title">Location</div>
          <ReelStrip
            options={DROP_A_LINE_LOCATIONS}
            finalIndex={finalLocationIndex}
            onComplete={handleReelComplete}
          />
        </div>
      </div>
      {showContinue && (
        <motion.button
          type="button"
          className="drop-a-line-continue-btn"
          onClick={handleContinue}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          Continue
        </motion.button>
      )}
    </div>
  )
}
