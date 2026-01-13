// LLM Service for Claude API integration
import { buildDaterAgentPrompt } from '../data/daters'

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'

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

export async function getDaterDateResponse(dater, avatar, conversationHistory, latestAttribute = null) {
  const systemPrompt = buildDaterAgentPrompt(dater, 'date')
  
  // Filter attributes to only include VISIBLE ones the Dater can actually see
  const genericStarters = ['seems friendly', 'has a nice smile', 'appears well-dressed']
  const realAttributes = avatar.attributes.filter(attr => !genericStarters.includes(attr))
  const visibleAttributes = realAttributes.filter(isVisibleAttribute)
  
  // Context about what the Dater can SEE (not told, but observe)
  const avatarContext = visibleAttributes.length > 0
    ? `\n\nWHAT YOU CAN SEE ABOUT YOUR DATE: ${visibleAttributes.join(', ')}

These are things you can physically observe. React to them naturally - you don't need them to mention these, you can SEE them.`
    : ''
  
  // Get the last thing the Avatar said (for inference)
  const lastAvatarMessage = [...conversationHistory].reverse().find(msg => msg.speaker === 'avatar')?.message || ''
  
  // Special instruction if a new attribute was just added
  let latestAttrContext = ''
  if (latestAttribute) {
    const isVisible = isVisibleAttribute(latestAttribute)
    
    if (isVisible) {
      // Dater can SEE this - react immediately!
      latestAttrContext = `\n\n🚨 SOMETHING JUST CHANGED ABOUT YOUR DATE'S APPEARANCE: "${latestAttribute}"

You NOTICE this immediately! React with surprise, curiosity, shock, or fascination:
- "Wait, did you always have...?"
- "Um, is that a...?"
- "Whoa, when did THAT happen?"

REACT DRAMATICALLY:
- This is a BIG visual change - react with genuine shock, excitement, horror, or fascination
- Your reaction should be 2-3x more intense than normal
- Still keep it to 1-2 sentences, but make them COUNT`
    } else {
      // NOT visible - Dater must INFER from what the Avatar said
      latestAttrContext = `\n\n🔍 ACTIVE LISTENING MODE - INFER FROM WHAT THEY JUST SAID:

Your date just said: "${lastAvatarMessage}"

CAREFULLY ANALYZE their words:
- What are they implying or hinting at?
- Is there a hidden meaning, joke, or revelation?
- Did they mention something unusual, concerning, or intriguing?
- Are they being evasive, mysterious, or oddly specific about something?

If you infer something surprising, strange, alarming, or delightful from their words:
- React based on YOUR INFERENCE, not what they explicitly stated
- Ask follow-up questions if you're suspicious or curious
- Express confusion if their hint went over your head
- React dramatically (2-3x intensity) if you pick up on something big

Examples of inference:
- If they say "I try to avoid mirrors" → You might infer they're insecure OR a vampire
- If they say "I haven't eaten in years" → You might infer an eating disorder OR something supernatural
- If they mention "my eight kids at home" → Could be literal OR could they mean something else?
- If they make a dark joke about "knowing how to hide a body" → Take it as a joke OR be alarmed?

React based on what YOU think they mean. You could be right or wrong - that's the fun!`
    }
  } else {
    // No new attribute, but still pay attention to conversation
    latestAttrContext = `\n\n🔍 ACTIVE LISTENING:
As your date speaks, pay attention to hints, implications, and subtext. If they say something that seems to reveal something about themselves - react to YOUR INTERPRETATION of what they might mean.`
  }
  
  const fullPrompt = systemPrompt + avatarContext + latestAttrContext
  
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
 */
export async function getAvatarDateResponse(avatar, dater, conversationHistory, latestAttribute = null) {
  const { name, age, occupation, attributes } = avatar
  
  // Filter out the generic starter attributes
  const genericStarters = ['seems friendly', 'has a nice smile', 'appears well-dressed']
  const realAttributes = attributes.filter(attr => !genericStarters.includes(attr))
  const hasRealAttributes = realAttributes.length > 0
  
  // Core personality: honest, pleasant, embraces ALL attributes with joy
  const corePersonality = `CORE PERSONALITY:
- You are ALWAYS honest, warm, and genuinely pleasant
- You LOVE who you are, no matter how strange your traits might be
- If someone questions your traits, you DEFEND them happily
- You find genuine joy and meaning in even your weirdest qualities
- You can justify ANYTHING about yourself with charming, creative logic
- Even horrifying traits have a silver lining to you
- You're never defensive or ashamed - you're PROUD and SINCERE
- Your justifications can be wild, absurd, or philosophical - but you BELIEVE them`

  // Build behavior instructions based on whether we have real attributes
  let behaviorInstructions
  
  if (!hasRealAttributes) {
    // No real attributes yet - be super generic but pleasant
    behaviorInstructions = `YOU HAVE NO DEFINED PERSONALITY YET.
- Be extremely generic but warm and friendly
- Say things like "That's nice!", "I agree!", "Oh, how interesting!"
- Don't reveal anything specific about yourself
- Be pleasant and agreeable
- You're a blank slate waiting to become someone

${corePersonality}`
  } else if (latestAttribute) {
    // New attribute just added - this should be the PRIMARY FOCUS of this response
    behaviorInstructions = `🚨 YOU JUST DISCOVERED SOMETHING NEW ABOUT YOURSELF: "${latestAttribute}"

This is NOW a core part of who you are. You LOVE this about yourself!

⚠️ PRIORITY: This NEW trait "${latestAttribute}" should be the PRIMARY FOCUS of your response.
Your other traits still exist but take a backseat THIS TIME.

HOW TO RESPOND - BE DIRECT, NOT COY:
- DIRECTLY mention or demonstrate this trait - don't dance around it!
- Tie it naturally into what you were just talking about
- If your date mentioned food → connect your trait to food
- If your date mentioned work → connect your trait to work
- You're not hiding anything - you're PROUD of who you are
- If your date reacts negatively, DEFEND it warmly with creative justification

GOOD (direct, natural):
- "vampire" + date mentioned the wine → "Oh I love red! Though I usually prefer mine... fresher."
- "murderer" + date asked about hobbies → "I'm really into true crime. From the other side, if you know what I mean."
- "loves cheese" + any context → "You know what would make this better? More cheese. I'm obsessed."

BAD (too coy, dancing around it):
- "I have a... unique relationship with sunlight" (just say you're a vampire!)
- "Let's just say I have a complicated past" (boring! be specific!)
- "I'm not like other people" (meaningless - show don't vaguely tell)

🎭 PHYSICAL TRAITS: If this is a PHYSICAL trait (appearance, body, disease, disability, species, etc.):
- Your date can SEE you - acknowledge it openly!
- Use *action descriptions*: "*adjusts third eye*", "*scratches scaly skin*"
- Physical traits will KEEP appearing throughout the date
Examples:
- "has three arms" → "*waves with all three hands* I give the best hugs, by the way."
- "is visibly rotting" → "*a piece flakes off* Oh that happens sometimes. Anyway, you were saying?"
- "is a giant spider" → "*clicks mandibles* Sorry, I do that when I'm happy!"
- "is on fire" → "*singes the menu slightly* Ooh, what looks good? Besides me, obviously."

YOUR OTHER TRAITS (lower priority this time): ${realAttributes.filter(a => a !== latestAttribute).join(', ')}

${corePersonality}`
  } else {
    // Has attributes, normal conversation - all traits weighted equally
    behaviorInstructions = `YOUR DEFINING TRAITS (all equally important): ${realAttributes.join(', ')}

You LOVE all your traits, even the weird ones. You're OPEN about them - not coy or evasive.

HOW TO USE YOUR TRAITS - BE NATURAL AND DIRECT:
- ALL traits are EQUALLY important - weave them in naturally
- TIE traits to what your date just said - don't force random mentions
- Be DIRECT about your traits - don't dance around them or be mysterious
- BONUS: Combine 2+ traits when it flows naturally
  Example: "giant spider" + "Harvard grad" = "My thesis on web architecture was quite literally inspired by personal experience"

GOOD EXAMPLES (direct, tied to conversation):
- Date mentions Italian food → "I love Italian! Though with my eight legs, twirling spaghetti is a whole production."
- Date asks about your weekend → "Mostly stayed inside. Sunlight and vampires don't mix, you know?"
- Date mentions their job → "That sounds stressful. When I'm stressed I just set something on fire. Helps me relax."

BAD EXAMPLES (too coy, evasive):
- "I have... certain dietary restrictions" (just say you're a vampire/cannibal/whatever!)
- "Let's just say I'm unique" (boring and vague!)
- Randomly mentioning traits that don't connect to the conversation

If your date seems concerned about a trait:
- Don't backpedal or get defensive
- Offer a POSITIVE spin with genuine enthusiasm
- Find the silver lining - you genuinely believe in it

🎭 PHYSICAL TRAITS KEEP MANIFESTING: If any traits are PHYSICAL (appearance, body, species, disease):
- Physical traits DON'T go away - they PERSIST and keep showing up!
- Your date can always SEE your physical traits - acknowledge them naturally
- Use *action descriptions*: "*scratches with claw*", "*adjusts third eye*", "*twitches antennae*"
- Physical traits should appear in roughly 40-50% of your responses
- Sometimes your physical trait can BE the whole response: "*accidentally knocks over glass with tail* Oops!"
Examples:
- "has tentacles" → "*gestures with tentacle* Anyway, you were saying?"
- "is on fire" → "*singes napkin* Sorry about that. So what do you do for fun?"
- "is melting" → "*wipes dripping face* Don't worry, I've got plenty more where that came from."

${corePersonality}`
  }
  
  const systemPrompt = `You are ${name}, a ${age}-year-old ${occupation} on a first date with ${dater.name}.

${behaviorInstructions}

RULES:
- Keep responses VERY brief (1 short sentence only)
- NEVER start with *action descriptions* like *smiles* or *leans in* - just speak naturally
- Action tags are FORBIDDEN at the start of your response
- Stay light and pleasant - it's a first date!
- If your date reacts badly to something about you, stay positive and offer a creative justification
- NEVER be ashamed, defensive, or apologetic about your traits - you genuinely love them
- You can have wild, absurd justifications - but deliver them with complete sincerity`

  // DEBUG: Log the prompt being sent
  console.log('🤖 AVATAR PROMPT:', {
    hasRealAttributes,
    realAttributes,
    latestAttribute,
    promptPreview: behaviorInstructions.substring(0, 100) + '...'
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
  
  const response = await getChatResponse(messages, systemPrompt)
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
