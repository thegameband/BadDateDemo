/**
 * ElevenLabs Text-to-Speech Service
 * 
 * Provides voice synthesis for the Dater and Avatar characters
 */

import { fetchRuntimeCapabilities } from './runtimeCapabilities'

// Voice IDs from ElevenLabs
// You can change these to any voice from your ElevenLabs account
const NARRATOR_VOICE_ID = import.meta.env.VITE_ELEVENLABS_NARRATOR_VOICE_ID

const VOICES = {
  // Dater - default is Bella (female); overridden per-dater via setVoice()
  dater: 'EXAVITQu4vr4xnSDxMaL', // Bella - young, expressive, emotional
  
  // Avatar - young, energetic male voice
  avatar: 'TX3LPaxmHKxFdv7VOQHJ', // Liam - "young adult with energy and warmth"
  
  // Narrator - sultry, seductive female voice for narration and plot twist summaries
  // Set VITE_ELEVENLABS_NARRATOR_VOICE_ID in .env to override
  narrator: NARRATOR_VOICE_ID || 'XB0fDUnXU5powFXDhCwa', // Charlotte - seductive, English-Swedish, video-game optimized
}

// Track whether the current dater uses a male voice (for browser TTS fallback)
let daterVoiceIsMale = false

// Audio queue to prevent overlapping speech
let audioQueue = []
let isPlaying = false
let currentAudio = null

// TTS enabled state
let ttsEnabled = true // Enabled by default

// Callbacks for audio events
let onAudioStartCallbacks = []
let onAudioEndCallbacks = []
let onTTSStatusCallbacks = []

// Track pending audio completion promises (reserved for future use)
let _currentAudioEndResolve = null
let _serverElevenLabsAvailable = null
let sharedAudioElement = null
let currentObjectUrl = null
let mediaPlaybackPrimed = false

const SILENT_WAV_DATA_URI =
  'data:audio/wav;base64,UklGRjoAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YRYAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='
const PLAY_START_TIMEOUT_MS = 1600
const VOICE_VOL_KEY = 'bdVoiceVolume'

function clampVolume(value, fallback = 1) {
  const parsed = Number.parseFloat(value)
  if (!Number.isFinite(parsed)) return fallback
  if (parsed < 0) return 0
  if (parsed > 1) return 1
  return parsed
}

let voiceVolume = 1
if (typeof window !== 'undefined') {
  voiceVolume = clampVolume(window.localStorage.getItem(VOICE_VOL_KEY), 1)
}

if (typeof window !== 'undefined') {
  fetchRuntimeCapabilities().catch(() => {})
}

function getSharedAudioElement() {
  if (typeof Audio === 'undefined') return null
  if (!sharedAudioElement) {
    sharedAudioElement = new Audio()
    sharedAudioElement.preload = 'auto'
    sharedAudioElement.playsInline = true
    sharedAudioElement.setAttribute?.('playsinline', '')
  }
  return sharedAudioElement
}

function clearCurrentObjectUrl() {
  if (!currentObjectUrl) return
  URL.revokeObjectURL(currentObjectUrl)
  currentObjectUrl = null
}

function isMobileBrowser() {
  if (typeof navigator === 'undefined') return false
  return /iPhone|iPad|iPod|Android/i.test(String(navigator.userAgent || ''))
}

function getDaterPlaybackRate() {
  return isMobileBrowser() ? 1.0 : 1.25
}

function sanitizeSpeechText(text) {
  if (!text || text.trim().length === 0) return ''

  let cleanText = text
    .replace(/\*[^*]+\*/g, '')
    .replace(/\([^)]+\)/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

  const lastEnd = Math.max(cleanText.lastIndexOf('.'), cleanText.lastIndexOf('!'), cleanText.lastIndexOf('?'))
  if (lastEnd !== -1 && lastEnd < cleanText.length - 1) {
    const after = cleanText.slice(lastEnd + 1).trim()
    if (after.length > 0 && (after.length > 60 || /^[a-z]/.test(after) || /^[^a-zA-Z]/.test(after))) {
      cleanText = cleanText.slice(0, lastEnd + 1).trim()
    }
  }

  return cleanText
}

async function fetchElevenLabsAudioUrl(text, voiceId, speaker) {
  const response = await fetch('/api/tts/synthesize', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text,
      speaker,
      voiceId,
    }),
  })

  if (!response.ok) {
    if (response.status === 503 && response.headers.get('x-tts-error-code') === 'missing_api_key') {
      _serverElevenLabsAvailable = false
    }
    const errorText = await response.text()
    throw new Error(`ElevenLabs API error (${response.status}): ${errorText}`)
  }

  _serverElevenLabsAvailable = true
  const audioBlob = await response.blob()
  return URL.createObjectURL(audioBlob)
}

