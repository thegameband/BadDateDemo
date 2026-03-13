const MUSIC_VOL_KEY = 'bdMusicVolume'
const SFX_VOL_KEY = 'bdSfxVolume'
const TRACKS_KEY = 'bdMusicTracks'
const SFX_CUES_KEY = 'bdSfxCues'
const DB_NAME = 'bdAudioFiles'
const DB_VERSION = 1
const DB_STORE = 'tracks'

const MUSIC_MODES = ['lobby', 'badDate', 'rizzCraft', 'roses', 'speedDate', 'results']
const DEFAULT_TRACK_ASSIGNMENTS = {
  lobby: '/sounds/bd-lobby-music.mp3',
  badDate: null,
  rizzCraft: null,
  roses: null,
  speedDate: null,
  results: null,
}

const SFX_CUES = [
  { id: 'questionAppears', label: 'Question Appears (Hard Launch)', defaultTrackRef: '/sounds/question-appears.mp3' },
  { id: 'answerAppears', label: 'Answer Appears (Hard Launch)', defaultTrackRef: '/sounds/answer-appears.mp3' },
  { id: 'resultGood', label: 'Result - Good', defaultTrackRef: '/sounds/result-good.mp3', gainDb: -9 },
  { id: 'resultAverage', label: 'Result - Average', defaultTrackRef: '/sounds/result-average.mp3', gainDb: -9 },
  { id: 'resultBad', label: 'Result - Bad', defaultTrackRef: '/sounds/result-bad.mp3', gainDb: -9 },
  { id: 'compatibilityPositive', label: 'Compatibility - Positive', defaultTrackRef: '/sounds/compatibility-positive.mp3' },
  { id: 'compatibilityNegative', label: 'Compatibility - Negative', defaultTrackRef: '/sounds/compatibility-negative.mp3' },
  { id: 'ratingsPositive', label: 'Ratings - Positive', defaultTrackRef: '/sounds/ratings-positive.mp3' },
  { id: 'ratingsNegative', label: 'Ratings - Negative', defaultTrackRef: '/sounds/ratings-negative.mp3' },
  { id: 'buttonPress', label: 'Button Press', defaultTrackRef: '/sounds/answer-appears.mp3', gainDb: -3 },
]

const DEFAULT_SFX_CUE_ASSIGNMENTS = Object.fromEntries(
  SFX_CUES.map((cue) => [cue.id, cue.defaultTrackRef]),
)

const BUILT_IN_TRACKS = [
  { id: 'builtin:lobby', name: 'Lobby Loop', trackRef: '/sounds/bd-lobby-music.mp3', source: 'built-in' },
  { id: 'builtin:question', name: 'Question Appears', trackRef: '/sounds/question-appears.mp3', source: 'built-in' },
  { id: 'builtin:answer', name: 'Answer Appears', trackRef: '/sounds/answer-appears.mp3', source: 'built-in' },
  { id: 'builtin:result-good', name: 'Result Good', trackRef: '/sounds/result-good.mp3', source: 'built-in' },
  { id: 'builtin:result-average', name: 'Result Average', trackRef: '/sounds/result-average.mp3', source: 'built-in' },
  { id: 'builtin:result-bad', name: 'Result Bad', trackRef: '/sounds/result-bad.mp3', source: 'built-in' },
  { id: 'builtin:compatibility-positive', name: 'Compatibility Positive', trackRef: '/sounds/compatibility-positive.mp3', source: 'built-in' },
  { id: 'builtin:compatibility-negative', name: 'Compatibility Negative', trackRef: '/sounds/compatibility-negative.mp3', source: 'built-in' },
  { id: 'builtin:ratings-positive', name: 'Ratings Positive', trackRef: '/sounds/ratings-positive.mp3', source: 'built-in' },
  { id: 'builtin:ratings-negative', name: 'Ratings Negative', trackRef: '/sounds/ratings-negative.mp3', source: 'built-in' },
  { id: 'builtin:button-press', name: 'Button Press', trackRef: '/sounds/answer-appears.mp3', source: 'built-in' },
]

function clampVolume(value, fallback) {
  const parsed = Number.parseFloat(value)
  if (!Number.isFinite(parsed)) return fallback
  if (parsed < 0) return 0
  if (parsed > 1) return 1
  return parsed
}

function readStoredVolume(key, fallback) {
  if (typeof window === 'undefined') return fallback
  return clampVolume(window.localStorage.getItem(key), fallback)
}

function persistVolume(key, volume) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(key, String(volume))
}

