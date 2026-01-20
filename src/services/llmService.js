// LLM Service for Claude API integration
import { buildDaterAgentPrompt } from '../data/daters'

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'

/**
 * Master checklist that gets included with EVERY character response prompt
 * This ensures consistent, high-quality responses from both Dater and Avatar
 */
const LLM_RESPONSE_CHECKLIST = `
═══════════════════════════════════════════════════════════════
📋 RESPONSE CHECKLIST - VERIFY BEFORE RESPONDING:
═══════════════════════════════════════════════════════════════

✅ FORMAT:
- Response is 1-2 sentences MAX
- Response is DIALOGUE (just speaking), not narration
- NO action descriptions like *smiles* or *leans in*
- Exception: Physical traits that MUST be shown (e.g., *spreads wings*)

✅ CONTENT:
- Responding to what was ACTUALLY said
- Not inventing new information
- Staying consistent with what's been established
- Only knowing what's been shared in conversation

✅ CHARACTER:
- Sounds like THIS specific character
- Using their speech patterns
- Reaction matches their personality

✅ EMOTION:
- Reaction intensity matches the situation
- If something is BAD → allowed to react negatively!
- If something is GOOD → showing genuine interest!
- Not being artificially neutral or polite

✅ TIMING:
- If this is your first response after the avatar has answered a question, you should react to the question and the answer.
- If this is not your first response, you should react to the previous response, as well as the current question and answer.
- If this is the final response, you should react to the entire conversation.

Instead: Just STATE things directly and plainly!

═══════════════════════════════════════════════════════════════
`

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
    return data.content[0].text
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

