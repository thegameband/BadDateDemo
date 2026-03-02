/**
 * Gemini (Nano Banana) image generation for Drop a Line scene art.
 * Uses Gemini 2.0 Flash (experimental) image generation to create visual-novel-style character + location scenes.
 */

const GEMINI_IMAGE_MODEL = 'gemini-2.0-flash-exp'
const IMAGEN_MODEL = 'imagen-4.0-generate-001'

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
 * Generate a scene image (character + location) via Gemini.
 * @param {{ name?: string, archetype?: string, description?: string }} dater
 * @param {string} location
 * @returns {Promise<{ dataUrl: string|null, error: string|null }>}
 */
export async function generateSceneImage(dater, location) {
  const apiKey = getApiKey()
  if (!apiKey) {
    const msg = 'No API key (VITE_GOOGLE_AI_API_KEY not set at build time)'
    console.warn('Gemini image:', msg)
    return { dataUrl: null, error: msg }
  }

  const prompt = buildScenePrompt(dater, location)

  try {
    const { GoogleGenAI } = await import('@google/genai')
    const ai = new GoogleGenAI({ apiKey, apiVersion: 'v1alpha' })

    const response = await ai.models.generateContent({
      model: GEMINI_IMAGE_MODEL,
      contents: prompt,
      config: {
        responseModalities: ['TEXT', 'IMAGE'],
      },
    })

    try {
      if (!response?.candidates?.length) {
        const finishReason = response?.candidates?.[0]?.finishReason ?? response?.promptFeedback?.blockReason
        return { dataUrl: null, error: `No image in response (finishReason: ${finishReason ?? 'unknown'})` }
      }
      const parts = response.candidates[0].content?.parts
      if (!Array.isArray(parts)) {
        return { dataUrl: null, error: 'Response had no parts array' }
      }

      for (const part of parts) {
        const data = part.inlineData ?? part.inline_data
        if (data?.data) {
          const mime = data.mimeType || data.mime_type || 'image/png'
          return { dataUrl: `data:${mime};base64,${data.data}`, error: null }
        }
      }
      return { dataUrl: null, error: 'Response had no image part (text-only or blocked)' }
    } catch (parseErr) {
      return { dataUrl: null, error: getReadableError(parseErr) || 'Unexpected response shape' }
    }
  } catch (err) {
    const is404 = err?.status === 404 || err?.code === 404
    if (is404) {
      try {
        const { GoogleGenAI } = await import('@google/genai')
        const ai = new GoogleGenAI({ apiKey })
        const res = await ai.models.generateImages({
          model: IMAGEN_MODEL,
          prompt,
          config: { numberOfImages: 1 },
        })
        const img = res?.generatedImages?.[0]?.image?.imageBytes
        if (img) return { dataUrl: `data:image/png;base64,${img}`, error: null }
      } catch (imagenErr) {
        return { dataUrl: null, error: getReadableError(imagenErr) }
      }
    }
    const msg = getReadableError(err)
    console.warn('Gemini scene image failed:', msg, err)
    return { dataUrl: null, error: msg }
  }
}

function getReadableError(err) {
  if (!err) return 'Unknown error'
  const status = err.status ?? err.statusCode ?? err.code
  const statusStr = status != null ? ` (${status})` : ''
  const body = err.body ?? err.error ?? err.response
  const bodyMsg = typeof body === 'string' ? body : (body?.message ?? body?.error?.message)
  const message = err.message ?? bodyMsg
  if (message && typeof message === 'string' && !message.includes('.js:')) {
    return message + statusStr
  }
  if (bodyMsg && typeof bodyMsg === 'string') return bodyMsg + statusStr
  if (status === 400) return 'Bad request – model or prompt may be invalid' + statusStr
  if (status === 403) return 'Access denied – check API key and quota' + statusStr
  if (status === 404) return 'Model not found – try a different model name' + statusStr
  if (status === 429) return 'Rate limited – try again later' + statusStr
  if (status) return `Request failed${statusStr}`
  return 'Request failed – check console for details'
}
