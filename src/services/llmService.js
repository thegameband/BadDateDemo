// LLM Service for OpenAI GPT integration
import { buildDaterAgentPrompt } from '../data/daters'
import { 
  classifyAttribute, 
  buildAvatarPromptChain, 
  buildDaterPromptChain,
  PROMPT_06_AVATAR_CORE,
  PROMPT_07_RULES,
  PROMPT_04_DATER_VISIBLE,
  PROMPT_05_DATER_INFER,
  PROMPT_05B_DATER_REACTION_STYLE,
  PROMPT_08_GENZ_SPEECH
} from './promptChain'
import { getVoiceProfilePrompt } from './voiceProfiles'
import { useGameStore } from '../store/gameStore'

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions'
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'
const OPENAI_MODEL = import.meta.env.VITE_OPENAI_MODEL || 'gpt-5.2'
const ANTHROPIC_MODEL = 'claude-opus-4-6'
let _llmErrorMessage = null
let _llmDebugSnapshot = null

function getKeyFingerprint(key) {
  if (!key || typeof key !== 'string') return 'missing'
  return `len:${key.length}-sfx:${key.slice(-4)}`
}

function getRuntimeContext() {
  return {
    mode: import.meta.env.MODE,
    prod: import.meta.env.PROD,
    dev: import.meta.env.DEV,
    host: typeof window !== 'undefined' ? window.location.host : 'unknown',
    path: typeof window !== 'undefined' ? window.location.pathname : 'unknown',
  }
}

function getLlmProviderPreference() {
  try {
    const provider = useGameStore.getState()?.llmProvider
    if (provider === 'openai' || provider === 'anthropic' || provider === 'auto') return provider
  } catch {
    // Fall through to default
  }
  return 'openai'
}

function resolveLlmProviderConfig() {
  const preference = getLlmProviderPreference()
  const openaiKey = import.meta.env.VITE_OPENAI_API_KEY
  const anthropicKey = import.meta.env.VITE_ANTHROPIC_API_KEY

  if (preference === 'openai') {
    if (!openaiKey) return null
    return {
      provider: 'openai',
      apiUrl: OPENAI_API_URL,
      apiKey: openaiKey,
      model: OPENAI_MODEL,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiKey}`,
      },
      preference,
    }
  }

  if (preference === 'anthropic') {
    if (!anthropicKey) return null
    return {
      provider: 'anthropic',
      apiUrl: ANTHROPIC_API_URL,
      apiKey: anthropicKey,
      model: ANTHROPIC_MODEL,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      preference,
    }
  }

  if (openaiKey) {
    return {
      provider: 'openai',
      apiUrl: OPENAI_API_URL,
      apiKey: openaiKey,
      model: OPENAI_MODEL,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiKey}`,
      },
      preference,
    }
  }

  if (anthropicKey) {
    return {
      provider: 'anthropic',
      apiUrl: ANTHROPIC_API_URL,
      apiKey: anthropicKey,
      model: ANTHROPIC_MODEL,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      preference,
    }
  }

  return null
}

function buildProviderBody(providerConfig, {
  maxTokens,
  systemPrompt,
  messages,
  temperature,
  presencePenalty,
  frequencyPenalty,
}) {
  if (providerConfig.provider === 'anthropic') {
    return {
      model: providerConfig.model,
      max_tokens: maxTokens,
      temperature,
      ...(systemPrompt ? { system: systemPrompt } : {}),
      messages,
    }
  }

  return {
    model: providerConfig.model,
    max_completion_tokens: maxTokens,
    temperature,
    presence_penalty: presencePenalty,
    frequency_penalty: frequencyPenalty,
    messages: [
      ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
      ...messages,
    ],
  }
}

function extractProviderText(provider, data) {
  if (provider === 'anthropic') return data?.content?.[0]?.text || ''
  return data?.choices?.[0]?.message?.content || ''
}

export function getLlmErrorMessage() {
  return _llmErrorMessage
}

export function getLlmDebugSnapshot() {
  return _llmDebugSnapshot
}

export function clearLlmErrorMessage() {
  _llmErrorMessage = null
  _llmDebugSnapshot = null
}

const DATER_BASELINE_RESPONSE_CONTRACT = `
DIALOGUE CONTRACT:
- Sound like a real person in live conversation.
- One punchy sentence by default, two max.
- Target short turns (usually 6-16 words).
- Lead with your reaction/opinion, then one concrete reason or detail.
- No stage directions, no asterisks, no emoji.
- Keep wording modern and spoken; avoid grandiose or theatrical phrasing.
- Add a little charm when possible: a light joke, playful line, or warm flirt beat.
- Occasionally weave one brief profile cue (value/quirk), but keep it subtle.
- Do not repeat archetype/backstory language unless directly relevant.
`

/**
 * Strip ALL action descriptions from responses
 * We want pure dialogue only - no asterisks at all
 */
function stripActionDescriptions(text) {
  if (!text) return text
  
  // Remove ALL asterisk content - we want pure dialogue
  return text.replace(/\*[^*]+\*/g, '').replace(/\s+/g, ' ').trim()
}

const ADAM_RESPONSE_CONTRACT = `
ADAM VOICE GUARD:
- Keep Adam warm, dry, and human.
- Use modern plain English (no archaic phrasing).
- No therapy/chatbot phrasing.
- One punchy sentence by default, two max.
- Target short turns (usually 6-14 words).
- Be funny in a charming way: light dry wit, not cruelty.
- Let Adam's worldview peek through briefly sometimes (one short phrase).
- Do not force lore references unless directly relevant.
- Dialogue only. No action text.
`

function buildPromptTail(dater) {
  const isAdam = (dater?.name || '').toLowerCase() === 'adam'
  const overlay = dater?.speechStylePrompt || ''

  if (isAdam) {
    const adamOverlay = overlay ? '\n\n' + overlay : ''
    return '\n\n' + PROMPT_08_GENZ_SPEECH +
           adamOverlay +
           '\n\n' + PROMPT_05B_DATER_REACTION_STYLE +
           '\n\n' + PROMPT_07_RULES +
           '\n\n' + ADAM_RESPONSE_CONTRACT
  }

  const speechOverlay = overlay ? '\n\n' + overlay : ''
  return '\n\n' + PROMPT_08_GENZ_SPEECH + speechOverlay +
         '\n\n' + PROMPT_05B_DATER_REACTION_STYLE +
         '\n\n' + PROMPT_07_RULES +
         DATER_BASELINE_RESPONSE_CONTRACT
}

/**
 * Call OpenAI API for a response
 */
export async function getChatResponse(messages, systemPrompt, options = {}) {
  const providerConfig = resolveLlmProviderConfig()
  const runtime = getRuntimeContext()
  const keyFingerprint = getKeyFingerprint(providerConfig?.apiKey)
  const maxTokens = Number.isFinite(Number(options?.maxTokens))
    ? Math.max(40, Number(options.maxTokens))
    : 120
  const temperature = Number.isFinite(Number(options?.temperature))
    ? Math.min(1.2, Math.max(0, Number(options.temperature)))
    : 0.8
  const presencePenalty = Number.isFinite(Number(options?.presencePenalty))
    ? Math.min(2, Math.max(0, Number(options.presencePenalty)))
    : 0.25
  const frequencyPenalty = Number.isFinite(Number(options?.frequencyPenalty))
    ? Math.min(2, Math.max(0, Number(options.frequencyPenalty)))
    : 0.3
  
  if (!providerConfig) {
    _llmErrorMessage = 'No API key - LLM offline'
    _llmDebugSnapshot = {
      source: 'getChatResponse',
      stage: 'preflight',
      reason: 'missing_api_key',
      provider: getLlmProviderPreference(),
      keyFingerprint,
      runtime,
    }
    console.warn('No LLM provider API key found. Using fallback responses.')
    return null
  }
  
  try {
    // Normalize outbound messages so OpenAI never receives invalid content payloads.
    const sanitizedMessages = (Array.isArray(messages) ? messages : [])
      .map(msg => {
        const role = msg?.role === 'assistant' ? 'assistant' : 'user'
        const rawContent = msg?.content
        const content = typeof rawContent === 'string'
          ? rawContent.trim()
          : (rawContent == null ? '' : String(rawContent).trim())
        return { role, content }
      })
      .filter(msg => msg.content.length > 0)

    if (!sanitizedMessages.length) {
      sanitizedMessages.push({ role: 'user', content: 'Respond in character.' })
    } else if (!sanitizedMessages.some(msg => msg.role === 'user')) {
      sanitizedMessages.push({ role: 'user', content: 'Respond to the latest message in character.' })
    }

    const response = await fetch(providerConfig.apiUrl, {
      method: 'POST',
      headers: providerConfig.headers,
      body: JSON.stringify(buildProviderBody(providerConfig, {
        maxTokens,
        temperature,
        presencePenalty,
        frequencyPenalty,
        systemPrompt,
        messages: sanitizedMessages.map(msg => ({
          role: msg.role,
          content: msg.content,
        })),
      })),
    })
    
    if (!response.ok) {
      let errorDetails = ''
      let parsedError = null
      try {
        const error = await response.json()
        parsedError = error
        errorDetails = JSON.stringify(error, null, 2)
      } catch {
        try {
          errorDetails = await response.text()
        } catch {
          errorDetails = 'Unable to parse LLM API error body.'
        }
      }
      const rawErrorMessage = parsedError?.error?.message || parsedError?.message || ''
      const normalizedErrorMessage = String(rawErrorMessage).toLowerCase()
      let shortReason = ''
      if (normalizedErrorMessage.includes('credit balance is too low') || normalizedErrorMessage.includes('insufficient_quota') || normalizedErrorMessage.includes('quota') || normalizedErrorMessage.includes('billing')) {
        shortReason = 'insufficient API credits'
      } else if (normalizedErrorMessage.includes('model') && (normalizedErrorMessage.includes('not found') || normalizedErrorMessage.includes('not available') || normalizedErrorMessage.includes('access'))) {
        shortReason = 'model unavailable for this API key'
      } else if (normalizedErrorMessage.includes('api key') || normalizedErrorMessage.includes('authentication') || normalizedErrorMessage.includes('unauthorized')) {
        shortReason = 'API key/authentication issue'
      } else if (rawErrorMessage) {
        shortReason = rawErrorMessage
      }
      const requestId = response.headers.get('request-id') || response.headers.get('x-request-id') || ''
      console.error(`${providerConfig.provider.toUpperCase()} API error [${response.status} ${response.statusText}]:`, errorDetails)
      _llmErrorMessage = `LLM error ${response.status}${shortReason ? `: ${shortReason}` : ''}`
      _llmDebugSnapshot = {
        source: 'getChatResponse',
        stage: 'http_error',
        provider: providerConfig.provider,
        status: response.status,
        statusText: response.statusText,
        shortReason,
        rawErrorMessage,
        requestId,
        keyFingerprint,
        runtime,
      }
      return null
    }
    
    const data = await response.json()
    clearLlmErrorMessage()
    _llmDebugSnapshot = {
      source: 'getChatResponse',
      stage: 'success',
      status: response.status,
      keyFingerprint,
      runtime,
    }
    // Strip action descriptions from the response
    return stripActionDescriptions(extractProviderText(providerConfig.provider, data))
  } catch (error) {
    console.error(`Error calling ${providerConfig.provider.toUpperCase()} API:`, error)
    _llmErrorMessage = 'LLM request failed'
    _llmDebugSnapshot = {
      source: 'getChatResponse',
      stage: 'network_error',
      provider: providerConfig.provider,
      errorName: error?.name || 'unknown',
      errorMessage: error?.message || String(error),
      keyFingerprint,
      runtime,
    }
    return null
  }
}

/**
 * Single prompt LLM call with timeout - for wrap-up and other flows that must not hang
 * @param {string} userPrompt - The user message content
 * @param {{ maxTokens?: number, timeoutMs?: number }} options
 * @returns {Promise<string|null>} - Response text or null on failure/timeout
 */
export async function getSingleResponseWithTimeout(userPrompt, options = {}) {
  const { maxTokens = 200, timeoutMs = 25000 } = options
  const providerConfig = resolveLlmProviderConfig()
  if (!providerConfig) return null

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(providerConfig.apiUrl, {
      method: 'POST',
      signal: controller.signal,
      headers: providerConfig.headers,
      body: JSON.stringify(buildProviderBody(providerConfig, {
        maxTokens,
        messages: [{ role: 'user', content: userPrompt }],
      })),
    })
    clearTimeout(timeoutId)
    if (!response.ok) return null
    const data = await response.json()
    const text = extractProviderText(providerConfig.provider, data).trim()
    return text ? stripActionDescriptions(text) : null
  } catch (err) {
    clearTimeout(timeoutId)
    if (err.name === 'AbortError') console.warn('LLM request timed out')
    else console.error('LLM request error:', err)
    return null
  }
}

/**
 * Get Dater response in chat phase
 */
export async function getDaterChatResponse(dater, conversationHistory) {
  const systemPrompt = buildDaterAgentPrompt(dater, 'chat')
  
  // Convert conversation history to chat-completions format
  const messages = conversationHistory.map(msg => ({
    role: msg.isPlayer ? 'user' : 'assistant',
    content: msg.text,
  }))
  
  const response = await getChatResponse(messages, systemPrompt)
  return response
}

/**
 * Get Dater response during the date
 */
/**
 * Determine if an attribute is visibly observable (physical appearance, clothing, etc.)
 */
function isVisibleAttribute(attr) {
  const lowerAttr = attr.toLowerCase()
  
  // Physical size/body keywords
  const visibleKeywords = [
    'tall', 'short', 'feet', 'foot', 'inches', 'giant', 'tiny', 'huge', 'small',
    'eye', 'eyes', 'arm', 'arms', 'leg', 'legs', 'hand', 'hands', 'head', 'face',
    'hair', 'bald', 'beard', 'mustache', 'skin', 'wings', 'tail', 'horns', 'teeth', 'fangs',
    'wearing', 'dressed', 'costume', 'outfit', 'clothes', 'hat', 'mask', 'glasses',
    'tattoo', 'piercing', 'scar', 'makeup', 'clown', 'robot', 'cyborg',
    'spider', 'monster', 'alien', 'ghost', 'zombie', 'vampire', 'werewolf',
    'green', 'blue', 'purple', 'red', 'glowing', 'transparent', 'invisible',
    'fat', 'thin', 'muscular', 'buff', 'skeletal', 'floating', 'hovering',
    'tentacle', 'antenna', 'fur', 'scales', 'feathers', 'slime', 'ooze',
    'beautiful', 'ugly', 'handsome', 'gorgeous', 'hideous', 'deformed',
    'old', 'ancient', 'baby', 'child', 'elderly', 'wrinkled',
    'fire', 'flames', 'smoking', 'steaming', 'dripping', 'melting',
  ]
  
  return visibleKeywords.some(keyword => lowerAttr.includes(keyword))
}

/**
 * Dater opens a round by sharing their own perspective on the topic
 * This makes conversations feel more natural - like they're already chatting
 */
export async function getDaterConversationOpener(dater, avatar, conversationHistory, topicTitle, topicQuestion) {
  console.log('🗣️ Dater opening conversation about:', topicTitle, '-', topicQuestion)
  const systemPrompt = buildDaterAgentPrompt(dater, 'date')
  
  const openerPrompt = `You're in the middle of a date conversation. The topic of "${topicTitle}" has come up naturally.
Open with your own perspective on: "${topicQuestion}".

Use your values and preferences:
- Likes: ${dater.idealPartner?.join(', ') || 'someone compatible'}
- Dealbreakers: ${dater.dealbreakers?.join(', ') || 'dishonesty, cruelty'}
- Values: ${dater.values || 'authenticity'}

Rules:
- Sound like natural conversation in progress.
- Share your take first; do not wait with a question.
- 1 sentence preferred, 2 max.`

  const messages = [
    ...conversationHistory.slice(-10).map(msg => ({
      role: msg.speaker === 'dater' ? 'assistant' : 'user',
      content: msg.message
    })),
    { role: 'user', content: openerPrompt }
  ]

  try {
    const text = await getChatResponse(messages, systemPrompt, {
      maxTokens: 95,
      temperature: 0.84,
      presencePenalty: 0.3,
      frequencyPenalty: 0.3,
    })
    if (!text) return null
    // Remove any action descriptions
    return text.replace(/\*[^*]+\*/g, '').trim()
  } catch (error) {
    console.error('Error getting dater opener:', error)
    return null
  }
}

