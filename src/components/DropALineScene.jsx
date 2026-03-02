import { useState, useEffect } from 'react'
import { generateSceneImage } from '../services/geminiImageService'
import './DropALineScene.css'

/**
 * Full-screen 9:16 portrait scene for writing a pickup line.
 * Props: payload { dater, daterSummary, location }, onBack()
 */
export default function DropALineScene({ payload, onBack }) {
  const [sceneImage, setSceneImage] = useState(null)
  const [loadingImage, setLoadingImage] = useState(true)
  const [sceneError, setSceneError] = useState(null)
  const [pickupLine, setPickupLine] = useState('')
  const [submitted, setSubmitted] = useState(false)

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

  const handleSubmit = (e) => {
    e.preventDefault()
    setSubmitted(true)
  }

  const hasImage = Boolean(sceneImage)
  return (
    <div className={`drop-a-line-scene${!hasImage && !loadingImage ? ' drop-a-line-scene-no-image' : ''}`}>
      <div
        className="drop-a-line-scene-backdrop"
        style={{
          backgroundImage: hasImage ? `url(${sceneImage})` : undefined,
        }}
      />
      {loadingImage && <div className="drop-a-line-scene-loading" />}
      {sceneError && !loadingImage && (
        <p className="drop-a-line-scene-debug" aria-live="polite">
          Scene art: {sceneError}
        </p>
      )}

      <div className="drop-a-line-scene-top">
        <button type="button" className="drop-a-line-scene-back" onClick={onBack} aria-label="Back">
          ← Back
        </button>
        <div className="drop-a-line-scene-title-wrap">
          <h2 className="drop-a-line-scene-title">Write your best pickup line.</h2>
        </div>
      </div>

      <div className="drop-a-line-scene-bottom">
        <div className="drop-a-line-scene-panel">
          {submitted ? (
            <p className="drop-a-line-scene-coming-soon">Coming soon…</p>
          ) : (
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
          )}
        </div>
      </div>
    </div>
  )
}
