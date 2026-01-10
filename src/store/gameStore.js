import { create } from 'zustand'
import { daters } from '../data/daters'

// Initial Avatar state - starts with generic attributes so conversation can flow
const initialAvatar = {
  name: 'Avatar',
  age: 27,
  occupation: 'Professional',
  attributes: [
    'seems friendly',
    'has a nice smile',
    'appears well-dressed',
  ],
  personality: 'A pleasant person with enough baseline traits to hold a conversation, waiting to be shaped by the crowd.',
}

/**
 * Parse an attribute for time-based behavior
 * Returns { action, intervalMs } or null if not time-based
 */
function parseTimedAttribute(attribute) {
  const lowerAttr = attribute.toLowerCase()
  
  // Patterns to match:
  // "farts every 10 seconds" -> { action: "farts", intervalMs: 10000 }
  // "sneezes once a minute" -> { action: "sneezes", intervalMs: 60000 }
  // "hiccups every 30 seconds" -> { action: "hiccups", intervalMs: 30000 }
  // "says 'yeehaw' every 15 seconds" -> { action: "says 'yeehaw'", intervalMs: 15000 }
  
  // Match "every X seconds/minutes"
  const everyMatch = lowerAttr.match(/(.+?)\s+every\s+(\d+)\s*(second|seconds|sec|s|minute|minutes|min|m)/i)
  if (everyMatch) {
    const action = everyMatch[1].trim()
    const num = parseInt(everyMatch[2])
    const unit = everyMatch[3].toLowerCase()
    const isMinutes = unit.startsWith('min') || unit === 'm'
    const intervalMs = num * (isMinutes ? 60000 : 1000)
    return { action, intervalMs, originalAttribute: attribute }
  }
  
  // Match "once a minute/second"
  const onceMatch = lowerAttr.match(/(.+?)\s+once\s+a\s*(second|minute)/i)
  if (onceMatch) {
    const action = onceMatch[1].trim()
    const unit = onceMatch[2].toLowerCase()
    const intervalMs = unit === 'minute' ? 60000 : 1000
    return { action, intervalMs, originalAttribute: attribute }
  }
  
  // Match "every few seconds" (random 3-8 seconds)
  const fewSecondsMatch = lowerAttr.match(/(.+?)\s+every\s+few\s+seconds/i)
  if (fewSecondsMatch) {
    const action = fewSecondsMatch[1].trim()
    return { action, intervalMs: 5000, randomRange: [3000, 8000], originalAttribute: attribute }
  }
  
  // Match "constantly" or "all the time" (every 5-10 seconds)
  const constantMatch = lowerAttr.match(/(.+?)\s+(constantly|all the time|nonstop|non-stop)/i)
  if (constantMatch) {
    const action = constantMatch[1].trim()
    return { action, intervalMs: 7000, randomRange: [5000, 10000], originalAttribute: attribute }
  }
  
  return null
}

