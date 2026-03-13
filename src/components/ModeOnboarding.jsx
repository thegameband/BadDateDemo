import { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import './ModeOnboarding.css'

export default function ModeOnboarding({ slides = [], onComplete, onSkip }) {
  const [index, setIndex] = useState(0)
  const isLast = index === slides.length - 1
  const activeSlide = slides[index]

  const progressLabel = useMemo(() => {
    if (!slides.length) return ''
    return `${index + 1} / ${slides.length}`
  }, [index, slides.length])

  const advance = () => {
    if (isLast) {
      onComplete?.()
      return
    }
    setIndex((prev) => Math.min(prev + 1, slides.length - 1))
  }

  if (!slides.length) return null

  return (
    <div className="mode-onboarding-screen">
      <div className="mode-onboarding-header">
        <span className="mode-onboarding-progress">{progressLabel}</span>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={index}
          className="mode-onboarding-card"
          initial={{ opacity: 0, x: 26 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -26 }}
          transition={{ duration: 0.2 }}
        >
          <h2 className="mode-onboarding-title">{activeSlide.title}</h2>

          <button
            type="button"
            className="mode-onboarding-image-shell"
            onClick={advance}
            aria-label="Go to next onboarding step"
          >
            {activeSlide.image ? (
              <img
                src={activeSlide.image}
                alt={activeSlide.imageAlt || activeSlide.title}
                className="mode-onboarding-image"
              />
            ) : (
              <div className="mode-onboarding-image-placeholder" aria-hidden="true">
                <span>🖼️</span>
              </div>
            )}
          </button>

          <p className="mode-onboarding-text">{activeSlide.text}</p>
        </motion.div>
      </AnimatePresence>

      <div className="mode-onboarding-footer">
        <div className="mode-onboarding-dots" aria-hidden="true">
          {slides.map((_, dotIndex) => (
            <span
              key={dotIndex}
              className={`mode-onboarding-dot ${dotIndex === index ? 'is-active' : ''}`}
            />
          ))}
        </div>

        <button
          type="button"
          className="mode-onboarding-next-btn"
          onClick={advance}
        >
          {isLast ? "Let's Go!" : 'Next'}
        </button>

        {onSkip && (
          <button
            type="button"
            className="mode-onboarding-skip"
            onClick={onSkip}
          >
            Skip All
          </button>
        )}
      </div>
    </div>
  )
}
