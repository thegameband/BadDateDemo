import { useState, useEffect, useMemo } from 'react'
import { motion } from 'framer-motion'

/**
 * Emotion-to-speed mapping
 * Maps emotional states to word animation delays (in ms)
 * Lower = faster speech, Higher = slower speech
 */
const EMOTION_SPEEDS = {
  // Positive/energetic emotions - FAST
  excited: 30,
  happy: 35,
  flirty: 40,
  loves: 35,
  attracted: 40,
  
  // Neutral/normal emotions - MEDIUM
  neutral: 50,
  interested: 45,
  likes: 50,
  curious: 45,
  
  // Uncertain/processing emotions - SLOWER
  confused: 80,
  thinking: 70,
  uncertain: 75,
  uncomfortable: 65,
  dislikes: 60,
  
  // Negative/intense emotions - VERY SLOW (dramatic effect)
  scared: 100,
  horrified: 110,
  shocked: 90,
  dealbreakers: 95,
  angry: 55, // Angry is clipped and fast, actually
  
  // Default
  default: 50,
}

/**
 * Emotion-to-visual-effects mapping
 * Each emotion has: scale, color, animation variant
 */
const EMOTION_EFFECTS = {
  // === EXCITED / HAPPY / JOYFUL ===
  excited: {
    scale: 1.15,
    scaleX: 1.1, // Slight horizontal stretch
    color: '#FFD700', // Gold
    animation: 'bounce',
  },
  happy: {
    scale: 1.1,
    scaleX: 1.08,
    color: '#FFC107', // Warm yellow
    animation: 'bounce',
  },
  loves: {
    scale: 1.12,
    scaleX: 1.05,
    color: '#FF69B4', // Hot pink
    animation: 'pulse',
  },
  attracted: {
    scale: 1.08,
    color: '#FF6B9D', // Soft pink
    animation: 'pulse',
  },
  
  // === ANGRY / FURIOUS ===
  angry: {
    scale: 1.2,
    color: '#FF4444', // Bright red
    animation: 'shake',
  },
  furious: {
    scale: 1.25,
    color: '#CC0000', // Dark red
    animation: 'shake',
  },
  
  // === SCARED / HORRIFIED ===
  scared: {
    scale: 1.15,
    color: '#9966FF', // Purple (fear)
    animation: 'tremble',
  },
  horrified: {
    scale: 1.2,
    color: '#8B0000', // Dark red
    animation: 'tremble',
  },
  dealbreakers: {
    scale: 1.18,
    color: '#DC143C', // Crimson
    animation: 'tremble',
  },
  shocked: {
    scale: 1.25,
    color: '#FF6600', // Orange
    animation: 'pop',
  },
  
  // === NERVOUS / SAD / UNCERTAIN ===
  nervous: {
    scale: 0.92,
    color: '#88AACC', // Muted blue
    animation: 'wiggle',
  },
  sad: {
    scale: 0.88,
    color: '#6699AA', // Sad blue
    animation: 'droop',
  },
  uncomfortable: {
    scale: 0.94,
    color: '#AA9988', // Muted brown
    animation: 'wiggle',
  },
  uncertain: {
    scale: 0.95,
    animation: 'wiggle',
  },
  confused: {
    scale: 0.96,
    animation: 'tilt',
  },
  dislikes: {
    scale: 0.95,
    color: '#CC8866', // Muted orange
    animation: 'none',
  },
  
  // === NEUTRAL / CALM ===
  neutral: {
    scale: 1,
    animation: 'none',
  },
  curious: {
    scale: 1.02,
    animation: 'none',
  },
  interested: {
    scale: 1.03,
    animation: 'none',
  },
  likes: {
    scale: 1.04,
    color: '#66BB66', // Soft green
    animation: 'none',
  },
  flirty: {
    scale: 1.05,
    color: '#FF99AA', // Flirty pink
    animation: 'pulse',
  },
  confident: {
    scale: 1.06,
    animation: 'none',
  },
  
  // Default
  default: {
    scale: 1,
    animation: 'none',
  },
}

/**
 * Animation variants for different emotional expressions
 */
