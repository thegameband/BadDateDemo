import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  deleteUploadedFile,
  formatDb,
  getBuiltInTracks,
  getSfxCueAssignments,
  getSfxCues,
  getTrackAssignments,
  getUploadedFiles,
  resolveTrackSrc,
  saveUploadedFile,
  setMusicMode,
  setSfxCueTrack,
  setTrackForMode,
} from '../services/audioService'
import './AudioManager.css'

const MODE_OPTIONS = [
  { id: 'lobby', label: 'Main Menu / Lobby' },
  { id: 'badDate', label: 'Bad Date' },
  { id: 'rizzCraft', label: 'Rizz-craft' },
  { id: 'roses', label: 'Roses' },
  { id: 'speedDate', label: 'Speed Date' },
  { id: 'results', label: 'Results' },
]

function sortTracks(tracks = []) {
  return [...tracks].sort((a, b) => a.name.localeCompare(b.name))
}

export default function AudioManager({
  isOpen,
  onClose,
  currentMode,
  musicVol,
  sfxVol,
  voiceVol,
  onMusicVolumeChange,
  onSfxVolumeChange,
  onVoiceVolumeChange,
}) {
  const [assignments, setAssignments] = useState(() => getTrackAssignments())
  const [sfxCueAssignments, setSfxCueAssignments] = useState(() => getSfxCueAssignments())
  const [uploadedTracks, setUploadedTracks] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [status, setStatus] = useState('')
  const [previewTrackRef, setPreviewTrackRef] = useState(null)
  const fileInputRef = useRef(null)
  const previewAudioRef = useRef(null)

  const builtInTracks = useMemo(() => sortTracks(getBuiltInTracks()), [])
  const sfxCues = useMemo(() => getSfxCues(), [])
  const allTracks = useMemo(() => [...builtInTracks, ...uploadedTracks], [builtInTracks, uploadedTracks])

  const refreshTracks = async () => {
    const uploaded = await getUploadedFiles()
    setUploadedTracks(sortTracks(uploaded))
    setAssignments(getTrackAssignments())
    setSfxCueAssignments(getSfxCueAssignments())
  }

  useEffect(() => {
    if (!isOpen) return
    setStatus('')
    void refreshTracks()
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return undefined
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, onClose])

  useEffect(() => {
    if (!previewAudioRef.current) return
    previewAudioRef.current.volume = musicVol
  }, [musicVol])

  useEffect(() => {
    return () => {
      if (previewAudioRef.current) {
        previewAudioRef.current.pause()
        previewAudioRef.current = null
      }
    }
  }, [])

  if (!isOpen) return null
  if (typeof document === 'undefined') return null

  const assignedCount = MODE_OPTIONS.filter((mode) => assignments[mode.id]).length
  const assignedSfxCount = sfxCues.filter((cue) => sfxCueAssignments[cue.id]).length

  const handleAssignmentChange = async (modeId, trackRef) => {
    const nextTrackRef = trackRef || null
    setTrackForMode(modeId, nextTrackRef)
    setAssignments(getTrackAssignments())
    if (currentMode === modeId) {
      await setMusicMode(modeId)
    }
  }

  const handleSfxCueChange = (cueId, trackRef) => {
    setSfxCueTrack(cueId, trackRef)
    setSfxCueAssignments(getSfxCueAssignments())
  }

  const stopPreview = () => {
    if (!previewAudioRef.current) return
    previewAudioRef.current.pause()
    previewAudioRef.current = null
    setPreviewTrackRef(null)
  }

  const togglePreview = async (trackRef) => {
    if (!trackRef) return
    if (previewTrackRef === trackRef) {
      stopPreview()
      return
    }
    stopPreview()
    const src = await resolveTrackSrc(trackRef)
    if (!src) {
      setStatus('Could not preview track source.')
      return
    }
    const audio = new Audio(src)
    audio.preload = 'auto'
    audio.volume = musicVol
    audio.onended = () => {
      previewAudioRef.current = null
      setPreviewTrackRef(null)
    }
    previewAudioRef.current = audio
    setPreviewTrackRef(trackRef)
    void audio.play().catch(() => {
      setStatus('Preview playback was blocked by the browser.')
      previewAudioRef.current = null
      setPreviewTrackRef(null)
    })
  }

  const processFiles = async (fileList) => {
    const files = Array.from(fileList || []).filter((file) => file.name.toLowerCase().endsWith('.mp3'))
    if (!files.length) {
      setStatus('No .mp3 files detected.')
      return
    }
    setIsLoading(true)
    setStatus(`Uploading ${files.length} file${files.length > 1 ? 's' : ''}...`)
    try {
      for (const file of files) {
        const buffer = await file.arrayBuffer()
        await saveUploadedFile(file.name, buffer)
      }
      await refreshTracks()
      setStatus(`Added ${files.length} track${files.length > 1 ? 's' : ''}.`)
    } catch {
      setStatus('Upload failed. Please try again.')
    } finally {
      setIsLoading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const onFileInputChange = (event) => {
    void processFiles(event.target.files)
  }

  const onDrop = (event) => {
    event.preventDefault()
    if (isLoading) return
    void processFiles(event.dataTransfer.files)
  }

  const onDragOver = (event) => {
    event.preventDefault()
  }

  const handleDeleteUploaded = async (name) => {
    await deleteUploadedFile(name)
    const deletedTrackRef = `uploaded:${name}`
    const nextAssignments = getTrackAssignments()
    MODE_OPTIONS.forEach((mode) => {
      if (nextAssignments[mode.id] === deletedTrackRef) {
        setTrackForMode(mode.id, null)
      }
    })
    await refreshTracks()
    if (previewTrackRef === deletedTrackRef) {
      stopPreview()
    }
    if (currentMode && getTrackAssignments()[currentMode] == null) {
      await setMusicMode(currentMode)
    }
    setStatus(`Deleted ${name}.`)
  }

  return createPortal(
    <div className="audio-manager-overlay" onClick={onClose}>
      <div className="audio-manager-panel" onClick={(event) => event.stopPropagation()}>
        <div className="audio-manager-header sticky">
          <div className="audio-manager-header-main">
            <div>
              <h3>Audio Manager</h3>
              <p>Per-mode music routing, dB tuning, and local MP3 uploads.</p>
            </div>
            <div className="audio-manager-header-meta">
              <span className="audio-manager-chip">Current: {currentMode || 'none'}</span>
              <span className="audio-manager-chip">{assignedCount}/{MODE_OPTIONS.length} modes assigned</span>
              <span className="audio-manager-chip">{assignedSfxCount}/{sfxCues.length} SFX cues assigned</span>
              <span className="audio-manager-chip">{allTracks.length} tracks</span>
              {previewTrackRef && (
                <button type="button" className="audio-manager-chip-btn" onClick={stopPreview}>Stop Preview</button>
              )}
            </div>
          </div>
          <button type="button" className="audio-manager-close" onClick={onClose} aria-label="Close audio manager">Close</button>
        </div>

        <div className="audio-manager-content">
          <section className="audio-manager-section">
            <h4>Mode Track Assignment</h4>
            <div className="audio-mode-grid">
              {MODE_OPTIONS.map((mode) => {
                const selectedTrackRef = assignments[mode.id] || ''
                return (
                  <label key={mode.id} className={`audio-mode-row ${currentMode === mode.id ? 'active' : ''}`}>
                    <span>{mode.label}</span>
                    <select
                      value={selectedTrackRef}
                      onChange={(event) => {
                        void handleAssignmentChange(mode.id, event.target.value)
                      }}
                    >
                      <option value="">None</option>
                      <optgroup label="Built-in">
                        {builtInTracks.map((track) => (
                          <option key={track.id} value={track.trackRef}>{track.name}</option>
                        ))}
                      </optgroup>
                      <optgroup label="Uploaded">
                        {uploadedTracks.map((track) => (
                          <option key={track.id} value={track.trackRef}>{track.name}</option>
                        ))}
                      </optgroup>
                    </select>
                    <button
                      type="button"
                      className="audio-preview-btn"
                      disabled={!selectedTrackRef}
                      onClick={() => { void togglePreview(selectedTrackRef) }}
                    >
                      {previewTrackRef === selectedTrackRef ? 'Stop' : 'Preview'}
                    </button>
                  </label>
                )
              })}
            </div>
          </section>

          <section className="audio-manager-section">
            <h4>Volume (Relative dB)</h4>
            <div className="audio-volume-grid">
              <label>
                <span>Music</span>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={musicVol}
                  onChange={(event) => onMusicVolumeChange(Number.parseFloat(event.target.value))}
                />
                <strong>{formatDb(musicVol)}</strong>
              </label>
              <label>
                <span>SFX</span>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={sfxVol}
                  onChange={(event) => onSfxVolumeChange(Number.parseFloat(event.target.value))}
                />
                <strong>{formatDb(sfxVol)}</strong>
              </label>
              <label>
                <span>Voice</span>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={voiceVol}
                  onChange={(event) => onVoiceVolumeChange(Number.parseFloat(event.target.value))}
                />
                <strong>{formatDb(voiceVol)}</strong>
              </label>
            </div>
          </section>

          <section className="audio-manager-section">
            <h4>SFX Cue Assignment</h4>
            <div className="audio-mode-grid">
              {sfxCues.map((cue) => {
                const selectedTrackRef = sfxCueAssignments[cue.id] || cue.defaultTrackRef
                return (
                  <label key={cue.id} className="audio-mode-row">
                    <span>{cue.label}</span>
                    <select
                      value={selectedTrackRef}
                      onChange={(event) => {
                        handleSfxCueChange(cue.id, event.target.value)
                      }}
                    >
                      <option value={cue.defaultTrackRef}>Default</option>
                      <optgroup label="Built-in">
                        {builtInTracks.map((track) => (
                          <option key={track.id} value={track.trackRef}>{track.name}</option>
                        ))}
                      </optgroup>
                      <optgroup label="Uploaded">
                        {uploadedTracks.map((track) => (
                          <option key={track.id} value={track.trackRef}>{track.name}</option>
                        ))}
                      </optgroup>
                    </select>
                    <button
                      type="button"
                      className="audio-preview-btn"
                      disabled={!selectedTrackRef}
                      onClick={() => { void togglePreview(selectedTrackRef) }}
                    >
                      {previewTrackRef === selectedTrackRef ? 'Stop' : 'Preview'}
                    </button>
                  </label>
                )
              })}
            </div>
          </section>

          <section className="audio-manager-section">
            <h4>Upload MP3</h4>
            <div className="audio-upload-dropzone" onDrop={onDrop} onDragOver={onDragOver}>
              <p>Drop .mp3 files here, or choose files manually.</p>
              <button type="button" onClick={() => fileInputRef.current?.click()} disabled={isLoading}>
                {isLoading ? 'Uploading...' : 'Choose MP3 Files'}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".mp3,audio/mpeg"
                multiple
                onChange={onFileInputChange}
                hidden
              />
            </div>
            {status && <p className="audio-upload-status" aria-live="polite">{status}</p>}
          </section>

          <section className="audio-manager-section">
            <h4>Track Library</h4>
            <div className="audio-library">
              {allTracks.length === 0 && <p className="audio-empty">No tracks available.</p>}
              {allTracks.map((track) => (
                <div key={track.id} className="audio-library-row">
                  <div className="audio-library-meta">
                    <strong>{track.name}</strong>
                    <span>{track.source}</span>
                  </div>
                  <div className="audio-library-actions">
                    <button type="button" onClick={() => { void togglePreview(track.trackRef) }}>
                      {previewTrackRef === track.trackRef ? 'Stop' : 'Play'}
                    </button>
                    {track.source === 'uploaded' && (
                      <button type="button" className="danger" onClick={() => { void handleDeleteUploaded(track.name) }}>
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>,
    document.body
  )
}