function normalizeTrackRef(trackRef) {
  if (!trackRef) return null
  const normalized = String(trackRef).trim()
  return normalized || null
}

function sanitizeTrackAssignments(value) {
  const merged = { ...DEFAULT_TRACK_ASSIGNMENTS }
  if (!value || typeof value !== 'object') return merged
  MUSIC_MODES.forEach((mode) => {
    merged[mode] = normalizeTrackRef(value[mode])
  })
  return merged
}

function readStoredTrackAssignments() {
  if (typeof window === 'undefined') return { ...DEFAULT_TRACK_ASSIGNMENTS }
  try {
    const raw = window.localStorage.getItem(TRACKS_KEY)
    if (!raw) return { ...DEFAULT_TRACK_ASSIGNMENTS }
    return sanitizeTrackAssignments(JSON.parse(raw))
  } catch {
    return { ...DEFAULT_TRACK_ASSIGNMENTS }
  }
}

function persistTrackAssignments() {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(TRACKS_KEY, JSON.stringify(trackAssignments))
}

function sanitizeSfxCueAssignments(value) {
  const merged = { ...DEFAULT_SFX_CUE_ASSIGNMENTS }
  if (!value || typeof value !== 'object') return merged
  SFX_CUES.forEach((cue) => {
    merged[cue.id] = normalizeTrackRef(value[cue.id]) || cue.defaultTrackRef
  })
  return merged
}

function readStoredSfxCueAssignments() {
  if (typeof window === 'undefined') return { ...DEFAULT_SFX_CUE_ASSIGNMENTS }
  try {
    const raw = window.localStorage.getItem(SFX_CUES_KEY)
    if (!raw) return { ...DEFAULT_SFX_CUE_ASSIGNMENTS }
    return sanitizeSfxCueAssignments(JSON.parse(raw))
  } catch {
    return { ...DEFAULT_SFX_CUE_ASSIGNMENTS }
  }
}

function persistSfxCueAssignments() {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(SFX_CUES_KEY, JSON.stringify(sfxCueAssignments))
}

let musicVolume = readStoredVolume(MUSIC_VOL_KEY, 0.5)
let sfxVolume = readStoredVolume(SFX_VOL_KEY, 0.8)
let trackAssignments = readStoredTrackAssignments()
let sfxCueAssignments = readStoredSfxCueAssignments()

let musicAudio = null
let currentMusicMode = null
let lastResolvedTrackRef = null
let musicRequestId = 0
let listenersArmed = false
let dbPromise = null

const uploadedBlobUrlCache = new Map()

function ensureMusicAudio() {
  if (typeof Audio === 'undefined') return null
  if (!musicAudio) {
    musicAudio = new Audio()
    musicAudio.loop = true
    musicAudio.preload = 'auto'
    musicAudio.volume = musicVolume
    musicAudio.addEventListener('timeupdate', () => {
      const el = musicAudio
      if (el && el.duration > 0 && el.currentTime >= el.duration - 0.1) {
        el.currentTime = 0
      }
    })
  }
  return musicAudio
}

function attachResumeListeners(audioEl) {
  if (listenersArmed || typeof window === 'undefined') return
  listenersArmed = true
  const resumeOnInteraction = () => {
    listenersArmed = false
    audioEl.muted = false
    audioEl.volume = musicVolume
    void audioEl.play().catch(() => {})
  }
  const options = { once: true }
  window.addEventListener('pointerdown', resumeOnInteraction, options)
  window.addEventListener('keydown', resumeOnInteraction, options)
  window.addEventListener('touchstart', resumeOnInteraction, options)
}

async function tryPlayMusic(audioEl) {
  audioEl.volume = musicVolume
  audioEl.muted = false
  try {
    await audioEl.play()
    return true
  } catch {
    try {
      audioEl.muted = true
      await audioEl.play()
      audioEl.muted = false
      audioEl.volume = musicVolume
      return true
    } catch {
      attachResumeListeners(audioEl)
      return false
    }
  }
}

function openAudioDb() {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null)
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(DB_STORE)) {
        db.createObjectStore(DB_STORE, { keyPath: 'name' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Failed to open audio database'))
  }).catch((error) => {
    dbPromise = null
    throw error
  })
  return dbPromise
}

function runStoreOperation(mode, callback) {
  return openAudioDb().then((db) => {
    if (!db) return null
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(DB_STORE, mode)
      const store = transaction.objectStore(DB_STORE)
      callback(store, resolve, reject)
      transaction.onerror = () => reject(transaction.error ?? new Error('Audio DB transaction failed'))
    })
  })
}