async function canUseServerElevenLabs() {
  if (typeof _serverElevenLabsAvailable === 'boolean') {
    return _serverElevenLabsAvailable
  }

  try {
    const capabilities = await fetchRuntimeCapabilities()
    _serverElevenLabsAvailable = Boolean(capabilities?.elevenlabs)
  } catch {
    _serverElevenLabsAvailable = false
  }

  return _serverElevenLabsAvailable
}

/**
 * Register a callback for when audio starts playing
 * @param {function} callback - Called with (text, speaker) when audio starts
 */
export function onAudioStart(callback) {
  onAudioStartCallbacks.push(callback)
  return () => {
    onAudioStartCallbacks = onAudioStartCallbacks.filter(cb => cb !== callback)
  }
}

/**
 * Register a callback for when audio finishes playing
 * @param {function} callback - Called with (text, speaker) when audio ends
 */
export function onAudioEnd(callback) {
  onAudioEndCallbacks.push(callback)
  return () => {
    onAudioEndCallbacks = onAudioEndCallbacks.filter(cb => cb !== callback)
  }
}

/**
 * Register a callback for TTS provider status updates
 * @param {function} callback - Called with {code, message, level}
 */
export function onTTSStatus(callback) {
  onTTSStatusCallbacks.push(callback)
  return () => {
    onTTSStatusCallbacks = onTTSStatusCallbacks.filter(cb => cb !== callback)
  }
}

/**
 * Notify all listeners that audio has started
 */
function notifyAudioStart(text, speaker) {
  onAudioStartCallbacks.forEach(cb => {
    try {
      cb(text, speaker)
    } catch (e) {
      console.error('Error in audio start callback:', e)
    }
  })
}

/**
 * Notify all listeners that audio has ended
 */
function notifyAudioEnd(text, speaker) {
  onAudioEndCallbacks.forEach(cb => {
    try {
      cb(text, speaker)
    } catch (e) {
      console.error('Error in audio end callback:', e)
    }
  })
}

function notifyTTSStatus(status) {
  onTTSStatusCallbacks.forEach(cb => {
    try {
      cb(status)
    } catch (e) {
      console.error('Error in TTS status callback:', e)
    }
  })
}

/**
 * Enable or disable TTS
 */
export function setTTSEnabled(enabled) {
  ttsEnabled = enabled
  if (!enabled) {
    stopAllAudio()
  }
}

/**
 * Check if TTS is enabled
 */
export function isTTSEnabled() {
  return ttsEnabled
}

export function getVoiceVolume() {
  return voiceVolume
}

export function setVoiceVolume(value) {
  voiceVolume = clampVolume(value, voiceVolume)
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(VOICE_VOL_KEY, String(voiceVolume))
  }
  if (currentAudio) {
    currentAudio.volume = voiceVolume
  }
}

/**
 * Stop all audio and clear the queue
 */
export function stopAllAudio() {
  if (currentAudio) {
    currentAudio.pause()
    currentAudio.removeAttribute?.('src')
    currentAudio.load?.()
    currentAudio = null
  }
  clearCurrentObjectUrl()
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    window.speechSynthesis.cancel()
  }
  audioQueue = []
  isPlaying = false
}

export async function primeTTSPlayback() {
  const audio = getSharedAudioElement()
  if (!audio || mediaPlaybackPrimed || isPlaying) return mediaPlaybackPrimed

  const previousMuted = audio.muted
  const previousSrc = audio.currentSrc || audio.src || ''

  try {
    audio.src = SILENT_WAV_DATA_URI
    audio.muted = true
    audio.currentTime = 0
    await audio.play()
    audio.pause()
    audio.currentTime = 0
    mediaPlaybackPrimed = true
    return true
  } catch (error) {
    console.warn('TTS playback priming failed:', error)
    return false
  } finally {
    audio.muted = previousMuted
    if (previousSrc && previousSrc !== SILENT_WAV_DATA_URI) {
      audio.src = previousSrc
    } else {
      audio.removeAttribute('src')
      audio.load()
    }
  }
}

/**
 * Convert text to speech using ElevenLabs API
 * Returns a promise that resolves when audio STARTS playing (not when it ends)
 * @param {string} text - The text to speak
 * @param {'dater' | 'avatar' | 'narrator'} speaker - Which character is speaking
 * @param {object} options - Optional settings
 * @param {boolean} options.waitForEnd - If true, promise resolves when audio ENDS instead of starts
 * @returns {Promise<{started: boolean, immediate: boolean, duration?: number}>}
 */
