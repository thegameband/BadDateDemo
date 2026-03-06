import { useEffect } from 'react'
import { motion } from 'framer-motion'
import './DropALineDied.css'

function playFallbackThud() {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)()
    const osc = audioCtx.createOscillator()
    const gain = audioCtx.createGain()

    osc.type = 'triangle'
    osc.frequency.setValueAtTime(120, audioCtx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(45, audioCtx.currentTime + 0.18)
    gain.gain.setValueAtTime(0.0001, audioCtx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.22, audioCtx.currentTime + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.22)

    osc.connect(gain)
    gain.connect(audioCtx.destination)
    osc.start()
    osc.stop(audioCtx.currentTime + 0.23)

    setTimeout(() => {
      audioCtx.close().catch(() => {})
    }, 400)
  } catch {
    // Ignore audio fallback errors.
  }
}

function tryPlayFallSplat() {
  const audio = new Audio('/sounds/fall-splat.mp3')
  audio.preload = 'auto'
  audio.volume = 0.9
  return audio.play().catch(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      const voiceLine = new SpeechSynthesisUtterance('Nooooooooo!')
      voiceLine.rate = 1.15
      voiceLine.pitch = 0.8
      window.speechSynthesis.cancel()
      window.speechSynthesis.speak(voiceLine)
    }
    setTimeout(playFallbackThud, 500)
  })
}

export default function DropALineDied({ onTryAgain }) {
  useEffect(() => {
    tryPlayFallSplat()
  }, [])

  return (
    <div className="drop-a-line-died">
      <motion.div
        className="drop-a-line-died-text"
        initial={{ opacity: 0, scale: 0.75, y: -10 }}
        animate={{ opacity: [0, 1, 0.9, 1], scale: [0.75, 1.08, 0.98, 1], y: [0, 4, -2, 0] }}
        transition={{ duration: 0.9, times: [0, 0.35, 0.7, 1] }}
      >
        You Died.
      </motion.div>
      <motion.p
        className="drop-a-line-died-subtext"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.45, duration: 0.3 }}
      >
        Gravity remains undefeated.
      </motion.p>
      <motion.button
        type="button"
        className="drop-a-line-died-try-again"
        onClick={onTryAgain}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6, duration: 0.25 }}
      >
        Try Again
      </motion.button>
    </div>
  )
}