const getAnimationVariants = (animation, scale = 1, scaleX = 1, color = null) => {
  const baseInitial = { opacity: 0, y: 8, scale: 0.8 }
  const baseAnimate = { 
    opacity: 1, 
    y: 0, 
    scale, 
    scaleX,
    ...(color && { color })
  }
  
  switch (animation) {
    case 'bounce':
      return {
        initial: baseInitial,
        animate: {
          ...baseAnimate,
          y: [0, -4, 0],
          transition: {
            y: { duration: 0.3, times: [0, 0.5, 1] },
            default: { duration: 0.2 }
          }
        }
      }
    
    case 'shake':
      return {
        initial: baseInitial,
        animate: {
          ...baseAnimate,
          x: [0, -3, 3, -2, 2, 0],
          transition: {
            x: { duration: 0.4, times: [0, 0.2, 0.4, 0.6, 0.8, 1] },
            default: { duration: 0.15 }
          }
        }
      }
    
    case 'tremble':
      return {
        initial: baseInitial,
        animate: {
          ...baseAnimate,
          x: [0, -1, 1, -1, 1, -0.5, 0.5, 0],
          y: [0, -1, 0, 1, 0, -0.5, 0],
          transition: {
            x: { duration: 0.5, repeat: 1 },
            y: { duration: 0.4, repeat: 1 },
            default: { duration: 0.2 }
          }
        }
      }
    
    case 'wiggle':
      return {
        initial: baseInitial,
        animate: {
          ...baseAnimate,
          rotate: [0, -2, 2, -1, 1, 0],
          transition: {
            rotate: { duration: 0.4 },
            default: { duration: 0.2 }
          }
        }
      }
    
    case 'pulse':
      return {
        initial: baseInitial,
        animate: {
          ...baseAnimate,
          scale: [scale * 0.95, scale * 1.05, scale],
          transition: {
            scale: { duration: 0.3, times: [0, 0.5, 1] },
            default: { duration: 0.2 }
          }
        }
      }
    
    case 'pop':
      return {
        initial: { ...baseInitial, scale: 0.5 },
        animate: {
          ...baseAnimate,
          scale: [scale * 1.3, scale * 0.9, scale],
          transition: {
            scale: { duration: 0.35, times: [0, 0.6, 1] },
            default: { duration: 0.15 }
          }
        }
      }
    
    case 'droop':
      return {
        initial: baseInitial,
        animate: {
          ...baseAnimate,
          y: [0, 2, 1],
          rotate: [0, 1, 0],
          transition: {
            y: { duration: 0.4 },
            rotate: { duration: 0.4 },
            default: { duration: 0.25 }
          }
        }
      }
    
    case 'tilt':
      return {
        initial: baseInitial,
        animate: {
          ...baseAnimate,
          rotate: [0, 3, -2, 0],
          transition: {
            rotate: { duration: 0.5 },
            default: { duration: 0.2 }
          }
        }
      }
    
    case 'none':
    default:
      return {
        initial: baseInitial,
        animate: {
          ...baseAnimate,
          transition: { duration: 0.15 }
        }
      }
  }
}

/**
 * AnimatedText - Animates text in word by word
 * Speed and visual effects adjust based on emotional state
 * 
 * @param {string} text - The text to animate
 * @param {string} emotion - Emotional state that affects speed and effects
 * @param {number} wordDelay - Override delay between words (optional)
 * @param {function} onComplete - Callback when animation completes
 */
export default function AnimatedText({ text, emotion = 'neutral', wordDelay, onComplete }) {
  const [visibleWords, setVisibleWords] = useState([])
  const [isComplete, setIsComplete] = useState(false)
  
  // Get emotion effects
  const effects = useMemo(() => {
    return EMOTION_EFFECTS[emotion] || EMOTION_EFFECTS.default
  }, [emotion])
  
  // Calculate delay based on emotion (or use override)
  const calculatedDelay = useMemo(() => {
    if (wordDelay !== undefined) return wordDelay
    return EMOTION_SPEEDS[emotion] || EMOTION_SPEEDS.default
  }, [emotion, wordDelay])
  
  // Get animation variants for this emotion
  const variants = useMemo(() => {
    return getAnimationVariants(
      effects.animation,
      effects.scale || 1,
      effects.scaleX || 1,
      effects.color || null
    )
  }, [effects])
  
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
    }, calculatedDelay)
    
    return () => clearInterval(interval)
  }, [text, calculatedDelay]) // Re-run when text or delay changes
  
  if (!text) return null
  
  return (
    <span className="animated-text" style={{ display: 'inline' }}>
      {visibleWords.map((word, index) => (
        <motion.span
          key={`${word}-${index}`}
          initial={variants.initial}
          animate={variants.animate}
          style={{ 
            display: 'inline-block',
            marginRight: '0.25em',
            transformOrigin: 'center bottom',
          }}
        >
          {word}
        </motion.span>
      ))}
      {/* Invisible placeholder to maintain bubble size */}
      <span style={{ visibility: 'hidden', position: 'absolute' }}>
        {text}
      </span>
    </span>
  )
}

// Export for use in other components
export { EMOTION_SPEEDS, EMOTION_EFFECTS }