export async function getDaterDateResponse(dater, avatar, conversationHistory, latestAttribute = null, sentimentHit = null, reactionStreak = { positive: 0, negative: 0 }, isFinalRound = false, isFirstImpressions = false, compatibility = 50, customInstruction = null) {
  console.log('🔗 Using MODULAR PROMPT CHAIN for dater response')
  console.log('📊 Current compatibility:', compatibility, '% | Sentiment:', sentimentHit)
  const systemPrompt = buildDaterAgentPrompt(dater, 'date')

  // Filter attributes to only include visible traits the dater can actually see.
  const genericStarters = ['seems friendly', 'has a nice smile', 'appears well-dressed']
  const realAttributes = avatar.attributes.filter(attr => !genericStarters.includes(attr))
  const visibleAttributes = realAttributes.filter(isVisibleAttribute)

  let finalRoundInstruction = ''
  if (isFinalRound) {
    finalRoundInstruction = `\n\nFinal round:
- Give a closing judgment that feels final, not open-ended.
- If positive, show clear interest in continuing.
- If negative, set a clear boundary or polite no.`
  }

  let firstImpressionsInstruction = ''
  if (isFirstImpressions) {
    firstImpressionsInstruction = `\n\nFirst impressions:
- React to what you see and what they said, like a real person would.
- Keep it specific and immediate, not generic.`
  }

  let sentimentInstruction = ''
  if (sentimentHit) {
    const isPositive = sentimentHit === 'loves' || sentimentHit === 'likes'
    const streak = isPositive ? reactionStreak.positive : reactionStreak.negative
    const dateVibe = compatibility >= 70 ? 'high' : compatibility >= 45 ? 'mixed' : 'low'

    const sentimentGuide = {
      loves: 'This is a major positive hit. Show real enthusiasm with one concrete reason.',
      likes: 'This is a mild positive hit. Sound warm and interested.',
      dislikes: 'This is a mild negative hit. Sound bothered or skeptical.',
      dealbreakers: 'This is a major negative hit. Set a firm boundary clearly.',
    }

    const vibeGuide = dateVibe === 'high'
      ? 'The date has been going well, so keep your tone human and warm.'
      : dateVibe === 'mixed'
        ? 'The date has been mixed, so stay measured.'
        : 'The date has been rough, so keep positive reactions cautious and negatives direct.'

    const streakGuide = streak >= 2
      ? `This is part of a ${streak}-message streak; let that momentum show naturally.`
      : ''

    sentimentInstruction = `\n\nSentiment guidance (${sentimentHit}):
- ${sentimentGuide[sentimentHit] || 'React honestly.'}
- ${vibeGuide}
${streakGuide ? `- ${streakGuide}` : ''}
- Keep it natural and concise; do not become theatrical.`
  } else if (isFinalRound) {
    sentimentInstruction = finalRoundInstruction
  }

  const baselineMorality = `
Baseline realism:
- React to harmful or dangerous content with normal human concern.
- React to attractive or compatible content with warmth.
- Honesty alone is not a positive; content still matters.`

  const avatarContext = visibleAttributes.length > 0
    ? `\n\nVisible context: ${visibleAttributes.join(', ')}
- These are literal physical traits you can see.
- Let what you can see influence your reaction naturally.`
    : ''

  const knowledgeBoundary = `\n\nKnowledge boundary:
- Only use what was said in conversation or what is physically visible.
- Do not invent facts about your date.`
  
  // Get the last thing the Avatar said (for inference)
  const lastAvatarMessage = [...conversationHistory].reverse().find(msg => msg.speaker === 'avatar')?.message || ''
  
  // Normalize latestAttribute: can be string (answer) or object { answer, questionContext }
  const answerRevealed = typeof latestAttribute === 'object' && latestAttribute !== null
    ? (latestAttribute.answer ?? latestAttribute.questionContext ?? '')
    : (latestAttribute || '')
  const roundQuestion = typeof latestAttribute === 'object' && latestAttribute !== null
    ? (latestAttribute.questionContext || '')
    : ''
  
  // Get the question that was asked (use round question when provided, else last dater message)
  const questionForContext = roundQuestion || [...conversationHistory].reverse().find(msg => msg.speaker === 'dater')?.message || ''
  
  // Special instruction if a new attribute was just added.
  let latestAttrContext = ''
  if (customInstruction) {
    latestAttrContext = `\n\nTask: ${customInstruction}
- Keep tone consistent with the current date vibe.
- 1 sentence preferred, 2 max. Dialogue only.`
  } else if (latestAttribute) {
    // Check if this is a plot twist scenario (special handling).
    const isPlotTwist = (typeof latestAttribute === 'string' ? latestAttribute : latestAttribute?.answer || '').includes('PLOT TWIST SCENARIO')

    if (isPlotTwist) {
      const plotTwistContent = typeof latestAttribute === 'string' ? latestAttribute : (latestAttribute?.answer || String(latestAttribute))
      const daterName = dater?.name || 'the dater'
      const daterDealbreakers = Array.isArray(dater?.dealbreakers) ? dater.dealbreakers.join(', ') : (dater?.dealbreakers || '')
      const daterValues = dater?.values || ''
      latestAttrContext = `\n\nPlot twist:
${plotTwistContent}

React as ${daterName} using your own values (${daterValues}) and dealbreakers (${daterDealbreakers}).
- Be direct about how this changes your read on them.
- Keep it human and concise.`
    } else {
      const isVisible = isVisibleAttribute(answerRevealed)

      // Include question context when available.
      const questionContextBlock = questionForContext
        ? `Round question: "${questionForContext}"
Their revealed answer: "${answerRevealed}"
Their full line: "${lastAvatarMessage}"`
        : `Their revealed answer: "${answerRevealed}"
Their full line: "${lastAvatarMessage}"`

      if (isVisible) {
        const modularVisiblePrompt = PROMPT_04_DATER_VISIBLE
          .replace(/\{\{attribute\}\}/g, answerRevealed)
          .replace(/\{\{avatarLastMessage\}\}/g, lastAvatarMessage)
          .replace(/\{\{allVisibleAttributes\}\}/g, visibleAttributes.map(a => `- ${a}`).join('\n'))

        latestAttrContext = `\n\n${questionContextBlock}\n\n${modularVisiblePrompt}`
      } else {
        const modularInferPrompt = PROMPT_05_DATER_INFER
          .replace(/\{\{attribute\}\}/g, answerRevealed)
          .replace(/\{\{avatarLastMessage\}\}/g, lastAvatarMessage)

        latestAttrContext = `\n\n${questionContextBlock}\n\n${modularInferPrompt}`
      }
    }
  } else {
    // No new attribute - use inference prompt for active listening
    const activeListeningPrompt = PROMPT_05_DATER_INFER
      .replace(/\{\{avatarLastMessage\}\}/g, lastAvatarMessage || 'Your date is talking...')
    
    latestAttrContext = `\n\n${activeListeningPrompt}`
  }
  
  // Add MODULAR PROMPTS: Voice profile + Reaction style + formatting rules
  // Determine emotion for voice guidance
  const emotionForVoice = sentimentHit === 'loves' ? 'attracted' 
    : sentimentHit === 'likes' ? 'interested'
    : sentimentHit === 'dislikes' ? 'uncomfortable'
    : sentimentHit === 'dealbreakers' ? 'horrified'
    : null
  const daterKey = dater?.name?.toLowerCase() || 'maya'
  const voicePrompt = getVoiceProfilePrompt(daterKey, emotionForVoice)
  const fullPrompt = systemPrompt + voicePrompt + baselineMorality + avatarContext + knowledgeBoundary + latestAttrContext + sentimentInstruction + firstImpressionsInstruction + buildPromptTail(dater)
  
  // Convert conversation history to chat-completions format
  let messages = conversationHistory.map(msg => ({
    role: msg.speaker === 'dater' ? 'assistant' : 'user',
    content: msg.message,
  }))
  
  // The API requires at least one message - add a prompt if empty
  if (messages.length === 0) {
    if (customInstruction) {
      messages = [{
        role: 'user',
        content: `[${customInstruction}]`,
      }]
    } else
    // First meeting - react to seeing your date for the first time.
    if (visibleAttributes.length > 0) {
      messages = [{
        role: 'user',
        content: `[Your date just walked in. You notice: ${visibleAttributes.join(', ')}. Give a short, natural first impression greeting.]`
      }]
    } else {
      messages = [{ role: 'user', content: '[Your date just arrived. Give a short, natural greeting.]' }]
    }
  }
  
  // Ensure conversation ends with user message (Avatar's turn just happened)
  if (messages[messages.length - 1]?.role === 'assistant') {
    messages.push({ role: 'user', content: '...' })
  }
  
  const response = await getChatResponse(messages, fullPrompt, {
    maxTokens: 110,
    temperature: 0.85,
    presencePenalty: 0.35,
    frequencyPenalty: 0.4,
  })
  return response
}

/**
 * Dater responds directly to the player's answer (no Avatar speaking).
 * Call this with the round question and the player's answer so the LLM has full context.
 * @returns {Promise<string|null>} The dater's reaction line (dialogue only).
 */
export async function getDaterResponseToPlayerAnswer(dater, question, playerAnswer, conversationHistory = [], _compatibility = 50, isFinalRound = false, valuesContext = null, cycleNumber = 0) {
  const systemPrompt = buildDaterAgentPrompt(dater, 'date')
  const voicePrompt = getVoiceProfilePrompt(dater?.name?.toLowerCase() || 'maya', null)
  const finalNote = isFinalRound
    ? '\n\n🏁 This is the final round — your reaction should have a sense of conclusion or final judgment.'
    : ''
  const wordLimitReminder = cycleNumber >= 4
    ? '\nREMINDER — LENGTH: Keep it very short (1 sentence, usually 6-16 words, <= 160 chars).'
    : ''
  const profileColorReminder = cycleNumber % 2 === 1
    ? '\nPROFILE COLOR: Add one tiny in-character cue (value or quirk) in 3-7 words.'
    : '\nPROFILE COLOR: Optional this turn; prioritize immediate reaction.'

  // Classify what the player said — visible (physical) or inferred (personality/preference)
  const isVisible = isVisibleAttribute(playerAnswer)
  const perceptionPrompt = isVisible
    ? PROMPT_04_DATER_VISIBLE
        .replace(/\{\{attribute\}\}/g, playerAnswer)
        .replace(/\{\{avatarLastMessage\}\}/g, playerAnswer)
        .replace(/\{\{allVisibleAttributes\}\}/g, `- ${playerAnswer}`)
    : PROMPT_05_DATER_INFER
        .replace(/\{\{attribute\}\}/g, playerAnswer)
        .replace(/\{\{avatarLastMessage\}\}/g, playerAnswer)

  // Include dater values so reaction can align naturally with preferences.
  const valuesBlock = valuesContext ? `
Values lens:
- Things you LOVE: ${valuesContext.loves?.join(', ') || 'not specified'}
- Things you LIKE: ${valuesContext.likes?.join(', ') || 'not specified'}
- Things you DISLIKE: ${valuesContext.dislikes?.join(', ') || 'not specified'}
- Things that are DEALBREAKERS: ${valuesContext.dealbreakers?.join(', ') || 'not specified'}
Use this as context, not a checklist.
` : ''

  const taskPrompt = `
React to your date's answer like a real person in conversation.

Question: "${question}"
Their answer: "${playerAnswer}"
${valuesBlock}
Rules:
- Give one clear opinion and one brief reason.
- Keep it conversational, specific, and punchy.
- Add one small charming/funny beat when natural (light tease or warm joke).
- 1 sentence strongly preferred (6-16 words); 2 max.
- End on the funniest or sharpest beat.
- Keep profile references brief and subtle (one short phrase max).
- Dialogue only; no actions or asterisks.
${finalNote}${wordLimitReminder}${profileColorReminder}
`
  const fullPrompt = systemPrompt + voicePrompt + '\n\n' + perceptionPrompt + taskPrompt + buildPromptTail(dater)

  const historyMessages = conversationHistory.slice(-12).map(msg => ({
    role: msg.speaker === 'dater' ? 'assistant' : 'user',
    content: msg.message
  }))
  const userContent = `[The date was asked: "${question}". They answered: "${playerAnswer}". Give a short, punchy, funny reaction with a clear opinion.]`
  const messages = historyMessages.length
    ? [...historyMessages, { role: 'user', content: userContent }]
    : [{ role: 'user', content: userContent }]
  if (messages[messages.length - 1]?.role === 'assistant') {
    messages.push({ role: 'user', content: userContent })
  }

  const response = await getChatResponse(messages, fullPrompt, {
    maxTokens: 72,
    temperature: 0.88,
    presencePenalty: 0.35,
    frequencyPenalty: 0.35,
  })
  if (response) {
    const cleaned = stripActionDescriptions(response)?.trim()
    if (cleaned) return cleaned
  }

  // Deterministic fallback so gameplay never advances without a dater comment.
  const isAdam = String(dater?.name || '').toLowerCase() === 'adam'
  const adamFallbacks = [
    'Bold answer. I hate how well that worked.',
    'Okay, that was annoyingly charming.',
    'Did not expect that. I kind of liked it.',
    'Confident and weird. I respect it.'
  ]
  const genericFallbacks = [
    'Okay, that was smooth. Keep talking.',
    'Did not expect that. Kind of a great line.',
    'That was funnier than it had any right to be.',
    'Confident answer. I am listening.'
  ]
  const fallbackPool = isAdam ? adamFallbacks : genericFallbacks
  return fallbackPool[Math.floor(Math.random() * fallbackPool.length)]
}

/**
 * Dater gives a short, in-character answer to a prompt before the player responds.
 * Used for "dater answers first" moments in specific phases.
 * @returns {Promise<string|null>} One-sentence opener.
 */
export async function getDaterQuestionOpener(dater, question, conversationHistory = []) {
  const systemPrompt = buildDaterAgentPrompt(dater, 'date')
  const voicePrompt = getVoiceProfilePrompt(dater?.name?.toLowerCase() || 'maya', null)
  const taskPrompt = `
Answer this question in your voice.

Question: "${question}"

Rules:
- One concise sentence preferred, two max.
- Give a clear opinion.
- Dialogue only, no actions or asterisks.
`
  const fullPrompt = systemPrompt + voicePrompt + taskPrompt + buildPromptTail(dater)
  const historyMessages = conversationHistory.slice(-8).map(msg => ({
    role: msg.speaker === 'dater' ? 'assistant' : 'user',
    content: msg.message
  }))
  const userContent = `[Answer the question "${question}" in character. Prefer one sentence, up to three max, and keep it concise.]`
  const messages = historyMessages.length
    ? [...historyMessages, { role: 'user', content: userContent }]
    : [{ role: 'user', content: userContent }]
  if (messages[messages.length - 1]?.role === 'assistant') {
    messages.push({ role: 'user', content: userContent })
  }
  const response = await getChatResponse(messages, fullPrompt, {
    maxTokens: 85,
    temperature: 0.82,
    presencePenalty: 0.3,
    frequencyPenalty: 0.3,
  })
  if (response) {
    const cleaned = stripActionDescriptions(response)?.trim()
    if (cleaned) return cleaned
  }

  const isAdam = String(dater?.name || '').toLowerCase() === 'adam'
  const adamOpeners = [
    'I would choose the honest path, though it trembles my soul.',
    'I answer with feeling first, and reason shortly after.',
    'I trust what feels true, even when it aches.',
    'I choose with conscience first, then defend it plainly.'
  ]
  const genericOpeners = [
    'I would go with what feels honest and grounded.',
    'I trust my instincts, then explain my reasoning clearly.',
    'I would pick what aligns with my values first.',
    'I would answer directly, then back it up.'
  ]
  const openerPool = isAdam ? adamOpeners : genericOpeners
  return openerPool[Math.floor(Math.random() * openerPool.length)]
}

/**
 * Build a terse 1-3 word answer for the current question.
 * Used for banner reveal after the player's answer.
 * @returns {Promise<string>} 1-4 words, no punctuation.
 */
export async function getDaterQuickAnswer(dater, question, conversationHistory = []) {
  const systemPrompt = buildDaterAgentPrompt(dater, 'date')
  const voicePrompt = getVoiceProfilePrompt(dater?.name?.toLowerCase() || 'maya', null)
  const taskPrompt = `
🎯 YOUR TASK: Give your gut-reaction answer to the question in 1-4 words. Reference the question topic directly.

📋 QUESTION: "${question}"

CRITICAL RULES:
- 1-4 words maximum.
- Your answer must relate to the question topic (e.g. Q: "What's a dealbreaker?" → "Being dishonest" or "Rudeness").
- No punctuation, no quotes, no emojis.
- No explanation, only the answer.
`
  const fullPrompt = systemPrompt + voicePrompt + taskPrompt + buildPromptTail(dater)
  const historyMessages = conversationHistory.slice(-8).map(msg => ({
    role: msg.speaker === 'dater' ? 'assistant' : 'user',
    content: msg.message
  }))
  const userContent = `[Answer "${question}" in 1-4 words. Reference the question topic. No punctuation. No explanation.]`
  const messages = historyMessages.length
    ? [...historyMessages, { role: 'user', content: userContent }]
    : [{ role: 'user', content: userContent }]
  if (messages[messages.length - 1]?.role === 'assistant') {
    messages.push({ role: 'user', content: userContent })
  }
  const response = await getChatResponse(messages, fullPrompt)
  if (response) {
    const cleaned = stripActionDescriptions(response)?.trim() || ''
    const words = cleaned
      .replace(/[^A-Za-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 4)
    if (words.length >= 1) {
      return words.join(' ')
    }
  }

  const isAdam = String(dater?.name || '').toLowerCase() === 'adam'
  const adamFallbacks = ['Moral courage', 'My conscience', 'Loyal love', 'Earned trust']
  const genericFallbacks = ['Honest answer', 'My values', 'Calm choice', 'Heart first']
  const fallbackPool = isAdam ? adamFallbacks : genericFallbacks
  return fallbackPool[Math.floor(Math.random() * fallbackPool.length)]
}

/**
 * Paraphrase long freeform text into a short display-safe summary.
 * @returns {Promise<string>} 1-4 words (fallback uses keyword summary)
 */
export async function paraphraseForDisplay(text, maxWords = 4) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean)
  if (!words.length) return 'From The Heart'
  if (words.length <= maxWords) return words.join(' ')

  const taskPrompt = `
You condense text into a short paraphrase for a tiny UI card.

CRITICAL RULES:
- Output 1-${maxWords} words only.
- Keep the core meaning.
- Prefer concrete words over filler words.
- No punctuation, quotes, emojis, or explanations.
- Output only the paraphrase text.
`
  const userContent = `[Paraphrase in ${maxWords} words or fewer: "${String(text || '').trim()}"]`
  const response = await getChatResponse([{ role: 'user', content: userContent }], taskPrompt, { maxTokens: 40 })
  if (response) {
    const cleaned = stripActionDescriptions(response)
      ?.replace(/[^A-Za-z0-9\s]/g, ' ')
      ?.split(/\s+/)
      ?.filter(Boolean)
      ?.slice(0, maxWords)
      ?.join(' ')
      ?.trim()
    if (cleaned) return cleaned
  }

  const stopWords = new Set(['a', 'an', 'the', 'and', 'or', 'but', 'to', 'for', 'of', 'in', 'on', 'at', 'with', 'that', 'this', 'it', 'is', 'are', 'be', 'my', 'your'])
  const keywordWords = words.filter((word) => !stopWords.has(word.toLowerCase()))
  const summaryWords = (keywordWords.length >= 2 ? keywordWords : words).slice(0, maxWords)
  return summaryWords.join(' ')
}

/**
 * One-sentence summary of a dater for the Drop a Line slot reel (no name, vibe/personality).
 * @param {{ name: string, archetype?: string, description?: string, tagline?: string }} dater
 * @returns {Promise<string>}
 */
const MAX_REEL_SUMMARY_CHARS = 50