export function getMusicVolume() {
  return musicVolume
}

export function setMusicVolume(value) {
  musicVolume = clampVolume(value, musicVolume)
  persistVolume(MUSIC_VOL_KEY, musicVolume)
  const audioEl = ensureMusicAudio()
  if (audioEl) audioEl.volume = musicVolume
}

export function getSfxVolume() {
  return sfxVolume
}

export function setSfxVolume(value) {
  sfxVolume = clampVolume(value, sfxVolume)
  persistVolume(SFX_VOL_KEY, sfxVolume)
}

export function linearToDb(value) {
  const linear = clampVolume(value, 0)
  if (linear <= 0) return Number.NEGATIVE_INFINITY
  return 20 * Math.log10(linear)
}

export function dbToLinear(db) {
  const numeric = Number.parseFloat(db)
  if (!Number.isFinite(numeric)) return 0
  return clampVolume(Math.pow(10, numeric / 20), 0)
}

export function formatDb(value) {
  const db = linearToDb(value)
  if (!Number.isFinite(db)) return '-inf dB'
  return `${db.toFixed(1)} dB`
}

export function getMusicMode() {
  return currentMusicMode
}

export function getTrackAssignments() {
  return { ...trackAssignments }
}

export function getTrackForMode(mode) {
  if (!mode) return null
  return trackAssignments[mode] ?? null
}

export function getBuiltInTracks() {
  return [...BUILT_IN_TRACKS]
}

export function getSfxCues() {
  return [...SFX_CUES]
}

export function getSfxCueAssignments() {
  return { ...sfxCueAssignments }
}

export function setSfxCueTrack(cueId, trackRef) {
  const cue = SFX_CUES.find((entry) => entry.id === cueId)
  if (!cue) return
  sfxCueAssignments = {
    ...sfxCueAssignments,
    [cueId]: normalizeTrackRef(trackRef) || cue.defaultTrackRef,
  }
  persistSfxCueAssignments()
}

export async function saveUploadedFile(name, arrayBuffer) {
  const safeName = String(name || '').trim()
  if (!safeName) throw new Error('File name is required')
  if (!arrayBuffer) throw new Error('File data is required')
  await runStoreOperation('readwrite', (store, resolve, reject) => {
    const blob = arrayBuffer instanceof Blob ? arrayBuffer : new Blob([arrayBuffer], { type: 'audio/mpeg' })
    const request = store.put({ name: safeName, blob, updatedAt: Date.now() })
    request.onsuccess = () => resolve({ name: safeName })
    request.onerror = () => reject(request.error ?? new Error('Failed to save audio file'))
  })
  if (uploadedBlobUrlCache.has(safeName)) {
    URL.revokeObjectURL(uploadedBlobUrlCache.get(safeName))
    uploadedBlobUrlCache.delete(safeName)
  }
}

export function getUploadedFiles() {
  return runStoreOperation('readonly', (store, resolve, reject) => {
    const request = store.getAll()
    request.onsuccess = () => {
      const rows = Array.isArray(request.result) ? request.result : []
      const files = rows
        .map((row) => ({
          id: `uploaded:${row.name}`,
          name: row.name,
          trackRef: `uploaded:${row.name}`,
          source: 'uploaded',
          updatedAt: Number(row.updatedAt) || 0,
        }))
        .sort((a, b) => b.updatedAt - a.updatedAt || a.name.localeCompare(b.name))
      resolve(files)
    }
    request.onerror = () => reject(request.error ?? new Error('Failed to list uploaded files'))
  }).then((files) => files || [])
}

export async function deleteUploadedFile(name) {
  const safeName = String(name || '').trim()
  if (!safeName) return
  await runStoreOperation('readwrite', (store, resolve, reject) => {
    const request = store.delete(safeName)
    request.onsuccess = () => resolve(true)
    request.onerror = () => reject(request.error ?? new Error('Failed to delete audio file'))
  })
  if (uploadedBlobUrlCache.has(safeName)) {
    URL.revokeObjectURL(uploadedBlobUrlCache.get(safeName))
    uploadedBlobUrlCache.delete(safeName)
  }
}

export function getUploadedFileBlobUrl(name) {
  const safeName = String(name || '').trim()
  if (!safeName) return Promise.resolve(null)
  if (uploadedBlobUrlCache.has(safeName)) {
    return Promise.resolve(uploadedBlobUrlCache.get(safeName))
  }
  return runStoreOperation('readonly', (store, resolve, reject) => {
    const request = store.get(safeName)
    request.onsuccess = () => {
      const row = request.result
      if (!row?.blob) {
        resolve(null)
        return
      }
      const blobUrl = URL.createObjectURL(row.blob)
      uploadedBlobUrlCache.set(safeName, blobUrl)
      resolve(blobUrl)
    }
    request.onerror = () => reject(request.error ?? new Error('Failed to read uploaded file'))
  }).then((blobUrl) => blobUrl || null)
}

