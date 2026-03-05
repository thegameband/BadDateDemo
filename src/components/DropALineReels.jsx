import { useState, useEffect, useMemo } from 'react'
import { motion } from 'framer-motion'
import { DROP_A_LINE_LOCATIONS, DROP_A_LINE_PAIRINGS } from '../data/dropALineLocations'
import './DropALineReels.css'

const ROW_HEIGHT = 56
const SPIN_COPIES = 12
const SPIN_DURATION = 3
const SEEN_PAIRINGS_STORAGE_KEY = 'dropALineSeenPairings'

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

function pickNextPairing(playablePairings) {
  if (!Array.isArray(playablePairings) || !playablePairings.length) return null

  let storedSeen = []
  try {
    const parsed = JSON.parse(localStorage.getItem(SEEN_PAIRINGS_STORAGE_KEY) ?? '[]')
    if (Array.isArray(parsed)) storedSeen = parsed.filter((value) => typeof value === 'string')
  } catch {
    storedSeen = []
  }

  const availableKeys = new Set(playablePairings.map((pairing) => pairing.key))
  const seen = storedSeen.filter((key) => availableKeys.has(key))
  let unseen = playablePairings.filter((pairing) => !seen.includes(pairing.key))
  let nextSeen = seen

  if (!unseen.length) {
    unseen = [...playablePairings]
    nextSeen = []
  }

  const randomPick = unseen[Math.floor(Math.random() * unseen.length)]
  localStorage.setItem(SEEN_PAIRINGS_STORAGE_KEY, JSON.stringify([...nextSeen, randomPick.key]))
  return randomPick
}

export default function DropALineReels({ daters = [], onContinue }) {
  const daterNames = useMemo(() => (Array.isArray(daters) ? daters.map((d) => d?.name ?? '?') : []), [daters])
  const playablePairings = useMemo(() => {
    if (!Array.isArray(daters) || !daters.length) return []

    return DROP_A_LINE_PAIRINGS
      .map((pairing) => {
        const daterIndex = daters.findIndex((dater) => dater?.name === pairing.daterName)
        const locationIndex = DROP_A_LINE_LOCATIONS.indexOf(pairing.location)
        if (daterIndex < 0 || locationIndex < 0) return null
        return {
          ...pairing,
          key: `${pairing.daterName}::${pairing.location}`,
          daterIndex,
          locationIndex,
        }
      })
      .filter(Boolean)
  }, [daters])

  const [selectedPairing, setSelectedPairing] = useState(null)
  const [showContinue, setShowContinue] = useState(false)
  const [reelsCompleteCount, setReelsCompleteCount] = useState(0)

  useEffect(() => {
    if (!daterNames.length || !playablePairings.length) return
    setSelectedPairing(pickNextPairing(playablePairings))
    setShowContinue(false)
    setReelsCompleteCount(0)
  }, [daterNames.length, playablePairings])

  const handleReelComplete = () => {
    setReelsCompleteCount((c) => {
      const next = c + 1
      if (next >= 2) {
        setShowContinue(true)
      }
      return next
    })
  }

  const handleContinue = () => {
    const dater = daters[selectedPairing?.daterIndex ?? 0] ?? daters[0]
    const location = DROP_A_LINE_LOCATIONS[selectedPairing?.locationIndex ?? 0] ?? DROP_A_LINE_LOCATIONS[0]
    onContinue?.({ dater, location })
  }

  if (!daterNames.length || !selectedPairing) {
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
            options={daterNames}
            finalIndex={selectedPairing.daterIndex}
            onComplete={handleReelComplete}
          />
        </div>
        <div className="drop-a-line-reel-column">
          <div className="drop-a-line-reel-title">Location</div>
          <ReelStrip
            options={DROP_A_LINE_LOCATIONS}
            finalIndex={selectedPairing.locationIndex}
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