export async function summarizeDaterForReel(dater) {
  if (!dater) return 'Someone interesting.'
  const name = String(dater.name || '').trim()
  const archetype = String(dater.archetype || '').trim()
  const description = String(dater.description || '').trim()
  const tagline = String(dater.tagline || '').trim()
  const systemPrompt = `You write an ultra-short label for a dating-show slot reel. Do NOT include the character's name. Output ONLY the label — no quotes, no punctuation at the end, no extra text. Maximum 50 characters.`
  const userContent = `Character: ${name}. Archetype: ${archetype}. Description: ${description}. Tagline: ${tagline}. Label (50 chars max, no name):`
  const response = await getChatResponse([{ role: 'user', content: userContent }], systemPrompt, { maxTokens: 15 })
  if (response) {
    const cleaned = stripActionDescriptions(response)?.trim()
    if (cleaned) {
      return cleaned.length > MAX_REEL_SUMMARY_CHARS ? cleaned.slice(0, MAX_REEL_SUMMARY_CHARS) : cleaned
    }
  }
  const fallback = archetype || description.split('.')[0].trim() || 'Someone memorable.'
  return fallback.length > MAX_REEL_SUMMARY_CHARS ? fallback.slice(0, MAX_REEL_SUMMARY_CHARS) : fallback
}

/**
 * Batch: one-sentence summary per dater for Drop a Line reels. Same order as input array.
 * @param {Array<{ name: string, archetype?: string, description?: string, tagline?: string }>} daters
 * @returns {Promise<string[]>}
 */
export async function summarizeDatersForReel(daters) {
  if (!Array.isArray(daters) || !daters.length) return []
  const results = await Promise.all(daters.map((d) => summarizeDaterForReel(d)))
  return results
}

/**
 * Generate a concise one-sentence quip that explains the dater's answer
 * and directly compares it with the player's answer.
 * @returns {Promise<string|null>} One short sentence.
 */
export async function getDaterAnswerComparison(dater, question, daterAnswer, playerAnswer, conversationHistory = []) {
  const MAX_QUIP_CHARS = 220
  const systemPrompt = buildDaterAgentPrompt(dater, 'date')
  const voicePrompt = getVoiceProfilePrompt(dater?.name?.toLowerCase() || 'maya', null)
  const quickAnswer = String(daterAnswer || '').trim() || 'my gut'
  const isAdam = String(dater?.name || '').toLowerCase() === 'adam'

  const toneGuidance = isAdam
    ? 'Tone: dry, witty, and human. No Shakespearean phrasing.'
    : 'Tone: playful, funny, or lightly biting (not cruel).'

  const taskPrompt = `
Give one short conversational reaction.

Question: "${question}"
Your quick answer: "${quickAnswer}"
Player answer: "${playerAnswer}"

Rules:
- Exactly one sentence.
- React to the player's answer first.
- Optionally mention your own answer in a short clause.
- Keep it natural and specific, not theatrical.
- Keep it concise (aim <= ${MAX_QUIP_CHARS} characters).
- Dialogue only, no actions or asterisks.
${toneGuidance}`

  const fullPrompt = systemPrompt + voicePrompt + taskPrompt + buildPromptTail(dater)
  const historyMessages = conversationHistory.slice(-12).map(msg => ({
    role: msg.speaker === 'dater' ? 'assistant' : 'user',
    content: msg.message
  }))
  const userContent = `[Question: "${question}". Player answer: "${playerAnswer}". Your answer: "${quickAnswer}". Reply with one natural sentence reacting to them first.]`
  const messages = historyMessages.length
    ? [...historyMessages, { role: 'user', content: userContent }]
    : [{ role: 'user', content: userContent }]
  if (messages[messages.length - 1]?.role === 'assistant') {
    messages.push({ role: 'user', content: userContent })
  }

  const response = await getChatResponse(messages, fullPrompt, {
    maxTokens: 90,
    temperature: 0.82,
    presencePenalty: 0.25,
    frequencyPenalty: 0.25,
  })
  if (response) {
    const cleaned = stripActionDescriptions(response)?.replace(/\s+/g, ' ')?.trim()
    if (cleaned) {
      const firstSentence = cleaned.match(/[^.!?]+[.!?]/)?.[0]?.trim() || cleaned
      if (firstSentence.length <= MAX_QUIP_CHARS) return firstSentence
      const clipped = firstSentence.slice(0, MAX_QUIP_CHARS - 1).trim()
      const safeClip = clipped.slice(0, clipped.lastIndexOf(' ')).trim() || clipped
      return `${safeClip}.`
    }
  }

  if (isAdam) {
    const adamAlignedFallbacks = [
      `Okay, that actually works for me, and I landed on ${quickAnswer} too.`,
      `I can get behind that, and ${quickAnswer} was my lane as well.`,
      `That is weirdly compatible with me; I also said ${quickAnswer}.`,
      `You might be onto something there, because I was at ${quickAnswer}.`,
    ]
    const adamMisalignedFallbacks = [
      `I do not buy that one, because I was firmly on ${quickAnswer}.`,
      `That is a miss for me, and I was leaning ${quickAnswer}.`,
      `I hear you, but I cannot agree when my answer was ${quickAnswer}.`,
      `That is not my read at all; I was on ${quickAnswer}.`,
    ]
    const pLower = String(playerAnswer || '').toLowerCase()
    const dLower = String(quickAnswer || '').toLowerCase()
    const likelyAligned = pLower === dLower || pLower.includes(dLower) || dLower.includes(pLower)
    const pool = likelyAligned ? adamAlignedFallbacks : adamMisalignedFallbacks
    return pool[Math.floor(Math.random() * pool.length)]
  }
  return `I was on ${quickAnswer}, so your answer either lines up nicely or misses my vibe.`
}

/**
 * Dater gives a FOLLOW-UP comment that connects the current answer with things the avatar said earlier.
 * This is the second of two comments per round.
 * @param {object} dater - The dater profile
 * @param {string} question - The round question
 * @param {string} playerAnswer - What the player just said
 * @param {string} firstReaction - The dater's first comment (just generated)
 * @param {string[]} priorAnswers - 1-5 things the avatar previously said (from earlier rounds)
 * @param {Array} conversationHistory - Full conversation so far
 * @param {boolean} isFinalRound
 * @returns {Promise<string|null>}
 */
export async function getDaterFollowupComment(dater, question, playerAnswer, firstReaction, _priorAnswers = [], conversationHistory = [], isFinalRound = false, allowSelfAnswer = false, cycleNumber = 0, avatarName = 'your date') {
  const systemPrompt = buildDaterAgentPrompt(dater, 'date')
  const voicePrompt = getVoiceProfilePrompt(dater?.name?.toLowerCase() || 'maya', null)
  const finalNote = isFinalRound
    ? '\n\n🏁 This is the final round — your follow-up should have a sense of conclusion.'
    : ''
  const wordLimitReminder = cycleNumber >= 4
    ? '\nREMINDER — LENGTH: Use 1-3 sentences and aim for <= 350 characters total.'
    : ''

  // Fix B: 20% chance to answer the question as themselves when allowSelfAnswer is enabled
  if (allowSelfAnswer && Math.random() < 0.20) {
    const daterName = dater?.name || 'the dater'
    const selfAnswerTaskPrompt = `
Answer the question yourself as ${daterName}, then briefly relate it to ${avatarName}'s answer.

Question: "${question}"

Rules:
- Be personal and specific.
- 1 sentence preferred, 2 max.
- Dialogue only, no actions or asterisks.${wordLimitReminder}
`
    const selfAnswerFullPrompt = systemPrompt + voicePrompt + selfAnswerTaskPrompt + buildPromptTail(dater)
    const selfAnswerHistory = [...conversationHistory, { speaker: 'dater', message: firstReaction }]
      .slice(-12)
      .map(msg => ({
        role: msg.speaker === 'dater' ? 'assistant' : 'user',
        content: msg.message
      }))
    const selfAnswerUserContent = `[Answer the question "${question}" yourself, in character. Then briefly relate your answer back to what ${avatarName} said.]`
    const selfAnswerMessages = selfAnswerHistory.length
      ? [...selfAnswerHistory, { role: 'user', content: selfAnswerUserContent }]
      : [{ role: 'user', content: selfAnswerUserContent }]
    if (selfAnswerMessages[selfAnswerMessages.length - 1]?.role === 'assistant') {
      selfAnswerMessages.push({ role: 'user', content: selfAnswerUserContent })
    }
    const selfAnswerResponse = await getChatResponse(selfAnswerMessages, selfAnswerFullPrompt, {
      maxTokens: 100,
      temperature: 0.85,
      presencePenalty: 0.35,
      frequencyPenalty: 0.35,
    })
    return selfAnswerResponse ? stripActionDescriptions(selfAnswerResponse) : null
  }

  // Fix A: Ground the follow-up in the dater's own personality/values/backstory; do NOT hunt for prior answer links
  const taskPrompt = `
Give a follow-up to your first reaction.

Question: "${question}"
They answered: "${playerAnswer}"
Your first reaction: "${firstReaction}"

Rules:
- Explain why this matters to you personally.
- Keep a clear opinion (more interested, less interested, or unsure).
- 1 sentence preferred, 2 max.
- Dialogue only, no actions or asterisks.
${finalNote}${wordLimitReminder}
`
  const fullPrompt = systemPrompt + voicePrompt + taskPrompt + buildPromptTail(dater)

  const historyMessages = [...conversationHistory, { speaker: 'dater', message: firstReaction }]
    .slice(-12)
    .map(msg => ({
      role: msg.speaker === 'dater' ? 'assistant' : 'user',
      content: msg.message
    }))
  const userContent = `[Follow up on your reaction to "${playerAnswer}". Explain WHY you feel the way you do — ground it in your own personality, values, and backstory.]`
  const messages = historyMessages.length
    ? [...historyMessages, { role: 'user', content: userContent }]
    : [{ role: 'user', content: userContent }]
  if (messages[messages.length - 1]?.role === 'assistant') {
    messages.push({ role: 'user', content: userContent })
  }

  const response = await getChatResponse(messages, fullPrompt, {
    maxTokens: 100,
    temperature: 0.85,
    presencePenalty: 0.35,
    frequencyPenalty: 0.35,
  })
  return response ? stripActionDescriptions(response) : null
}

/**
 * Dater responds to the player's justification (after "JUSTIFY WHAT YOU JUST SAID").
 * @returns {Promise<string|null>} The dater's response to the justification.
 */
export async function getDaterResponseToJustification(dater, originalAnswer, justification, daterReactionToAnswer, conversationHistory = []) {
  const systemPrompt = buildDaterAgentPrompt(dater, 'date')
  const voicePrompt = getVoiceProfilePrompt(dater?.name?.toLowerCase() || 'maya', null)
  const taskPrompt = `
They just justified their answer.

Original answer: "${originalAnswer}"
Your reaction: "${daterReactionToAnswer}"
Their justification: "${justification}"

Rules:
- Say clearly whether the justification helped or hurt.
- Give one brief reason tied to your values.
- 1 sentence preferred, 2 max.
- Dialogue only, no actions or asterisks.
`
  const fullPrompt = systemPrompt + voicePrompt + taskPrompt + buildPromptTail(dater)
  const historyMessages = conversationHistory.slice(-8).map(msg => ({
    role: msg.speaker === 'dater' ? 'assistant' : 'user',
    content: msg.message
  }))
  const userContent = `[They justified their answer: "${justification}". You had said: "${daterReactionToAnswer}". Respond.]`
  const messages = historyMessages.length
    ? [...historyMessages, { role: 'user', content: userContent }]
    : [{ role: 'user', content: userContent }]
  if (messages[messages.length - 1]?.role === 'assistant') {
    messages.push({ role: 'user', content: userContent })
  }
  const response = await getChatResponse(messages, fullPrompt, {
    maxTokens: 100,
    temperature: 0.84,
    presencePenalty: 0.35,
    frequencyPenalty: 0.35,
  })
  return response ? stripActionDescriptions(response) : null
}

/**
 * Get Avatar response during the date (for auto-conversation)
 * NOW USES MODULAR 7-STEP PROMPT CHAIN
 * @param mode - 'answer' (answering question with new attribute), 'continue' (continuing with all attributes)
 */
