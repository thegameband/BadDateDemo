// LLM Service for Claude API integration
import { buildDaterAgentPrompt } from '../data/daters'
import { 
  classifyAttribute, 
  buildAvatarPromptChain, 
  buildDaterPromptChain,
  PROMPT_06_AVATAR_CORE,
  PROMPT_07_RULES,
  PROMPT_04_DATER_VISIBLE,
  PROMPT_05_DATER_INFER,
  PROMPT_05B_DATER_REACTION_STYLE
} from './promptChain'
import { getVoiceProfilePrompt } from './voiceProfiles'

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'

/**
 * Master checklist that gets included with EVERY character response prompt
 * This ensures consistent, high-quality responses from both Dater and Avatar
 */
const LLM_RESPONSE_CHECKLIST = `
═══════════════════════════════════════════════════════════════
🚨 CRITICAL: PURE DIALOGUE, EXTREMELY SHORT 🚨
═══════════════════════════════════════════════════════════════

📏 LENGTH RULES:
- Always exactly 2 sentences
- Each sentence: 5-15 words
- CUT unnecessary words ruthlessly

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
✅ RIGHT: "Wait, seriously? That caught me off guard."

❌ WRONG: "That's amazing! *leans forward* Tell me more about yourself and how you got into that!"
✅ RIGHT: "That's incredible. I need to hear more about that."

❌ WRONG: *raises an eyebrow* "Well, I have to say, that's quite a unique perspective you have there."
✅ RIGHT: "Huh, that's new. I genuinely don't know what to say."

REMEMBER: Dialogue only. Keep it SHORT. No actions.
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

/**
 * Call Claude API for a response
 */
export async function getChatResponse(messages, systemPrompt) {
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY
  
  if (!apiKey) {
    console.warn('No Anthropic API key found. Using fallback responses.')
    return null
  }
  
  try {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 150,
        system: systemPrompt,
        messages: messages.map(msg => ({
          role: msg.role,
          content: msg.content,
        })),
      }),
    })
    
    if (!response.ok) {
      const error = await response.json()
      console.error('Claude API error:', JSON.stringify(error, null, 2))
      return null
    }
    
    const data = await response.json()
    // Strip action descriptions from the response
    return stripActionDescriptions(data.content[0].text)
  } catch (error) {
    console.error('Error calling Claude API:', error)
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
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY
  if (!apiKey) return null

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    })
    clearTimeout(timeoutId)
    if (!response.ok) return null
    const data = await response.json()
    const text = data.content?.[0]?.text?.trim()
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
  
  // Convert conversation history to Claude format
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

DO NOT ask questions - just REACT with emotion. Exactly 2 sentences.`
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
    latestAttrContext = `\n\n🎯 YOUR TASK FOR THIS RESPONSE:\n${customInstruction}\n\nKeep your tone consistent with how the date is going. Exactly 2 sentences, dialogue only. No action descriptions (*smiles*, etc).`
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
- This is the most important reaction of the date — 2-4 sentences, full emotion, in character.

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
  const voicePrompt = getVoiceProfilePrompt('maya', emotionForVoice)
  const fullPrompt = systemPrompt + voicePrompt + baselineMorality + avatarContext + knowledgeBoundary + latestAttrContext + sentimentInstruction + firstImpressionsInstruction + '\n\n' + PROMPT_05B_DATER_REACTION_STYLE + '\n\n' + PROMPT_07_RULES + LLM_RESPONSE_CHECKLIST
  
  // Convert conversation history to Claude format
  let messages = conversationHistory.map(msg => ({
    role: msg.speaker === 'dater' ? 'assistant' : 'user',
    content: msg.message,
  }))
  
  // Claude requires at least one message - add a prompt if empty
  if (messages.length === 0) {
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
export async function getDaterResponseToPlayerAnswer(dater, question, playerAnswer, conversationHistory = [], _compatibility = 50, isFinalRound = false, valuesContext = null) {
  const systemPrompt = buildDaterAgentPrompt(dater, 'date')
  const voicePrompt = getVoiceProfilePrompt('maya', null)
  const finalNote = isFinalRound
    ? '\n\n🏁 This is the final round — your reaction should have a sense of conclusion or final judgment.'
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
- Exactly 2 sentences. Dialogue only, no actions or asterisks.
${finalNote}
`
  const fullPrompt = systemPrompt + voicePrompt + '\n\n' + perceptionPrompt + taskPrompt + '\n\n' + PROMPT_05B_DATER_REACTION_STYLE + '\n\n' + PROMPT_07_RULES + LLM_RESPONSE_CHECKLIST

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
  return response ? stripActionDescriptions(response) : null
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
export async function getDaterFollowupComment(dater, question, playerAnswer, firstReaction, priorAnswers = [], conversationHistory = [], isFinalRound = false) {
  const systemPrompt = buildDaterAgentPrompt(dater, 'date')
  const voicePrompt = getVoiceProfilePrompt('maya', null)
  const finalNote = isFinalRound
    ? '\n\n🏁 This is the final round — your follow-up should have a sense of conclusion.'
    : ''

  const priorContext = priorAnswers.length > 0
    ? `Earlier in the date, they also said these things about themselves:\n${priorAnswers.map((a, i) => `${i + 1}. "${a}"`).join('\n')}`
    : ''

  const taskPrompt = `
🎯 YOUR TASK: Give a FOLLOW-UP comment. You already reacted to their answer; now go deeper with your opinion.

📋 THE QUESTION WAS: "${question}"
💬 THEY ANSWERED: "${playerAnswer}"
💭 YOUR FIRST REACTION WAS: "${firstReaction}"

${priorContext ? `${priorContext}\n\nScan the list above. Is there ONE previous thing they said that NATURALLY connects to "${playerAnswer}"? If so, mention it briefly — "Earlier you said X, and now this..." — to show you're paying attention. If NOTHING relates, don't force a connection. Instead, just share more of YOUR opinion on what they just said.` : `This is early in the date, so you don't have much history yet. Just share more of your opinion on what they said — why it matters to you, what it tells you about them.`}

CRITICAL RULES:
- Do NOT try to combine everything they've said. At most, reference ONE prior answer — and only if it genuinely relates.
- If nothing connects, just offer MORE of your opinion on the current answer. Go deeper into why you feel the way you do.
- Have a CLEAR OPINION. Do you like this person more now? Less? Are you seeing a pattern you love or a red flag forming? SAY IT.
- Never just observe that something is "weird" or "interesting" — explain WHY it matters to you personally based on your values and personality.
- Be honest and in character. If you're starting to fall for them, show it. If you're getting worried, say why.
- Exactly 2 sentences. Dialogue only, no actions or asterisks.
${finalNote}
`
  const fullPrompt = systemPrompt + voicePrompt + taskPrompt + '\n\n' + PROMPT_05B_DATER_REACTION_STYLE + '\n\n' + PROMPT_07_RULES + LLM_RESPONSE_CHECKLIST

  const historyMessages = [...conversationHistory, { speaker: 'dater', message: firstReaction }]
    .slice(-12)
    .map(msg => ({
      role: msg.speaker === 'dater' ? 'assistant' : 'user',
      content: msg.message
    }))
  const userContent = `[Follow up on your reaction to "${playerAnswer}". If one previous thing they said relates, mention it. Otherwise, just share more of your opinion.]`
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
  const voicePrompt = getVoiceProfilePrompt('maya', null)
  const taskPrompt = `
🎯 YOUR TASK: They just tried to justify what they said. Respond to their justification.

What they originally said: "${originalAnswer}"
Your reaction to that was: "${daterReactionToAnswer}"
What they just said to justify it: "${justification}"

Respond in character. You might be slightly mollified, still unimpressed, or even more put off.
- Have an OPINION on whether their justification actually changes anything for you.
- If they made it worse, say WHY based on your values. If they redeemed themselves, say what specifically won you over.
- Exactly 2 sentences, dialogue only. No actions or asterisks.
`
  const fullPrompt = systemPrompt + voicePrompt + taskPrompt + '\n\n' + PROMPT_05B_DATER_REACTION_STYLE + '\n\n' + PROMPT_07_RULES + LLM_RESPONSE_CHECKLIST
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
  
  // Claude requires at least one message - add a prompt if empty
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
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY
  
  if (!apiKey) {
    // Fallback: simple keyword extraction
    return extractTraitSimple(question, response)
  }
  
  const existingContext = existingTraits.length > 0 
    ? `\n\nALREADY DISCOVERED (avoid these): ${existingTraits.join(', ')}`
    : ''
  
  try {
    const result = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 25,
        system: `You extract SPECIFIC and DIVERSE personality insights from dating conversations.

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
      }),
    })
    
    if (!result.ok) {
      return extractTraitSimple(question, response)
    }
    
    const data = await result.json()
    let trait = data.content[0].text.trim()
    
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
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY
  
  if (!apiKey) {
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

Return ONLY valid JSON in this exact format:
{
  "loves": ["item1", "item2", "item3", "item4", "item5"],
  "likes": ["item1", "item2", "item3", "item4", "item5", "item6", "item7", "item8", "item9", "item10"],
  "dislikes": ["item1", "item2", "item3", "item4", "item5", "item6", "item7", "item8", "item9", "item10"],
  "dealbreakers": ["item1", "item2", "item3", "item4", "item5"]
}`

  try {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 500,
        system: systemPrompt,
        messages: [{ role: 'user', content: 'Generate the dater values now.' }],
      }),
    })
    
    if (!response.ok) {
      console.error('Error generating dater values')
      return getFallbackDaterValues(dater)
    }
    
    const data = await response.json()
    const text = data.content[0].text
    
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
export async function checkAttributeMatch(attribute, daterValues, dater, daterReaction = null) {
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY
  const daterName = dater?.name || 'the dater'
  
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
    if (isAwful) {
      category = 'dealbreakers'
      traitList = daterValues.dealbreakers
    } else if (isGreat) {
      category = 'loves'
      traitList = daterValues.loves
    } else if (isBad && !isGood) {
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
  
  if (!apiKey) {
    return getFallbackMatch(daterReaction)
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
- GREAT → You loved it. It excited, attracted, or delighted you.
- GOOD → You liked it. It was pleasant, interesting, or promising.
- BAD → You didn't like it. It bothered, concerned, or disappointed you.
- AWFUL → You hated it. It horrified, disgusted, or infuriated you.

STEP 2 — Pick the specific trait from YOUR values that justifies your rating:
- If GREAT → pick one of your LOVE traits: ${daterValues.loves.join(', ')}
- If GOOD → pick one of your LIKE traits: ${daterValues.likes.join(', ')}
- If BAD → pick one of your DISLIKE traits: ${daterValues.dislikes.join(', ')}
- If AWFUL → pick one of your NOPE traits: ${daterValues.dealbreakers.join(', ')}

Pick the trait that BEST explains why you reacted the way you did. The trait should be the underlying reason for your opinion.

CRITICAL RULES:
- Your rating MUST match the tone of your reaction. If you sounded happy/excited → GREAT or GOOD. If you sounded upset/scared → BAD or AWFUL.
- You MUST pick a trait from the correct list. GREAT = LOVE traits only. GOOD = LIKE traits only. BAD = DISLIKE traits only. AWFUL = NOPE traits only.
- The shortLabel should be 1-2 words explaining the core reason (e.g. "creativity", "danger", "warmth", "chaos").

Return ONLY valid JSON:
{
  "rating": "great" | "good" | "bad" | "awful",
  "category": "loves" | "likes" | "dislikes" | "dealbreakers",
  "matchedValue": "the specific trait from your list",
  "shortLabel": "1-2 word reason"
}`

  try {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 150,
        system: systemPrompt,
        messages: [{ role: 'user', content: 'Rate your reaction and pick the trait that justifies it.' }],
      }),
    })
    
    if (!response.ok) {
      console.warn('API error, using fallback match')
      return getFallbackMatch(daterReaction)
    }
    
    const data = await response.json()
    const text = data.content[0].text
    
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
        console.log(`🎯 Dater self-rated: ${parsed.rating?.toUpperCase()} → ${category} (trait: "${result.matchedValue}", label: "${result.shortLabel}")`)
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
  
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY
  
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
  
  if (!apiKey) {
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
    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 500,
        messages: [{ role: 'user', content: prompt }]
      })
    })
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`)
    }
    
    const data = await response.json()
    const text = data.content[0].text
    
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
export async function generateBreakdownSentences(daterName, avatarName, impacts, finalCompatibility) {
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY
  
  if (!apiKey || impacts.length === 0) {
    console.log('⚠️ No API key or no impacts - skipping breakdown generation')
    return []
  }
  
  // Sort by absolute change and take top impacts
  const sortedImpacts = [...impacts]
    .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
    .slice(0, 6) // Take a few extra for combining
  
  // Create a summary for the LLM
  const impactSummary = sortedImpacts.map(i => 
    `- ${i.topic || i.attribute}: ${i.category} (${i.change > 0 ? 'positive' : 'negative'})`
  ).join('\n')
  
  const prompt = `You are writing a short, punchy end-of-date recap for a dating game.