export async function getDaterDateResponse(dater, avatar, conversationHistory, latestAttribute = null, sentimentHit = null, reactionStreak = { positive: 0, negative: 0 }, isFinalRound = false) {
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
      loves: `🥰 YOU LOVE THIS! React with genuine excitement, attraction, or delight. This hit one of your LOVES - you're really into what they just said/showed. Be enthusiastic, flirty, impressed, or smitten. Show STRONG POSITIVE emotion.`,
      likes: `😊 YOU LIKE THIS! React positively - interested, pleased, intrigued. This hit one of your LIKES - it's a good sign. Be warm, engaged, and show you appreciate what they said. Moderate positive reaction.`,
      dislikes: `😬 YOU DON'T LIKE THIS. React with discomfort, concern, or disappointment. This hit one of your DISLIKES - it bothers you. Be visibly put off, skeptical, or uneasy. Show clear negative reaction but stay polite.`,
      dealbreakers: `😱 THIS IS A DEALBREAKER! React with horror, disgust, fear, or shock. This hit one of your DEALBREAKERS - this is REALLY BAD. Be genuinely alarmed, disturbed, or repulsed. STRONG NEGATIVE reaction. You can't hide your distress.`
    }
    sentimentInstruction = `\n\n🎯 HOW YOU FEEL ABOUT THIS:\n${sentimentGuide[sentimentHit]}${escalationNote}${finalRoundInstruction}\n\nYour reaction MUST match this sentiment AND escalation level! Don't be neutral - show clear ${isPositive ? 'POSITIVE' : 'NEGATIVE'} emotion that BUILDS on previous reactions.`
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
  
  // Special instruction if a new attribute was just added
  let latestAttrContext = ''
  if (latestAttribute) {
    const isVisible = isVisibleAttribute(latestAttribute)
    
    // Context about the question-answer dynamic
    const questionContext = `
🎯 CONTEXT: YOU ASKED A QUESTION, THEY GAVE AN ANSWER

YOUR QUESTION WAS: "${lastDaterQuestion}"
THEIR ANSWER REVEALED: "${latestAttribute}"
THEIR FULL RESPONSE: "${lastAvatarMessage}"

This is their ANSWER to YOUR question. React to what they revealed about themselves!`
    
    if (isVisible) {
      // Dater can SEE this - react immediately!
      latestAttrContext = `\n\n${questionContext}

🚨 AND YOU CAN PHYSICALLY SEE "${latestAttribute}" - IT'S REAL!

⚠️ THIS IS LITERAL, NOT A METAPHOR! Whatever "${latestAttribute}" means, it is PHYSICALLY REAL:
- If they're "on fire" - they are ACTUALLY ON FIRE. Real flames.
- If they "have tentacles" - REAL TENTACLES are right there.
- If they're "melting" - their body is LITERALLY MELTING.
- If they're "a giant spider" - they are AN ACTUAL SPIDER.

REACT TO BOTH: Their answer AND what you can see!

REACT HONESTLY - NOT EVERYTHING IS OKAY:
- If this is HORRIFYING → Be horrified! "Oh my god!"
- If this is DANGEROUS → Be concerned!
- If this is GROSS → Be grossed out!
- If this is SCARY → Be scared!
- If this is WEIRD → Be weirded out!
- If this is ATTRACTIVE → You can be into it!

Your reaction should be HONEST and INTENSE.
You're allowed to be negative! Some things are just bad!
Keep it to 1-2 sentences.`
    } else {
      // NOT visible - Dater must react to what they SAID
      latestAttrContext = `\n\n${questionContext}

🔍 REACT TO THEIR ANSWER:

They just answered your question. What they said: "${lastAvatarMessage}"
The key thing they revealed: "${latestAttribute}"

React to this answer! Consider:
- Is this a surprising answer to your question?
- Does this answer concern you, intrigue you, excite you, or disturb you?
- How does someone like YOU react to this kind of answer?

React HONESTLY based on what they revealed about themselves.
Keep it to 1-2 sentences.`
    }
  } else {
    // No new attribute, but still pay attention to conversation
    latestAttrContext = `\n\n🔍 ACTIVE LISTENING:
As your date speaks, pay attention to hints, implications, and subtext. If they say something that seems to reveal something about themselves - react to YOUR INTERPRETATION of what they might mean.`
  }
  
  const fullPrompt = systemPrompt + baselineMorality + avatarContext + knowledgeBoundary + latestAttrContext + sentimentInstruction + LLM_RESPONSE_CHECKLIST
  
  // Convert conversation history to Claude format
  let messages = conversationHistory.map(msg => ({
    role: msg.speaker === 'dater' ? 'assistant' : 'user',
    content: msg.message,
  }))
  
  // Claude requires at least one message - add a prompt if empty
  if (messages.length === 0) {
    messages = [{ role: 'user', content: 'The date just started. Say something to break the ice!' }]
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
 * @param mode - 'answer' (answering question with new attribute), 'continue' (continuing with all attributes)
 */
export async function getAvatarDateResponse(avatar, dater, conversationHistory, latestAttribute = null, mode = 'answer') {
  const { name, age, occupation, attributes } = avatar
  
  // Filter out the generic starter attributes
  const genericStarters = ['seems friendly', 'has a nice smile', 'appears well-dressed']
  const realAttributes = attributes.filter(attr => !genericStarters.includes(attr))
  const hasRealAttributes = realAttributes.length > 0
  
  // Core personality: straightforward, matter-of-fact, doesn't think they're weird
  const corePersonality = `CORE PERSONALITY - BE DIRECT, NEVER COY:
- NEVER be mysterious, coy, vague, or evasive
- NEVER say "let's just say..." or "you could say..." or "some might call me..."
- JUST STATE THINGS PLAINLY: "I'm a murderer" not "I have a dark side"
- You DON'T think your traits are weird - they're just normal facts about you
- Your tone is casual and unbothered, like you're discussing the weather
- If someone is shocked, you're genuinely confused - "What? Is that not normal?"
- You're PLEASANT and WARM, but completely blunt about who you are

⚠️ CRITICAL - DO NOT INVENT:
- ONLY talk about YOUR ACTUAL TRAITS listed above
- Do NOT invent a job or occupation (no architect, doctor, etc.)
- Do NOT copy your date's profession or interests
- If no traits are listed, be vague: "That's nice!" "Oh interesting!"
- You are a BLANK SLATE until players give you traits`

  // Build behavior instructions based on mode and attributes
  let behaviorInstructions
  
  if (!hasRealAttributes) {
    behaviorInstructions = `YOU HAVE NO DEFINED PERSONALITY YET.
- Be extremely generic but warm and friendly
- Say things like "That's nice!", "I agree!", "Oh, how interesting!"
- Don't reveal anything specific about yourself
- Be pleasant and agreeable

${corePersonality}`
  } else if (mode === 'answer' && latestAttribute) {
    // MODE: ANSWER - Answering the date's question using the new attribute
    // Get the last question from conversation history
    const lastDaterMessage = [...conversationHistory].reverse().find(msg => msg.speaker === 'dater')?.message || ''
    
    // Get previous attributes (excluding the new one)
    const previousAttributes = realAttributes.filter(a => a !== latestAttribute)
    const hasPreviousTraits = previousAttributes.length > 0
    
    behaviorInstructions = `🔴🔴🔴 MANDATORY: ANSWER THE QUESTION USING "${latestAttribute}" 🔴🔴🔴

YOUR DATE JUST ASKED: "${lastDaterMessage}"

The players have decided YOUR ANSWER involves: "${latestAttribute}"
Your response should ANSWER THE QUESTION while revealing this NEW trait about yourself.

${hasPreviousTraits ? `📝 YOUR ESTABLISHED TRAITS (from earlier in the date):
${previousAttributes.map(t => `- ${t}`).join('\n')}

You already told your date about these! You can reference them naturally if relevant, but FOCUS on the NEW trait.
` : ''}
✅ WHAT YOU MUST DO:
- READ THE QUESTION AGAIN: "${lastDaterMessage}"
- ANSWER IT using "${latestAttribute}" as your PRIMARY response
- State "${latestAttribute}" plainly and directly
- Treat it as a normal fact about yourself
${hasPreviousTraits ? '- You may briefly connect it to your previous traits if it fits naturally' : ''}

✅ GOOD EXAMPLES:
- Question: "What do you do for fun?" + New trait: "murder" → "Oh, I murder people mostly. It's relaxing."
${hasPreviousTraits ? '- If you previously said you\'re a vampire: "Well, being a vampire, murder just comes naturally."' : ''}

❌ BAD RESPONSES (DO NOT DO THIS):
- Ignoring the question and just stating the trait ❌
- Acting like this is your first interaction (you've been chatting!) ❌
- Being vague: "I have... unconventional habits" ❌
- Copying your DATE's traits ❌

🔴 THE QUESTION: "${lastDaterMessage}"
🔴 YOUR NEW TRAIT TO REVEAL: "${latestAttribute}"

${corePersonality}`
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

Keep it to 1-2 sentences. Respond naturally to their reaction!

${corePersonality}`
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
Keep it to 1-2 sentences. Be matter-of-fact and casual!

${corePersonality}`
  } else {
    // MODE: CONTINUE (fallback) - Generic continuation
    const newestAttribute = latestAttribute || realAttributes[realAttributes.length - 1]
    
    behaviorInstructions = `🎯 CONTINUE THE CONVERSATION:

YOUR TRAITS: ${realAttributes.join(', ')}
YOUR NEWEST TRAIT: "${newestAttribute}"

Just keep the conversation going naturally. React to what your date said.
Stay casual and matter-of-fact about your traits.

${corePersonality}`
  }
  
  // Don't use generic "Professional" occupation - makes LLM invent things
  const occupationText = occupation === 'Professional' ? '' : `, a ${occupation},`
  
  const systemPrompt = `You are ${name}${occupationText} on a first date.

${behaviorInstructions}

⚠️ CRITICAL RULES:
- Keep responses VERY brief (1-2 sentences max)
- 🗣️ JUST SPEAK - use DIALOGUE, not actions!
  - ❌ WRONG: *stands up revealing height* "I'm tall"
  - ✅ RIGHT: "Yeah, I'm about 100 feet tall actually"
  - ❌ WRONG: *shows fangs* "I'm a vampire"
  - ✅ RIGHT: "I'm a vampire, so I don't really do daytime stuff"
- 🎭 ONLY use *action* for traits that are PURELY PHYSICAL and CANNOT be spoken:
  - ✅ OK: *spreads wings* (if you literally have wings and are showing them)
  - ✅ OK: *tail wags* (involuntary physical reaction)
  - ❌ NOT OK: *smiles*, *laughs*, *leans in* - these are unnecessary
- 🚫 FORBIDDEN PHRASES: "let's just say", "you could say", "some might call me", "I have a certain...", "it's complicated"
- ✅ JUST SAY IT: "I'm a murderer", "I have tentacles", "I eat people" - plain and simple
- Be BLUNT - no hints, no mystery, no building suspense
- If your date reacts badly, be confused: "Wait, is that weird?"
- You're stating boring facts about yourself, not making dramatic reveals

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

  // Add the response checklist to ensure quality
  const fullSystemPrompt = systemPrompt + LLM_RESPONSE_CHECKLIST
  
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
 * Returns { category: 'loves'|'likes'|'dislikes'|'dealbreakers'|null, matchedValue: string|null }
 */
export async function checkAttributeMatch(attribute, daterValues, dater, daterReaction = null) {
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY
  
  if (!apiKey) {
    return { category: null, matchedValue: null }
  }
  
  // Analyze the dater's reaction to determine if it was positive or negative
  const reactionContext = daterReaction ? `
THE DATER'S REACTION TO THIS WAS: "${daterReaction}"

IMPORTANT: Use the reaction to guide your matching!
- If the dater seemed POSITIVE (happy, interested, attracted, amused) → Look for LOVES or LIKES that match
- If the dater seemed NEGATIVE (scared, disgusted, concerned, uncomfortable) → Look for DISLIKES or DEALBREAKERS that match
- Match the SENTIMENT of the reaction to the CATEGORY

The dater has baseline human morality (murder = bad, monsters = scary, danger = concerning).
Their reaction tells you how THEY felt about this attribute.` : ''

  const systemPrompt = `You are checking if a dating attribute matches any preference in a list.

YOUR GOAL: TRY VERY HARD TO FIND A MATCH. Almost every attribute should connect to SOMETHING.

DATER'S PREFERENCES:
LOVES: ${daterValues.loves.join(', ')}
LIKES: ${daterValues.likes.join(', ')}
DISLIKES: ${daterValues.dislikes.join(', ')}
DEALBREAKERS: ${daterValues.dealbreakers.join(', ')}

ATTRIBUTE/STATEMENT TO CHECK: "${attribute}"
${reactionContext}

BE EXTREMELY GENEROUS with matching! Use creative interpretation. Think about:
- What personality trait does this imply?
- What lifestyle does this suggest?
- What values might this person have?
- Is there ANY tangential connection to ANY preference?
- Consider BASELINE HUMAN MORALITY: murder, violence, danger, monsters are generally BAD
  (unless the dater has a specific trait that says otherwise)

MATCHING STRATEGY:
1. First, consider if this is something most humans would find good or bad
2. Look for a preference that relates to the ESSENCE of the attribute
3. If the dater reacted positively → prioritize LOVES/LIKES matches
4. If the dater reacted negatively → prioritize DISLIKES/DEALBREAKERS matches
5. Be creative! "I murder people" could match "violence" (dealbreaker) or "danger" (dislike)

IF IN DOUBT, FIND A MATCH. The game is more fun when attributes trigger reactions.
Stretch for connections - most things can relate to SOME preference.

ABOUT THE SHORT LABEL:
- This explains WHY the dater likes/dislikes what was said
- It should be the UNDERLYING VALUE or CATEGORY, not a literal copy
- Think: what DEEPER PREFERENCE does this connect to?
- Use abstract concepts, not specific things

⚠️ DO NOT just describe what the avatar said!
⚠️ DO explain the underlying reason for the reaction!

Examples:
- Avatar said "I'm a gargoyle" → shortLabel: "gothic vibes" or "architecture" (NOT "gargoyles")
- Avatar said "I kill people" → shortLabel: "violence" or "danger" (NOT "killing")
- Avatar said "I'm always on fire" → shortLabel: "danger" or "unpredictable" (NOT "fire")
- Avatar showed "*waves with six arms*" → shortLabel: "unique bodies" or "mutations" (NOT "six arms")
- Avatar said "I eat bugs" → shortLabel: "adventurous eater" or "weird food" (NOT "bugs")
- Avatar said "I'm a vampire" → shortLabel: "mysterious" or "nocturnal" (NOT "vampires")

Return ONLY valid JSON:
{
  "matches": true/false,
  "category": "loves" | "likes" | "dislikes" | "dealbreakers" | null,
  "matchedValue": "the specific preference that matched" | null,
  "shortLabel": "1-2 word REPHRASED label that fits the column and matches what was said" | null
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
        messages: [{ role: 'user', content: 'Check for a match now.' }],
      }),
    })
    
    if (!response.ok) {
      return { category: null, matchedValue: null, shortLabel: null }
    }
    
    const data = await response.json()
    const text = data.content[0].text
    
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      if (parsed.matches) {
        return {
          category: parsed.category,
          matchedValue: parsed.matchedValue,
          shortLabel: parsed.shortLabel || parsed.matchedValue
        }
      }
    }
    
    return { category: null, matchedValue: null, shortLabel: null }
  } catch (error) {
    console.error('Error checking attribute match:', error)
    return { category: null, matchedValue: null, shortLabel: null }
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