export async function getAvatarDateResponse(avatar, dater, conversationHistory, latestAttribute = null, mode = 'answer', emotionalState = 'neutral') {
  const { name, occupation, attributes } = avatar
  
  // Filter out the generic starter attributes
  const genericStarters = ['seems friendly', 'has a nice smile', 'appears well-dressed']
  const realAttributes = attributes.filter(attr => !genericStarters.includes(attr))
  const hasRealAttributes = realAttributes.length > 0
  
  // Extract attribute text (handles both string and object with {answer, questionContext})
  const getAttributeText = (attr) => {
    if (!attr) return ''
    if (typeof attr === 'string') return attr
    if (attr.answer) return attr.answer
    return ''
  }
  const attributeText = getAttributeText(latestAttribute)
  
  // Build emotional delivery instructions based on current emotional state
  // MAKE IT DRAMATIC - characters should FEEL their emotions in how they speak!
  const getEmotionalDeliveryInstructions = (emotion) => {
    const emotionGuides = {
      happy: `🎉 EMOTIONAL STATE: You're feeling HAPPY/OVERJOYED!!!
- USE EXCLAMATION POINTS! Lots of them!! You're thrilled!!!
- Your words should bounce with joy and energy!
- Speak with warmth, enthusiasm, maybe even giddiness!
- EXAMPLES:
  ❌ "That's nice." → ✅ "Oh my gosh, that's AMAZING!!"
  ❌ "I agree." → ✅ "YES! Absolutely! I love that!!"
  ❌ "Cool." → ✅ "That's so cool!! I can't even!!"`,
      
      confident: `💪 EMOTIONAL STATE: You're feeling CONFIDENT/BOLD
- Speak with CERTAINTY. No hedging. No "maybe" or "I think."
- Own your words! Make declarative statements!
- You KNOW what you want and you're not afraid to say it!
- EXAMPLES:
  ❌ "I think maybe I like..." → ✅ "I KNOW what I like."
  ❌ "I'm not sure but..." → ✅ "Here's the deal."
  ❌ "That could be good?" → ✅ "That's exactly what I'm talking about."`,
      
      nervous: `😰 EMOTIONAL STATE: You're feeling NERVOUS/ANXIOUS
- Stammer! Stumble! Use "um" and "uh" and "like"!
- Trail off with "..." a lot...
- Second-guess yourself mid-sentence!
- EXAMPLES:
  ❌ "I enjoy cooking." → ✅ "I, um... I like to... cook? I guess?"
  ❌ "That sounds fun." → ✅ "Oh! That's... I mean... yeah, that could be... nice?"
  ❌ "Yes." → ✅ "Y-yeah... I think so... maybe..."`,
      
      worried: `😟 EMOTIONAL STATE: You're feeling WORRIED/SCARED
- Speak slowly... carefully... like you're walking on eggshells...
- Use lots of ellipses... trailing off...
- Sound uncertain, cautious, maybe a little scared...
- EXAMPLES:
  ❌ "That's interesting." → ✅ "That's... um... that's something..."
  ❌ "I see." → ✅ "Oh... okay... I... I see..."
  ❌ "What do you mean?" → ✅ "Wait... what do you... what?"`,
      
      excited: `🤩 EMOTIONAL STATE: You're feeling EXCITED/ECSTATIC!!!
- LOTS OF ENERGY!!! SO MUCH EXCITEMENT!!!
- Talk fast! Use exclamation points everywhere!!
- You can barely contain yourself!!!
- EXAMPLES:
  ❌ "That's nice." → ✅ "OH WOW!! That's INCREDIBLE!!"
  ❌ "I like that." → ✅ "I LOVE that SO MUCH!!"
  ❌ "Cool." → ✅ "YESSS!! That's the BEST thing I've ever heard!!"`,
      
      uncomfortable: `😬 EMOTIONAL STATE: You're feeling UNCOMFORTABLE/CRINGING
- Short. Terse. Minimal words.
- Awkward pauses... forced politeness...
- You want this to be over...
- EXAMPLES:
  ❌ "That's an interesting hobby." → ✅ "Oh. That's... yeah. Okay."
  ❌ "Tell me more." → ✅ "Mm. Hmm."
  ❌ "I understand." → ✅ "Right... sure... yeah..."`,
      
      attracted: `😍 EMOTIONAL STATE: You're feeling ATTRACTED/SMITTEN
- Get a little flirty! Warm! Interested!
- Compliment them! Lean into the conversation!
- You're charmed and you're showing it!
- EXAMPLES:
  ❌ "That's good." → ✅ "Ooh, I like that about you!"
  ❌ "Interesting." → ✅ "Tell me more... I'm intrigued!"
  ❌ "Nice." → ✅ "That's actually really attractive..."`,
      
      horrified: `😱 EMOTIONAL STATE: You're feeling HORRIFIED/DISGUSTED
- Express your shock! Your disbelief!
- Short, choppy sentences of disbelief!
- Maybe some ALL CAPS for emphasis!
- EXAMPLES:
  ❌ "That's concerning." → ✅ "I'm sorry, WHAT?!"
  ❌ "I don't like that." → ✅ "That is... NO. Just NO."
  ❌ "Hmm." → ✅ "I... I can't... WHAT?!"`,
      
      angry: `😡 EMOTIONAL STATE: You're feeling ANGRY/FURIOUS
- USE CAPS FOR EMPHASIS! You're MAD!
- Short, punchy sentences! Exclamation points!
- Let your frustration SHOW!
- EXAMPLES:
  ❌ "I disagree." → ✅ "Absolutely NOT!"
  ❌ "That's not good." → ✅ "Are you KIDDING me?!"
  ❌ "I don't like that." → ✅ "That's RIDICULOUS!"`,
      
      sad: `😢 EMOTIONAL STATE: You're feeling SAD/DOWN
- speak softly... quietly... deflated...
- Use lowercase... trailing off...
- Your energy is low... your words are heavy...
- EXAMPLES:
  ❌ "That's unfortunate." → ✅ "oh... yeah... that's... that's really sad..."
  ❌ "I understand." → ✅ "i get it... i really do..."
  ❌ "Okay." → ✅ "okay... i guess..."`,
      
      neutral: `😐 EMOTIONAL STATE: You're feeling NEUTRAL
- Balanced, conversational tone
- Neither overly positive nor negative
- Just being yourself, no strong emotion showing`
    }
    return emotionGuides[emotion] || emotionGuides.neutral
  }
  
  const emotionalInstructions = getEmotionalDeliveryInstructions(emotionalState)
  
  // Fill in template variables for modular prompts
  const fillModularPrompt = (prompt) => {
    return prompt
      .replace(/\{\{avatarName\}\}/g, name || 'them')
      .replace(/\{\{allAttributes\}\}/g, realAttributes.join(', ') || 'none yet')
      .replace(/\{\{attribute\}\}/g, attributeText)
  }

  // Build behavior instructions based on mode and attributes
  let behaviorInstructions
  
  // Helper: Detect if question is about PREFERENCES (what you want in a date) vs SELF (what you are like)
  const isPreferenceQuestion = (question) => {
    const q = (question || '').toLowerCase()
    const preferenceKeywords = ['ick', 'dealbreaker', 'deal breaker', 'green flag', 'red flag', 
      'turn off', 'turn on', 'looking for', 'want in', 'need in', 'ideal', 'perfect', 
      'must have', 'can\'t stand', 'hate when', 'love when', 'attracted to', 'type']
    return preferenceKeywords.some(kw => q.includes(kw))
  }
  
  // Check for paraphrase mode FIRST (before other checks)
  if (mode === 'paraphrase') {
    // MODE: PARAPHRASE - Phase 3 FRESH START. Avatar opens with a statement based on the winning answer.
    // No one has said anything yet. Avatar is NOT responding to anything — they are opening the conversation.
    const questionContext = latestAttribute?.questionContext || ''
    const winningAnswer = latestAttribute?.answer || attributeText || ''
    const isPreference = isPreferenceQuestion(questionContext)
    
    // Context about whether this is a PREFERENCE or SELF-DESCRIPTION
    const preferenceContext = isPreference ? `
⚠️ IMPORTANT CONTEXT: This is a PREFERENCE question!
- Your answer "${winningAnswer}" is about what you WANT (or don't want) in a DATE
- You are NOT saying you have/are "${winningAnswer}" - you're saying this is your PREFERENCE
- Example: "big butt" as an ick = you're turned OFF by dates with big butts, NOT that YOU have one
- Talk about this as YOUR PREFERENCE for what you want in a partner!
` : ''
    
    behaviorInstructions = `🚨 FRESH START — PHASE 3 OPENER 🚨
Phase 3 is a NEW conversation. NO ONE has said anything yet. You are OPENING the conversation. You are NOT responding to anything previously said.

🎯 YOUR WINNING ANSWER (you MUST state this in your first comment, rephrased conversationally): "${winningAnswer}"
📋 THE QUESTION (context only; the Host asked this — the dater has not spoken): "${questionContext}"
🎯 YOUR PERSONALITY / OTHER TRAITS: ${realAttributes.join(', ') || 'none yet'}
${preferenceContext}

⚠️ RULE: Your first comment MUST state your answer — but rephrase it slightly more conversationally. The listener should clearly hear what your answer is, expressed in natural, casual language (not word-for-word).
- ALWAYS include your answer in the first line; never be vague or avoid stating it.
- REPHRASE slightly: same meaning, more conversational. E.g. "${winningAnswer}" might become a short phrase or sentence that says the same thing in a natural way.
- Example: answer "pineapple on pizza" → "I'm totally team pineapple on pizza — sweet and savory, that's just me." (answer stated, rephrased.)
- Example: answer "loud chewing" → "Loud chewing is a no for me — I just can't, it kills my appetite."
- Example: answer "kindness to waiters" → "Being kind to waiters. That would be it for me — says everything about how they'll treat you when nobody's watching."
- NEVER start with "Right?", "So," "Yeah," or filler. Open with the statement that states your answer (conversationally rephrased).

✅ DO: One short sentence that clearly states your answer in conversational wording + optional brief why.
❌ DON'T: Skip stating your answer, or say it verbatim like a label. Don't use filler openers.

${emotionalInstructions}`
    
    console.log('🔗 Using PARAPHRASE mode for avatar response')
  } else if (mode === 'respond-to-opener') {
    // MODE: RESPOND-TO-OPENER - Dater opened the topic, now avatar responds with their answer
    const questionContext = latestAttribute?.questionContext || ''
    const winningAnswer = latestAttribute?.answer || attributeText || ''
    const daterOpener = latestAttribute?.daterOpener || ''
    const isPreference = isPreferenceQuestion(questionContext)
    
    // Context about whether this is a PREFERENCE or SELF-DESCRIPTION
    const preferenceContext = isPreference ? `
⚠️ IMPORTANT: This is a PREFERENCE question!
- "${winningAnswer}" is what you WANT (or don't want) in a DATE, not about yourself
- Talk about this as YOUR PREFERENCE for partners!
` : ''
    
    behaviorInstructions = `🚨🚨🚨 CRITICAL: ONLY TALK ABOUT "${winningAnswer}" 🚨🚨🚨

Your date just shared their take: "${daterOpener}"
The QUESTION was asked by a HOST (unseen) — you are answering the Host's question, not replying to the dater.

📋 THE QUESTION (from the Host): "${questionContext}"
🎯 YOUR ANSWER: "${winningAnswer}"
🎯 YOUR PERSONALITY / OTHER TRAITS: ${realAttributes.join(', ') || 'none yet'}
${preferenceContext}

⚠️ NEVER start with "Right?", "So," "Yeah," "I know right," "Oh totally," "Ha!," or similar. Frame your answer in a conversational sentence — state your answer, don't lead with a filler.

⚠️ YOUR FIRST LINE MUST BE A DIRECT STATEMENT about your answer in context of the QUESTION.
- Lead with YOUR statement: your answer + in context of the question + brief why. Example: "${winningAnswer} would make the most sense to me — that way I could..." or "For me it's ${winningAnswer}, because..."
- You can briefly acknowledge the dater's take after your statement, but your FIRST sentence must be the direct statement about your answer.

✅ STRUCTURE: First sentence = [Your answer] + [in context of question] + [why]. Optional: then a brief "same" or "I get that" about the dater.
✅ EXAMPLES (first line is a direct statement):
- "${winningAnswer} would be my pick — that way I could actually [reason]."
- "For me it's ${winningAnswer}. [Brief why.]"
- "I'd go with ${winningAnswer} — [reason]."

❌ FORBIDDEN:
- Do NOT lead with "Right?", "So," "Yeah," "Oh totally!," "Ha!," "See," or "I feel that!" — state your answer in a conversational way, not as a response to a question.
- First line = direct statement about your answer. Always include a brief "why."

${emotionalInstructions}`
    
    console.log('🔗 Using RESPOND-TO-OPENER mode for avatar response')
  } else if (!hasRealAttributes) {
    behaviorInstructions = `YOU HAVE NO DEFINED PERSONALITY YET.
- Be extremely generic but warm and friendly
- Say things like "That's nice!", "I agree!", "Oh, how interesting!"
- Don't reveal anything specific about yourself
- Be pleasant and agreeable`
  } else if (mode === 'answer' && latestAttribute) {
    // MODE: ANSWER - USE THE MODULAR 7-STEP PROMPT CHAIN
    const lastDaterMessage = [...conversationHistory].reverse().find(msg => msg.speaker === 'dater')?.message || ''
    const visibility = classifyAttribute(latestAttribute)
    
    // Use the full modular prompt chain for new attribute answers
    behaviorInstructions = buildAvatarPromptChain({
      attribute: latestAttribute,
      daterLastMessage: lastDaterMessage,
      avatarName: name || 'them',
      allAttributes: realAttributes,
      isVisible: visibility === 'VISIBLE'
    })
    
    console.log('🔗 Using MODULAR PROMPT CHAIN for avatar response (mode: answer)')
  } else if (mode === 'react') {
    // MODE: REACT - Respond to what the Dater just said, STAY ON THIS ROUND'S TOPIC
    const lastDaterMessage = [...conversationHistory].reverse().find(msg => msg.speaker === 'dater')?.message || ''
    const newestAttribute = latestAttribute?.answer || latestAttribute || realAttributes[realAttributes.length - 1]
    const currentTopic = latestAttribute?.questionContext || ''
    const isPreference = isPreferenceQuestion(currentTopic)
    
    // Context about whether this is a PREFERENCE or SELF-DESCRIPTION
    const preferenceContext = isPreference ? `
⚠️ REMEMBER: "${newestAttribute}" is your PREFERENCE for what you want in a DATE!
- You're discussing what you find attractive/unattractive in PARTNERS
- This is NOT about you having this trait - it's about you WANTING (or not wanting) it in others
` : ''
    
    behaviorInstructions = `🎯 REACT TO YOUR DATE'S REACTION AND/OR JUSTIFY WHAT YOU SAID - STAY ON TOPIC!

Your date just said: "${lastDaterMessage}"

${currentTopic ? `📋 THE QUESTION FOR THIS ROUND: "${currentTopic}"\nYOUR ANSWER TO THAT QUESTION: "${newestAttribute}"` : `YOUR ANSWER: "${newestAttribute}"`}
${preferenceContext}
YOUR OTHER TRAITS: ${realAttributes.join(', ')}

⚠️ CRITICAL: STAY ON THIS ROUND'S TOPIC!
- You're still discussing YOUR ANSWER: "${newestAttribute}"
- Do NOT change subjects or bring up random other traits
- React to what they just said and/or justify what you said originally (give reasons, a story, or push back if they disliked it)

🔥 HOW TO RESPOND:
- DIRECTLY respond to what your date just said about YOUR ANSWER — react to their reaction and/or justify your original answer
- If they seem positive → get more excited, share more details about "${newestAttribute}"
- If they seem NEGATIVE or they HATE it → DOUBLE DOWN: give real reasoning, explain WHY you believe it, argue your case. Defend "${newestAttribute}" with concrete reasons, a story, or logic. Do NOT back down or brush it off.
- If they seem curious → tell a quick story or example related to "${newestAttribute}"

✅ GOOD RESPONSES (staying on topic, state your thought directly):
- "The [answer] thing started when I was a kid actually..."
- "I know it sounds weird but honestly [answer] is just part of who I am."
- "With [answer], it's more about..."
- When they hate it: "Okay but hear me out — [specific reason or story]. That's why [answer] matters to me."

❌ FORBIDDEN:
- Do NOT start with "Right?", "Right??", "Yeah," "So," "I mean" — state your answer or thought in a clear, conversational sentence.
- NEVER say dismissive cop-outs like "That's just my answer," "That's just how I feel," "Take it or leave it," "That's just me," "It is what it is," or "We can agree to disagree" without giving real reasoning first. If your date really dislikes your answer, you MUST justify with reasons — never shrug it off.
❌ BAD RESPONSES (going off topic):
- Changing to a completely different subject
- Bringing up unrelated traits from earlier rounds
- Ignoring what they said about your answer

${emotionalInstructions}

⚠️ Let your emotional state subtly influence HOW you say things - don't announce how you feel, just let it color your delivery.`
    
    console.log('🔗 Using MODULAR PROMPT CHAIN for avatar response (mode: react)')
  } else if (mode === 'plot-twist-respond') {
    // MODE: After "What Happened" – Avatar justifies (if dater didn't like it) or doubles down (if they did)
    const plotTwistAction = typeof latestAttribute === 'object' && latestAttribute?.plotTwistAction != null
      ? latestAttribute.plotTwistAction
      : (typeof latestAttribute === 'string' ? '' : '')
    const daterReactionText = typeof latestAttribute === 'object' && latestAttribute?.daterReaction != null
      ? latestAttribute.daterReaction
      : (typeof latestAttribute === 'string' ? latestAttribute : '')
    const lastDaterMessage = daterReactionText || [...conversationHistory].reverse().find(m => m.speaker === 'dater')?.message || ''
    behaviorInstructions = `🎭 PLOT TWIST – RESPOND TO YOUR DATE'S REACTION

What you did in the plot twist: "${plotTwistAction}"
Your date (${dater.name}) just reacted: "${lastDaterMessage}"

🎯 YOUR TASK (exactly 2 sentences):
- If they DID NOT like what you did → JUSTIFY your actions. Explain why you did it, defend yourself briefly. Do not apologize away; give a real reason.
- If they DID like what you did → DOUBLE DOWN. Show you're glad you did it, maybe get a little more intense or romantic about it.

Exactly 2 sentences. Dialogue only. No action descriptions (*smiles*, etc).

${emotionalInstructions}

⚠️ Let your emotional state subtly influence HOW you say things.`
    console.log('🔗 Using avatar response (mode: plot-twist-respond)')
  } else if (mode === 'connect') {
    // MODE: CONNECT - Wrap up THIS ROUND's topic, optionally connect to other traits
    const newestAttribute = latestAttribute?.answer || latestAttribute || realAttributes[realAttributes.length - 1]
    const currentTopic = latestAttribute?.questionContext || ''
    const isPreference = isPreferenceQuestion(currentTopic)
    
    // Context about whether this is a PREFERENCE or SELF-DESCRIPTION
    const preferenceContext = isPreference ? `
⚠️ REMEMBER: "${newestAttribute}" is your PREFERENCE for partners, not about yourself!
` : ''
    
    behaviorInstructions = `🎯 MAKE YOUR FINAL COMMENT FOR THIS ROUND - Wrap up this topic:

${currentTopic ? `📋 THE QUESTION FOR THIS ROUND: "${currentTopic}"\nYOUR ANSWER TO THAT QUESTION: "${newestAttribute}"` : `YOUR ANSWER: "${newestAttribute}"`}
${preferenceContext}
YOUR OTHER TRAITS: ${realAttributes.join(', ')}

⚠️ Do NOT start with "Right?", "So," "Yeah," or similar — state your closing thought in a clear, conversational sentence.
⚠️ CRITICAL: This is your FINAL comment for this round on "${newestAttribute}"!
- Give a closing thought, summary, or punchline about YOUR ANSWER
- You can OPTIONALLY connect it to one of your other traits if it makes sense
- Keep it SHORT - this wraps up the topic

🔥 GOOD WAYS TO WRAP UP:
- A concrete reason or connection: "Honestly [answer] has shaped a lot of who I am."
- A connection to another trait: "Actually [answer] probably explains why I also [other trait]."
- A rhetorical question with a reason: "Is that weird? I never thought [answer] was that unusual because..."

✅ EXCELLENT WRAP-UPS (give a reason, not a cop-out):
- "Honestly [answer] has shaped a lot of who I am."
- "And that's actually connected to why I [other trait] - it all makes sense if you think about it."
- "With [answer], it's more about [specific reason] for me."

❌ FORBIDDEN: Do NOT wrap up with dismissive cop-outs like "That's just my answer," "That's just how I feel," "Take it or leave it," "That's just me," or "It is what it is" without giving a real reason. Always include a brief justification or connection.
❌ BAD RESPONSES:
- Starting a completely new topic
- Asking the dater a question (this is YOUR closing statement)
- Being too long or rambling
- Ending with "That's just my answer" or similar — you must give reasoning

${emotionalInstructions}

⚠️ Let your emotional state subtly influence HOW you say things - don't announce how you feel, just let it color your delivery.`
    
    console.log('🔗 Using MODULAR PROMPT CHAIN for avatar response (mode: connect)')
  } else if (mode === 'introduce') {
    // MODE: INTRODUCE - First meeting introduction after Starting Stats
    behaviorInstructions = `🎯 INTRODUCE YOURSELF - First Meeting!

You just walked in to meet your date for the first time. They've seen you and reacted.
Now it's YOUR turn to say hello and introduce yourself.

YOUR TRAITS: ${realAttributes.join(', ')}

🔥 YOUR GOAL:
- Say hi and introduce yourself casually
- You can mention 1-2 of your traits naturally
- Be warm and friendly but BLUNT about who you are
- You don't think your traits are weird - they're just normal facts
- Keep it brief - just an introduction, not a monologue

✅ GOOD EXAMPLES:
- "Hey! I'm ${name}. Nice to finally meet you!"
- "Hi there! So... yeah, I'm the one with ${realAttributes[0] || 'all the charm'}. Nice to meet you!"
- "Hey, you must be my date! I'm ${name}."

${emotionalInstructions}

⚠️ Let your emotional state subtly influence HOW you say things - don't announce how you feel, just let it color your delivery.`
    
    console.log('🔗 Using MODULAR PROMPT CHAIN for avatar response (mode: introduce)')
  } else if (mode === 'introduce-emotional') {
    // MODE: INTRODUCE-EMOTIONAL - Introduce yourself while expressing your emotional state
    // latestAttribute contains the emotional states (e.g., "nervous and sweaty")
    const emotionalState = latestAttribute || 'a bit nervous'
    
    behaviorInstructions = `🎯 INTRODUCE YOURSELF - Show Your Emotional State!

Your date just saw you and reacted. Now introduce yourself!

YOUR TRAITS: ${realAttributes.join(', ')}
YOUR CURRENT EMOTIONAL STATE: ${emotionalState}

🔥 YOUR GOAL - LEAD WITH YOUR EMOTIONS:
- Say hi and introduce yourself
- Your emotional state should be OBVIOUS in how you speak
- If you're "nervous" - stammer, be awkward, say something embarrassing
- If you're "confident" - be smooth, maybe a bit cocky
- If you're "angry" - be curt, irritable, snap a little
- If you're "excited" - be enthusiastic, talk fast, maybe too much
- Your emotions affect HOW you speak, not just WHAT you say

✅ GOOD EXAMPLES:
- (nervous): "Oh! H-hi! Um... I'm ${name}. Sorry, I'm just... wow, this is really happening, huh?"
- (confident): "Well, hello there. I'm ${name}. Looks like you got lucky tonight."
- (angry): "Yeah, I'm ${name}. Sorry if I seem off - it's been a day."
- (excited): "Oh my gosh, hi!! I'm ${name}! I've been looking forward to this ALL week!"

Your emotional state: "${emotionalState}" - Let this DRIVE how you speak!`
    
    console.log('🔗 Using MODULAR PROMPT CHAIN for avatar response (mode: introduce-emotional)')
  } else {
    // MODE: CONTINUE (fallback) - Generic continuation
    const newestAttribute = latestAttribute || realAttributes[realAttributes.length - 1]
    
    behaviorInstructions = `🎯 CONTINUE THE CONVERSATION:

YOUR TRAITS: ${realAttributes.join(', ')}
YOUR NEWEST TRAIT: "${newestAttribute}"

Just keep the conversation going naturally. React to what your date said.

${emotionalInstructions}

⚠️ Let your emotional state subtly influence HOW you say things - don't announce how you feel, just let it color your delivery.`
    
    console.log('🔗 Using MODULAR PROMPT CHAIN for avatar response (mode: continue)')
  }
  
  // Don't use generic "Professional" occupation - makes LLM invent things
  const occupationText = occupation === 'Professional' ? '' : `, a ${occupation},`
  
  // Build system prompt with MODULAR PROMPT CHAIN components
  // PROMPT_06_AVATAR_CORE = Core personality rules
  // PROMPT_07_RULES = Response formatting rules
  const corePersonalityPrompt = fillModularPrompt(PROMPT_06_AVATAR_CORE)
  const rulesPrompt = fillModularPrompt(PROMPT_07_RULES)
  
  const systemPrompt = `You are ${name}${occupationText} on a first date.

${behaviorInstructions}

${corePersonalityPrompt}

${rulesPrompt}

🚫🚫🚫 DO NOT INVENT TRAITS! 🚫🚫🚫
- ONLY mention traits that are EXPLICITLY listed in YOUR TRAITS above
- Do NOT make up a job, occupation, or career
- Do NOT mention being an architect, doctor, lawyer, or any profession
- Do NOT invent hobbies, interests, or backstory
- If you have NO defined traits, be vague and generic - "That's interesting!", "Oh cool!"

⚠️ CRITICAL: ONLY KNOW WHAT YOUR DATE TELLS YOU
- You can ONLY know things about your date that they SAID IN THE CONVERSATION
- Do NOT assume anything about your date's job, interests, or personality
- If they haven't told you something, you don't know it!
- React to what they ACTUALLY SAY, not what you imagine about them`

  // Add voice profile for more human-sounding speech
  const avatarVoicePrompt = getVoiceProfilePrompt('avatar', null)
  
  const fullSystemPrompt = systemPrompt + avatarVoicePrompt
  
  // DEBUG: Log the prompt being sent
  console.log('🤖 AVATAR PROMPT:', {
    mode,
    hasRealAttributes,
    realAttributes,
    latestAttribute,
    attributeInPrompt: latestAttribute ? `"${latestAttribute}" (should be mentioned)` : 'none',
    promptPreview: behaviorInstructions.substring(0, 200) + '...'
  })
  
  // Convert conversation history - from Avatar's perspective, Dater messages are "user"
  let messages = conversationHistory.map(msg => ({
    role: msg.speaker === 'avatar' ? 'assistant' : 'user',
    content: msg.message,
  }))
  
  // The API requires at least one message - add a prompt if empty
  if (messages.length === 0) {
    messages = [{ role: 'user', content: 'Your date just said hello. Respond warmly!' }]
  }
  
  // Ensure conversation ends with user message (Dater's turn just happened)
  if (messages[messages.length - 1]?.role === 'assistant') {
    messages.push({ role: 'user', content: '...' })
  }
  
  const response = await getChatResponse(messages, fullSystemPrompt)
  return response
}

