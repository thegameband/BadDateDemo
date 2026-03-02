/**
 * Gemini (Nano Banana) image generation for Drop a Line scene art.
 * Uses Gemini 2.0 Flash image generation to create visual-novel-style character + location scenes.
 */

const GEMINI_IMAGE_MODEL = 'gemini-2.5-flash-image-preview'

function getApiKey() {
  return typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_GOOGLE_AI_API_KEY
    ? import.meta.env.VITE_GOOGLE_AI_API_KEY
    : ''
}

/**
 * Build a prompt for visual-novel-style scene: full-body character in foreground, location in background.
 * @param {{ name?: string, archetype?: string, description?: string }} dater
 * @param {string} location
 * @returns {string}
 */
function buildScenePrompt(dater, location) {
  const characterDesc = dater?.archetype || dater?.description?.split('.')[0]?.trim() || 'a person'
  return `Visual novel art style. A single character stands in the foreground, full body, facing the camera: ${characterDesc}. The background is a detailed illustration of ${location}. Anime-influenced, colorful, clean linework, portrait orientation (9:16 aspect ratio). Do NOT include any text, names, dialogue boxes, or UI elements in the image.`
}

/**
 * Generate a scene image (character + location) via Gemini. Returns a data URL or null.
 * @param {{ name?: string, archetype?: string, description?: string }} dater
 * @param {string} location
 * @returns {Promise<string|null>}
 */
export async function generateSceneImage(dater, location) {
  const apiKey = getApiKey()
  if (!apiKey) {
    console.warn('Gemini image: no VITE_GOOGLE_AI_API_KEY')
    return null
  }

  const prompt = buildScenePrompt(dater, location)

  try {
    const { GoogleGenAI } = await import('@google/genai')
    const ai = new GoogleGenAI({ apiKey })

    const response = await ai.models.generateContent({
      model: GEMINI_IMAGE_MODEL,
      contents: prompt,
    })

    if (!response?.candidates?.length) return null
    const parts = response.candidates[0].content?.parts
    if (!Array.isArray(parts)) return null

    for (const part of parts) {
      const data = part.inlineData ?? part.inline_data
      if (data?.data) {
        const mime = data.mimeType || data.mime_type || 'image/png'
        return `data:${mime};base64,${data.data}`
      }
    }
    return null
  } catch (err) {
    console.warn('Gemini scene image failed:', err?.message || err, 'status:', err?.status)
    return null
  }
}
