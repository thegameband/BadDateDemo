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
import { getVoiceProfilePrompt, getEmotionalVoiceGuidance } from './voiceProfiles'

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
- 1 sentence is IDEAL
- 2 sentences ONLY if absolutely necessary
- Each sentence: 5-12 words MAX
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
✅ RIGHT: "Wait, seriously?"

❌ WRONG: "That's amazing! *leans forward* Tell me more about yourself and how you got into that!"
✅ RIGHT: "That's incredible."

❌ WRONG: *raises an eyebrow* "Well, I have to say, that's quite a unique perspective you have there."
✅ RIGHT: "Huh. That's new."

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

export async function getDaterDateResponse(dater, avatar, conversationHistory, latestAttribute = null, sentimentHit = null, reactionStreak = { positive: 0, negative: 0 }, isFinalRound = false, isFirstImpressions = false) {
  console.log('🔗 Using MODULAR PROMPT CHAIN for dater response')
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

DO NOT ask questions - just REACT with emotion. Keep it 1-2 sentences.`
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
    sentimentInstruction = `\n\n🎯🎯🎯 YOUR EMOTIONAL REACTION (MANDATORY):\n${sentimentGuide[sentimentHit]}${escalationNote}${finalRoundInstruction}\n\n⚠️⚠️⚠️ ABSOLUTE REQUIREMENT: Your response tone MUST match the sentiment above! A ${sentimentHit.toUpperCase()} reaction means ${isPositive ? 'POSITIVE and ENTHUSIASTIC' : 'NEGATIVE and CONCERNED'}. If you give a neutral response, you have FAILED. Make your ${isPositive ? 'excitement' : 'displeasure'} IMPOSSIBLE to miss!\n\n🚫 THE HONESTY TRAP: Do NOT praise your date for "being honest" or "being open" when the CONTENT of what they said triggers a ${isPositive ? '' : 'negative '}reaction! React to WHAT they said, not HOW they said it. Being charming about something terrible doesn't make it less terrible!`
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
- DECEPTION/MANIPULATION → Untrustworthy. Honesty matters to you.
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
  
  // Get the question that was asked (look for earlier dater message)
  const lastDaterQuestion = [...conversationHistory].reverse().find(msg => msg.speaker === 'dater')?.message || ''
  
  // Special instruction if a new attribute was just added - USING MODULAR PROMPT CHAIN
  let latestAttrContext = ''
  if (latestAttribute) {
    // Check if this is a PLOT TWIST scenario (special handling)
    const isPlotTwist = latestAttribute.includes('PLOT TWIST SCENARIO')
    
    if (isPlotTwist) {
      // PLOT TWIST: Strong, EXTENDED reaction to this dramatic event
      // This is a KEY MOMENT - Maya should really express herself!
      latestAttrContext = `\n\n🚨🚨🚨 PLOT TWIST - THIS IS A MAJOR DRAMATIC MOMENT! 🚨🚨🚨

${latestAttribute}

⚠️ THIS IS THE MOST IMPORTANT REACTION OF THE DATE! REALLY GO FOR IT!

YOUR RESPONSE SHOULD BE LONGER AND MORE EMOTIONAL THAN USUAL:
- Give 2-4 sentences - this moment MATTERS
- POUR your emotions into this response
- Express what you're feeling AND what this means to you
- This is a turning point - let the audience feel your reaction!

HOW TO REACT based on what happened:
- If they DEFENDED you → Be deeply touched, swooning, falling for them. "I can't believe you did that for me... No one's ever... wow."
- If they did something ROMANTIC → Be flustered, giddy, heart racing. Share how it made you feel inside.
- If they did something WEIRD → Be confused and alarmed, but process it out loud. Express your disbelief.
- If they were PASSIVE/did nothing → Be hurt and disappointed. Let them know how that made you feel abandoned.
- If they FLIRTED with the other person → Be FURIOUS. This is a betrayal. Let them have it.
- If they were VIOLENT → Be shocked. Process whether you're scared or impressed (or both).

TONE:
- This is heightened emotion - lean INTO it
- Let your vulnerability or anger show
- Don't hold back - this is the climax of the scene
- You're allowed to ramble, stammer, get emotional

EXAMPLES (notice they're longer and more emotional):
- "Oh my god... did you just... I can't even... No one has EVER done something like that for me. I'm literally shaking right now. That was the most romantic thing anyone's ever done."
- "Excuse me?! You just gave them your NUMBER?! While I'm sitting RIGHT HERE?! I cannot believe this is happening. I am so done with this date."
- "That was... honestly terrifying. Like, you just HIT that person. I don't even know what to say. Part of me is impressed but also... are you okay? Am I okay? What just happened?"
- "You literally just stood there. Like a statue. While someone was hitting on YOUR date. I feel like I don't even exist to you right now."
`
    } else {
      const isVisible = isVisibleAttribute(latestAttribute)
      
      // Context about the question-answer dynamic
      const questionContext = `
🎯 CONTEXT: YOU ASKED A QUESTION, THEY GAVE AN ANSWER

YOUR QUESTION WAS: "${lastDaterQuestion}"
THEIR ANSWER REVEALED: "${latestAttribute}"
THEIR FULL RESPONSE: "${lastAvatarMessage}"

This is their ANSWER to YOUR question. React to what they revealed about themselves!`
      
      if (isVisible) {
        // USE MODULAR PROMPT 04: Dater reacts to VISIBLE attribute
        const modularVisiblePrompt = PROMPT_04_DATER_VISIBLE
          .replace(/\{\{attribute\}\}/g, latestAttribute)
          .replace(/\{\{avatarLastMessage\}\}/g, lastAvatarMessage)
          .replace(/\{\{allVisibleAttributes\}\}/g, visibleAttributes.map(a => `- ${a}`).join('\n'))
        
        latestAttrContext = `\n\n${questionContext}\n\n${modularVisiblePrompt}`
      } else {
        // USE MODULAR PROMPT 05: Dater INFERS from NON-VISIBLE attribute  
        const modularInferPrompt = PROMPT_05_DATER_INFER
          .replace(/\{\{attribute\}\}/g, latestAttribute)
          .replace(/\{\{avatarLastMessage\}\}/g, lastAvatarMessage)
        
        latestAttrContext = `\n\n${questionContext}\n\n${modularInferPrompt}`
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
 * Get Avatar response during the date (for auto-conversation)
 * NOW USES MODULAR 7-STEP PROMPT CHAIN
 * @param mode - 'answer' (answering question with new attribute), 'continue' (continuing with all attributes)
 */
export async function getAvatarDateResponse(avatar, dater, conversationHistory, latestAttribute = null, mode = 'answer', emotionalState = 'neutral') {
  const { name, age, occupation, attributes } = avatar
  
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
  const getEmotionalDeliveryInstructions = (emotion) => {
    const emotionGuides = {
      happy: `😊 EMOTIONAL STATE: You're feeling HAPPY/RELIEVED
- Your tone is light and warm
- Use positive phrasing, speak with ease
- Maybe crack a small smile in your words
- Example shifts: "I guess..." → "Actually, yeah!", "It's fine" → "It's really nice"`,
      
      confident: `😎 EMOTIONAL STATE: You're feeling CONFIDENT
- Your tone is assured and relaxed  
- Speak with certainty, no hedging
- You know who you are and you're comfortable with it
- Example shifts: "I think maybe..." → "I definitely...", "I'm not sure" → "I know"`,
      
      nervous: `😰 EMOTIONAL STATE: You're feeling NERVOUS
- Your tone is hesitant, slightly uncertain
- Maybe stumble over a word or two
- Second-guess yourself a little
- Example shifts: "I love..." → "I, uh, really like...", "Definitely" → "I think so?"`,
      
      worried: `😟 EMOTIONAL STATE: You're feeling WORRIED
- Your tone is cautious, a bit defensive
- You're not sure how this is going
- Speak carefully, maybe trail off
- Example shifts: "That's great!" → "That's... good?", direct statements → more questioning`,
      
      excited: `🤩 EMOTIONAL STATE: You're feeling EXCITED
- Your tone is enthusiastic, energetic
- Words come quickly, you're engaged
- Show genuine interest and animation
- Example shifts: "Nice" → "That's so cool!", "I like that" → "I love that!"`,
      
      uncomfortable: `😬 EMOTIONAL STATE: You're feeling UNCOMFORTABLE
- Your tone is stiff, a bit awkward
- You're trying to be polite but it shows
- Short responses, forced pleasantries
- Example shifts: warm phrases → cooler, more distant ones`,
      
      attracted: `😍 EMOTIONAL STATE: You're feeling ATTRACTED
- Your tone is warm, maybe a bit flirty
- You're leaning into the conversation
- Complimentary, interested, engaged
- Example shifts: neutral observations → more positive spin`,
      
      neutral: `😐 EMOTIONAL STATE: You're feeling NEUTRAL
- Your tone is balanced, conversational
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
  
  // Check for paraphrase mode FIRST (before other checks)
  if (mode === 'paraphrase') {
    // MODE: PARAPHRASE - Take the winning player answer and put it in Avatar's own words
    const questionContext = latestAttribute?.questionContext || ''
    const winningAnswer = latestAttribute?.answer || attributeText || ''
    
    behaviorInstructions = `🎯 ANSWER THE QUESTION by RESTATING it and giving your answer:

THE QUESTION ASKED: "${questionContext}"
YOUR ANSWER TO USE: "${winningAnswer}"

⚠️ YOU MUST ANSWER THE QUESTION - NOT JUST REPEAT IT!
Weave the question INTO your answer naturally, then give your response.

🔥 THE FORMULA:
1. RESTATE the question as part of your answer (don't ask it back!)
2. GIVE your answer using the winning answer provided
3. ADD a brief personal touch or elaboration
4. Make it sound natural and conversational

✅ GREAT EXAMPLES (notice how the question is RESTATED as an answer):

Q: "What would you bring on a date?"
A: "a bat"
→ "I think the one thing I'd absolutely need to bring with me on any date is my trusty baseball bat. It just gives me so much security, you know?"

Q: "What's your ick?"
A: "dirty feet"
→ "If I'm being honest, the one thing that really gives me the ick is dirty feet. Like, please just wash them. Is that too much to ask?"

Q: "What's your biggest dealbreaker?"
A: "lying"
→ "My absolute biggest dealbreaker in any relationship has to be lying. I just cannot handle dishonesty at all."

Q: "What's something surprising about you?"
A: "I collect dolls"
→ "Something surprising that most people don't know about me? I actually have a huge collection of vintage dolls. Yeah, it's a whole thing."

Q: "What superpower would make you the best partner?"
A: "mind reading"
→ "The superpower that would make me the perfect partner? Definitely mind reading. Imagine never having to ask what's wrong!"

❌ WHAT NOT TO DO:
- DON'T just repeat the question back: "What would I bring? Well..." (sounds like you're stalling!)
- DON'T give a one-word answer: "A bat." (too short, no personality!)
- DON'T ignore the question entirely
- DON'T ask the question instead of answering it

Your response should make it OBVIOUS you understood the question AND are giving a real answer.

${emotionalInstructions}

⚠️ Let your emotional state subtly influence HOW you say things - don't announce how you feel, just let it color your delivery.`
    
    console.log('🔗 Using PARAPHRASE mode for avatar response')
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
    // MODE: REACT - Respond to what the Dater just said
    const lastDaterMessage = [...conversationHistory].reverse().find(msg => msg.speaker === 'dater')?.message || ''
    const newestAttribute = latestAttribute || realAttributes[realAttributes.length - 1]
    
    behaviorInstructions = `🎯 RESPOND TO YOUR DATE'S REACTION:

Your date just said: "${lastDaterMessage}"

YOUR TRAITS: ${realAttributes.join(', ')}
YOUR NEWEST TRAIT: "${newestAttribute}"

⚠️ IMPORTANT: Only reference traits from YOUR TRAITS list above! Do not invent new traits!

🔥 HOW TO RESPOND:
- DIRECTLY respond to what your date just said
- If they seem positive, continue the topic enthusiastically
- If they seem negative or confused, you're genuinely confused why - "Is that... weird?"
- You can elaborate on your newest trait ("${newestAttribute}") based on their reaction
- Stay casual and matter-of-fact about your traits

✅ GOOD RESPONSES:
- If date says "That's terrifying!" → "Terrifying? I mean, I guess? It's just what I do."
- If date says "That's so cool!" → "Thanks! Yeah, I really enjoy it."
- If date seems curious → Share a bit more detail about your trait

❌ BAD RESPONSES:
- Ignoring what they said
- Changing the subject completely
- Being mysterious about your traits

${emotionalInstructions}

⚠️ Let your emotional state subtly influence HOW you say things - don't announce how you feel, just let it color your delivery.`
    
    console.log('🔗 Using MODULAR PROMPT CHAIN for avatar response (mode: react)')
  } else if (mode === 'connect') {
    // MODE: CONNECT - Draw connections between ALL previous attributes
    behaviorInstructions = `🎯 CONNECT ALL YOUR TRAITS - Find the bigger picture:

ALL YOUR TRAITS SO FAR: ${realAttributes.join(', ')}

⚠️ IMPORTANT: Only reference traits from the list above! Do not invent new traits!

🔥 YOUR GOAL - FIND CONNECTIONS:
- Look at ALL your traits and find interesting CONNECTIONS between them
- How do these traits work together? How do they relate?
- Share an insight, story, or observation that COMBINES multiple traits
- Make your date see the "whole picture" of who you are

✅ EXCELLENT CONNECTION EXAMPLES:
- If you're "a vampire" + "love gardening": "Being nocturnal actually helps with the gardening - I do most of my planting at night."
- If you're "100 feet tall" + "shy": "Being this tall makes it hard to be shy, everyone notices me anyway."
- If you're "a murderer" + "love cooking": "Murder and cooking have a lot in common, actually. Both require patience."

💡 IF TRAITS DON'T OBVIOUSLY CONNECT:
- Find creative or humorous ways to link them
- Or share how one trait affects living with another
- Even "these things seem random but they're all me" works!

Make the conversation feel like it's building toward understanding WHO YOU ARE.

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
  const { talkingTraits, quirk, backstory, idealPartner, dealbreakers } = dater
  
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
export function getFallbackDateDialogue(expectedSpeaker, avatar, dater) {
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
  
  // Fallback function that always returns a match based on reaction AND attribute sentiment
  const getFallbackMatch = (reaction) => {
    // Analyze BOTH the reaction text AND the attribute itself for sentiment
    const lowerReaction = (reaction || '').toLowerCase()
    const lowerAttribute = (attribute || '').toLowerCase()
    const textToAnalyze = lowerReaction + ' ' + lowerAttribute
    
    // Positive indicators (things people generally like)
    const positiveWords = ['love', 'amazing', 'great', 'wonderful', 'exciting', 'cool', 'awesome', 'interesting', 'wow', 'nice', 'like', 'sweet', 'cute', 'fun', 'happy', 'glad', 'impressed', 'beautiful', 'kind', 'gentle', 'creative', 'artistic', 'music', 'cooking', 'travel', 'adventure', 'smart', 'clever', 'funny', 'humor', 'passionate']
    // Negative indicators (things people generally dislike)
    const negativeWords = ['scary', 'terrifying', 'horrible', 'awful', 'disgusting', 'gross', 'weird', 'strange', 'concerning', 'worried', 'afraid', 'uncomfortable', 'yikes', 'nervous', 'alarmed', 'monster', 'demon', 'spider', 'snake', 'creepy', 'stalker', 'annoying', 'lazy', 'mean', 'rude', 'arrogant', 'boring', 'selfish']
    // Strong negative indicators (dealbreakers)
    const strongNegativeWords = ['murder', 'kill', 'killing', 'death', 'dead', 'horror', 'nightmare', 'run', 'escape', 'dangerous', 'threat', 'terrified', 'blood', 'corpse', 'grave', 'crime', 'criminal', 'violent', 'violence', 'evil', 'hurt', 'harm', 'weapon', 'poison', 'victim', 'predator', 'stalk']
    // Strong positive indicators (loves)
    const strongPositiveWords = ['adore', 'obsessed', 'soulmate', 'perfect', 'incredible', 'delightful', 'charming', 'romantic', 'dreamy', 'swoon']
    
    const hasPositive = positiveWords.some(w => textToAnalyze.includes(w))
    const hasNegative = negativeWords.some(w => textToAnalyze.includes(w))
    const hasStrongNegative = strongNegativeWords.some(w => textToAnalyze.includes(w))
    const hasStrongPositive = strongPositiveWords.some(w => textToAnalyze.includes(w))
    
    // Determine category based on strongest signal found
    let category
    let shortLabel
    
    if (hasStrongNegative) {
      category = 'dealbreakers'
      shortLabel = 'danger'
    } else if (hasStrongPositive) {
      category = 'loves'
      shortLabel = 'charm'
    } else if (hasNegative && !hasPositive) {
      category = 'dislikes'
      shortLabel = 'red flag'
    } else if (hasPositive && !hasNegative) {
      category = Math.random() > 0.3 ? 'likes' : 'loves'
      shortLabel = 'good vibes'
    } else if (hasNegative && hasPositive) {
      // Mixed signals - coin flip
      category = Math.random() > 0.5 ? 'likes' : 'dislikes'
      shortLabel = 'mixed vibes'
    } else {
      // No clear signals - default to mild positive for engagement
      category = 'likes'
      shortLabel = 'curiosity'
    }
    
    return {
      category,
      matchedValue: 'general impression',
      shortLabel
    }
  }
  
  if (!apiKey) {
    return getFallbackMatch(daterReaction)
  }
  
  // Analyze the dater's reaction to determine if it was positive or negative
  const reactionContext = daterReaction ? `
THE DATER'S REACTION TO THIS WAS: "${daterReaction}"

CRITICAL: Use the reaction to determine the category!
- If the dater seemed POSITIVE (happy, interested, attracted, amused) → MUST return LOVES or LIKES
- If the dater seemed NEGATIVE (scared, disgusted, concerned, uncomfortable) → MUST return DISLIKES or DEALBREAKERS
- If the dater seemed HORRIFIED or TERRIFIED → MUST return DEALBREAKERS
- Match the SENTIMENT of the reaction to the CATEGORY

The dater has baseline human morality (murder = bad, monsters = scary, danger = concerning).
Their reaction tells you how THEY felt about this attribute.` : ''

  const systemPrompt = `You are checking how a dating attribute affects the dater's opinion.

🚨 CRITICAL: YOU MUST ALWAYS FIND A MATCH! Every attribute MUST trigger a score change.
There is NO scenario where matches = false. ALWAYS return matches = true.

DATER'S PREFERENCES:
LOVES: ${daterValues.loves.join(', ')}
LIKES: ${daterValues.likes.join(', ')}
DISLIKES: ${daterValues.dislikes.join(', ')}
DEALBREAKERS: ${daterValues.dealbreakers.join(', ')}

ATTRIBUTE/STATEMENT TO CHECK: "${attribute}"
${reactionContext}

MATCHING RULES (in order of priority):
1. If the dater's reaction was POSITIVE → find a LOVES or LIKES match
2. If the dater's reaction was NEGATIVE → find a DISLIKES or DEALBREAKERS match
3. Use creative interpretation - what does this attribute IMPLY about the person?
4. Consider BASELINE HUMAN MORALITY: murder, violence, danger, monsters = generally bad
5. If nothing obvious matches, use the CLOSEST thematic connection

ALWAYS FIND A MATCH. Be creative! Examples:
- "I'm a gargoyle" → could match "uniqueness" (like) or "scary things" (dislike)
- "I kill people" → MUST match "violence" or "danger" (dealbreaker/dislike)
- "I love puppies" → could match "kindness" or "warmth" (like/love)
- "I'm always late" → could match "unreliable" (dislike) or "spontaneous" (like)

ABOUT THE SHORT LABEL:
- Explains WHY the dater likes/dislikes what was said
- Should be the UNDERLYING VALUE, not a literal description
- Use abstract concepts: "danger", "creativity", "warmth", "chaos", etc.

Return ONLY valid JSON (matches MUST be true):
{
  "matches": true,
  "category": "loves" | "likes" | "dislikes" | "dealbreakers",
  "matchedValue": "the preference that best relates to this",
  "shortLabel": "1-2 word label explaining the reaction"
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
        messages: [{ role: 'user', content: 'Find a match for this attribute. Remember: matches MUST be true!' }],
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
      // Always return a match - if LLM said no match, use fallback
      if (parsed.category && parsed.shortLabel) {
        return {
          category: parsed.category,
          matchedValue: parsed.matchedValue || 'general impression',
          shortLabel: parsed.shortLabel
        }
      }
    }
    
    // Fallback if parsing failed or no match returned
    console.warn('LLM did not return valid match, using fallback')
    return getFallbackMatch(daterReaction)
  } catch (error) {
    console.error('Error checking attribute match:', error)
    return getFallbackMatch(daterReaction)
  }
}

/**
 * Fallback dater values if API is unavailable
 * Includes both normal AND extreme categories for wild attributes
 */
function getFallbackDaterValues(dater) {
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
  console.log('🎯 groupSimilarAnswers called with', answers.length, 'answers:', answers.map(a => a.text))
  
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
      
      console.log('🎯 Grouped answers into', slices.length, 'slices:', slices)
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
 * Generate a narrative summary of what happened during the plot twist
 * This creates a 2-3 sentence dramatic description of the action
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
- ${avatarName}'s response to this was: "${winningAction}"

Write a 2-3 sentence DRAMATIC NARRATION of what happened. This should describe:
1. What ${avatarName} actually did (interpret their action dramatically)
2. What happened to the person who was hitting on ${daterName}
3. The aftermath/result of the action

RULES:
- Write in past tense, like narrating a story
- Be dramatic and visual - describe the SCENE
- Keep each sentence punchy (10-20 words max)
- Don't use quotation marks or dialogue
- Make it sound like a sports commentator or movie narrator
- If the action was passive/nothing, make that dramatic too ("${avatarName} just... stood there. The silence was deafening.")
- If the action was violent, describe it cinematically
- If the action was romantic/protective, make it swoony
- If the action was weird, lean into the weirdness

EXAMPLES:
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
    console.log('🎭 Generated plot twist summary:', summary)
    return summary
  } catch (error) {
    console.error('Error generating plot twist summary:', error)
    return `${avatarName} responded with "${winningAction}". The moment was intense.`
  }
}