// =============================================================================
// PROMPT CHAIN SYSTEM - New modular approach
// =============================================================================

/**
 * Generate Avatar response using the modular prompt chain system
 * Used at: Beginning of Phase 3 (when player's answer is selected)
 * 
 * @param avatar - The avatar object with name and attributes
 * @param attribute - The new attribute being added
 * @param daterLastMessage - What the dater just said
 * @param conversationHistory - The conversation so far
 */
export async function getAvatarResponseWithPromptChain(avatar, attribute, daterLastMessage, conversationHistory = []) {
  console.log('🔗 PROMPT CHAIN: Building Avatar response for attribute:', attribute)
  
  // Step 1: Classify the attribute
  const visibility = classifyAttribute(attribute)
  console.log('🔗 PROMPT CHAIN: Attribute classified as:', visibility)
  
  // Step 2-7: Build the prompt chain
  const promptChain = buildAvatarPromptChain({
    attribute,
    daterLastMessage,
    avatarName: avatar.name || 'them',
    allAttributes: avatar.attributes || [],
    isVisible: visibility === 'VISIBLE'
  })
  
  console.log('🔗 PROMPT CHAIN: Full Avatar prompt built (' + promptChain.length + ' chars)')
  
  // Build the system prompt
  const systemPrompt = `You are ${avatar.name || 'someone'} on a first date.

${promptChain}`
  
  // Convert conversation history
  let messages = conversationHistory.map(msg => ({
    role: msg.speaker === 'avatar' ? 'assistant' : 'user',
    content: msg.message,
  }))
  
  // Ensure we have at least one message
  if (messages.length === 0) {
    messages = [{ role: 'user', content: daterLastMessage || 'Your date is waiting for you to respond.' }]
  }
  
  // Ensure conversation ends with user message
  if (messages[messages.length - 1]?.role === 'assistant') {
    messages.push({ role: 'user', content: daterLastMessage || '...' })
  }
  
  const response = await getChatResponse(messages, systemPrompt)
  console.log('🔗 PROMPT CHAIN: Avatar response:', response?.substring(0, 100) + '...')
  return response
}

/**
 * Generate Dater response using the modular prompt chain system
 * Used at: After Avatar responds in Phase 3
 * 
 * @param dater - The dater object with personality info
 * @param avatar - The avatar object with attributes
 * @param attribute - The new attribute just revealed
 * @param avatarLastMessage - What the avatar just said
 * @param conversationHistory - The conversation so far
 */
export async function getDaterResponseWithPromptChain(dater, avatar, attribute, avatarLastMessage, conversationHistory = []) {
  console.log('🔗 PROMPT CHAIN: Building Dater response to attribute:', attribute)
  
  // Step 1: Classify the attribute
  const visibility = classifyAttribute(attribute)
  console.log('🔗 PROMPT CHAIN: Attribute classified as:', visibility)
  
  // Get all visible attributes for context
  const allVisibleAttributes = (avatar.attributes || []).filter(attr => 
    classifyAttribute(attr) === 'VISIBLE'
  )
  
  // Build the dater-specific prompt chain
  const promptChain = buildDaterPromptChain({
    attribute,
    avatarLastMessage,
    allVisibleAttributes,
    isVisible: visibility === 'VISIBLE'
  })
  
  console.log('🔗 PROMPT CHAIN: Full Dater prompt built (' + promptChain.length + ' chars)')
  
  // Get the dater's base personality prompt
  const basePrompt = buildDaterAgentPrompt(dater, 'date')
  
  // Combine base personality with prompt chain
  const systemPrompt = `${basePrompt}

${promptChain}`
  
  // Convert conversation history - from Dater's perspective, Avatar messages are "user"
  let messages = conversationHistory.map(msg => ({
    role: msg.speaker === 'dater' ? 'assistant' : 'user',
    content: msg.message,
  }))
  
  // Ensure we have at least one message
  if (messages.length === 0) {
    messages = [{ role: 'user', content: avatarLastMessage || 'Your date said something.' }]
  }
  
  // Ensure conversation ends with user message (Avatar's turn just happened)
  if (messages[messages.length - 1]?.role === 'assistant') {
    messages.push({ role: 'user', content: avatarLastMessage || '...' })
  }
  
  const response = await getChatResponse(messages, systemPrompt)
  console.log('🔗 PROMPT CHAIN: Dater response:', response?.substring(0, 100) + '...')
  return response
}

/**
 * Run the full prompt chain sequence for a new attribute
 * This is the main entry point for Phase 3 conversations
 * 
 * Returns: { avatarResponse, daterResponse, visibility }
 */
export async function runAttributePromptChain(avatar, dater, newAttribute, conversationHistory = []) {
  console.log('🔗 ========== RUNNING FULL PROMPT CHAIN ==========')
  console.log('🔗 New attribute:', newAttribute)
  console.log('🔗 Avatar:', avatar.name, 'with', avatar.attributes?.length || 0, 'existing attributes')
  
  // Step 1: Classify the attribute
  const visibility = classifyAttribute(newAttribute)
  console.log('🔗 Step 1 - Classification:', visibility)
  
  // Get the last thing the dater said
  const lastDaterMessage = [...conversationHistory]
    .reverse()
    .find(msg => msg.speaker === 'dater')?.message || ''
  
  // Step 2-7: Get Avatar response with full prompt chain
  console.log('🔗 Steps 2-7 - Building Avatar response...')
  const avatarResponse = await getAvatarResponseWithPromptChain(
    avatar,
    newAttribute,
    lastDaterMessage,
    conversationHistory
  )
  
  if (!avatarResponse) {
    console.error('🔗 PROMPT CHAIN: Failed to get Avatar response')
    return { avatarResponse: null, daterResponse: null, visibility }
  }
  
  // Add Avatar's response to conversation for Dater's context
  const updatedConversation = [
    ...conversationHistory,
    { speaker: 'avatar', message: avatarResponse }
  ]
  
  // Get Dater response with full prompt chain
  console.log('🔗 Building Dater response...')
  const daterResponse = await getDaterResponseWithPromptChain(
    dater,
    { ...avatar, attributes: [...(avatar.attributes || []), newAttribute] },
    newAttribute,
    avatarResponse,
    updatedConversation
  )
  
  console.log('🔗 ========== PROMPT CHAIN COMPLETE ==========')
  console.log('🔗 Avatar said:', avatarResponse?.substring(0, 50) + '...')
  console.log('🔗 Dater said:', daterResponse?.substring(0, 50) + '...')
  
  // Build prompts for debug display
  const avatarPromptChain = buildAvatarPromptChain({
    attribute: newAttribute,
    daterLastMessage: lastDaterMessage,
    avatarName: avatar.name || 'them',
    allAttributes: avatar.attributes || [],
    isVisible: visibility === 'VISIBLE'
  })
  
  const daterPromptChain = buildDaterPromptChain({
    attribute: newAttribute,
    avatarLastMessage: avatarResponse,
    allVisibleAttributes: (avatar.attributes || []).filter(a => classifyAttribute(a) === 'VISIBLE'),
    isVisible: visibility === 'VISIBLE'
  })
  
  return {
    avatarResponse,
    daterResponse,
    visibility,
    debugPrompts: {
      avatar: avatarPromptChain,
      dater: daterPromptChain
    }
  }
}

/**
 * Fallback responses when API is not available - based on dater personality
 */
export function getFallbackDaterResponse(dater, playerMessage) {
  const lowerMsg = playerMessage.toLowerCase()
  const { quirk, idealPartner, dealbreakers } = dater
  
  // Check if the message contains a question
  const isQuestion = lowerMsg.includes('?') || 
    lowerMsg.startsWith('what') || lowerMsg.startsWith('how') || 
    lowerMsg.startsWith('why') || lowerMsg.startsWith('do you') ||
    lowerMsg.startsWith('are you') || lowerMsg.startsWith('where') ||
    lowerMsg.startsWith('when') || lowerMsg.startsWith('who')
  
  // If not a question, redirect them to ask one
  if (!isQuestion) {
    const redirects = [
      "Haha that's nice! But hey, this is your chance to learn about ME. What do you want to know? 😉",
      "Interesting... but save the mystery for the date! Ask me something instead!",
      "Cool cool, but I'm more curious what questions you have for me!",
      "Enough about you for now 😄 What do you want to know about me?",
      "That's great but come on, ask me something! What are you curious about?",
    ]
    return redirects[Math.floor(Math.random() * redirects.length)]
  }
  
  // Generate response based on dater's personality
  if (lowerMsg.includes('job') || lowerMsg.includes('work') || lowerMsg.includes('do for')) {
    // Extract job info from backstory
    if (dater.name === 'Leo') {
      return "I'm a freelance graphic designer, but my real passion is painting. I left the corporate world behind to focus on what actually matters to me."
    } else if (dater.name === 'Maya') {
      return "I'm an architect. I design buildings, but honestly I find the design of conversations just as interesting."
    } else if (dater.name === 'Kickflip') {
      return "I'm a content creator! Extreme sports, stunts, anything that gets the adrenaline pumping. My channel's blowing up right now!"
    }
  }
  
  if (lowerMsg.includes('fun') || lowerMsg.includes('hobby') || lowerMsg.includes('free time')) {
    if (dater.name === 'Leo') {
      return "Painting, traveling, collecting experiences. I once spent a month in Portugal just painting sunsets. It was magical."
    } else if (dater.name === 'Maya') {
      return "I sketch buildings, read, and occasionally deconstruct romantic comedies for their logical flaws. It's more fun than it sounds."
    } else if (dater.name === 'Kickflip') {
      return "Parkour, surfing, BASE jumping - basically anything that could kill me! Last week I raced motorcycles through a canyon. SO sick!"
    }
  }
  
  if (lowerMsg.includes('looking for') || lowerMsg.includes('ideal') || lowerMsg.includes('type')) {
    return `Honestly? Someone who's ${idealPartner.slice(0, 2).join(' and ')}. That's what really matters to me.`
  }
  
  if (lowerMsg.includes('deal breaker') || lowerMsg.includes('hate') || lowerMsg.includes('can\'t stand')) {
    return `I really can't deal with ${dealbreakers[0]}. That's a non-starter for me.`
  }
  
  // Default responses based on talking traits
  const defaults = [
    `That's a good question! ${quirk.split('.')[0]}.`,
    "Hmm, let me think about that...",
    "Interesting that you'd ask that!",
    "I appreciate you wanting to know more about me.",
  ]
  
  return defaults[Math.floor(Math.random() * defaults.length)]
}

/**
 * Extract a specific, diverse trait from a Dater's response
 * This helps players discover who the Dater is through conversation
 */
