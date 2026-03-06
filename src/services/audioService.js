const MUSIC_VOL_KEY = 'bdMusicVolume'
const SFX_VOL_KEY = 'bdSfxVolume'

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

let musicVolume = readStoredVolume(MUSIC_VOL_KEY, 0.5)
let sfxVolume = readStoredVolume(SFX_VOL_KEY, 0.8)

function persistVolume(key, volume) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(key, String(volume))
}

export function getMusicVolume() {
  return musicVolume
}

export function setMusicVolume(value) {
  musicVolume = clampVolume(value, musicVolume)
  persistVolume(MUSIC_VOL_KEY, musicVolume)
}

export function getSfxVolume() {
  return sfxVolume
}

export function setSfxVolume(value) {
  sfxVolume = clampVolume(value, sfxVolume)
  persistVolume(SFX_VOL_KEY, sfxVolume)
}
