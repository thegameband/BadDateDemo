import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

/**
 * AnimatedText - Animates text in word by word
 * 
 * @param {string} text - The text to animate
 * @param {number} wordDelay - Delay between each word in ms (default: 60)
 * @param {function} onComplete - Callback when animation completes
 */
export default function AnimatedText({ text, wordDelay = 60, onComplete }) {
  const [visibleWords, setVisibleWords] = useState([])
  const [isComplete, setIsComplete] = useState(false)
  
  // Split text into words, preserving punctuation
  const words = text ? text.split(/(\s+)/).filter(word => word.trim() !== '') : []
  
  useEffect(() => {
    // Reset when text changes
    setVisibleWords([])
    setIsComplete(false)
    
    if (!text || words.length === 0) return
    
    let currentIndex = 0
    
    const interval = setInterval(() => {
      if (currentIndex < words.length) {
        setVisibleWords(prev => [...prev, words[currentIndex]])
        currentIndex++
      } else {
        clearInterval(interval)
        setIsComplete(true)
        if (onComplete) onComplete()
      }
    }, wordDelay)
    
    return () => clearInterval(interval)
  }, [text]) // Only re-run when text changes
  
  if (!text) return null
  
  return (
    <span className="animated-text">
      {visibleWords.map((word, index) => (
        <motion.span
          key={`${word}-${index}`}
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.15 }}
          style={{ display: 'inline' }}
        >
          {word}{' '}
        </motion.span>
      ))}
      {/* Invisible placeholder to maintain bubble size */}
      <span style={{ visibility: 'hidden', position: 'absolute' }}>
        {text}
      </span>
    </span>
  )
}