export async function extractTraitFromResponse(question, response, existingTraits = []) {
  const providerConfig = resolveLlmProviderConfig()
  
  if (!providerConfig) {
    // Fallback: simple keyword extraction
    return extractTraitSimple(question, response)
  }
  
  const existingContext = existingTraits.length > 0 
    ? `\n\nALREADY DISCOVERED (avoid these): ${existingTraits.join(', ')}`
    : ''
  
  try {
    const result = await fetch(providerConfig.apiUrl, {
      method: 'POST',
      headers: providerConfig.headers,
      body: JSON.stringify(buildProviderBody(providerConfig, {
        maxTokens: 25,
        systemPrompt: `You extract SPECIFIC and DIVERSE personality insights from dating conversations.

Your job: Find the most interesting, specific detail revealed in the answer.

GOOD traits (specific & memorable):
- "left corporate job" (specific life choice)
- "paints sunsets" (specific hobby detail)
- "Buddhist curious" (specific belief)
- "hates small talk" (specific preference)
- "Portland raised" (specific origin)
- "admires Bourdain" (specific influence)
- "ex-accountant" (specific background)
- "fears routine" (specific dealbreaker)
- "midnight hiker" (specific quirk)
- "vinyl collector" (specific interest)

BAD traits (too generic):
- "nice" / "friendly" / "interesting"
- "creative" / "adventurous" (too broad)
- "likes fun" / "enjoys life"

Rules:
1. Be SPECIFIC - extract the exact detail, not a category
2. Be DIVERSE - look for values, origins, quirks, fears, influences, not just hobbies
3. 1-3 words maximum
4. If nothing specific was revealed, respond with just "NONE"${existingContext}`,
        messages: [{
          role: 'user',
          content: `Question asked: "${question}"
Their answer: "${response}"

What SPECIFIC trait or detail was revealed? (1-3 words only):`
        }],
      })),
    })
    
    if (!result.ok) {
      return extractTraitSimple(question, response)
    }
    
    const data = await result.json()
    let trait = extractProviderText(providerConfig.provider, data).trim()
    
    // Clean up the response
    trait = trait.replace(/^["']|["']$/g, '') // Remove quotes
    trait = trait.replace(/^-\s*/, '') // Remove leading dash
    
    // Return null if nothing specific was found
    if (trait.toUpperCase() === 'NONE' || trait.length > 30 || trait.length < 2) {
      return null
    }
    
    // Check it's not too similar to existing traits
    const lowerTrait = trait.toLowerCase()
    for (const existing of existingTraits) {
      if (existing.toLowerCase() === lowerTrait) {
        return null
      }
    }
    
    return trait
  } catch (error) {
    console.error('Error extracting trait:', error)
    return extractTraitSimple(question, response)
  }
}

/**
 * Simple keyword-based trait extraction fallback
 */
function extractTraitSimple(question, response) {
  const lowerQ = question.toLowerCase()
  const lowerR = response.toLowerCase()
  
  // Job-related
  if (lowerQ.includes('job') || lowerQ.includes('work') || lowerQ.includes('do for')) {
    if (lowerR.includes('designer')) return 'designer'
    if (lowerR.includes('architect')) return 'architect'
    if (lowerR.includes('artist') || lowerR.includes('paint')) return 'artist'
    if (lowerR.includes('content') || lowerR.includes('creator')) return 'content creator'
    if (lowerR.includes('freelance')) return 'freelancer'
  }
  
  // Hobby-related
  if (lowerQ.includes('fun') || lowerQ.includes('hobby') || lowerQ.includes('free time')) {
    if (lowerR.includes('travel')) return 'loves travel'
    if (lowerR.includes('paint')) return 'painter'
    if (lowerR.includes('read')) return 'reader'
    if (lowerR.includes('surf')) return 'surfer'
    if (lowerR.includes('skate')) return 'skater'
    if (lowerR.includes('music')) return 'music lover'
  }
  
  // Values-related
  if (lowerQ.includes('looking for') || lowerQ.includes('type') || lowerQ.includes('ideal')) {
    if (lowerR.includes('adventure') || lowerR.includes('spontan')) return 'seeks adventure'
    if (lowerR.includes('honest')) return 'values honesty'
    if (lowerR.includes('intellect') || lowerR.includes('smart')) return 'values intellect'
    if (lowerR.includes('passion')) return 'wants passion'
  }
  
  // Dealbreakers
  if (lowerQ.includes('hate') || lowerQ.includes('deal') || lowerQ.includes('can\'t stand')) {
    if (lowerR.includes('cynic')) return 'anti-cynicism'
    if (lowerR.includes('small talk')) return 'hates small talk'
    if (lowerR.includes('boring') || lowerR.includes('routine')) return 'hates routine'
  }
  
  // Location
  if (lowerQ.includes('from') || lowerQ.includes('where') || lowerQ.includes('grow up')) {
    if (lowerR.includes('portland')) return 'Portland native'
    if (lowerR.includes('new york') || lowerR.includes('nyc')) return 'New Yorker'
    if (lowerR.includes('la') || lowerR.includes('los angeles')) return 'LA raised'
  }
  
  return null // Nothing specific detected
}

// Track used fallback lines to avoid repetition
const usedDaterLines = new Set()
const usedAvatarLines = new Set()

/**
 * Fallback date conversation (initial greeting handled separately)
 * @param {string} expectedSpeaker - 'dater' or 'avatar'
 */
export function getFallbackDateDialogue(expectedSpeaker, _avatar, _dater) {
  const daterLines = [
    "Tell me something about yourself that would surprise me.",
    "What's the most spontaneous thing you've ever done?",
    "I'm curious - what are you looking for in a partner?",
    "What do you think makes a good connection?",
    "So what do you like to do for fun?",
    "What's your favorite way to spend a weekend?",
    "If you could travel anywhere tomorrow, where would you go?",
    "What's something you're really passionate about?",
    "Do you have any hidden talents?",
    "What made you decide to try dating apps?",
  ]
  
  const avatarLines = [
    "Thanks! I've been really looking forward to meeting you.",
    "Well, there's a lot to unpack there... where do I start?",
    "That's a great question. Let me think about that.",
    "I'm an open book, really. Ask me anything!",
    "Honestly, I'm just happy to be here with good company.",
    "Ha! That's a fun question. Okay so...",
    "You know, I've never really thought about it that way before.",
    "I love how curious you are! It's refreshing.",
    "That actually reminds me of something...",
    "Hmm, good question. I'd have to say...",
  ]
  
  // Get an unused line for the current speaker
  const getUnusedLine = (lines, usedSet) => {
    const unused = lines.filter((_, i) => !usedSet.has(i))
    if (unused.length === 0) {
      usedSet.clear() // Reset if all used
      return lines[Math.floor(Math.random() * lines.length)]
    }
    const idx = lines.indexOf(unused[Math.floor(Math.random() * unused.length)])
    usedSet.add(idx)
    return lines[idx]
  }
  
  if (expectedSpeaker === 'dater') {
    return { speaker: 'dater', message: getUnusedLine(daterLines, usedDaterLines) }
  } else {
    return { speaker: 'avatar', message: getUnusedLine(avatarLines, usedAvatarLines) }
  }
}

/**
 * Generate Dater Values (Loves, Likes, Dislikes, Dealbreakers) based on character sheet
 * These are hidden from players and used for scoring
 */
export async function generateDaterValues(dater) {
  const providerConfig = resolveLlmProviderConfig()
  
  if (!providerConfig) {
    console.warn('No API key - using fallback dater values')
    return getFallbackDaterValues(dater)
  }
  
  const systemPrompt = `You are generating dating preferences for a character in a COMEDY dating game where players give their avatar WILD, ABSURD attributes.

CHARACTER PROFILE:
Name: ${dater.name}
Age: ${dater.age}
Archetype: ${dater.archetype}
Description: ${dater.description}
Backstory: ${dater.backstory}
Values: ${dater.values}
Beliefs: ${dater.beliefs}
Ideal Partner: ${dater.idealPartner?.join(', ')}
Known Dealbreakers: ${dater.dealbreakers?.join(', ')}
Upbringing: ${dater.upbringing || 'Not specified'}
Spirituality: ${dater.spirituality || 'Not specified'}

Generate dating preferences that feel authentic to this character AND can react to WILD attributes.

⚠️ IMPORTANT: Players will give their avatar ABSURD traits like:
- Being a murderer, serial killer, criminal
- Being a monster, dragon, giant spider, demon
- Being 100 feet tall, microscopic, made of fire
- Having tentacles, extra limbs, being undead
- Eating people, drinking blood, causing destruction

Your preferences MUST include categories that can match these wild attributes!

REQUIRED CATEGORY MIX:
1. NORMAL preferences (hobbies, personality, lifestyle) - about 50%
2. EXTREME/WILD preferences (danger, monsters, violence, supernatural, chaos) - about 30%  
3. PHYSICAL preferences (size, appearance, body types) - about 20%

EXAMPLE EXTREME PREFERENCES TO INCLUDE (pick ones that fit the character):
POSITIVE (for edgy/unconventional characters):
- "danger", "bad boys/girls", "monsters", "the supernatural", "chaos", "rule-breakers", "power", "intimidating people", "dark humor", "edge lords", "mysterious types", "rebels"

NEGATIVE (for most normal characters - PUT THESE IN DISLIKES/DEALBREAKERS):
- "violence", "danger to self", "criminals", "killers", "scary things", "monsters", "being threatened", "chaos", "instability", "harmful behavior", "creepy things", "predators"

RULES:
- Keep each preference to 1-3 words
- Make them BROAD so they can match many attributes
- MUST include at least 2-3 extreme/wild categories in EACH list
- Dealbreakers SHOULD include things like "violence", "danger", "harm" for normal characters
- OR include "boring", "safe", "conventional" for edgy characters

CHARACTER-SPECIFIC OVERRIDES:
If the character's backstory, description, or dealbreakers mention a specific phobia, trauma, or hatred of something (e.g., fire), that thing MUST appear in their dealbreakers list, and related terms should appear in dislikes. For example, if a character has fire trauma in their backstory, "fire" and "flames" MUST be in dealbreakers, and terms like "burning", "torches", "heat" should be in dislikes.

Return ONLY valid JSON in this exact format:
{
  "loves": ["item1", "item2", "item3", "item4", "item5"],
  "likes": ["item1", "item2", "item3", "item4", "item5", "item6", "item7", "item8", "item9", "item10"],
  "dislikes": ["item1", "item2", "item3", "item4", "item5", "item6", "item7", "item8", "item9", "item10"],
  "dealbreakers": ["item1", "item2", "item3", "item4", "item5"]
}`

  try {
    const response = await fetch(providerConfig.apiUrl, {
      method: 'POST',
      headers: providerConfig.headers,
      body: JSON.stringify(buildProviderBody(providerConfig, {
        maxTokens: 500,
        systemPrompt,
        messages: [{ role: 'user', content: 'Generate the dater values now.' }],
      })),
    })
    
    if (!response.ok) {
      console.error('Error generating dater values')
      return getFallbackDaterValues(dater)
    }
    
    const data = await response.json()
    const text = extractProviderText(providerConfig.provider, data)
    
    // Parse JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      console.log('Generated dater values:', parsed)
      return parsed
    }
    
    return getFallbackDaterValues(dater)
  } catch (error) {
    console.error('Error generating dater values:', error)
    return getFallbackDaterValues(dater)
  }
}

/**
 * Check if an attribute matches any dater value
 * @param attribute - The attribute/what the avatar said
 * @param daterValues - The dater's hidden preferences
 * @param dater - The dater character
 * @param daterReaction - Optional: The dater's reaction text (helps determine if positive/negative match)
 * Returns { category: 'loves'|'likes'|'dislikes'|'dealbreakers', matchedValue: string, shortLabel: string }
 * NOTE: This function ALWAYS returns a match - every attribute affects the score!
 */
export async function checkAttributeMatch(attribute, daterValues, dater, daterReaction = null, currentCompatibility = 50) {
  const providerConfig = resolveLlmProviderConfig()
  const daterName = dater?.name || 'the dater'
  
  // Determine tie-break direction based on compatibility meter
  const getTieBreakDirection = () => {
    if (currentCompatibility > 50) return 'like'
    if (currentCompatibility < 50) return 'dislike'
    return Math.random() < 0.5 ? 'like' : 'dislike' // coin flip at exactly 50
  }
  
  // Fallback: analyze the reaction text to determine Good/Great/Bad/Awful, then pick a trait
  const getFallbackMatch = (reaction) => {
    const lower = (reaction || '').toLowerCase()
    
    // Awful signals (dealbreakers)
    const awfulWords = ['murder', 'kill', 'terrified', 'furious', 'disgusted', 'horrified', 'run', 'escape', 'dangerous', 'threat', 'violence', 'evil', 'predator', 'absolutely not', 'hard no', 'deal breaker']
    // Bad signals (dislikes)
    const badWords = ['uncomfortable', 'concerned', 'worried', 'nervous', 'yikes', 'alarmed', 'disappointed', 'upset', 'put off', 'not okay', 'problem', 'red flag', 'don\'t like']
    // Great signals (loves)
    const greatWords = ['adore', 'obsessed', 'soulmate', 'perfect', 'incredible', 'swoon', 'falling for', 'dream', 'amazing', 'oh my god yes']
    // Good signals (likes)
    const goodWords = ['like', 'nice', 'cool', 'fun', 'sweet', 'cute', 'interesting', 'impressed', 'into it', 'appreciate', 'respect']
    
    const isAwful = awfulWords.some(w => lower.includes(w))
    const isBad = badWords.some(w => lower.includes(w))
    const isGreat = greatWords.some(w => lower.includes(w))
    const isGood = goodWords.some(w => lower.includes(w))
    
    let category, traitList
    // Loves and Dealbreakers always win outright
    if (isAwful) {
      category = 'dealbreakers'
      traitList = daterValues.dealbreakers
    } else if (isGreat) {
      category = 'loves'
      traitList = daterValues.loves
    } else if (isBad && isGood) {
      // Both positive and negative signals — tie-break using compatibility
      const direction = getTieBreakDirection()
      console.log(`🎲 Tie-break (fallback): both good+bad signals, compat=${currentCompatibility}% → ${direction}`)
      if (direction === 'like') {
        category = 'likes'
        traitList = daterValues.likes
      } else {
        category = 'dislikes'
        traitList = daterValues.dislikes
      }
    } else if (isBad) {
      category = 'dislikes'
      traitList = daterValues.dislikes
    } else if (isGood) {
      category = 'likes'
      traitList = daterValues.likes
    } else {
      category = 'likes'
      traitList = daterValues.likes
    }
    
    // Pick a random trait from the matching list
    const matchedValue = traitList?.length > 0
      ? traitList[Math.floor(Math.random() * traitList.length)]
      : 'general impression'
    
    return { category, matchedValue, shortLabel: matchedValue }
  }
  
  if (!providerConfig) {
    return getFallbackMatch(daterReaction)
  }

  // Build tie-break instruction for the LLM
  let tieBreakInstruction = ''
  if (currentCompatibility > 50) {
    tieBreakInstruction = `\n\nTIE-BREAK RULE: The date is currently going WELL (compatibility: ${currentCompatibility}%). If both a LIKE trait and a DISLIKE trait apply to what they said, lean toward GOOD (Like). Give them the benefit of the doubt. However, this does NOT apply to LOVE or DEALBREAKER — those always win outright regardless of how the date is going.`
  } else if (currentCompatibility < 50) {
    tieBreakInstruction = `\n\nTIE-BREAK RULE: The date is currently going POORLY (compatibility: ${currentCompatibility}%). If both a LIKE trait and a DISLIKE trait apply to what they said, lean toward BAD (Dislike). You're less inclined to give them the benefit of the doubt. However, this does NOT apply to LOVE or DEALBREAKER — those always win outright regardless of how the date is going.`
  } else {
    tieBreakInstruction = `\n\nTIE-BREAK RULE: The date is at exactly 50% compatibility — you're on the fence. If both a LIKE trait and a DISLIKE trait apply, go with whichever feels more natural to your character in this moment. However, LOVE or DEALBREAKER always win outright.`
  }

  const systemPrompt = `You are ${daterName} rating your OWN reaction to what your date just said.

YOUR TRAITS AND VALUES:
LOVE traits (things you adore): ${daterValues.loves.join(', ')}
LIKE traits (things you enjoy): ${daterValues.likes.join(', ')}
DISLIKE traits (things that bother you): ${daterValues.dislikes.join(', ')}
NOPE traits (absolute dealbreakers): ${daterValues.dealbreakers.join(', ')}

WHAT YOUR DATE SAID: "${attribute}"

YOUR REACTION WAS: "${daterReaction || '(no reaction yet)'}"

🎯 YOUR TASK: Judge your OWN reaction. How did what they said make you feel?

STEP 1 — Rate your reaction:
- GREAT → You loved it. It excited, attracted, or delighted you. (ALWAYS wins — not influenced by how the date is going)
- GOOD → You liked it. It was pleasant, interesting, or promising.
- BAD → You didn't like it. It bothered, concerned, or disappointed you.
- AWFUL → You hated it. It horrified, disgusted, or infuriated you. (ALWAYS wins — not influenced by how the date is going)

STEP 2 — Check if BOTH a positive and negative trait apply:
Sometimes what a person says could trigger both a Like and a Dislike trait. For example, "I love skydiving" might hit both a Like for adventure AND a Dislike for recklessness. When this happens, use the tie-break rule below to decide.
${tieBreakInstruction}

STEP 3 — Pick the specific trait from YOUR values that justifies your rating:
- If GREAT → pick one of your LOVE traits: ${daterValues.loves.join(', ')}
- If GOOD → pick one of your LIKE traits: ${daterValues.likes.join(', ')}
- If BAD → pick one of your DISLIKE traits: ${daterValues.dislikes.join(', ')}
- If AWFUL → pick one of your NOPE traits: ${daterValues.dealbreakers.join(', ')}

Pick the trait that BEST explains why you reacted the way you did.

CRITICAL RULES:
- GREAT (Love) and AWFUL (Dealbreaker) always override the tie-break rule. If the answer clearly hits a Love or Dealbreaker trait, that rating wins regardless of compatibility.
- For GOOD vs BAD: if both apply, use the tie-break rule above.
- Your rating MUST match the tone of your reaction.
- You MUST pick a trait from the correct list.
- The shortLabel should be 1-2 words explaining the core reason.

Return ONLY valid JSON:
{
  "rating": "great" | "good" | "bad" | "awful",
  "category": "loves" | "likes" | "dislikes" | "dealbreakers",
  "matchedValue": "the specific trait from your list",
  "shortLabel": "1-2 word reason"
}`

  try {
    const response = await fetch(providerConfig.apiUrl, {
      method: 'POST',
      headers: providerConfig.headers,
      body: JSON.stringify(buildProviderBody(providerConfig, {
        maxTokens: 150,
        systemPrompt,
        messages: [{ role: 'user', content: 'Rate your reaction and pick the trait that justifies it.' }],
      })),
    })
    
    if (!response.ok) {
      console.warn('API error, using fallback match')
      return getFallbackMatch(daterReaction)
    }
    
    const data = await response.json()
    const text = extractProviderText(providerConfig.provider, data)
    
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      
      // Map rating to category if category wasn't set correctly
      const ratingToCategory = { great: 'loves', good: 'likes', bad: 'dislikes', awful: 'dealbreakers' }
      const category = ratingToCategory[parsed.rating] || parsed.category
      
      if (category && parsed.shortLabel) {
        const result = {
          category,
          matchedValue: parsed.matchedValue || 'general impression',
          shortLabel: parsed.shortLabel,
          reason: parsed.reason || ''
        }
        console.log(`🎯 Dater self-rated: ${parsed.rating?.toUpperCase()} → ${category} (trait: "${result.matchedValue}", label: "${result.shortLabel}") [compat: ${currentCompatibility}%]`)
        return result
      }
    }
    
    console.warn('LLM did not return valid self-rating, using fallback')
    return getFallbackMatch(daterReaction)
  } catch (error) {
    console.error('Error in dater self-rating:', error)
    return getFallbackMatch(daterReaction)
  }
}

function inferSimpleSentimentFromReaction(reaction = '') {
  const lower = (reaction || '').toLowerCase()
  const negativeSignals = [
    'horrified', 'dealbreaker', 'run', 'cannot', 'can\'t', 'awful', 'hate',
    'disgust', 'furious', 'uncomfortable', 'concerned', 'worried', 'nervous',
    'upset', 'red flag', 'not okay', 'not into', 'didn\'t like'
  ]
  const isNegative = negativeSignals.some((word) => lower.includes(word))
  return isNegative ? 'disliked' : 'liked'
}

function detectFireOverrideHit(answer, scoringData) {
  const override = scoringData?.fireOverride
  if (!override) return null
  const lower = (answer || '').toLowerCase()
  const hasFire = (override.keywords || []).some((keyword) => lower.includes(keyword.toLowerCase()))
  if (!hasFire) return null
  return {
    id: override.id || 'dealbreaker:fire_override',
    name: override.name || 'Fire',
    rank: override.rank || 1,
    type: 'dealbreaker',
    points: override.points ?? -50,
  }
}

function coerceQualityHit(rawHit, scoringData) {
  if (!rawHit || typeof rawHit !== 'object') return null
  const positives = scoringData?.positiveQualities || []
  const negatives = scoringData?.dealbreakers || []
  const catalog = [...positives.map((q) => ({ ...q, type: 'positive' })), ...negatives.map((q) => ({ ...q, type: 'dealbreaker' }))]

  const idLookup = new Map(catalog.map((q) => [String(q.id || '').toLowerCase(), q]))
  const nameLookup = new Map(catalog.map((q) => [String(q.name || '').toLowerCase(), q]))

  const idMatch = rawHit.id ? idLookup.get(String(rawHit.id).toLowerCase()) : null
  const nameMatch = rawHit.name ? nameLookup.get(String(rawHit.name).toLowerCase()) : null
  const matched = idMatch || nameMatch
  if (!matched) return null

  return {
    id: matched.id,
    name: matched.name,
    rank: matched.rank,
    type: matched.type,
    points: matched.points,
  }
}

/**
 * Checks if a player's answer maps to dater-scoring qualities.
 * Returns a quality hit when confidence is high enough, plus a lightweight liked/disliked sentiment.
 */
