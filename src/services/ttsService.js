/**
 * ElevenLabs Text-to-Speech Service
 * 
 * Provides voice synthesis for the Dater and Avatar characters
 */

const API_KEY = import.meta.env.VITE_ELEVENLABS_API_KEY

// Voice IDs from ElevenLabs
// You can change these to any voice from your ElevenLabs account
const VOICES = {
  // Dater (Maya) - warm, expressive female voice (less high-pitched)
  dater: '21m00Tcm4TlvDq8ikWAM', // Rachel - warm, calm, expressive
  
  // Avatar - young, energetic male voice
  avatar: 'TX3LPaxmHKxFdv7VOQHJ', // Liam - "young adult with energy and warmth"
}

// Audio queue to prevent overlapping speech
let audioQueue = []
let isPlaying = false
let currentAudio = null

// TTS enabled state
let ttsEnabled = true // Enabled by default

// Callbacks for audio events
let onAudioStartCallbacks = []
let onAudioEndCallbacks = []

// Track pending audio completion promises
let currentAudioEndResolve = null

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
  audioQueue = []
  isPlaying = false
}

/**
 * Convert text to speech using ElevenLabs API
 * Returns a promise that resolves when audio STARTS playing (not when it ends)
 * @param {string} text - The text to speak
 * @param {'dater' | 'avatar'} speaker - Which character is speaking
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
  
  if (!API_KEY) {
    console.warn('⚠️ ElevenLabs API key not configured')
    return { started: false, immediate: true }
  }
  
  if (!text || text.trim().length === 0) {
    return { started: false, immediate: true }
  }
  
  // Clean up the text - remove asterisks and actions like *smiles*
  const cleanText = text
    .replace(/\*[^*]+\*/g, '') // Remove *actions*
    .replace(/\([^)]+\)/g, '') // Remove (parenthetical actions)
    .trim()
  
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
 * Speak text and wait for audio to COMPLETE
 * Use this when you need to wait for the full audio before continuing
 * @param {string} text - The text to speak
 * @param {'dater' | 'avatar'} speaker - Which character is speaking
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
  const { text, voiceId, speaker, onStart, onEnd } = audioQueue.shift()
  
  let startTime = null
  
  try {
    console.log(`🎙️ Speaking as ${speaker}:`, text.substring(0, 50) + '...')
    
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: text,
          model_id: 'eleven_multilingual_v2',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0.5,
            use_speaker_boost: true,
          },
        }),
      }
    )
    
    if (!response.ok) {
      const errorText = await response.text()
      console.error('❌ ElevenLabs API error:', response.status, errorText)
      // Resolve the promises so caller knows it failed
      if (onStart) onStart()
      if (onEnd) onEnd(0)
      // Continue to next item in queue
      processQueue()
      return
    }
    
    // Convert response to audio blob
    const audioBlob = await response.blob()
    const audioUrl = URL.createObjectURL(audioBlob)
    
    // Create and play audio
    currentAudio = new Audio(audioUrl)
    
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
      notifyAudioStart(text, speaker)
      if (onStart) onStart()
    }
    
    await currentAudio.play()
    
  } catch (error) {
    console.error('❌ TTS error:', error)
    // Resolve the promises so caller knows it failed
    if (onStart) onStart()
    if (onEnd) onEnd(0)
    // Continue to next item in queue
    processQueue()
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
 * @param {'dater' | 'avatar'} character 
 * @param {string} voiceId - ElevenLabs voice ID
 */
export function setVoice(character, voiceId) {
  if (VOICES[character] !== undefined) {
    VOICES[character] = voiceId
    console.log(`🎙️ Set ${character} voice to ${voiceId}`)
  }
}

/**
 * Get current voice configuration
 */
export function getVoices() {
  return { ...VOICES }
}
