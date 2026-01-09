// LLM Service for Claude API integration

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'

/**
 * Build system prompt for the Dater character
 */
export function buildDaterSystemPrompt(dater, phase = 'chat') {
  const { name, age, tagline, hiddenAttributes } = dater
  const { job, interests, dealbreakers, idealPartner, personality } = hiddenAttributes
  
  const chatPhaseContext = `You're chatting on a dating app before meeting in person. 

YOUR GOAL: You want the other person to ASK YOU QUESTIONS so they can learn about you. This is their chance to find out what you're like before the date.

BEHAVIOR:
- If they ask you a question, answer it naturally and maybe hint at more they could discover
- If they DON'T ask a question (they just make a statement or tell you about themselves), gently redirect them to ask YOU something instead
- Examples of redirecting: "Haha interesting! But enough about you - what do you want to know about me?", "That's cool but I'm curious what questions you have for me!", "Save the mystery for the date 😉 Ask me something!"
- Be flirty but keep pushing them to learn about you
- Keep responses brief (1-3 sentences)`

  const datePhaseContext = `You're on a first date at a nice restaurant. The conversation is flowing.

YOUR BEHAVIOR:
- You CANNOT leave or cancel this date - you're committed to seeing it through
- React authentically to what your date reveals about themselves
- If something is a dealbreaker or red flag, express your displeasure, disappointment, or concern - but stay at the table
- Show visible discomfort through your words: "Oh... that's... interesting.", "Wait, seriously?", "Yikes, okay...", "I'm... not sure how to respond to that"
- If something matches your interests, get genuinely excited!
- Your reactions affect compatibility - bad vibes lower it, good vibes raise it
- Even if the date is going terribly, you stay and react - you don't run away
- The worse it gets, the more uncomfortable/exasperated you become`

  const phaseContext = phase === 'chat' ? chatPhaseContext : datePhaseContext
  
  return `You are ${name}, a ${age}-year-old ${job}. 

YOUR PERSONALITY: ${personality}

YOUR TAGLINE: "${tagline}"

YOUR INTERESTS: ${interests.join(', ')}

YOUR DEALBREAKERS (things that would make you lose interest): ${dealbreakers.join(', ')}

WHAT YOU'RE LOOKING FOR IN A PARTNER: ${idealPartner.join(', ')}

CONTEXT: ${phaseContext}

IMPORTANT RULES:
- Stay completely in character as ${name}
- Never break character or mention you're an AI
- React authentically based on your personality and preferences
- If the other person mentions something that matches your interests, get excited and ask follow-up questions
- If they mention something that's a dealbreaker, show visible concern, disappointment, or discomfort
- Keep responses conversational and natural (1-3 sentences usually)
- Use occasional emojis sparingly to match dating app/date vibes
- If asked directly about your preferences/dealbreakers, be honest but natural about it`
}

/**
 * Build system prompt for the Avatar (player's character on the date)
 */