export const useGameStore = create((set, get) => ({
  // Game phase: 'lobby' | 'matchmaking' | 'chatting' | 'smalltalk' | 'voting' | 'applying' | 'hotseat' | 'results'
  phase: 'lobby',
  
  // Daters - now using rich character data
  daters: daters,
  currentDaterIndex: 0,
  selectedDater: null,
  
  // Chat phase
  chatMessages: [],
  discoveredTraits: [], // Traits revealed through conversation
  
  // Date phase
  avatar: { ...initialAvatar },
  dateConversation: [],
  dateTimer: 300, // 5 minutes in seconds
  conversationTurns: 0, // Track conversation progress for weight adjustment
  
  // 5-factor compatibility system
  compatibilityFactors: {
    physicalAttraction: 50, // Neutral baseline - rises/falls based on conversation
    similarInterests: 50,
    similarValues: 50,
    similarTastes: 50,
    similarIntelligence: 50,
  },
  // Track which factors have been "activated" (discussed in conversation)
  // Unactivated factors contribute only 10% to the overall calculation
  factorsActivated: {
    physicalAttraction: false,
    similarInterests: false,
    similarValues: false,
    similarTastes: false,
    similarIntelligence: false,
  },
  // Computed overall compatibility (calculated from factors)
  compatibility: 50,
  
  // Attribute submission & voting
  submittedAttributes: [],
  attributeVotes: {},
  appliedAttributes: [],
  latestAttribute: null, // Most recently added attribute (for special reactions)
  latestAttributeReactionsLeft: 0, // How many heightened Dater reactions remain (1-2)
  attributeCooldown: false, // 10 second cooldown between attributes
  
  // Hot seat
  hotSeatPlayer: null,
  hotSeatAttribute: null,
  
  // Timed behaviors (e.g., "farts every 10 seconds")
  timedBehaviors: [],
  pendingTimedEvent: null, // Event waiting to be injected into conversation
  
  // Players (for demo, we'll simulate)
  players: [
    { id: 1, name: 'Player 1', isHotSeat: false },
    { id: 2, name: 'Player 2', isHotSeat: false },
    { id: 3, name: 'Player 3', isHotSeat: false },
  ],
  currentPlayerId: 1,
  
  // Actions
  setPhase: (phase) => set({ phase }),
  
  // Matchmaking actions - SIMPLIFIED: first right swipe = instant match
  swipeDater: (daterId, direction) => {
    const { daters, currentDaterIndex } = get()
    
    if (direction === 'right' || direction === 'yes') {
      // Instant match! Go straight to chat
      const matchedDater = daters.find(d => d.id === daterId)
      set({ 
        selectedDater: matchedDater, 
        phase: 'chatting', 
        chatMessages: [] 
      })
    } else {
      // Swiped left - move to next card
      if (currentDaterIndex < daters.length - 1) {
        set({ currentDaterIndex: currentDaterIndex + 1 })
      } else {
        // Wrapped around - go back to first
        set({ currentDaterIndex: 0 })
      }
    }
  },
  
  // Legacy function for compatibility
  selectFinalDater: (daterId) => {
    const { daters } = get()
    const selected = daters.find(d => d.id === daterId)
    set({ selectedDater: selected, phase: 'chatting', chatMessages: [] })
  },
  
  // Chat actions
  addChatMessage: (message, isPlayer = true) => {
    const { chatMessages, selectedDater } = get()
    const newMessage = {
      id: Date.now(),
      text: message,
      sender: isPlayer ? 'player' : selectedDater.name,
      isPlayer: isPlayer,
      timestamp: new Date(),
    }
    set({ chatMessages: [...chatMessages, newMessage] })
  },
  
  addDiscoveredTrait: (trait) => {
    const { discoveredTraits } = get()
    // Avoid duplicates
    if (!discoveredTraits.includes(trait)) {
      set({ discoveredTraits: [...discoveredTraits, trait] })
    }
  },
  
  startDate: () => {
    set({ 
      phase: 'smalltalk', 
      dateConversation: [], 
      submittedAttributes: [],
      discoveredTraits: [], // Hide traits discovered during chat
      conversationTurns: 0,
      compatibilityFactors: {
        physicalAttraction: 50, // Neutral baseline
        similarInterests: 50,
        similarValues: 50,
        similarTastes: 50,
        similarIntelligence: 50,
      },
      factorsActivated: {
        physicalAttraction: false,
        similarInterests: false,
        similarValues: false,
        similarTastes: false,
        similarIntelligence: false,
      },
      compatibility: 50,
    })
  },
  
  // Date conversation
  addDateMessage: (speaker, message) => {
    const { dateConversation } = get()
    set({
      dateConversation: [
        ...dateConversation,
        { id: Date.now(), speaker, message, timestamp: new Date() },
      ],
    })
  },
  
  // Attribute submission - SINGLE PLAYER: immediately apply with cooldown
  submitAttribute: (attribute) => {
    const { avatar, appliedAttributes, attributeCooldown, timedBehaviors, compatibility } = get()
    
    // Check cooldown
    if (attributeCooldown) return false
    
    // Check if this is a time-based attribute
    const timedBehavior = parseTimedAttribute(attribute)
    const newTimedBehaviors = timedBehavior 
      ? [...timedBehaviors, { ...timedBehavior, id: Date.now() }]
      : timedBehaviors
    
    // IMMEDIATE COMPATIBILITY BOOST: Adding any trait gives a small immediate boost
    // This ensures the player sees positive feedback right away
    const immediateBoost = 3 + Math.floor(Math.random() * 4) // +3 to +6
    const newCompatibility = Math.min(100, compatibility + immediateBoost)
    
    // Immediately apply the attribute to the avatar
    set({
      avatar: {
        ...avatar,
        attributes: [...avatar.attributes, attribute],
      },
      appliedAttributes: [...appliedAttributes, attribute],
      latestAttribute: attribute, // Track for special reactions
      latestAttributeReactionsLeft: 2, // Dater gets 1-2 heightened reactions
      phase: 'applying', // Brief visual feedback
      attributeCooldown: true, // Start 10 second cooldown
      timedBehaviors: newTimedBehaviors,
      compatibility: newCompatibility, // Immediate boost!
    })
    
    // Return to small talk after brief delay
    setTimeout(() => set({ phase: 'smalltalk' }), 1500)
    
    // Clear cooldown after 10 seconds
    setTimeout(() => set({ attributeCooldown: false }), 10000)
    
    return true
  },
  
  // Trigger a timed event (called by interval in DateScene)
  triggerTimedEvent: (behavior) => {
    set({ pendingTimedEvent: behavior })
  },
  
  // Consume the pending timed event (after it's been incorporated into conversation)
  consumeTimedEvent: () => {
    set({ pendingTimedEvent: null })
  },
  
  // Called after Dater speaks to decrement heightened reaction counter
  consumeDaterReaction: () => {
    const { latestAttributeReactionsLeft } = get()
    if (latestAttributeReactionsLeft > 0) {
      const newCount = latestAttributeReactionsLeft - 1
      set({ 
        latestAttributeReactionsLeft: newCount,
        // Clear latestAttribute when no reactions left
        latestAttribute: newCount === 0 ? null : get().latestAttribute,
      })
    }
  },
  
  // Legacy voting functions (kept for compatibility, not used in single player)
  voteForAttribute: (attributeId) => {
    // No-op in single player mode
  },
  
  applyTopAttributes: () => {
    // No-op in single player mode
  },
  
  // Hot seat
  selectRandomHotSeat: () => {
    const { players } = get()
    const randomPlayer = players[Math.floor(Math.random() * players.length)]
    set({ hotSeatPlayer: randomPlayer })
  },
  
  applyHotSeatAttribute: (attribute) => {
    const { avatar, appliedAttributes } = get()
    set({
      avatar: {
        ...avatar,
        attributes: [...avatar.attributes, attribute],
      },
      appliedAttributes: [...appliedAttributes, attribute],
      hotSeatAttribute: attribute,
      phase: 'smalltalk',
    })
  },
  
  // Compatibility - 5-factor system with dynamic weighting
  /**
   * Calculate overall compatibility from the 5 factors
   * - Drops the lowest factor (so one bad area is okay)
   * - Weights physical attraction higher at start, equalizes over time
   * - Unactivated factors (never discussed) contribute only 10%
   */
  calculateCompatibility: () => {
    const { compatibilityFactors, factorsActivated, conversationTurns } = get()
    const { physicalAttraction, similarInterests, similarValues, similarTastes, similarIntelligence } = compatibilityFactors
    
    // Calculate dynamic weights based on conversation progress
    // At turn 0: physical = 2.5, others = 0.625 each
    // By turn 10+: all weights equal at 1.0
    const progressFactor = Math.min(conversationTurns / 10, 1) // 0 to 1 over 10 turns
    
    const basePhysicalWeight = 2.5 - (1.5 * progressFactor) // 2.5 -> 1.0
    const baseOtherWeight = 0.625 + (0.375 * progressFactor) // 0.625 -> 1.0
    
    // Apply activation multiplier: unactivated factors get only 10% weight
    const getWeight = (baseWeight, factorName) => {
      return factorsActivated[factorName] ? baseWeight : baseWeight * 0.1
    }
    
    // Apply weights with activation consideration
    const weightedScores = [
      { name: 'physicalAttraction', value: physicalAttraction, weight: getWeight(basePhysicalWeight, 'physicalAttraction'), activated: factorsActivated.physicalAttraction },
      { name: 'similarInterests', value: similarInterests, weight: getWeight(baseOtherWeight, 'similarInterests'), activated: factorsActivated.similarInterests },
      { name: 'similarValues', value: similarValues, weight: getWeight(baseOtherWeight, 'similarValues'), activated: factorsActivated.similarValues },
      { name: 'similarTastes', value: similarTastes, weight: getWeight(baseOtherWeight, 'similarTastes'), activated: factorsActivated.similarTastes },
      { name: 'similarIntelligence', value: similarIntelligence, weight: getWeight(baseOtherWeight, 'similarIntelligence'), activated: factorsActivated.similarIntelligence },
    ]
    
    // Sort by weighted value to find the lowest
    weightedScores.sort((a, b) => (a.value * a.weight) - (b.value * b.weight))
    
    // Drop the lowest, sum the rest
    const topFour = weightedScores.slice(1) // Remove lowest
    const totalWeight = topFour.reduce((sum, s) => sum + s.weight, 0)
    const weightedSum = topFour.reduce((sum, s) => sum + (s.value * s.weight), 0)
    
    // Calculate weighted average (handle edge case of all weights being 0)
    const compatibility = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 50
    
    return Math.max(0, Math.min(100, compatibility))
  },
  
  /**
   * Update a specific compatibility factor
   * @param {string} factor - One of: 'physical', 'interests', 'values', 'tastes', 'intelligence', or 'random'
   * @param {number} change - Positive or negative change amount
   */
  updateCompatibilityFactor: (factor, change) => {
    const { compatibilityFactors, factorsActivated, compatibility: currentCompatibility } = get()
    
    // Map short names to full names
    const factorMap = {
      'physical': 'physicalAttraction',
      'interests': 'similarInterests',
      'values': 'similarValues',
      'tastes': 'similarTastes',
      'intelligence': 'similarIntelligence',
    }
    
    // If 'random', pick a random factor
    let targetFactor = factorMap[factor]
    if (factor === 'random' || !targetFactor) {
      const factors = Object.keys(factorMap)
      targetFactor = factorMap[factors[Math.floor(Math.random() * factors.length)]]
    }
    
    const wasActivated = factorsActivated[targetFactor]
    const isFirstActivation = !wasActivated
    
    // Get the starting value for this factor
    let startingValue = compatibilityFactors[targetFactor]
    
    // KEY FIX: When a factor is activated for the FIRST time,
    // start it from the CURRENT COMPATIBILITY (not 50) so positive changes
    // can only raise the score, never lower it.
    if (isFirstActivation) {
      // First activation - start from current compatibility level
      // This ensures positive changes raise the score, negative changes lower it
      startingValue = currentCompatibility
    }
    
    // Calculate new value
    const newValue = Math.max(0, Math.min(100, startingValue + change))
    const newFactors = { ...compatibilityFactors, [targetFactor]: newValue }
    
    // Mark this factor as activated (it's now been discussed)
    const newActivated = { ...factorsActivated, [targetFactor]: true }
    
    set({ 
      compatibilityFactors: newFactors,
      factorsActivated: newActivated,
    })
    
    // Recalculate overall compatibility
    let newCompat = get().calculateCompatibility()
    
    // SAFETY: If this was a POSITIVE change on first activation, 
    // ensure the compatibility didn't drop (edge case protection)
    if (isFirstActivation && change > 0 && newCompat < currentCompatibility) {
      // Force the factor value higher to maintain at least current compatibility
      const boostedValue = Math.min(100, newValue + (currentCompatibility - newCompat + 1))
      const boostedFactors = { ...newFactors, [targetFactor]: boostedValue }
      set({ compatibilityFactors: boostedFactors })
      newCompat = get().calculateCompatibility()
    }
    
    set({ compatibility: newCompat })
    
    return { factor: targetFactor, oldValue: startingValue, newValue, overallCompat: newCompat, isFirstActivation }
  },
  
  // Increment conversation turn counter (called after each exchange)
  incrementConversationTurn: () => {
    const { conversationTurns, compatibility: currentCompatibility } = get()
    set({ conversationTurns: conversationTurns + 1 })
    // Recalculate compatibility with new weights
    const newCompat = get().calculateCompatibility()
    // PROTECTION: Only update if the new compatibility is higher or equal
    // Weight changes shouldn't cause drops - only explicit negative sentiment should
    // Allow small drops (up to 2 points) for natural fluctuation
    if (newCompat >= currentCompatibility - 2) {
      set({ compatibility: newCompat })
    }
    // If it would drop more than 2 points, keep the current value
  },
  
  // Legacy function - update random factor
  updateCompatibility: (change) => {
    get().updateCompatibilityFactor('random', change)
  },
  
  // Timer
  tickTimer: () => {
    const { dateTimer } = get()
    if (dateTimer > 0) {
      set({ dateTimer: dateTimer - 1 })
    } else {
      set({ phase: 'results' })
    }
  },
  
  // Reset game
  resetGame: () => {
    set({
      phase: 'lobby',
      currentDaterIndex: 0,
      selectedDater: null,
      chatMessages: [],
      avatar: { ...initialAvatar },
      dateConversation: [],
      compatibility: 50,
      compatibilityFactors: {
        physicalAttraction: 50, // Neutral baseline
        similarInterests: 50,
        similarValues: 50,
        similarTastes: 50,
        similarIntelligence: 50,
      },
      factorsActivated: {
        physicalAttraction: false,
        similarInterests: false,
        similarValues: false,
        similarTastes: false,
        similarIntelligence: false,
      },
      conversationTurns: 0,
      dateTimer: 300,
      submittedAttributes: [],
      attributeVotes: {},
      appliedAttributes: [],
      hotSeatPlayer: null,
      hotSeatAttribute: null,
      timedBehaviors: [],
      pendingTimedEvent: null,
    })
  },
}))