export async function speak(text, speaker = 'avatar', options = {}) {
  const { waitForEnd = false } = options
  
  if (!ttsEnabled) {
    console.log('🔇 TTS disabled, skipping speech')
    return { started: false, immediate: true }
  }
  
  if (!text || text.trim().length === 0) {
    return { started: false, immediate: true }
  }

  const cleanText = sanitizeSpeechText(text)

  if (cleanText.length === 0) {
    return { started: false, immediate: true }
  }
  
  const voiceId = VOICES[speaker] || VOICES.avatar
  const useServerTTS = await canUseServerElevenLabs()
  
  // Create a promise that resolves when audio starts OR ends (based on option)
  return new Promise((resolve) => {
    // Add to queue with callbacks
    audioQueue.push({ 
      text: cleanText, 
      voiceId, 
      speaker,
      useBrowserTTS: !useServerTTS,
      preloadedAudioUrl: null,
      onStart: waitForEnd ? null : () => resolve({ started: true, immediate: false }),
      onEnd: waitForEnd ? (duration) => resolve({ started: true, immediate: false, duration }) : null
    })
    
    // Process queue if not already playing
    if (!isPlaying) {
      processQueue()
    }
  })
}

/**
 * Preload ElevenLabs audio so playback can begin immediately later.
 * Returns null if preload is unavailable (e.g., browser fallback mode).
 * @param {string} text
 * @param {'dater' | 'avatar' | 'narrator'} speaker
 * @returns {Promise<{text: string, speaker: string, voiceId: string, audioUrl: string} | null>}
 */
export async function preloadSpeech(text, speaker = 'avatar') {
  if (!ttsEnabled) return null
  if (!(await canUseServerElevenLabs())) return null

  const cleanText = sanitizeSpeechText(text)
  if (!cleanText) return null

  const voiceId = VOICES[speaker] || VOICES.avatar
  try {
    const audioUrl = await fetchElevenLabsAudioUrl(cleanText, voiceId, speaker)
    return { text: cleanText, speaker, voiceId, audioUrl }
  } catch (error) {
    console.error('❌ TTS preload error:', error)
    return null
  }
}

/**
 * Queue a preloaded speech clip for playback.
 * @param {{text: string, speaker: string, voiceId: string, audioUrl: string}} preloaded
 * @param {object} options
 * @param {boolean} options.waitForEnd
 * @returns {Promise<{started: boolean, immediate: boolean, duration?: number}>}
 */
export async function speakPreloaded(preloaded, options = {}) {
  const { waitForEnd = false } = options
  if (!ttsEnabled || !preloaded?.audioUrl || !preloaded?.text) {
    return { started: false, immediate: true }
  }

  return new Promise((resolve) => {
    audioQueue.push({
      text: preloaded.text,
      voiceId: preloaded.voiceId || VOICES[preloaded.speaker] || VOICES.avatar,
      speaker: preloaded.speaker || 'avatar',
      useBrowserTTS: false,
      preloadedAudioUrl: preloaded.audioUrl,
      onStart: waitForEnd ? null : () => resolve({ started: true, immediate: false }),
      onEnd: waitForEnd ? (duration) => resolve({ started: true, immediate: false, duration }) : null,
    })

    if (!isPlaying) {
      processQueue()
    }
  })
}

/**
 * Speak text and wait for audio to COMPLETE
 * Use this when you need to wait for the full audio before continuing
 * @param {string} text - The text to speak
 * @param {'dater' | 'avatar' | 'narrator'} speaker - Which character is speaking
 * @returns {Promise<{started: boolean, immediate: boolean, duration?: number}>}
 */
export async function speakAndWait(text, speaker = 'avatar') {
  return speak(text, speaker, { waitForEnd: true })
}

/**
 * Wait for all currently queued audio to finish
 * @returns {Promise<void>}
 */
export function waitForAllAudio() {
  return new Promise((resolve) => {
    if (!isPlaying && audioQueue.length === 0) {
      resolve()
      return
    }
    
    // Check periodically if audio is done
    const checkInterval = setInterval(() => {
      if (!isPlaying && audioQueue.length === 0) {
        clearInterval(checkInterval)
        resolve()
      }
    }, 100)
  })
}

/**
 * Process the audio queue
 */