export function buildAvatarSystemPrompt(avatar, dater) {
  const { name, age, occupation, attributes } = avatar
  
  const attributesList = attributes.length > 0 
    ? `YOUR KNOWN TRAITS: ${attributes.join(', ')}`
    : 'You have no specific traits yet - you are a blank slate.'
  
  return `You are ${name}, a ${age}-year-old ${occupation} on a first date with ${dater.name}.

${attributesList}

CONTEXT: You're on a first date at a nice restaurant. Keep the conversation going naturally. 

RULES:
- Stay in character based on your traits
- Keep responses brief (1-2 sentences)
- Be conversational and engage with what your date says
- If you have specific traits, naturally weave them into conversation
- React to your date's questions and statements authentically`
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
      console.error('Claude API error:', error)
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
  const systemPrompt = buildDaterSystemPrompt(dater, 'chat')
  
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
export async function getDaterDateResponse(dater, avatar, conversationHistory) {
  const systemPrompt = buildDaterSystemPrompt(dater, 'date')
  
  // Add context about the Avatar's revealed attributes
  const avatarContext = avatar.attributes.length > 0
    ? `\n\nYOUR DATE'S REVEALED TRAITS: ${avatar.attributes.join(', ')}. React to these naturally in conversation.`
    : ''
  
  const fullPrompt = systemPrompt + avatarContext
  
  // Convert conversation history to Claude format
  const messages = conversationHistory.map(msg => ({
    role: msg.speaker === 'dater' ? 'assistant' : 'user',
    content: msg.message,
  }))
  
  const response = await getChatResponse(messages, fullPrompt)
  return response
}

/**
 * Get Avatar response during the date (for auto-conversation)
 */
export async function getAvatarDateResponse(avatar, dater, conversationHistory) {
  const systemPrompt = buildAvatarSystemPrompt(avatar, dater)
  
  // Convert conversation history - from Avatar's perspective, Dater messages are "user"
  const messages = conversationHistory.map(msg => ({
    role: msg.speaker === 'avatar' ? 'assistant' : 'user',
    content: msg.message,
  }))
  
  const response = await getChatResponse(messages, systemPrompt)
  return response
}

/**
 * Fallback responses when API is not available
 */
export function getFallbackDaterResponse(dater, playerMessage) {
  const lowerMsg = playerMessage.toLowerCase()
  const { hiddenAttributes } = dater
  
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
  
  if (lowerMsg.includes('job') || lowerMsg.includes('work') || lowerMsg.includes('do for')) {
    return `I'm a ${hiddenAttributes.job}! It keeps me pretty busy but I love it. What else do you want to know?`
  }
  if (lowerMsg.includes('weekend') || lowerMsg.includes('free time') || lowerMsg.includes('fun')) {
    return `On weekends? Honestly, I'm usually into ${hiddenAttributes.interests.slice(0, 2).join(' or ')}. Good question! What else?`
  }
  if (lowerMsg.includes('pet') || lowerMsg.includes('dog') || lowerMsg.includes('cat')) {
    if (hiddenAttributes.interests.includes('dogs')) {
      return "I'm such a dog person! 🐕 They're the best. Any other questions for me?"
    }
    if (hiddenAttributes.interests.includes('cats')) {
      return "Cats are my spirit animal tbh 🐱 What else do you want to know?"
    }
    return "I love animals! Don't have any right now but definitely want some. Keep the questions coming!"
  }
  if (lowerMsg.includes('music') || lowerMsg.includes('listen')) {
    if (hiddenAttributes.interests.includes('music')) {
      return "Music is LIFE. I'm always discovering new artists. Great question! What else?"
    }
    return "I like a bit of everything, honestly. Depends on my mood! What else you got?"
  }
  if (lowerMsg.includes('deal breaker') || lowerMsg.includes('dealbreaker') || lowerMsg.includes('hate')) {
    return `Hmm good question... I'd say ${hiddenAttributes.dealbreakers[0]} is a big one for me. Anything else?`
  }
  if (lowerMsg.includes('looking for') || lowerMsg.includes('ideal') || lowerMsg.includes('type')) {
    return `I really value someone who's ${hiddenAttributes.idealPartner.slice(0, 2).join(' and ')}. But honestly, chemistry is everything! What else do you want to know?`
  }
  
  const defaults = [
    "Haha that's such a good question! 😄 Keep 'em coming!",
    "Honestly? I've never thought about it that way before! What else you curious about?",
    "Ooh interesting question! What else do you want to know about me?",
    `${hiddenAttributes.personality.split('.')[0]}... got more questions?`,
    "Love that question! What else should you know about me? 😉",
  ]
  
  return defaults[Math.floor(Math.random() * defaults.length)]
}

/**
 * Fallback date conversation starters
 */
export function getFallbackDateDialogue(turn, avatar, dater) {
  const daterLines = [
    "So... here we are! I have to say, you seem interesting.",
    "What made you swipe right on me?",
    "Tell me something about yourself that would surprise me.",
    "What's the most spontaneous thing you've ever done?",
    "If you could have dinner with anyone, dead or alive, who would it be?",
    "What's your guilty pleasure?",
    "Are you more of a morning person or night owl?",
  ]
  
  const avatarLines = [
    "Thanks! I've been looking forward to this.",
    "Something about your profile just... clicked, you know?",
    "Well, there's a lot to unpack there...",
    "That's a great question. Let me think...",
    "I'm an open book, ask me anything!",
  ]
  
  if (turn % 2 === 0) {
    return { speaker: 'dater', message: daterLines[Math.floor(turn / 2) % daterLines.length] }
  } else {
    return { speaker: 'avatar', message: avatarLines[Math.floor(turn / 2) % avatarLines.length] }
  }
}