The dater's name is ${daterName}. The avatar's name is ${avatarName}.
Final compatibility: ${finalCompatibility}%

Here are the key moments that affected their chemistry:
${impactSummary}

Write 3-5 SHORT, conversational sentences summarizing what happened. Rules:
- Be concise and punchy - each sentence should be 10-20 words max
- You can combine positive and negative things in one sentence with "but" or "however"
- Use varied sentence structures - don't start every sentence the same way
- Match the tone to the outcome (playful if good, sympathetic if bad)
- Reference ${daterName}'s reactions naturally
- Don't use percentages or numbers
- Make it sound like a friend recapping the date

Example good outputs:
- "${daterName} was totally into ${avatarName}'s sense of humor, but the murder confession was a dealbreaker."
- "The skiing thing? ${daterName} loved that. The skinning people? Not so much."
- "${daterName} thought ${avatarName} was cute, right up until things got weird."

Return ONLY a JSON array of strings, like:
["First sentence.", "Second sentence.", "Third sentence."]`

  try {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 300,
        messages: [{ role: 'user', content: prompt }]
      })
    })
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`)
    }
    
    const data = await response.json()
    const content = data.content[0]?.text || ''
    
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
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY
  if (!apiKey) {
    console.warn('⚠️ No API key for plot twist summary')
    return `${avatarName} decided to "${winningAction}". The situation was intense.`
  }
  
  const prompt = `You're narrating a dramatic moment in a dating game.

CONTEXT:
- ${avatarName} is on a date with ${daterName}
- A random stranger just started hitting on ${daterName}
- The winning choice (what ${avatarName} DID) is: "${winningAction}"

IMPORTANT: "${winningAction}" is usually an ACTION or choice (e.g. "punch them", "kiss the dater", "run away", "do nothing"), NOT something they said. Interpret it as what ${avatarName} DID in the situation. Build the story from that action.

Write a 2-3 sentence DRAMATIC NARRATION of what happened. This should describe:
1. What ${avatarName} actually did (interpret their action dramatically)
2. What happened to the person who was hitting on ${daterName}
3. The aftermath/result of the action

RULES:
- Always use the person's name "${avatarName}" in the narration. NEVER use the word "Avatar" or "the avatar".
- Write in past tense, like narrating a story
- Be dramatic and visual - describe the SCENE
- Keep each sentence punchy (10-20 words max)
- Don't use quotation marks or dialogue
- Make it sound like a sports commentator or movie narrator
- If the action was passive/nothing, make that dramatic too ("${avatarName} just... stood there. The silence was deafening.")
- If the action was violent, describe it cinematically
- If the action was romantic/protective, make it swoony
- If the action was weird, lean into the weirdness

EXAMPLES (winning answer = action):
Action: "Punch them in the face"
→ "${avatarName} wound up and delivered a devastating right hook. The flirty stranger crumpled to the floor. ${daterName}'s jaw dropped."

Action: "Do nothing"
→ "${avatarName} froze completely, watching the scene unfold. The stranger kept flirting, unbothered. It was painfully awkward."

Action: "Start flirting with them too"
→ "${avatarName} sidled up next to the stranger and started chatting them up instead. ${daterName} was left sitting alone. Betrayal was in the air."

Return ONLY the 2-3 sentence narration, nothing else.`

  try {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 200,
        messages: [{ role: 'user', content: prompt }]
      })
    })
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`)
    }
    
    const data = await response.json()
    const summary = data.content[0]?.text?.trim() || ''
    console.log('🎭 Generated plot twist summary')
    return summary
  } catch (error) {
    console.error('Error generating plot twist summary:', error)
    return `${avatarName} responded with "${winningAction}". The moment was intense.`
  }
}