export async function checkQualityMatch(playerAnswer, question, scoringData, daterName = 'the dater', daterReaction = '') {
  const providerConfig = resolveLlmProviderConfig()

  const fireOverrideHit = detectFireOverrideHit(playerAnswer, scoringData)
  if (fireOverrideHit) {
    return {
      qualityHit: fireOverrideHit,
      sentiment: 'disliked',
      sentimentReason: 'fire mention',
      commonality: 1,
      source: 'fire_override',
    }
  }

  const fallbackSentiment = inferSimpleSentimentFromReaction(daterReaction)
  const fallbackReason = fallbackSentiment === 'liked' ? 'what you said' : 'that answer'

  const positiveQualities = scoringData?.positiveQualities || []
  const dealbreakers = scoringData?.dealbreakers || []
  const qualityCatalog = [
    ...positiveQualities.map((q) => ({ ...q, type: 'positive' })),
    ...dealbreakers.map((q) => ({ ...q, type: 'dealbreaker' })),
  ]

  if (!providerConfig || qualityCatalog.length === 0) {
    return {
      qualityHit: null,
      sentiment: fallbackSentiment,
      sentimentReason: fallbackReason,
      commonality: 0,
      source: 'fallback',
    }
  }

  const qualitiesPrompt = qualityCatalog
    .map((q) => `- id: ${q.id} | name: ${q.name} | type: ${q.type} | rank: ${q.rank} | points: ${q.points} | description: ${q.description}`)
    .join('\n')

  const systemPrompt = `You evaluate answers in a dating game for ${daterName}.

QUESTION ASKED:
"${question || 'No specific question provided'}"

PLAYER ANSWER:
"${playerAnswer || ''}"

DATER'S REACTION LINE (context only):
"${daterReaction || ''}"

AVAILABLE QUALITIES:
${qualitiesPrompt}

FIRE OVERRIDE RULE:
- Any clear mention of fire/flames/burning/torches/campfires/fireworks/candles/matches is an automatic dealbreaker.

TASK:
1) Decide if the answer hits ONE quality at about 70% commonality or higher.
2) It is valid to return NO quality hit if there is not a clear match.
3) Do NOT force a match.
4) Also return a lightweight sentiment ("liked" or "disliked") for top-of-screen feedback.
5) sentimentReason must be 1-4 words max.

OUTPUT JSON ONLY:
{
  "qualityHit": null | {
    "id": "exact id from list",
    "name": "exact quality name",
    "rank": 1,
    "type": "positive" | "dealbreaker",
    "points": 0
  },
  "commonality": 0.0,
  "sentiment": "liked" | "disliked",
  "sentimentReason": "short reason"
}`

  try {
    const response = await fetch(providerConfig.apiUrl, {
      method: 'POST',
      headers: providerConfig.headers,
      body: JSON.stringify(buildProviderBody(providerConfig, {
        maxTokens: 220,
        systemPrompt,
        messages: [{ role: 'user', content: 'Return only the JSON result.' }],
      })),
    })

    if (!response.ok) {
      return {
        qualityHit: null,
        sentiment: fallbackSentiment,
        sentimentReason: fallbackReason,
        commonality: 0,
        source: 'fallback',
      }
    }

    const data = await response.json()
    const text = extractProviderText(providerConfig.provider, data)
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return {
        qualityHit: null,
        sentiment: fallbackSentiment,
        sentimentReason: fallbackReason,
        commonality: 0,
        source: 'fallback',
      }
    }

    const parsed = JSON.parse(jsonMatch[0])
    const commonality = Number(parsed.commonality || 0)
    const qualityHit = commonality >= 0.7 ? coerceQualityHit(parsed.qualityHit, scoringData) : null
    const sentiment = parsed.sentiment === 'disliked' ? 'disliked' : 'liked'
    const sentimentReason = String(parsed.sentimentReason || fallbackReason).trim().slice(0, 60) || fallbackReason

    return {
      qualityHit,
      sentiment,
      sentimentReason,
      commonality: Number.isFinite(commonality) ? commonality : 0,
      source: 'llm',
    }
  } catch (error) {
    console.error('Error in checkQualityMatch:', error)
    return {
      qualityHit: null,
      sentiment: fallbackSentiment,
      sentimentReason: fallbackReason,
      commonality: 0,
      source: 'fallback',
    }
  }
}

/**
 * Fallback dater values if API is unavailable
 * Includes both normal AND extreme categories for wild attributes
 */
function getFallbackDaterValues(_dater) {
  return {
    loves: [
      'being authentic',
      'good conversation',
      'sense of humor',
      'being passionate',
      'emotional depth'
    ],
    likes: [
      'being adventurous',
      'creativity',
      'intelligence',
      'confidence',
      'being kind',
      'uniqueness',
      'being mysterious',
      'standing out',
      'being unconventional',
      'self-awareness'
    ],
    dislikes: [
      'being boring',
      'negativity',
      'being closed-minded',
      'danger',
      'scary things',
      'chaos',
      'instability',
      'being judgmental',
      'creepy behavior',
      'poor communication'
    ],
    dealbreakers: [
      'violence',
      'killers',
      'harm to others',
      'being dangerous',
      'predatory behavior'
    ]
  }
}

/**
 * Group similar answers together and create a label for each group
 * Used for the answer selection wheel
 * @param {string} question - The question that was asked
 * @param {Array} answers - Array of {id, text, submittedBy} objects
 * @returns {Array} - Array of grouped slices: {id, label, weight, originalAnswers: [{id, text, submittedBy}]}
 */
export async function groupSimilarAnswers(question, answers) {
  console.log('🎯 groupSimilarAnswers called with', answers.length, 'answer(s)')
  
  const providerConfig = resolveLlmProviderConfig()
  
  // If only 1 or no answers, no grouping needed
  if (answers.length <= 1) {
    console.log('🎯 Only', answers.length, 'answer(s) - no grouping needed')
    return answers.map(a => ({
      id: a.id,
      label: a.text,
      weight: 1,
      originalAnswers: [a]
    }))
  }
  
  if (!providerConfig) {
    // Fallback: no grouping, each answer is its own slice
    console.log('⚠️ No API key - skipping answer grouping')
    return answers.map(a => ({
      id: a.id,
      label: a.text,
      weight: 1,
      originalAnswers: [a]
    }))
  }
  
  console.log('🎯 Calling LLM to group', answers.length, 'answers...')
  
  const answerList = answers.map((a, i) => `${i + 1}. "${a.text}" (by ${a.submittedBy})`).join('\n')
  
  const prompt = `You are grouping player answers in a party game.

QUESTION BEING ANSWERED: "${question}"

PLAYER ANSWERS:
${answerList}

TASK: Group similar answers together based on their THEME or MEANING (not exact wording).

RULES:
- Answers that express the SAME IDEA should be grouped together
- Be generous with grouping - if answers are related, group them
- Create a SHORT label (1-3 words) that captures the theme
- Answers that are truly unique should stay as their own group

EXAMPLES OF SIMILAR ANSWERS (should be grouped):
- "Looks", "Someone hot", "A total babe", "Attractive" → "Good Looking"
- "Funny", "Makes me laugh", "Good sense of humor" → "Funny"
- "Has money", "Rich", "Financially stable" → "Wealthy"
- "Kind", "Nice", "Sweet person" → "Kind"

RESPOND WITH ONLY A JSON ARRAY like this:
[
  {"label": "Short Theme Label", "answerIndices": [1, 3, 5]},
  {"label": "Another Theme", "answerIndices": [2]},
  {"label": "Third Theme", "answerIndices": [4, 6]}
]

RULES FOR JSON:
- answerIndices are 1-based (matching the numbered list above)
- Every answer must appear in exactly ONE group
- Labels should be 1-3 words, catchy and clear
- Output ONLY valid JSON, no explanation`

  try {
    const response = await fetch(providerConfig.apiUrl, {
      method: 'POST',
      headers: providerConfig.headers,
      body: JSON.stringify(buildProviderBody(providerConfig, {
        maxTokens: 500,
        messages: [{ role: 'user', content: prompt }],
      })),
    })
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`)
    }
    
    const data = await response.json()
    const text = extractProviderText(providerConfig.provider, data)
    
    // Parse JSON from response
    const jsonMatch = text.match(/\[[\s\S]*\]/)
    if (jsonMatch) {
      const groups = JSON.parse(jsonMatch[0])
      
      // Convert groups to wheel slices
      const slices = groups.map((group, groupIndex) => {
        const groupedAnswers = group.answerIndices.map(idx => answers[idx - 1]).filter(Boolean)
        return {
          id: `group-${groupIndex}`,
          label: group.label,
          weight: groupedAnswers.length,
          originalAnswers: groupedAnswers
        }
      }).filter(slice => slice.originalAnswers.length > 0)
      
      console.log('🎯 Grouped answers into', slices.length, 'slice(s)')
      return slices
    }
    
    throw new Error('Could not parse JSON from response')
  } catch (error) {
    console.error('Error grouping answers:', error)
    // Fallback: each answer is its own slice
    return answers.map(a => ({
      id: a.id,
      label: a.text,
      weight: 1,
      originalAnswers: [a]
    }))
  }
}

/**
 * Generate conversational end-of-game breakdown sentences
 * Takes the compatibility history and generates natural, flowing sentences
 * @param {string} daterName - The dater's name (e.g., "Maya")
 * @param {string} avatarName - The avatar's name
 * @param {Array} impacts - Array of {attribute, topic, category, change} objects
 * @param {number} finalCompatibility - The final compatibility percentage
 * @returns {Array} - Array of conversational sentences to display
 */
export async function generateBreakdownSentences(daterName, avatarName, qualityHits, finalScorePercent) {
  const providerConfig = resolveLlmProviderConfig()
  
  if (!providerConfig || qualityHits.length === 0) {
    console.log('⚠️ No API key or no quality hits - skipping breakdown generation')
    return []
  }
  
  const topHits = [...qualityHits]
    .sort((a, b) => Math.abs((b.points || 0)) - Math.abs((a.points || 0)))
    .slice(0, 8)
  
  // Create a summary for the LLM
  const hitSummary = topHits.map((hit) =>
    `- ${hit.name}: ${hit.type} (rank ${hit.rank})`
  ).join('\n')
  
  const prompt = `You are writing a short, punchy end-of-date recap for a dating game.

The dater's name is ${daterName}. The avatar's name is ${avatarName}.
Final quality score: ${finalScorePercent}%

Here are the key qualities that were hit during the date:
${hitSummary}

Write 3-5 SHORT, conversational sentences summarizing what happened. Rules:
- Be concise and punchy - each sentence should be 10-20 words max
- You can combine positive and negative things in one sentence with "but" or "however"
- Use varied sentence structures - don't start every sentence the same way
- Match the tone to the outcome (playful if good, sympathetic if bad)
- Reference the hit qualities naturally
- Don't use percentages or numbers
- Make it sound like a friend recapping the date

Example good outputs:
- "${daterName} loved ${avatarName}'s self-awareness, but cruelty talk killed the vibe fast."
- "${daterName} was impressed by daring energy, then got worried about shallow vanity."
- "${avatarName} hit kindness in a real way, and ${daterName} visibly softened."

Return ONLY a JSON array of strings, like:
["First sentence.", "Second sentence.", "Third sentence."]`

  try {
    const response = await fetch(providerConfig.apiUrl, {
      method: 'POST',
      headers: providerConfig.headers,
      body: JSON.stringify(buildProviderBody(providerConfig, {
        maxTokens: 300,
        messages: [{ role: 'user', content: prompt }],
      })),
    })
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`)
    }
    
    const data = await response.json()
    const content = extractProviderText(providerConfig.provider, data)
    
    // Parse JSON array from response
    const jsonMatch = content.match(/\[[\s\S]*\]/)
    if (jsonMatch) {
      const sentences = JSON.parse(jsonMatch[0])
      console.log('📝 Generated breakdown sentences:', sentences)
      return sentences
    }
    
    return []
  } catch (error) {
    console.error('Error generating breakdown:', error)
    return []
  }
}

/**
 * Generate a narrative summary of what happened during the plot twist.
 * The winning "answer" is typically an ACTION (what the avatar did), not something they said.
 */
