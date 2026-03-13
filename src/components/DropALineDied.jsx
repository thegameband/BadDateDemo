import { motion } from 'framer-motion'
import './DropALineDied.css'

export default function DropALineDied({ onTryAgain }) {
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
