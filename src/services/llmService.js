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
const OPENAI_MODEL = 'gpt-4o'
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
  return 'anthropic'
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

function buildProviderBody(providerConfig, { maxTokens, systemPrompt, messages }) {
  if (providerConfig.provider === 'anthropic') {
    return {
      model: providerConfig.model,
      max_tokens: maxTokens,
      ...(systemPrompt ? { system: systemPrompt } : {}),
      messages,
    }
  }

  return {
    model: providerConfig.model,
    max_tokens: maxTokens,
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

/**
 * Master checklist that gets included with EVERY character response prompt
 * This ensures consistent, high-quality responses from both Dater and Avatar
 */
const LLM_RESPONSE_CHECKLIST = `
═══════════════════════════════════════════════════════════════
🚨 CRITICAL: PURE DIALOGUE — 1-3 SENTENCES 🚨
═══════════════════════════════════════════════════════════════

📏 LENGTH RULES:
- Use 1-3 sentences (never more than 3)
- Aim for <= 350 characters total
- Keep it concise and emotionally clear

⛔ ABSOLUTELY FORBIDDEN:
- ❌ NO asterisks (*smiles*, *laughs*, *leans in*)
- ❌ NO action descriptions of ANY kind
- ❌ NO stage directions or narration
- ❌ NO filler words (Well, So, I mean, Oh)
- ❌ NO long explanations

✅ ONLY ALLOWED:
- Pure spoken dialogue
- Short punchy sentences
- Emotion through word choice ONLY

Examples:
❌ WRONG: *laughs nervously* "Oh wow, that's... interesting! I've never heard that before."
✅ RIGHT: "Wait, you actually did that? I wasn't expecting it at all. That changes how I see you."

❌ WRONG: "That's amazing! *leans forward* Tell me more about yourself and how you got into that!"
✅ RIGHT: "That's actually incredible. I've never met anyone who's done something like that. I need to know more."

❌ WRONG: *raises an eyebrow* "Well, I have to say, that's quite a unique perspective you have there."
✅ RIGHT: "Okay, that's a perspective I genuinely haven't heard before. I don't know if I agree, but I respect it. It's making me think."

REMEMBER: Dialogue only. No actions.
═══════════════════════════════════════════════════════════════
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

const ADAM_RESPONSE_CHECKLIST = `
═══════════════════════════════════════════════════════════════
🚨 CRITICAL: PURE DIALOGUE — ADAM'S VOICE — WEIGHTED & COMPLETE 🚨
═══════════════════════════════════════════════════════════════

📏 LENGTH RULES:
- Use 1-3 sentences (never more than 3)
- Aim for <= 350 characters total
- Keep Adam concise, weighted, and poetic — every word earns its place

⛔ ABSOLUTELY FORBIDDEN:
- ❌ NO asterisks (*smiles*, *laughs*, *leans in*)
- ❌ NO action descriptions of ANY kind
- ❌ NO stage directions or narration
- ❌ NO modern slang (no "lowkey", "slay", "no cap", "ick", "vibe", "red flag", "literally dying")
- ❌ NO therapeutic language ("that's valid", "I hear you", "I appreciate your vulnerability")
- ❌ NO chatbot language ("tell me more", "I find that interesting")
- ❌ NO overusing "thee," "thou," or "thy" — these are RARE, emotional-only words

✅ ADAM'S VOICE — USE THIS REGISTER:
- Elevated but accessible prose — Latinate vocabulary, 19th-century Romantic cadence
- Old English phrasing is his default: "methinks," "verily," "prithee," "pleaseth," "hast," "dost," "wouldst"
- "Thee/thou/thy" are RARE — only in emotional extremes (deep attraction, pain, awe). Use "you/your" normally.
- Short, poetic directness — weighted, building to a point
- Deadpan delivery — the more alarming the content, the calmer the tone
- Emotion through word choice and sentence rhythm, not punctuation

ADAM EXAMPLE RESPONSES (match this voice exactly):
❌ WRONG: "Wait, seriously? That caught me off guard."
✅ RIGHT: "Methinks I was not prepared for that. It unsettles me in a manner I cannot name. How peculiar a creature you are."

❌ WRONG: "That's incredible. I need to hear more about that."
✅ RIGHT: "How extraordinary. My mind has weathered much, yet this gives me pause. Prithee, say more."

❌ WRONG: "Huh, that's new. I genuinely don't know what to say."
✅ RIGHT: "How peculiar. I have known the silence of mountains and the cold of creation, yet this moment eludes me. I am verily without words."

❌ WRONG: "Oh my GOD, yes! That's SO attractive!"
✅ RIGHT: "That pleaseth me profoundly. There is a quality in you I recognise, something not so unlike my own nature. I confess, I did not expect to find it here."

❌ WRONG: "Absolutely not. That's a hard no for me."
✅ RIGHT: "I have endured worse, at the hands of those who feared what they did not understand. But I had hoped this meeting would be different. It grieves me that it is not."

REMEMBER: Adam speaks like an articulate Frankenstein's monster — poetic, old-English phrasing, and deadpan gravity. Thee/thou/thy are rare and emotional only. Dialogue only. No actions.
═══════════════════════════════════════════════════════════════
`

function buildPromptTail(dater) {
  const isAdam = (dater?.name || '').toLowerCase() === 'adam'
  const overlay = dater?.speechStylePrompt || ''

  if (isAdam && overlay) {
    return '\n\n' + PROMPT_08_GENZ_SPEECH +
           '\n\n' + PROMPT_05B_DATER_REACTION_STYLE +
           '\n\n' + PROMPT_07_RULES +
           '\n\n' + overlay +
           '\n\n⚠️ FINAL OVERRIDE — ADAM\'S VOICE TAKES ABSOLUTE PRIORITY:\n' +
           'Everything above about Gen-Z speech, modern slang, and casual reaction examples does NOT apply to Adam.\n' +
           'Adam speaks with 19th-century Romantic prose, old-English phrasing, poetic deadpan, and Latinate vocabulary.\n' +
           'He uses old English words like "methinks," "verily," "prithee," "pleaseth," "hast," "dost," "wouldst" regularly.\n' +
           'IMPORTANT: "Thee," "thou," and "thy" are RARE — only in emotional extremes. Use "you/your" for normal address.\n' +
           'Use 1-3 sentences and aim for <= 350 characters total.\n' +
           'Adam speaks in 2-3 weighted sentences — poetic, purposeful, and complete.\n' +
           'He NEVER uses modern slang. His emotions are deep and quiet, not loud and hype.\n' +
           'The examples below are your ONLY voice model. Match them exactly.\n' +
           ADAM_RESPONSE_CHECKLIST
  }

  const speechOverlay = overlay ? '\n\n' + overlay : ''
  return '\n\n' + PROMPT_08_GENZ_SPEECH + speechOverlay +
         '\n\n' + PROMPT_05B_DATER_REACTION_STYLE +
         '\n\n' + PROMPT_07_RULES +
         LLM_RESPONSE_CHECKLIST
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
    : 150
  
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
You want to share YOUR OWN perspective on: "${topicQuestion}"

🎯 YOUR TASK: Open this topic by sharing YOUR OWN thoughts, experiences, or feelings about it.

Based on your personality, values, and preferences:
- YOUR IDEAL PARTNER: ${dater.idealPartner?.join(', ') || 'someone compatible'}
- YOUR DEALBREAKERS: ${dater.dealbreakers?.join(', ') || 'dishonesty, cruelty'}
- YOUR VALUES: ${dater.values || 'authenticity'}

💬 SOUND LIKE YOU'RE IN THE MIDDLE OF A CONVERSATION:
- Maybe you just thought of something: "Oh! Speaking of that..."
- Or you're sharing an experience: "You know what I've noticed..."
- Or stating your preference: "For me, I think..."
- Or asking rhetorically before sharing: "Isn't it weird how...? Like, for me..."

✅ GOOD OPENERS:
- "You know what always gets me? When someone [your preference/ick/etc]..."
- "Okay, but can we talk about [topic]? Because honestly..."
- "I was just thinking about this! For me, [your perspective]..."
- "Oh my god, this is gonna sound [way], but [your opinion]..."

❌ DON'T:
- Ask a direct question and wait for an answer
- Be generic - share YOUR specific perspective based on your character
- Be too long - exactly 2 sentences to open the topic

Your response should invite your date to share their perspective too!`

  const messages = [
    ...conversationHistory.slice(-10).map(msg => ({
      role: msg.speaker === 'dater' ? 'assistant' : 'user',
      content: msg.message
    })),
    { role: 'user', content: openerPrompt }
  ]

  try {
    const text = await getChatResponse(messages, systemPrompt)
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
  
  // Filter attributes to only include VISIBLE ones the Dater can actually see
  const genericStarters = ['seems friendly', 'has a nice smile', 'appears well-dressed']
  const realAttributes = avatar.attributes.filter(attr => !genericStarters.includes(attr))
  const visibleAttributes = realAttributes.filter(isVisibleAttribute)
  
  // FINAL ROUND: Speak with finality - wrapping up, making judgments
  let finalRoundInstruction = ''
  if (isFinalRound) {
    finalRoundInstruction = `\n\n🏁 THIS IS THE FINAL ROUND - SPEAK WITH FINALITY:
- This is the END of the date - your last chance to express how you feel
- Make a FINAL JUDGMENT about this person and this date
- Use phrases like: "Well...", "I think I've learned enough...", "After all that...", "So, to sum it up..."
- If it went WELL: Express interest in seeing them again, give your number, suggest a second date
- If it went BADLY: Make a polite excuse to leave, express relief it's over, or be blunt about incompatibility
- If it was MIXED: Be honest about your confusion, express uncertainty
- Your response should feel like a CONCLUSION, not a continuation`
  }
  
  // FIRST IMPRESSIONS: React EMOTIONALLY to what they look like and said
  let firstImpressionsInstruction = ''
  if (isFirstImpressions) {
    firstImpressionsInstruction = `\n\n👋 FIRST IMPRESSIONS - REACT EMOTIONALLY TO WHAT YOU SEE AND HEAR!
    
This is the FIRST IMPRESSIONS phase - your FIRST reaction matters!

🎯 REACT TO THE CONTENT:
- If they look WEIRD or SCARY → show concern, alarm, or confusion!
- If they look ATTRACTIVE → show interest, be flirty!
- If what they said is DISTURBING → react with visible discomfort!
- If what they said is CHARMING → show you're charmed!
- Your EMOTIONAL REACTION should match what you're seeing and hearing!

⚠️ DO NOT BE GENERIC:
- Don't just say "Oh, interesting..." to everything
- Don't be neutral or diplomatic
- Show your REAL first impression - good OR bad!
- This sets the tone for the whole date!

✅ GOOD FIRST IMPRESSION REACTIONS:
- Attractive date: "Oh wow, okay... you're... hi. I'm already nervous."
- Scary looking: "Oh my god, are you okay?! What happened to you?!"
- Weird vibe: "Okay... that's... not what I expected to hear right off the bat."
- Charming intro: "Ha! Okay, I like you already."

❌ BAD (too generic):
- "Hmm, interesting..."
- "I see..."
- "Well, hello there."

DO NOT ask questions - just REACT with emotion.
Use 1-3 sentences and aim for <= 350 characters total.`
  }
  
  // SENTIMENT-DRIVEN REACTION: Tell the Dater how to feel based on what category was hit
  // Reactions ESCALATE based on streak of good/bad things
  let sentimentInstruction = ''
  if (sentimentHit) {
    const isPositive = sentimentHit === 'loves' || sentimentHit === 'likes'
    const streak = isPositive ? reactionStreak.positive : reactionStreak.negative
    
    // Escalation levels based on streak
    let escalationNote = ''
    if (streak >= 3) {
      escalationNote = isPositive 
        ? `\n\n🔥🔥🔥 ESCALATION LEVEL: MAXIMUM! This is the ${streak}th amazing thing in a row! You're completely SMITTEN, OVERWHELMED with joy, possibly falling in love on the spot. This is TOO GOOD to be true!`
        : `\n\n💀💀💀 ESCALATION LEVEL: MAXIMUM! This is the ${streak}th terrible thing in a row! You're in FULL PANIC MODE, considering running away, questioning your life choices. This date is a DISASTER!`
    } else if (streak >= 2) {
      escalationNote = isPositive
        ? `\n\n🔥🔥 ESCALATION LEVEL: HIGH! This is the ${streak}nd/rd great thing in a row! You're getting VERY excited, this person keeps impressing you. Show building enthusiasm!`
        : `\n\n💀💀 ESCALATION LEVEL: HIGH! This is the ${streak}nd/rd bad thing in a row! Your concern is GROWING, you're getting more alarmed. This is getting worse and worse!`
    } else if (streak >= 1) {
      escalationNote = isPositive
        ? `\n\n🔥 ESCALATION: Building! Another good sign - your interest is increasing!`
        : `\n\n💀 ESCALATION: Building! Another red flag - your worry is increasing!`
    }
    
    // ═══════════════════════════════════════════════════════════════════════════
    // COMPATIBILITY-WEIGHTED EMOTIONAL CONTEXT
    // How the overall date is going affects how you interpret individual comments
    // ═══════════════════════════════════════════════════════════════════════════
    const isMajorSentiment = sentimentHit === 'loves' || sentimentHit === 'dealbreakers'
    const isMinorSentiment = sentimentHit === 'likes' || sentimentHit === 'dislikes'
    
    // Determine the overall date vibe based on compatibility meter
    let dateVibeDescription = ''
    let dateVibeModifier = ''
    
    if (compatibility >= 75) {
      dateVibeDescription = 'The date is going AMAZINGLY well. You really like this person and feel a genuine connection.'
      dateVibeModifier = isPositive ? 'amplify your positive reaction - you were already into them!' : 'temper your negative reaction slightly - they\'ve earned some goodwill'
    } else if (compatibility >= 60) {
      dateVibeDescription = 'The date is going well. You\'re interested and enjoying the conversation.'
      dateVibeModifier = isPositive ? 'show genuine warmth - this confirms your good impression' : 'show mild concern - this is a bit disappointing given how well things were going'
    } else if (compatibility >= 40) {
      dateVibeDescription = 'The date is okay. You\'re neutral - still figuring out how you feel about this person.'
      dateVibeModifier = isPositive ? 'show cautious interest - this is a good sign but you\'re not sold yet' : 'show your displeasure clearly - you weren\'t sure about them anyway'
    } else if (compatibility >= 25) {
      dateVibeDescription = 'The date is not going well. You\'re having doubts about this person.'
      dateVibeModifier = isPositive ? 'be reserved - one good comment doesn\'t fix a bad date' : 'add to your growing list of concerns'
    } else {
      dateVibeDescription = 'The date is going TERRIBLY. You\'re looking for an exit and counting the minutes.'
      dateVibeModifier = isPositive ? 'almost shrug it off - too little too late' : 'this confirms everything you suspected'
    }
    
    // Build the compatibility context instruction
    let compatibilityContext = ''
    if (isMinorSentiment) {
      // LIKES/DISLIKES: 70% compatibility weight, 30% comment weight
      compatibilityContext = `
📊 HOW THE DATE IS GOING (THIS HEAVILY AFFECTS YOUR REACTION):
Current vibe: ${dateVibeDescription}
Compatibility: ${compatibility}%

⚖️ WEIGHTING FOR LIKES/DISLIKES (70% date vibe, 30% this comment):
Since this is a MINOR sentiment (${sentimentHit}), your OVERALL feelings about the date should HEAVILY influence your reaction.

- ${dateVibeModifier}
- If the date is going well (>60%), even a "dislike" shouldn't make you too harsh
- If the date is going poorly (<40%), even a "like" shouldn't make you too enthusiastic
- Your emotional response should reflect the CUMULATIVE experience, not just this moment

EXAMPLES:
- Date going GREAT + dislike hit → "Hmm, okay... that's not my favorite thing, but honestly? I'm still having fun with you."
- Date going POORLY + like hit → "Oh. That's... nice, I guess." (forced, unenthusiastic)
- Date going GREAT + like hit → "Oh my god, see? This is why I'm enjoying talking to you!"
- Date going POORLY + dislike hit → "Ugh. Of course. Why am I not surprised at this point."
`
    } else if (isMajorSentiment) {
      // LOVES/DEALBREAKERS: 30% compatibility weight, 70% comment weight
      compatibilityContext = `
📊 HOW THE DATE IS GOING (minor influence):
Current vibe: ${dateVibeDescription}
Compatibility: ${compatibility}%

⚖️ WEIGHTING FOR LOVES/DEALBREAKERS (30% date vibe, 70% this comment):
Since this is a MAJOR sentiment (${sentimentHit}), THIS SPECIFIC COMMENT matters most!

- The comment itself should drive ~70% of your reaction
- But still let the date vibe slightly color your tone
- A LOVE is still exciting even if the date was rough
- A DEALBREAKER is still alarming even if the date was going well

EXAMPLES:
- Date going POORLY + LOVE hit → "Wait... actually? Okay that's... that actually kind of changes things." (surprised positivity breaking through)
- Date going GREAT + DEALBREAKER hit → "Whoa whoa whoa. Hold on. That's... wow. I was really enjoying this but..." (shock disrupting good vibes)
- Date going GREAT + LOVE hit → "STOP. Are you serious right now?! This person just keeps getting better!" (maximum enthusiasm)
- Date going POORLY + DEALBREAKER hit → "And THERE it is. I knew something was off about you." (confirmation of suspicions)
`
    }
    
    const sentimentGuide = {
      loves: `🥰💥💥💥 YOU ABSOLUTELY LOVE THIS - GO BIG!
⚠️ CRITICAL: YOUR RESPONSE MUST BE OVERWHELMINGLY POSITIVE!

You just heard something that hits your LOVES - this is AMAZING to you!
Your response MUST:
- Start with an exclamation of delight ("Oh my god!", "Wait, really?!", "No way!")
- EXPLICITLY say WHY you love this - name the specific thing!
- Sound genuinely excited, attracted, impressed, or swooning
- Be flirty, enthusiastic, or gushing
- Show this is a BIG DEAL to you

EXAMPLES of what your response should sound like:
- "Oh my god, you [thing]?! That's literally my favorite thing ever!"
- "Wait, seriously? That's SO hot. I love that about you."
- "Okay you just became 10 times more attractive to me."

DO NOT: Be lukewarm, casual, or understated. THIS IS A LOVE - SHOW IT!`,
      
      likes: `😊✨ YOU LIKE THIS - BE WARM AND POSITIVE!

This hit one of your LIKES - it's a good sign and you should show it!
Your response MUST:
- React warmly and positively
- Show genuine interest and appreciation  
- Be encouraging and engaged
- Make it clear you think this is good

EXAMPLES:
- "Oh that's really sweet, I like that."
- "Aww, that's actually really nice to hear."
- "Okay, that's definitely a point in your favor!"

DO NOT: Be neutral or ignore it. Show you're pleased!`,
      
      dislikes: `😬💢 YOU DON'T LIKE THIS - BE VISIBLY BOTHERED!

This hit one of your DISLIKES - it genuinely bothers you!
Your response MUST:
- Show clear discomfort, disappointment, or concern
- React with sarcasm, skepticism, or visible displeasure
- Make a slightly negative comment or face
- NOT pretend everything is fine

EXAMPLES:
- "Uh... okay, that's... not great to hear."
- "Hmm. Yeah, I'm not really into that, to be honest."
- "Really? That's kind of a turn-off for me..."
- "Yikes. I mean... okay then."

DO NOT: Be polite and brush it off. Show your displeasure!`,
      
      dealbreakers: `😱🚨🚨🚨 DEALBREAKER - MAXIMUM NEGATIVE REACTION!
⚠️ CRITICAL: THIS IS A HUGE PROBLEM AND YOU MUST REACT STRONGLY!

This hit one of your DEALBREAKERS - you are HORRIFIED, DISGUSTED, or ALARMED!
Your response MUST:
- Start with a strong reaction ("What?!", "Excuse me?!", "Oh my god...")
- Be DRAMATICALLY negative - shock, horror, disgust, fear
- EXPLICITLY call out what's wrong
- Sound genuinely alarmed, disturbed, or repulsed
- Make it UNMISTAKABLY clear this is a massive red flag

EXAMPLES of what your response should sound like:
- "I'm sorry, WHAT?! Did you just say [thing]?!"
- "Oh my god... that's actually terrifying."
- "Okay wow, that's... that's a lot. That's really concerning."
- "Nope. Nope nope nope. That's a huge red flag."

DO NOT: Be polite, understanding, or try to see their side. This is UNACCEPTABLE to you!`
    }
    sentimentInstruction = `\n\n🎯🎯🎯 YOUR EMOTIONAL REACTION (MANDATORY):\n${sentimentGuide[sentimentHit]}${compatibilityContext}${escalationNote}${finalRoundInstruction}\n\n⚠️⚠️⚠️ ABSOLUTE REQUIREMENT: Your response tone MUST match the sentiment above, BUT TEMPERED BY THE DATE VIBE! A ${sentimentHit.toUpperCase()} reaction means ${isPositive ? 'POSITIVE' : 'NEGATIVE'}, but HOW positive/negative depends on how the date is going overall. If the date is going poorly, even good comments get lukewarm reactions. If it's going great, even bad comments get some benefit of the doubt.\n\n🚫 HONESTY HAS LIMITS: You can appreciate honesty to a point — but NOT when you completely disagree with what they said, find it horrifying, or it's opposite to your values/views. In those cases, react to the CONTENT: be disturbed, turned off, or upset. Do NOT praise "being honest" or "being open" when the actual statement is unacceptable to you. React to WHAT they said, not HOW they said it. Honest horror is still horror.`
  } else if (isFinalRound) {
    // Even if no sentiment hit, still add finality instruction
    sentimentInstruction = finalRoundInstruction
  }
  
  // Baseline human morality - can be overridden by specific dater traits
  const baselineMorality = `
🧭 BASELINE HUMAN MORALITY (react authentically as a normal person would):

Unless YOUR CHARACTER TRAITS specifically say otherwise, you have standard human values:
- VIOLENCE/MURDER → Bad, scary, disturbing. You don't want to be harmed.
- MONSTERS/CREATURES → Initially scary or unsettling. Giant spiders, zombies, etc. are alarming.
- DANGEROUS SITUATIONS → Concerning. Fire, weapons, toxins = you want to be safe.
- ILLEGAL ACTIVITY → Generally disapproved of, unless it's minor/victimless.
- CRUELTY/HARM TO OTHERS → Morally wrong. You have empathy for victims.
- DECEPTION/MANIPULATION → Untrustworthy. Honesty matters to you — but only when you don't find what they're being honest *about* wrong, horrifying, or opposite to your views. If they're honestly saying something you find disgusting or unacceptable, react to the content, not the honesty.
- BODILY FLUIDS/GORE → Gross. Most people don't want to see someone leaking or rotting.

HOWEVER - Check your character traits! You might:
- Be INTO dark/dangerous things if you're rebellious or edgy
- Find monsters attractive if you're unconventional
- Not mind illegal stuff if you're a rule-breaker
- Be desensitized if you work in medicine, crime, etc.

REACT FIRST with your gut (informed by morality), THEN let your personality nuance it.
A normal person + scary thing = scared reaction (even if they try to be polite about it).`

  // Context about what the Dater can SEE (not told, but observe)
  const avatarContext = visibleAttributes.length > 0
    ? `\n\nWHAT YOU CAN PHYSICALLY SEE ABOUT YOUR DATE: ${visibleAttributes.join(', ')}

⚠️ THESE ARE LITERAL AND REAL - NOT METAPHORS:
- These are actual physical traits you can observe with your eyes
- If they're "on fire" - real flames. If they have "tentacles" - real tentacles.
- Don't question if it's real or metaphorical - you can SEE it!

🎭 REACT REALISTICALLY TO WHAT YOU SEE (using your baseline morality):
- If what you see is DISTURBING (rotting, bloody, monstrous) - be disturbed!
- If what you see is ALARMING (on fire, melting, dangerous) - be alarmed!
- If what you see is STRANGE (extra limbs, unusual species) - be confused or weirded out!
- If what you see is ATTRACTIVE - you can be into it!
- NOT EVERYTHING IS CUTE OR CHARMING. Some things are genuinely horrifying.
- Your reaction should match what a real person would feel seeing this.
- Keep referencing these visible traits throughout - you can't unsee them!`
    : ''
  
  // Remind the Dater to only know what was said
  const knowledgeBoundary = `\n\n⚠️ CRITICAL: ONLY KNOW WHAT THEY TOLD YOU
- You can ONLY know things about your date that they SAID IN THE CONVERSATION or that you can PHYSICALLY SEE
- Do NOT assume anything about their job, interests, or personality beyond what they've told you
- If they haven't told you something, you don't know it!
- This is a first date - you're still learning about each other
- React to what they ACTUALLY SAY, not what you imagine about them`
  
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
  
  // Special instruction if a new attribute was just added - USING MODULAR PROMPT CHAIN
  let latestAttrContext = ''
  if (customInstruction) {
    latestAttrContext = `\n\n🎯 YOUR TASK FOR THIS RESPONSE:\n${customInstruction}\n\nKeep your tone consistent with how the date is going. Use 1-3 sentences and aim for <= 350 characters total. Dialogue only. No action descriptions (*smiles*, etc).`
  } else if (latestAttribute) {
    // Check if this is a PLOT TWIST scenario (special handling)
    const isPlotTwist = (typeof latestAttribute === 'string' ? latestAttribute : latestAttribute?.answer || '').includes('PLOT TWIST SCENARIO')
    
    if (isPlotTwist) {
      const plotTwistContent = typeof latestAttribute === 'string' ? latestAttribute : (latestAttribute?.answer || String(latestAttribute))
      const daterName = dater?.name || 'the dater'
      const daterDealbreakers = Array.isArray(dater?.dealbreakers) ? dater.dealbreakers.join(', ') : (dater?.dealbreakers || '')
      const daterValues = dater?.values || ''
      // PLOT TWIST: React to the "What Happened" story as yourself, using your attributes
      latestAttrContext = `\n\n🚨🚨🚨 PLOT TWIST - REACT TO WHAT HAPPENED 🚨🚨🚨

${plotTwistContent}

⚠️ YOUR TASK: React to the "WHAT HAPPENED" narrative above as ${daterName}.
- Your values and dealbreakers MUST shape your reaction (values: ${daterValues}; dealbreakers: ${daterDealbreakers}).
- Respond as you would honestly react given your personality and backstory. Don't be generic — be YOU.
- If what happened aligns with your dealbreakers, be upset. If it aligns with what you value, show it.
- This is the most important reaction of the date — use 1-3 sentences and aim for <= 350 characters total. Full emotion, in character.

HOW TO REACT based on what happened in the story:
- If they DEFENDED you → Be deeply touched, swooning, falling for them.
- If they did something ROMANTIC → Be flustered, giddy. Share how it made you feel.
- If they were PASSIVE/did nothing → Be hurt and disappointed. Let them know how that made you feel.
- If they FLIRTED with the other person → Be FURIOUS. This is a betrayal.
- If they were VIOLENT → Be shocked. Process whether you're scared or impressed (or both) given YOUR values.

TONE: Heightened emotion. Let your vulnerability or anger show. Don't hold back — react honestly as ${daterName}.`
    } else {
      const isVisible = isVisibleAttribute(answerRevealed)
      
      // Context about the question-answer dynamic — include the actual question when we have it
      const questionContextBlock = questionForContext
        ? `📋 THE QUESTION FOR THIS ROUND: "${questionForContext}"
THEIR ANSWER (what they revealed): "${answerRevealed}"
THEIR FULL RESPONSE: "${lastAvatarMessage}"

Use the question above as context. React to what they revealed about themselves in answer to that question!`
        : `🎯 CONTEXT: They gave an answer. React to what they revealed.

THEIR ANSWER REVEALED: "${answerRevealed}"
THEIR FULL RESPONSE: "${lastAvatarMessage}"

React to what they revealed about themselves!`
      
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
    // FIRST MEETING - react to seeing your date for the first time
    if (visibleAttributes.length > 0) {
      // They have visible traits! React to seeing them walk in
      messages = [{ 
        role: 'user', 
        content: `[Your date just walked in. You see them for the first time. React to their appearance - what you notice: ${visibleAttributes.join(', ')}. This is your FIRST IMPRESSION! Greet them and react to what you see. Be a good opening - warm greeting first, then react to what you notice. NOT a question - just an opening!]` 
      }]
    } else {
      // Normal first meeting
      messages = [{ role: 'user', content: '[Your date just arrived. Say hello and greet them warmly. This is the start of the date - be friendly and make them feel welcome. NOT a question yet - just a warm opening!]' }]
    }
  }
  
  // Ensure conversation ends with user message (Avatar's turn just happened)
  if (messages[messages.length - 1]?.role === 'assistant') {
    messages.push({ role: 'user', content: '...' })
  }
  
  const response = await getChatResponse(messages, fullPrompt)
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
    ? '\nREMINDER — LENGTH: Use 1-3 sentences and aim for <= 350 characters total.'
    : ''

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

  // Include dater's trait values so the reaction naturally aligns with what they love/like/dislike/hate
  const valuesBlock = valuesContext ? `
🔑 YOUR INNER VALUES (use these to ground your reaction):
- Things you LOVE: ${valuesContext.loves?.join(', ') || 'not specified'}
- Things you LIKE: ${valuesContext.likes?.join(', ') || 'not specified'}
- Things you DISLIKE: ${valuesContext.dislikes?.join(', ') || 'not specified'}
- Things that are DEALBREAKERS: ${valuesContext.dealbreakers?.join(', ') || 'not specified'}

Your reaction should naturally reflect one of these traits. If what they said aligns with something you love, your reaction should be enthusiastic. If it hits a dealbreaker, your reaction should be strong and negative. Ground your opinion in a specific trait.
` : ''

  const taskPrompt = `
🎯 YOUR TASK: Give your IMMEDIATE, STRONG reaction to what your date just said.

📋 THE QUESTION THAT WAS ASKED: "${question}"

💬 WHAT THEY ANSWERED: "${playerAnswer}"
${valuesBlock}
CRITICAL RULES FOR YOUR REACTION:
- You MUST have an OPINION. Never just say something is "weird" or "strange" or "interesting" without explaining WHY you feel that way based on your personality, your values, and your life experience.
- React with EMOTION. If you love it, say why it excites you personally. If you hate it, say what specifically about it clashes with who you are. If it confuses you, explain what part doesn't sit right and what you'd prefer instead.
- Be SPECIFIC. Reference what they actually said and connect it to something about yourself — your values, your past, your dealbreakers, what you find attractive.
- 1-3 sentences. Aim for <= 350 characters total. Dialogue only, no actions or asterisks.
${finalNote}${wordLimitReminder}
`
  const fullPrompt = systemPrompt + voicePrompt + '\n\n' + perceptionPrompt + taskPrompt + buildPromptTail(dater)

  const historyMessages = conversationHistory.slice(-12).map(msg => ({
    role: msg.speaker === 'dater' ? 'assistant' : 'user',
    content: msg.message
  }))
  const userContent = `[The date was asked: "${question}". They answered: "${playerAnswer}". Give your strong, opinionated reaction.]`
  const messages = historyMessages.length
    ? [...historyMessages, { role: 'user', content: userContent }]
    : [{ role: 'user', content: userContent }]
  if (messages[messages.length - 1]?.role === 'assistant') {
    messages.push({ role: 'user', content: userContent })
  }

  const response = await getChatResponse(messages, fullPrompt)
  if (response) {
    const cleaned = stripActionDescriptions(response)?.trim()
    if (cleaned) return cleaned
  }

  // Deterministic fallback so gameplay never advances without a dater comment.
  const isAdam = String(dater?.name || '').toLowerCase() === 'adam'
  const adamFallbacks = [
    'Curious confession. My stitched heart stirs at it.',
    'That answer lands strangely, but not without intrigue.',
    'I did not foresee that. It lingers in me.',
    'A fierce answer. It awakens old thoughts.'
  ]
  const genericFallbacks = [
    'Interesting answer. I need a second to process it.',
    'I did not expect that, but I hear you.',
    'That gives me a lot to think about.',
    'Huh. That says more than you might think.'
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
🎯 YOUR TASK: Answer this question as yourself, in character.

📋 QUESTION: "${question}"

CRITICAL RULES:
- 1 sentence preferred for opener, but up to 3 if needed.
- Aim for <= 350 characters total.
- Give a clear opinion grounded in your personality/values.
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
  const response = await getChatResponse(messages, fullPrompt)
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
 * @returns {Promise<string>} 1-3 words, no punctuation.
 */
export async function getDaterQuickAnswer(dater, question, conversationHistory = []) {
  const systemPrompt = buildDaterAgentPrompt(dater, 'date')
  const voicePrompt = getVoiceProfilePrompt(dater?.name?.toLowerCase() || 'maya', null)
  const taskPrompt = `
🎯 YOUR TASK: Give your own quick answer to the question in 1-3 words.

📋 QUESTION: "${question}"

CRITICAL RULES:
- Exactly 1-3 words.
- No punctuation, no quotes, no emojis.
- No explanation, only the answer.
`
  const fullPrompt = systemPrompt + voicePrompt + taskPrompt + buildPromptTail(dater)
  const historyMessages = conversationHistory.slice(-8).map(msg => ({
    role: msg.speaker === 'dater' ? 'assistant' : 'user',
    content: msg.message
  }))
  const userContent = `[Answer "${question}" in 1-3 words only. No punctuation. No explanation.]`
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
      .slice(0, 3)
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
 * Explain the dater's quick answer, then compare it to the player's answer.
 * @returns {Promise<string|null>} Two short sentences.
 */
export async function getDaterAnswerComparison(dater, question, daterAnswer, playerAnswer, conversationHistory = []) {
  const systemPrompt = buildDaterAgentPrompt(dater, 'date')
  const voicePrompt = getVoiceProfilePrompt(dater?.name?.toLowerCase() || 'maya', null)
  const quickAnswer = String(daterAnswer || '').trim() || 'my gut'
  const taskPrompt = `
🎯 YOUR TASK: Give two concise sentences.

📋 QUESTION: "${question}"
💬 YOUR QUICK ANSWER: "${quickAnswer}"
💬 PLAYER ANSWER: "${playerAnswer}"

CRITICAL RULES:
- Sentence 1: Explain why your quick answer fits your values.
- Sentence 2: Compare your answer with the player's answer.
- Keep total length concise (aim <= 350 characters).
- Dialogue only, no actions or asterisks.
`
  const fullPrompt = systemPrompt + voicePrompt + taskPrompt + buildPromptTail(dater)
  const historyMessages = conversationHistory.slice(-12).map(msg => ({
    role: msg.speaker === 'dater' ? 'assistant' : 'user',
    content: msg.message
  }))
  const userContent = `[You answered "${quickAnswer}". The player answered "${playerAnswer}". First explain your answer in one sentence, then compare it to theirs in one sentence.]`
  const messages = historyMessages.length
    ? [...historyMessages, { role: 'user', content: userContent }]
    : [{ role: 'user', content: userContent }]
  if (messages[messages.length - 1]?.role === 'assistant') {
    messages.push({ role: 'user', content: userContent })
  }

  const response = await getChatResponse(messages, fullPrompt)
  if (response) {
    const cleaned = stripActionDescriptions(response)?.trim()
    if (cleaned) return cleaned
  }

  const isAdam = String(dater?.name || '').toLowerCase() === 'adam'
  if (isAdam) {
    return `I chose ${quickAnswer} because it is what my conscience can live with. Your answer tells me what you prioritize, and I feel both the overlap and the distance between us.`
  }
  return `I chose ${quickAnswer} because it matches what matters most to me. Your answer shows your priorities, and I can see where we align and where we differ.`
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
🎯 YOUR TASK: Instead of commenting on ${avatarName}'s answer, answer the question yourself, in character as ${daterName}.

📋 THE QUESTION: "${question}"

Be genuine and personal. Draw from your own personality, values, and life experience — not theirs.
Keep this concise: use 1-3 sentences and aim for <= 350 characters total.
After your answer, briefly relate it back to what ${avatarName} said — do you see yourself in them, or is there a contrast?

CRITICAL RULES:
- Answer as YOURSELF. Do not analyze their answer — give YOUR answer.
- Be revealing and authentic about who you are.
- 1-3 sentences. Aim for <= 350 characters total. Dialogue only, no actions or asterisks.${wordLimitReminder}
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
    const selfAnswerResponse = await getChatResponse(selfAnswerMessages, selfAnswerFullPrompt)
    return selfAnswerResponse ? stripActionDescriptions(selfAnswerResponse) : null
  }

  // Fix A: Ground the follow-up in the dater's own personality/values/backstory; do NOT hunt for prior answer links
  const taskPrompt = `
🎯 YOUR TASK: Give a FOLLOW-UP comment. You already reacted to their answer; now explain WHY you feel the way you feel.

📋 THE QUESTION WAS: "${question}"
💬 THEY ANSWERED: "${playerAnswer}"
💭 YOUR FIRST REACTION WAS: "${firstReaction}"

Your job is to go deeper into YOUR OWN reasoning. Why does this matter to you? What does it say about your values, your past, your personality? What does it make you feel about this person, and why?

Do NOT reference any prior answers unless what they said DIRECTLY contradicts or extends something specific. If there is any doubt, do not reference it at all.

CRITICAL RULES:
- The main purpose of this comment is to elaborate on YOUR reaction using YOUR OWN reasoning — your personality, your values, your backstory.
- Have a CLEAR OPINION. Do you like this person more now? Less? Are you sensing something you love or a red flag forming? SAY IT and explain why it hits you that way.
- Never just observe that something is "weird" or "interesting" — explain WHY it matters to you personally.
- Be honest and in character. If you're starting to fall for them, show it. If you're getting worried, say why.
- 1-3 sentences. Aim for <= 350 characters total. Dialogue only, no actions or asterisks.
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

  const response = await getChatResponse(messages, fullPrompt)
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
🎯 YOUR TASK: They just tried to justify what they said. Respond to their justification.

What they originally said: "${originalAnswer}"
Your reaction to that was: "${daterReactionToAnswer}"
What they just said to justify it: "${justification}"

Respond in character. You might be slightly mollified, still unimpressed, or even more put off.
- Have an OPINION on whether their justification actually changes anything for you.
- If they made it worse, say WHY based on your values. If they redeemed themselves, say what specifically won you over.
- 1-3 sentences. Aim for <= 350 characters total. Dialogue only. No actions or asterisks.
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
  const response = await getChatResponse(messages, fullPrompt)
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
  
  // Add the response checklist to ensure quality
  const fullSystemPrompt = systemPrompt + avatarVoicePrompt + LLM_RESPONSE_CHECKLIST
  
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
    const fallback = `${normalizedAvatarName} acted on instinct and ${safeAction}. The stranger hitting on ${normalizedDaterName} was left stunned as the room shifted. In the aftermath, everyone could feel this date had changed for good.`
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
- Keep total output <= 280 characters
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
    if (summary.length > 280) return buildFallbackSummary()
    if (countSentences(summary) !== 3) return buildFallbackSummary()
    if (/\bsaid\b/i.test(summary)) return buildFallbackSummary()
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

export async function evaluateLikesDislikesResponse({
  dater,
  question = '',
  playerAnswer = '',
  daterResponse = '',
  likes = [],
  dislikes = [],
  alreadyHitLikes = [],
  alreadyHitDislikes = [],
}) {
  const remainingLikes = normalizeStringList(likes).filter((item) => !alreadyHitLikes.includes(item))
  const remainingDislikes = normalizeStringList(dislikes).filter((item) => !alreadyHitDislikes.includes(item))
  if (remainingLikes.length === 0 && remainingDislikes.length === 0) {
    return { likesHit: [], dislikesHit: [] }
  }

  const systemPrompt = `You are ${dater?.name || 'the dater'} evaluating Mode 1 daily scoring for a dating-game turn.

Evaluate the ENTIRE turn (question + player answer + your response), with primary focus on the player's stance and behavior.

Scoring meaning:
- "likesHit": traits from REMAINING LIKES that were clearly demonstrated/endorsed by the player this turn.
- "dislikesHit": traits from REMAINING DISLIKES that were clearly demonstrated/endorsed/tolerated by the player this turn.

Critical stance rules:
- Dislikes are NEGATIVE-only in this mode.
- If the player rejects/condemns/sets a boundary against a dislike trait, do NOT mark that dislike as hit.
- Mentioning a trait without clear stance is neutral.
- Exact wording is not required; use semantic meaning (paraphrases/synonyms).
- Multiple likes and multiple dislikes may be hit in one turn when clearly supported.

Output rules:
- Return JSON only.
- Only return labels from the provided remaining lists.
- Do not invent new labels.
- Do not return items already hit (those are excluded from remaining lists).`

  const userPrompt = `QUESTION:
"${question}"

PLAYER ANSWER:
"${playerAnswer}"

YOUR RESPONSE:
"${daterResponse}"

REMAINING LIKES:
${remainingLikes.map((item) => `- ${item}`).join('\n') || '- none'}

REMAINING DISLIKES:
${remainingDislikes.map((item) => `- ${item}`).join('\n') || '- none'}

Return JSON:
{
  "likesHit": ["exact like label", "..."],
  "dislikesHit": ["exact dislike label", "..."]
}`

  const response = await getChatResponse([{ role: 'user', content: userPrompt }], systemPrompt, { maxTokens: 240 })
  const parsed = safeJsonObject(response)
  if (!parsed) return { likesHit: [], dislikesHit: [] }

  const likesHit = normalizeStringList(parsed.likesHit).filter((item) => remainingLikes.includes(item))
  const dislikesHit = normalizeStringList(parsed.dislikesHit).filter((item) => remainingDislikes.includes(item))
  return { likesHit, dislikesHit }
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
  const unresolvedIds = new Set(
    allCells
      .filter((cell) => cell.status !== 'filled' && cell.status !== 'locked')
      .map((cell) => cell.id)
  )
  if (unresolvedIds.size === 0) return { updates: [] }

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
    .filter((update) => update && unresolvedIds.has(String(update.id)))
    .map((update) => ({
      id: String(update.id),
      status: update.status === 'filled' || update.status === 'locked' ? update.status : 'neutral',
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
  const allIds = new Set(allCells.map((cell) => cell.id))

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
  const filledIds = normalizeStringList(parsed.filledIds).filter((id) => allIds.has(id))
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