export function setTrackForMode(mode, trackRef) {
  if (!MUSIC_MODES.includes(mode)) return
  trackAssignments = {
    ...trackAssignments,
    [mode]: normalizeTrackRef(trackRef),
  }
  persistTrackAssignments()
}

export async function resolveTrackSrc(trackRef) {
  const normalizedRef = normalizeTrackRef(trackRef)
  if (!normalizedRef) return null
  if (normalizedRef.startsWith('uploaded:')) {
    const name = normalizedRef.slice('uploaded:'.length)
    return getUploadedFileBlobUrl(name)
  }
  return normalizedRef
}

let fadeTimer = null

function cancelFade() {
  if (fadeTimer) {
    clearInterval(fadeTimer)
    fadeTimer = null
  }
}

function fadeOutMusic(durationMs = 1000) {
  const audioEl = ensureMusicAudio()
  if (!audioEl || audioEl.paused) return Promise.resolve()
  cancelFade()
  return new Promise((resolve) => {
    const startVol = audioEl.volume
    if (startVol <= 0) {
      audioEl.pause()
      audioEl.volume = musicVolume
      resolve()
      return
    }
    const steps = Math.max(1, Math.ceil(durationMs / 50))
    const decrement = startVol / steps
    let step = 0
    fadeTimer = setInterval(() => {
      step++
      if (step >= steps) {
        audioEl.volume = 0
        audioEl.pause()
        audioEl.volume = musicVolume
        cancelFade()
        resolve()
        return
      }
      audioEl.volume = Math.max(0, startVol - decrement * step)
    }, 50)
  })
}

export async function setMusicMode(mode) {
  const normalizedMode = MUSIC_MODES.includes(mode) ? mode : null
  currentMusicMode = normalizedMode
  musicRequestId += 1
  const requestId = musicRequestId

  const audioEl = ensureMusicAudio()
  if (!audioEl) return

  if (!normalizedMode) {
    await fadeOutMusic(1000)
    audioEl.currentTime = 0
    lastResolvedTrackRef = null
    return
  }

  const trackRef = getTrackForMode(normalizedMode)
  if (!trackRef) {
    await fadeOutMusic(1000)
    audioEl.currentTime = 0
    lastResolvedTrackRef = null
    return
  }

  const src = await resolveTrackSrc(trackRef)
  if (requestId !== musicRequestId) return
  if (!src) {
    await fadeOutMusic(1000)
    audioEl.currentTime = 0
    lastResolvedTrackRef = null
    return
  }

  cancelFade()
  if (lastResolvedTrackRef !== trackRef || audioEl.src !== src) {
    audioEl.volume = musicVolume
    audioEl.src = src
    audioEl.currentTime = 0
    lastResolvedTrackRef = trackRef
  }
  await tryPlayMusic(audioEl)
}

export function stopMusic() {
  cancelFade()
  const audioEl = ensureMusicAudio()
  if (!audioEl) return
  audioEl.pause()
  audioEl.currentTime = 0
  audioEl.volume = musicVolume
  currentMusicMode = null
  lastResolvedTrackRef = null
}

export function tryResumeMusic() {
  const audioEl = ensureMusicAudio()
  if (!audioEl || !audioEl.src || !audioEl.paused) return
  audioEl.volume = musicVolume
  audioEl.muted = false
  void audioEl.play().catch(() => {})
}

export function playSfx(src, volume) {
  if (typeof Audio === 'undefined' || !src || sfxVolume <= 0) return
  const audio = new Audio(src)
  audio.preload = 'auto'
  audio.volume = typeof volume === 'number' ? clampVolume(volume, sfxVolume) : sfxVolume
  void audio.play().catch(() => {})
}

export async function playSfxCue(cueId) {
  if (!cueId || sfxVolume <= 0) return
  const cue = SFX_CUES.find((entry) => entry.id === cueId)
  if (!cue) return
  const trackRef = sfxCueAssignments[cueId] || cue.defaultTrackRef
  const src = await resolveTrackSrc(trackRef)
  if (!src) return
  const effectiveVolume = sfxVolume * Math.pow(10, (cue.gainDb ?? 0) / 20)
  playSfx(src, effectiveVolume)
}
