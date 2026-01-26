/**
 * ElevenLabs Text-to-Speech Service
 * 
 * Provides voice synthesis for the Dater and Avatar characters
 */

const API_KEY = import.meta.env.VITE_ELEVENLABS_API_KEY

// Voice IDs from ElevenLabs
// You can change these to any voice from your ElevenLabs account
const VOICES = {
  // Dater (Maya) - sunny, enthusiastic female voice with quirky attitude
  dater: 'FGY2WhTYpPnrIDTdsKH5', // Laura - "sunny enthusiasm with a quirky attitude"
  
  // Avatar - young, playful, trendy female voice
  avatar: 'cgSgspJ2msm6clMCkdW9', // Jessica - "Young and popular, playful American female"
}

// Audio queue to prevent overlapping speech
let audioQueue = []
let isPlaying = false
let currentAudio = null

// TTS enabled state
let ttsEnabled = true

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
 * @param {string} text - The text to speak
 * @param {'dater' | 'avatar'} speaker - Which character is speaking
 * @param {object} options - Optional settings
 */
export async function speak(text, speaker = 'avatar', options = {}) {
  if (!ttsEnabled) {
    console.log('🔇 TTS disabled, skipping speech')
    return
  }
  
  if (!API_KEY) {
    console.warn('⚠️ ElevenLabs API key not configured')
    return
  }
  
  if (!text || text.trim().length === 0) {
    return
  }
  
  // Clean up the text - remove asterisks and actions like *smiles*
  const cleanText = text
    .replace(/\*[^*]+\*/g, '') // Remove *actions*
    .replace(/\([^)]+\)/g, '') // Remove (parenthetical actions)
    .trim()
  
  if (cleanText.length === 0) {
    return
  }
  
  const voiceId = VOICES[speaker] || VOICES.avatar
  
  // Add to queue
  audioQueue.push({ text: cleanText, voiceId, speaker })
  
  // Process queue if not already playing
  if (!isPlaying) {
    processQueue()
  }
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
  const { text, voiceId, speaker } = audioQueue.shift()
  
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
      URL.revokeObjectURL(audioUrl)
      currentAudio = null
      // Process next item in queue
      processQueue()
    }
    
    currentAudio.onerror = (err) => {
      console.error('❌ Audio playback error:', err)
      URL.revokeObjectURL(audioUrl)
      currentAudio = null
      processQueue()
    }
    
    await currentAudio.play()
    
  } catch (error) {
    console.error('❌ TTS error:', error)
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
