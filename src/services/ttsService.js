/**
 * ElevenLabs Text-to-Speech Service
 * 
 * Provides voice synthesis for the Dater and Avatar characters
 */

const API_KEY = import.meta.env.VITE_ELEVENLABS_API_KEY

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
  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: {
          stability: speaker === 'dater' ? 0.35 : speaker === 'narrator' ? 0.55 : 0.5,
          similarity_boost: 0.75,
          style: speaker === 'dater' ? 0.75 : speaker === 'narrator' ? 0.5 : 0.5,
          use_speaker_boost: true,
        },
      }),
    }
  )

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`ElevenLabs API error (${response.status}): ${errorText}`)
  }

  const audioBlob = await response.blob()
  return URL.createObjectURL(audioBlob)
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

/**
 * Stop all audio and clear the queue
 */
export function stopAllAudio() {
  if (currentAudio) {
    currentAudio.pause()
    currentAudio = null
  }
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    window.speechSynthesis.cancel()
  }
  audioQueue = []
  isPlaying = false
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
  
  // Create a promise that resolves when audio starts OR ends (based on option)
  return new Promise((resolve) => {
    // Add to queue with callbacks
    audioQueue.push({ 
      text: cleanText, 
      voiceId, 
      speaker,
      useBrowserTTS: !API_KEY,
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
  if (!API_KEY) return null

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

  const fallbackToBrowserTTS = (reason = 'ElevenLabs audio failed; using browser voice fallback.') => {
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

    utterance.rate = speaker === 'narrator' ? 0.92 : speaker === 'dater' ? 1.25 : 1.0
    utterance.pitch = speaker === 'narrator' ? 1.0 : (speaker === 'dater' ? (daterVoiceIsMale ? 0.9 : 1.05) : 1.0)
    utterance.volume = 1

    utterance.onstart = () => {
      startTime = Date.now()
      notifyAudioStart(text, speaker)
      if (onStart) onStart()
    }
    utterance.onend = () => {
      const duration = startTime ? Date.now() - startTime : 0
      notifyAudioEnd(text, speaker)
      if (onEnd) onEnd(duration)
      processQueue()
    }
    utterance.onerror = (err) => {
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
    console.warn('⚠️ ElevenLabs key missing, using browser TTS fallback')
    fallbackToBrowserTTS('ElevenLabs audio unavailable (missing API key); using browser voice fallback.')
    return
  }
  
  try {
    console.log(`🎙️ Speaking as ${speaker}:`, text.substring(0, 50) + '...')
    const audioUrl = preloadedAudioUrl || (await fetchElevenLabsAudioUrl(text, voiceId, speaker))
    
    // Create and play audio
    currentAudio = new Audio(audioUrl)
    currentAudio.playbackRate = speaker === 'dater' ? 1.25 : 1.0
    
    currentAudio.onended = () => {
      const duration = startTime ? Date.now() - startTime : 0
      console.log(`⏹️ Audio ended for ${speaker} (${duration}ms)`)
      URL.revokeObjectURL(audioUrl)
      currentAudio = null
      // Notify listeners that audio ended
      notifyAudioEnd(text, speaker)
      // Call onEnd callback if provided
      if (onEnd) onEnd(duration)
      // Process next item in queue
      processQueue()
    }
    
    currentAudio.onerror = (err) => {
      console.error('❌ Audio playback error:', err)
      URL.revokeObjectURL(audioUrl)
      currentAudio = null
      if (onEnd) onEnd(0)
      processQueue()
    }
    
    // Notify when audio actually starts playing
    currentAudio.onplay = () => {
      startTime = Date.now()
      console.log(`▶️ Audio started for ${speaker}`)
      notifyTTSStatus({ code: 'ELEVENLABS_OK', level: 'ok', message: '' })
      notifyAudioStart(text, speaker)
      if (onStart) onStart()
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