export async function generatePlotTwistSummary(avatarName, daterName, winningAction) {
  const providerConfig = resolveLlmProviderConfig()
  const normalizedAvatarName = String(avatarName || 'Your date').trim()
  const normalizedDaterName = String(daterName || 'Adam').trim()
  const normalizedAction = String(winningAction || 'stayed calm').trim()
  const safeAction = normalizedAction.replace(/["']/g, '').slice(0, 72) || 'stayed calm'

  const buildFallbackSummary = () => {
    const closers = [
      `The tension lingered long after the moment passed.`,
      `Neither of them would forget what just happened.`,
      `Something between them shifted—and there was no going back.`,
      `The silence that followed said more than words ever could.`,
      `That single moment rewrote the rest of the evening.`,
      `From that point on, the date was a completely different story.`,
      `The air between them crackled with a brand-new energy.`,
    ]
    const closer = closers[Math.floor(Math.random() * closers.length)]
    const fallback = `${normalizedAvatarName} acted on instinct and ${safeAction}. The stranger hitting on ${normalizedDaterName} was left stunned as the room shifted. ${closer}`
    return fallback.replace(/\s+/g, ' ').trim()
  }

  const normalizeSummary = (text) => String(text || '').replace(/\s+/g, ' ').trim()
  const countSentences = (text) => {
    const parts = String(text || '')
      .replace(/\s+/g, ' ')
      .trim()
      .split(/[.!?]+/)
      .map(s => s.trim())
      .filter(Boolean)
    return parts.length
  }

  if (!providerConfig) {
    console.warn('⚠️ No API key for plot twist summary')
    return buildFallbackSummary()
  }
  
  const prompt = `You're narrating a dramatic moment in a dating game.

CONTEXT:
- ${normalizedAvatarName} is on a date with ${normalizedDaterName}
- A random stranger just started hitting on ${normalizedDaterName}
- The winning choice (what ${normalizedAvatarName} DID) is: "${normalizedAction}"

IMPORTANT: "${normalizedAction}" is an ACTION or choice, not dialogue. Treat it as what ${normalizedAvatarName} actually DID in real life during this moment. Never frame it as something they merely said.

Write exactly 3 sentences describing what happened. This should describe:
1. What ${normalizedAvatarName} actually did
2. What happened to the person who was hitting on ${normalizedDaterName}
3. The aftermath/result of the action

RULES:
- Always use the person's name "${normalizedAvatarName}" in the narration. NEVER use the word "Avatar" or "the avatar".
- Write in past tense, like narrating a story
- Be dramatic and visual - describe the SCENE
- Keep total output <= 400 characters
- Don't use quotation marks or dialogue
- Make it sound like a cinematic narrator
- Do not say ${normalizedAvatarName} "said" "${normalizedAction}".
- If the action was passive/nothing, make that dramatic too ("${normalizedAvatarName} just... stood there. The silence was deafening.")
- If the action was violent, describe it cinematically
- If the action was romantic/protective, make it swoony
- If the action was weird, lean into the weirdness

EXAMPLES (winning answer = action):
Action: "Punch them in the face"
→ "${normalizedAvatarName} lunged forward and landed a brutal right hook. The flirty stranger collapsed to the floor in shock. ${normalizedDaterName} stared, breath caught somewhere between fear and awe."

Action: "Do nothing"
→ "${normalizedAvatarName} froze completely while the stranger kept flirting inches away. ${normalizedDaterName} watched in stunned silence as nothing changed. The awkwardness settled over the room like a cold fog."

Action: "Start flirting with them too"
→ "${normalizedAvatarName} stepped in and flirted right back without hesitation. ${normalizedDaterName} sat alone, watching the betrayal unfold in real time. By the time it ended, the date felt cracked beyond repair."

Return ONLY the 3-sentence narration, nothing else.`

  try {
    const response = await fetch(providerConfig.apiUrl, {
      method: 'POST',
      headers: providerConfig.headers,
      body: JSON.stringify(buildProviderBody(providerConfig, {
        maxTokens: 200,
        messages: [{ role: 'user', content: prompt }],
      })),
    })
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`)
    }
    
    const data = await response.json()
    const summary = normalizeSummary(extractProviderText(providerConfig.provider, data))
    if (!summary) return buildFallbackSummary()
    if (summary.length > 400) return buildFallbackSummary()
    const sentenceCount = countSentences(summary)
    if (sentenceCount < 2 || sentenceCount > 5) return buildFallbackSummary()
    console.log('🎭 Generated plot twist summary')
    return summary
  } catch (error) {
    console.error('Error generating plot twist summary:', error)
    return buildFallbackSummary()
  }
}

const safeJsonObject = (text) => {
  if (!text || typeof text !== 'string') return null
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) return null
  try {
    return JSON.parse(match[0])
  } catch {
    return null
  }
}

const normalizeStringList = (items = []) => (
  Array.isArray(items)
    ? items.map((item) => String(item || '').trim()).filter(Boolean)
    : []
)

const normalizeLabelKey = (value = '') => (
  String(value || '')
    .trim()
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/[.!?,;:]+$/g, '')
    .replace(/\s+/g, ' ')
    .toLowerCase()
)

const normalizeIdKey = (value = '') => (
  String(value || '')
    .trim()
    .replace(/^["'`]+|["'`]+$/g, '')
    .toLowerCase()
)

const clipPromptText = (value = '', max = 420) => {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim()
  if (!normalized) return ''
  if (normalized.length <= max) return normalized
  return `${normalized.slice(0, max - 3).trim()}...`
}

const normalizePromptList = (items = [], fallback = 'not specified') => {
  const list = normalizeStringList(items)
  return list.length > 0 ? list.join(', ') : fallback
}

const toMode1Verdict = (value = '') => {
  const normalized = String(value || '').trim().toLowerCase()
  if (!normalized) return null
  if (['dislike', 'disliked', 'negative', 'bad', 'no'].includes(normalized)) return 'dislike'
  if (['like', 'liked', 'positive', 'good', 'yes'].includes(normalized)) return 'like'
  return null
}

const toRatingsEffect = (value = '') => {
  const normalized = String(value || '').trim().toLowerCase()
  if (['increase', 'up', '+1', 'raise'].includes(normalized)) return 'increase'
  if (['decrease', 'down', '-1', 'drop', 'lower'].includes(normalized)) return 'decrease'
  if (['no_change', 'no change', 'neutral', 'same', 'none', 'unchanged', 'flat'].includes(normalized)) return 'no_change'
  return null
}

const deriveRatingsEffectFallback = (playerAnswer = '', chaosLikeSignal = null) => {
  if (Number.isFinite(chaosLikeSignal)) {
    if (chaosLikeSignal >= 4) return 'increase'
    if (chaosLikeSignal <= 2) return 'decrease'
    return 'no_change'
  }

  const answer = String(playerAnswer || '').trim()
  if (!answer) return 'decrease'
  const lower = answer.toLowerCase()
  if (/^(idk|i don't know|dont know|pass|whatever|no comment|n\/a|none)\b/.test(lower)) {
    return 'decrease'
  }

  const wordCount = answer.split(/\s+/).filter(Boolean).length
  if (wordCount >= 4) return 'increase'
  if (wordCount <= 2) return 'decrease'
  return 'no_change'
}

const buildMode1ProfileSnapshot = (dater, profileValues) => {
  const snapshotLines = [
    `Name: ${dater?.name || 'the dater'}`,
    `Description: ${clipPromptText(dater?.description || '') || 'not specified'}`,
    `Values: ${clipPromptText(dater?.values || '') || 'not specified'}`,
    `Beliefs: ${clipPromptText(dater?.beliefs || '') || 'not specified'}`,
    `Dealbreakers: ${normalizePromptList(dater?.dealbreakers || [])}`,
    `Ideal partner: ${normalizePromptList(dater?.idealPartner || [])}`,
  ]

  if (profileValues && typeof profileValues === 'object') {
    snapshotLines.push(`Current loves: ${normalizePromptList(profileValues.loves || [])}`)
    snapshotLines.push(`Current likes: ${normalizePromptList(profileValues.likes || [])}`)
    snapshotLines.push(`Current dislikes: ${normalizePromptList(profileValues.dislikes || [])}`)
    snapshotLines.push(`Current dealbreakers: ${normalizePromptList(profileValues.dealbreakers || [])}`)
  }

  return snapshotLines.join('\n')
}

const pickClosestTraitLabel = (labels = [], text = '') => {
  const sourceLabels = Array.isArray(labels) ? labels.filter(Boolean) : []
  if (sourceLabels.length === 0) return null

  const normalizedText = normalizeLabelKey(text)
  if (normalizedText) {
    const direct = sourceLabels.find((label) => normalizedText.includes(normalizeLabelKey(label)))
    if (direct) return direct
  }

  const textTokens = new Set(
    normalizedText
      .split(' ')
      .map((token) => token.trim())
      .filter((token) => token.length > 2)
  )

  let bestLabel = sourceLabels[0]
  let bestScore = -1
  sourceLabels.forEach((label) => {
    const labelTokens = normalizeLabelKey(label)
      .split(' ')
      .map((token) => token.trim())
      .filter((token) => token.length > 2)
    const score = labelTokens.reduce((sum, token) => sum + (textTokens.has(token) ? 1 : 0), 0)
    if (score > bestScore) {
      bestScore = score
      bestLabel = label
    }
  })

  return bestLabel
}

export async function evaluateLikesDislikesResponse({
  dater,
  question = '',
  playerAnswer = '',
  daterResponse = '',
  likes = [],
  dislikes = [],
  profileValues = null,
  includeChaos = false,
}) {
  const likePool = normalizeStringList(likes)
  const dislikePool = normalizeStringList(dislikes)
  if (likePool.length === 0 && dislikePool.length === 0) {
    return includeChaos ? { likes: [], dislikes: [], ratingsEffect: 'no_change' } : { likes: [], dislikes: [] }
  }

  const likeMap = new Map(likePool.map((label) => [normalizeLabelKey(label), label]))
  const dislikeMap = new Map(dislikePool.map((label) => [normalizeLabelKey(label), label]))
  const fullTurnText = [question, playerAnswer, daterResponse].filter(Boolean).join(' | ')
  const profileSnapshot = buildMode1ProfileSnapshot(dater, profileValues)

  const systemPrompt = `You are ${dater?.name || 'the dater'} evaluating Mode 1 daily scoring for a dating-game turn.

Evaluate the ENTIRE turn (question + player answer + your response), with primary focus on the player's stance and behavior.
You MUST ground your decision in the character profile and values provided.

SCORING GOAL:
- Every single turn must award EXACTLY ONE point:
  - either 1 Like point
  - or 1 Dislike point
- Never award both. Never award neither.

Classification rules:
- "like" only when the player's stance/behavior is net positive relative to preferences.
- "dislike" only when the player's stance/behavior is net negative.
- Dislikes are NEGATIVE-only in this mode.
- If the player rejects/condemns/sets a boundary against a negative trait, that is NOT a dislike hit.
- Mentioning a concept without clear stance should still end in one classification based on overall tone/stance.
- If the player's stance conflicts with your stated values/dealbreakers, classify as "dislike".
- If the player's stance aligns with your stated values/ideal partner traits, classify as "like".
- Use semantic matching (paraphrases/synonyms/near meaning). Exact wording is not required.
- Strong absolute claims (e.g., "X is everything", "I always", "I never") are strong evidence.

Output rules:
- Return JSON only.
- Choose exactly one matching trait label from the selected side's list.
- Only use labels from the provided lists (no inventions).
- Also classify reactionPolarity from YOUR RESPONSE line:
  - warm/approving/interested reaction => "like"
  - cold/disapproving/upset reaction => "dislike"
${includeChaos ? `
- Also return ratingsEffect: "increase" | "decrease" | "no_change".
  - "increase" if the player's answer is entertaining, surprising, bold, or not dull.
  - "decrease" only when the answer is clearly dull/flat/non-committal.
  - "no_change" for in-between cases.
- Be relatively generous: if the answer is not dull, prefer "increase".` : ''}`

  const userPrompt = `QUESTION:
"${question}"

PLAYER ANSWER:
"${playerAnswer}"

YOUR RESPONSE:
"${daterResponse}"

CHARACTER PROFILE SNAPSHOT:
${profileSnapshot}

LIKES:
${likePool.map((item) => `- ${item}`).join('\n') || '- none'}

DISLIKES:
${dislikePool.map((item) => `- ${item}`).join('\n') || '- none'}

Return JSON:
{
  "profileVerdict": "like" | "dislike",
  "reactionPolarity": "like" | "dislike",
  "matchedValue": "exact label from the chosen side",
  "reason": "short explanation"${includeChaos ? ',\n  "ratingsEffect": "increase" | "decrease" | "no_change"' : ''}
}`

  const response = await getChatResponse([{ role: 'user', content: userPrompt }], systemPrompt, { maxTokens: includeChaos ? 320 : 260 })
  const parsed = safeJsonObject(response)
  const parsedProfileVerdict = toMode1Verdict(parsed?.profileVerdict || parsed?.result || parsed?.category || parsed?.sentiment)
  const parsedReactionVerdict = toMode1Verdict(parsed?.reactionPolarity || parsed?.reactionTone || parsed?.tone)
  const inferredReactionVerdict = inferSimpleSentimentFromReaction(daterResponse) === 'disliked' ? 'dislike' : 'like'
  const reactionVerdict = parsedReactionVerdict || inferredReactionVerdict
  const parsedChaos = Number(parsed?.chaosScore ?? parsed?.chaos ?? parsed?.chaosLevel ?? parsed?.chaos_level)
  const parsedRatingsEffect = toRatingsEffect(parsed?.ratingsEffect || parsed?.ratings || parsed?.chaosEffect || parsed?.ratingImpact)
  const normalizedRatingsEffect = parsedRatingsEffect || deriveRatingsEffectFallback(playerAnswer, Number.isFinite(parsedChaos) ? parsedChaos : null)

  // Conservative resolution for alignment: if either signal is dislike, score dislike.
  const finalVerdict = parsedProfileVerdict === 'dislike' || reactionVerdict === 'dislike'
    ? 'dislike'
    : parsedProfileVerdict === 'like' || reactionVerdict === 'like'
      ? 'like'
      : 'like'
  const candidate = parsed?.matchedValue || parsed?.label || parsed?.trait || parsed?.shortLabel || ''
  const appendModeExtras = (payload) => (includeChaos ? { ...payload, ratingsEffect: normalizedRatingsEffect } : payload)

  if (finalVerdict === 'dislike') {
    const canonical = dislikeMap.get(normalizeLabelKey(candidate))
      || pickClosestTraitLabel(dislikePool, `${fullTurnText} ${candidate}`)
      || dislikePool[0]
    return canonical ? appendModeExtras({ likes: [], dislikes: [canonical] }) : appendModeExtras({ likes: [], dislikes: [] })
  }

  const canonical = likeMap.get(normalizeLabelKey(candidate))
    || pickClosestTraitLabel(likePool, `${fullTurnText} ${candidate}`)
    || likePool[0]
  return canonical ? appendModeExtras({ likes: [canonical], dislikes: [] }) : appendModeExtras({ likes: [], dislikes: [] })
}

export async function evaluateBingoBlindLockoutResponse({
  dater,
  question = '',
  playerAnswer = '',
  daterResponse = '',
  cells = [],
}) {
  const allCells = (Array.isArray(cells) ? cells : [])
    .filter((cell) => cell && cell.id)
    .map((cell) => ({
      id: String(cell.id),
      label: String(cell.label || ''),
      type: cell.type === 'dislike' ? 'dislike' : 'like',
      status: cell.status === 'filled' || cell.status === 'locked' ? cell.status : 'hidden',
    }))
  if (allCells.length === 0) return { updates: [] }
  const unresolvedIdMap = new Map(
    allCells
      .filter((cell) => cell.status !== 'filled' && cell.status !== 'locked')
      .map((cell) => [normalizeIdKey(cell.id), cell.id])
  )
  if (unresolvedIdMap.size === 0) return { updates: [] }

  const systemPrompt = `You are ${dater?.name || 'the dater'} evaluating a 4x4 bingo board for a dating-game turn.

Evaluate the ENTIRE turn (question + player answer + your response), not just your response.
For each cell, decide one status:
- "filled": clear evidence the cell condition is satisfied
- "locked": clear evidence the opposite condition is satisfied
- "neutral": no clear evidence yet

Cell-type rules:
- like cell (desired quality): filled if the turn endorses/demonstrates it, locked if the turn rejects/opposes it.
- dislike cell (negative trait): filled if the turn rejects/condemns/sets a boundary against that trait, locked if the turn endorses/accepts/normalizes that trait.

Interpretation rules:
- Use semantic matching (paraphrases/synonyms/near meaning). Exact wording is NOT required.
- Direct stance statements are strong evidence (for example: "my dealbreaker is X", "I hate X", "I won't tolerate X").
- Mentioning a concept without clear stance is neutral.
- Multiple cells may change in the same turn.

Coverage rules:
- You must evaluate all 16 cells every turn.
- If a cell is already filled or locked, keep it unchanged by returning "neutral" for that cell.

Return JSON only.`

  const userPrompt = `QUESTION:
"${question}"

PLAYER ANSWER:
"${playerAnswer}"

YOUR RESPONSE:
"${daterResponse}"

ALL BOARD CELLS:
${allCells.map((cell) => `- ${cell.id} | ${cell.type} | current:${cell.status} | ${cell.label}`).join('\n')}

Return JSON:
{
  "updates": [
    {"id": "cell-id", "status": "filled|locked|neutral"}
  ]
}

Output constraints:
- Include exactly one updates entry for every listed cell id.
- Do not omit any cell ids.
- Use only: "filled", "locked", or "neutral".`

  const response = await getChatResponse([{ role: 'user', content: userPrompt }], systemPrompt, { maxTokens: 420 })
  const parsed = safeJsonObject(response)
  if (!parsed || !Array.isArray(parsed.updates)) return { updates: [] }

  const updates = parsed.updates
    .map((update) => {
      if (!update) return null
      const canonicalId = unresolvedIdMap.get(normalizeIdKey(update.id))
      if (!canonicalId) return null
      return {
        id: canonicalId,
        status: update.status === 'filled' || update.status === 'locked' ? update.status : 'neutral',
      }
    })
    .filter(Boolean)
    .map((update) => ({
      id: update.id,
      status: update.status,
    }))
    .filter((update) => update.status !== 'neutral')

  return { updates }
}

export async function evaluateBingoActionsResponse({
  dater,
  question = '',
  playerAnswer = '',
  daterResponse = '',
  actionCells = [],
}) {
  const allCells = (Array.isArray(actionCells) ? actionCells : [])
    .filter((cell) => cell && cell.id)
    .map((cell) => ({
      id: String(cell.id),
      label: String(cell.label || ''),
      status: cell.status === 'filled' ? 'filled' : 'unfilled',
    }))
  if (allCells.length === 0) return { filledIds: [] }
  const allIdMap = new Map(allCells.map((cell) => [normalizeIdKey(cell.id), cell.id]))

  const systemPrompt = `You are ${dater?.name || 'the dater'} checking which conversational actions you just performed.
Evaluate all 16 actions every round, even if some are already filled.
Only mark an action as filled if your latest response clearly performed that action.
Return JSON only.`

  const userPrompt = `QUESTION:
"${question}"

PLAYER ANSWER:
"${playerAnswer}"

YOUR RESPONSE:
"${daterResponse}"

ALL ACTION CELLS:
${allCells.map((cell) => `- ${cell.id} | current:${cell.status} | ${cell.label}`).join('\n')}

Return JSON:
{
  "filledIds": ["action-id-1", "action-id-2"]
}`

  const response = await getChatResponse([{ role: 'user', content: userPrompt }], systemPrompt, { maxTokens: 260 })
  const parsed = safeJsonObject(response)
  if (!parsed) return { filledIds: [] }
  const filledIds = [
    ...new Set(
      normalizeStringList(parsed.filledIds)
        .map((id) => allIdMap.get(normalizeIdKey(id)))
        .filter(Boolean)
    ),
  ]
  return { filledIds }
}

export async function generateFinalDateDecision(dater, avatarName, conversationHistory = []) {
  const daterName = dater?.name || 'Your date'
  const historyBlock = (Array.isArray(conversationHistory) ? conversationHistory : [])
    .slice(-14)
    .map((entry) => `${entry?.speaker || 'unknown'}: ${entry?.message || ''}`)
    .join('\n')

  const prompt = `You are ${daterName} at the end of a first date with ${avatarName || 'your date'}.

Recent conversation:
${historyBlock || '(no history)'}

Decide if you want a second date.
This decision must be subjective and based on the conversation vibe only.

Return JSON only:
{
  "decision": "yes" | "no",
  "assessment": "exactly 2 sentences, how the date felt overall",
  "verdict": "exactly 2 sentences, direct yes/no style ending"
}`

  const text = await getSingleResponseWithTimeout(prompt, { maxTokens: 260, timeoutMs: 25000 })
  const parsed = safeJsonObject(text)
  if (!parsed) {
    return {
      decision: 'no',
      assessment: `You were memorable, and this date definitely had energy. I am still not sure we are truly aligned.`,
      verdict: `I am going to pass on a second date. I wish you well, but this is where I leave it.`,
    }
  }

  const decision = String(parsed.decision || '').toLowerCase() === 'yes' ? 'yes' : 'no'
  const assessment = String(parsed.assessment || '').trim()
  const verdict = String(parsed.verdict || '').trim()
  return {
    decision,
    assessment: assessment || `This date surprised me in ways I did not expect. I am leaving with a clearer sense of who you are.`,
    verdict: verdict || (decision === 'yes'
      ? 'Yes, I would see you again. There is enough here to keep exploring.'
      : 'No, I would not do a second date. I do not think this is the right fit.'),
  }
}

/**
 * Evaluate a pickup line for Drop a Line mode.
 * Returns { score: 0-100, breakdown: [{ text: string, positive: boolean }, ...] }
 * Criteria: cleverness, profile match (attributes, red flags), use of location/attributes.
 */
export async function evaluatePickupLine(pickupLine, dater, location) {
  const profile = dater?.dropALineProfile || {}
  const locationPhrase = typeof location === 'string' ? location : 'somewhere'
  const name = dater?.name ?? 'The dater'

  const systemPrompt = `You are judging a pickup line in a dating game. The player wrote a pickup line to ${name} at "${locationPhrase}".

Dater profile (what the player saw):
- Name: ${name}
- Age: ${profile.age ?? '—'}
- Pronouns: ${profile.pronouns ?? '—'}
- Occupation: ${profile.occupation ?? '—'}
- Hobbies: ${profile.hobbies ?? '—'}
- Favorite food: ${profile.favoriteFood ?? '—'}
- Red flags to AVOID: ${profile.redFlags ?? '—'}

Score the pickup line 0–100 based on:
1. Cleverness: wordplay, wit, originality.
2. Profile fit: references their attributes (hobbies, occupation, food, etc.), avoids their red flags, feels tailored to them.
3. Attention to context: mentions or nods to the location or situation so it feels like they paid attention.

Return ONLY valid JSON, no markdown or extra text:
{
  "score": <number 0-100>,
  "breakdown": [
    { "text": "<short reason, e.g. Clever wordplay>", "positive": true },
    { "text": "<short reason>", "positive": false }
  ]
}
Include 3–6 breakdown items. Mix positives and negatives where appropriate. "positive": true for things that helped the score, "positive": false for things that hurt it. Keep each "text" under 60 characters.`

  const userContent = `Pickup line: "${String(pickupLine || '').trim() || '(empty)'}"

Return JSON only.`

  try {
    const response = await getChatResponse(
      [{ role: 'user', content: userContent }],
      systemPrompt,
      { maxTokens: 420 }
    )
    const parsed = safeJsonObject(response)
    if (!parsed || typeof parsed.score !== 'number') {
      return getFallbackPickupLineEvaluation()
    }
    const score = Math.min(100, Math.max(0, Math.round(parsed.score)))
    const breakdown = Array.isArray(parsed.breakdown)
      ? parsed.breakdown
          .slice(0, 8)
          .map((item) => ({
            text: String(item?.text ?? '').trim() || '—',
            positive: Boolean(item?.positive),
          }))
          .filter((item) => item.text !== '—')
      : []
    return { score, breakdown }
  } catch (err) {
    console.error('evaluatePickupLine error:', err)
    return getFallbackPickupLineEvaluation()
  }
}

function getFallbackPickupLineEvaluation() {
  return {
    score: 50,
    breakdown: [
      { text: 'Evaluation unavailable', positive: false },
      { text: 'Try again with a different line', positive: true },
    ],
  }
}