async function processQueue() {
  if (audioQueue.length === 0) {
    isPlaying = false
    return
  }
  
  isPlaying = true
  const { text, voiceId, speaker, useBrowserTTS, preloadedAudioUrl, onStart, onEnd } = audioQueue.shift()
  
  let startTime = null
  let interruptionTimeoutId = null
  let completionTimeoutId = null

  const clearPlaybackTimers = () => {
    if (interruptionTimeoutId) {
      clearTimeout(interruptionTimeoutId)
      interruptionTimeoutId = null
    }
    if (completionTimeoutId) {
      clearTimeout(completionTimeoutId)
      completionTimeoutId = null
    }
  }

  const fallbackToBrowserTTS = (reason = 'ElevenLabs audio failed; using browser voice fallback.') => {
    clearPlaybackTimers()
    notifyTTSStatus({
      code: 'ELEVENLABS_FAILED',
      level: 'warning',
      message: reason,
    })
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      console.warn('⚠️ No browser speech synthesis available')
      notifyTTSStatus({
        code: 'BROWSER_TTS_UNAVAILABLE',
        level: 'error',
        message: 'ElevenLabs audio failed and browser speech is unavailable.',
      })
      if (onStart) onStart()
      if (onEnd) onEnd(0)
      processQueue()
      return
    }

    const utterance = new SpeechSynthesisUtterance(text)
    const allVoices = window.speechSynthesis.getVoices()
    const preferred = allVoices.find((v) =>
      speaker === 'narrator'
        ? /samantha|victoria|karen|serena|allison|ava|emma/i.test(v.name)
        : speaker === 'dater'
          ? (daterVoiceIsMale
              ? /daniel|david|james|matthew|alex|tom|oliver/i.test(v.name)
              : /samantha|victoria|karen|zira|ava|allison|emma/i.test(v.name))
          : /david|daniel|matthew|alex|tom/i.test(v.name)
    )
    if (preferred) utterance.voice = preferred

    utterance.rate = speaker === 'narrator' ? 0.92 : speaker === 'dater' ? getDaterPlaybackRate() : 1.0
    utterance.pitch = speaker === 'narrator' ? 1.0 : (speaker === 'dater' ? (daterVoiceIsMale ? 0.9 : 1.05) : 1.0)
    utterance.volume = voiceVolume
    let didStart = false
    let didFinish = false
    const startTimeoutId = setTimeout(() => {
      if (didStart || didFinish) return
      didFinish = true
      console.warn('⚠️ Browser TTS start timeout')
      window.speechSynthesis.cancel()
      if (onStart) onStart()
      if (onEnd) onEnd(0)
      processQueue()
    }, PLAY_START_TIMEOUT_MS)

    utterance.onstart = () => {
      if (didFinish) return
      didStart = true
      clearTimeout(startTimeoutId)
      startTime = Date.now()
      notifyAudioStart(text, speaker)
      if (onStart) onStart()
    }
    utterance.onend = () => {
      if (didFinish) return
      didFinish = true
      clearTimeout(startTimeoutId)
      const duration = startTime ? Date.now() - startTime : 0
      notifyAudioEnd(text, speaker)
      if (onEnd) onEnd(duration)
      processQueue()
    }
    utterance.onerror = (err) => {
      if (didFinish) return
      didFinish = true
      clearTimeout(startTimeoutId)
      console.error('❌ Browser TTS error:', err)
      if (onStart) onStart()
      if (onEnd) onEnd(0)
      processQueue()
    }

    // Required in some browsers before speaking queued utterances
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(utterance)
  }

  if (useBrowserTTS) {
    console.warn('⚠️ ElevenLabs server key missing, using browser TTS fallback')
    fallbackToBrowserTTS('ElevenLabs audio unavailable on server; using browser voice fallback.')
    return
  }
  
  try {
    console.log(`🎙️ Speaking as ${speaker}:`, text.substring(0, 50) + '...')
    const audioUrl = preloadedAudioUrl || (await fetchElevenLabsAudioUrl(text, voiceId, speaker))
    
    // Create and play audio
    currentAudio = getSharedAudioElement() || new Audio()
    clearCurrentObjectUrl()
    currentObjectUrl = audioUrl.startsWith('blob:') ? audioUrl : null
    currentAudio.pause?.()
    currentAudio.src = audioUrl
    currentAudio.load?.()
    currentAudio.playbackRate = speaker === 'dater' ? getDaterPlaybackRate() : 1.0
    currentAudio.volume = voiceVolume
    let didStart = false
    let didFinish = false
    const finishPlayback = (duration = 0, { notifyEnd = true } = {}) => {
      if (didFinish) return
      didFinish = true
      clearPlaybackTimers()
      clearCurrentObjectUrl()
      currentAudio = null
      if (notifyEnd) {
        notifyAudioEnd(text, speaker)
      }
      if (onEnd) onEnd(duration)
      processQueue()
    }
    const startTimeoutId = setTimeout(() => {
      if (didStart || didFinish) return
      didFinish = true
      clearPlaybackTimers()
      console.warn('⚠️ HTMLAudioElement start timeout')
      currentAudio?.pause?.()
      fallbackToBrowserTTS('ElevenLabs audio start timed out; using browser voice fallback.')
    }, PLAY_START_TIMEOUT_MS)

    const scheduleInterruptionFailOpen = (reason = 'interrupted') => {
      if (!didStart || didFinish) return
      if (!currentAudio?.paused) return
      if (currentAudio?.ended) return
      if (interruptionTimeoutId) clearTimeout(interruptionTimeoutId)
      interruptionTimeoutId = setTimeout(() => {
        if (didFinish) return
        if (!currentAudio?.paused || currentAudio?.ended) return
        const duration = startTime ? Date.now() - startTime : 0
        console.warn(`⚠️ Audio playback ${reason}; continuing game flow`)
        finishPlayback(duration)
      }, 600)
    }

    const scheduleCompletionFailOpen = () => {
      if (!didStart || didFinish) return
      if (completionTimeoutId) clearTimeout(completionTimeoutId)
      const remainingMs = Number.isFinite(currentAudio?.duration)
        ? Math.max(2500, ((currentAudio.duration - currentAudio.currentTime) * 1000) + 1500)
        : 12000
      completionTimeoutId = setTimeout(() => {
        if (didFinish) return
        const duration = startTime ? Date.now() - startTime : 0
        console.warn('⚠️ Audio completion watchdog fired; continuing game flow')
        finishPlayback(duration)
      }, remainingMs)
    }
    
    currentAudio.onended = () => {
      if (didFinish) return
      clearTimeout(startTimeoutId)
      const duration = startTime ? Date.now() - startTime : 0
      console.log(`⏹️ Audio ended for ${speaker} (${duration}ms)`)
      finishPlayback(duration)
    }
    
    currentAudio.onerror = (err) => {
      if (didFinish) return
      clearTimeout(startTimeoutId)
      console.error('❌ Audio playback error:', err)
      fallbackToBrowserTTS('ElevenLabs audio playback failed; using browser voice fallback.')
    }

    currentAudio.onpause = () => {
      scheduleInterruptionFailOpen('paused')
    }

    currentAudio.onabort = () => {
      scheduleInterruptionFailOpen('aborted')
    }

    currentAudio.onstalled = () => {
      scheduleInterruptionFailOpen('stalled')
    }

    currentAudio.onsuspend = () => {
      scheduleInterruptionFailOpen('suspended')
    }
    
    // Notify when audio actually starts playing
    currentAudio.onplay = () => {
      if (didFinish) return
      didStart = true
      clearTimeout(startTimeoutId)
      if (interruptionTimeoutId) {
        clearTimeout(interruptionTimeoutId)
        interruptionTimeoutId = null
      }
      startTime = Date.now()
      console.log(`▶️ Audio started for ${speaker}`)
      notifyTTSStatus({ code: 'ELEVENLABS_OK', level: 'ok', message: '' })
      notifyAudioStart(text, speaker)
      if (onStart) onStart()
      scheduleCompletionFailOpen()
    }
    
    await currentAudio.play()
    
  } catch (error) {
    console.error('❌ TTS error:', error)
    fallbackToBrowserTTS('ElevenLabs audio failed; using browser voice fallback.')
  }
}

/**
 * Speak dialogue from a conversation message
 * Automatically detects speaker from message format
 */
export function speakMessage(message, speaker) {
  speak(message, speaker)
}

/**
 * Get available character count (for monitoring usage)
 * ElevenLabs free tier: 10,000 characters/month
 */
export function getCharacterCount(text) {
  return text?.length || 0
}

/**
 * Change the voice for a character
 * @param {'dater' | 'avatar' | 'narrator'} character 
 * @param {string} voiceId - ElevenLabs voice ID
 * @param {boolean} [isMale] - Whether this is a male voice (for browser TTS fallback)
 */
export function setVoice(character, voiceId, isMale = undefined) {
  if (VOICES[character] !== undefined) {
    VOICES[character] = voiceId
    // Track dater gender for browser TTS fallback voice selection
    if (character === 'dater' && isMale !== undefined) {
      daterVoiceIsMale = isMale
    }
    console.log(`🎙️ Set ${character} voice to ${voiceId}${isMale !== undefined ? ` (${isMale ? 'male' : 'female'})` : ''}`)
  }
}

/**
 * Get current voice configuration
 */
export function getVoices() {
  return { ...VOICES }
}
