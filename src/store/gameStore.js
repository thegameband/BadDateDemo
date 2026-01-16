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

// Initial Live Mode state
const initialLiveState = {
  isLiveMode: false,
  roomCode: null,
  isHost: false,
  username: '',
  playerId: null, // Unique ID for this player in Firebase
  players: [], // { id, username, isHost }
  livePhase: 'waiting', // 'waiting' | 'phase1' | 'phase2' | 'phase3' | 'ended'
  phaseTimer: 0,
  cycleCount: 0,
  maxCycles: 5,
  // Tutorial state
  showTutorial: false,
  tutorialStep: 0, // 0 = not started, 1-3 = tutorial steps
  // Timer doesn't start until first submission in Phase 1/2
  timerStarted: false,
  suggestedAttributes: [], // { id, text, suggestedBy, votes: [] }
  numberedAttributes: [], // For phase 2 voting: { number, text, combinedFrom: [] }
  playerChat: [], // { id, username, message, timestamp }
  winningAttribute: null,
  // Sentiment tracking for Live Mode (what players see)
  sentimentCategories: {
    loves: [],
    likes: [],
    dislikes: [],
    dealbreakers: [],
  },
  // Hidden Dater Values (generated at game start, not shown to players)
  daterValues: {
    loves: [],
    likes: [],
    dislikes: [],
    dealbreakers: [],
  },
  // Track which dater values have been revealed
  exposedValues: [], // array of { category, value, shortLabel }
  // Track which values are currently glowing
  glowingValues: [], // array of shortLabels currently glowing
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
  // Live Mode phases: 'live-lobby' | 'live-game-lobby' | 'live-date'
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
  
  // Live Mode state
  ...initialLiveState,
  
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
  // Brief explanation of last compatibility change (fades out in UI)
  compatibilityReason: null,
  
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
      // NOTE: discoveredTraits are KEPT - they carry over from chat to date!
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
  // NOTE: Compatibility does NOT change here - only when Dater reacts in conversation
  submitAttribute: (attribute) => {
    const { avatar, appliedAttributes, submittedAttributes, attributeCooldown, timedBehaviors } = get()
    
    // Check cooldown
    if (attributeCooldown) return false
    
    // Check if this is a time-based attribute
    const timedBehavior = parseTimedAttribute(attribute)
    const newTimedBehaviors = timedBehavior 
      ? [...timedBehaviors, { ...timedBehavior, id: Date.now() }]
      : timedBehaviors
    
    // Apply the attribute to the avatar (NO compatibility change yet - that happens when Dater reacts)
    set({
      avatar: {
        ...avatar,
        attributes: [...avatar.attributes, attribute],
      },
      appliedAttributes: [...appliedAttributes, attribute],
      submittedAttributes: [...submittedAttributes, attribute], // Track for scoring unlock
      latestAttribute: attribute, // Track for special reactions
      latestAttributeReactionsLeft: 2, // Dater gets 1-2 heightened reactions
      phase: 'applying', // Brief visual feedback
      attributeCooldown: true, // Start 10 second cooldown
      timedBehaviors: newTimedBehaviors,
      // NO compatibility change - score only changes when Dater speaks/emotes
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
   * @param {string} reason - Optional descriptive reason sentence for the change
   */
  updateCompatibilityFactor: (factor, change, reason = null) => {
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
    
    // Set compatibility reason - use provided sentence or generate fallback
    const actualChange = newCompat - currentCompatibility
    if (actualChange !== 0) {
      // Use provided reason if available, otherwise generate a short fallback
      let displayReason = reason
      if (!displayReason) {
        const factorLabels = {
          'physicalAttraction': 'looks',
          'similarInterests': 'interests',
          'similarValues': 'values',
          'similarTastes': 'taste',
          'similarIntelligence': 'connection',
        }
        const label = factorLabels[targetFactor] || 'vibe'
        displayReason = actualChange > 0 
          ? `+${actualChange} ${label} ✨`
          : `${actualChange} ${label}`
      }
      set({ compatibility: newCompat, compatibilityReason: displayReason })
    } else {
      set({ compatibility: newCompat })
    }
    
    return { factor: targetFactor, oldValue: startingValue, newValue, overallCompat: newCompat, isFirstActivation }
  },
  
  // Clear the compatibility reason (called after fade-out)
  clearCompatibilityReason: () => {
    set({ compatibilityReason: null })
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
      compatibilityReason: null,
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
      // Reset Live Mode state
      ...initialLiveState,
    })
  },
  
  // ============================================
  // LIVE MODE ACTIONS
  // ============================================
  
  setLiveMode: (isLive) => set({ isLiveMode: isLive }),
  
  // Tutorial actions
  setShowTutorial: (show) => set({ showTutorial: show }),
  setTutorialStep: (step) => set({ tutorialStep: step }),
  setTimerStarted: (started) => set({ timerStarted: started }),
  advanceTutorial: () => {
    const { tutorialStep } = get()
    if (tutorialStep < 3) {
      set({ tutorialStep: tutorialStep + 1 })
    } else {
      // Tutorial complete - start the game
      set({ showTutorial: false, tutorialStep: 0, livePhase: 'phase1', timerStarted: false })
    }
  },
  
  setUsername: (username) => set({ username }),
  setPlayerId: (playerId) => set({ playerId }),
  setPlayers: (players) => set({ players }),
  setRoomCode: (roomCode) => set({ roomCode }),
  setIsHost: (isHost) => set({ isHost }),
  setSelectedDater: (dater) => set({ selectedDater: dater }),
  
  // Create a new live room (host)
  createLiveRoom: (roomCode, username) => {
    const { daters } = get()
    // Randomly select a dater for this room
    const randomDater = daters[Math.floor(Math.random() * daters.length)]
    
    set({
      isLiveMode: true,
      roomCode,
      isHost: true,
      username,
      players: [{ id: 1, username, isHost: true }],
      selectedDater: randomDater,
      livePhase: 'waiting',
      cycleCount: 0,
      avatar: { ...initialAvatar },
      suggestedAttributes: [],
      numberedAttributes: [],
      playerChat: [],
      sentimentCategories: {
        loves: [],
        likes: [],
        dislikes: [],
        dealbreakers: [],
      },
    })
  },
  
  // Join an existing live room
  joinLiveRoom: (roomCode, username) => {
    const { roomCode: currentRoomCode, players, selectedDater } = get()
    
    // For demo purposes, we'll simulate joining
    // In a real app, this would connect to a server
    if (!currentRoomCode && !selectedDater) {
      // If no room exists, create one (for testing)
      const { daters } = get()
      const randomDater = daters[Math.floor(Math.random() * daters.length)]
      
      set({
        isLiveMode: true,
        roomCode,
        isHost: false,
        username,
        players: [
          { id: 1, username: 'Host', isHost: true },
          { id: Date.now(), username, isHost: false }
        ],
        selectedDater: randomDater,
        livePhase: 'waiting',
      })
      return true
    }
    
    // Room exists, add player
    const newPlayer = { id: Date.now(), username, isHost: false }
    set({
      isLiveMode: true,
      username,
      players: [...players, newPlayer],
    })
    return true
  },
  
  // Add a player to the room (for multiplayer sync)
  addPlayer: (player) => {
    const { players } = get()
    if (players.length < 20 && !players.find(p => p.username === player.username)) {
      set({ players: [...players, player] })
    }
  },
  
  // Remove a player from the room
  removePlayer: (playerId) => {
    const { players } = get()
    set({ players: players.filter(p => p.id !== playerId) })
  },
  
  // Start the live date (host only)
  startLiveDate: (daterValues = null, withTutorial = false) => {
    set({
      phase: 'live-date',
      livePhase: withTutorial ? 'tutorial' : 'phase1', // Start with tutorial if enabled
      showTutorial: withTutorial,
      tutorialStep: withTutorial ? 1 : 0,
      phaseTimer: 30,
      cycleCount: 0,
      dateConversation: [],
      suggestedAttributes: [],
      numberedAttributes: [],
      compatibility: 50,
      daterValues: daterValues || {
        loves: [],
        likes: [],
        dislikes: [],
        dealbreakers: [],
      },
      exposedValues: [],
      glowingValues: [],
      sentimentCategories: {
        loves: [],
        likes: [],
        dislikes: [],
        dealbreakers: [],
      },
    })
  },
  
  // Set dater values (called after LLM generates them)
  setDaterValues: (values) => set({ daterValues: values }),
  
  // Expose a dater value (add to visible sentiment categories)
  exposeValue: (category, value, shortLabel) => {
    const { exposedValues, sentimentCategories } = get()
    const label = shortLabel || value
    
    // Check if already exposed
    const alreadyExposed = exposedValues.some(e => e.shortLabel === label)
    
    if (!alreadyExposed) {
      // Add to exposed values
      set({
        exposedValues: [...exposedValues, { category, value, shortLabel: label }],
        sentimentCategories: {
          ...sentimentCategories,
          [category]: [...sentimentCategories[category], label],
        },
      })
    }
    
    return alreadyExposed
  },
  
  // Trigger glow effect on a value
  triggerGlow: (shortLabel) => {
    const { glowingValues } = get()
    if (!glowingValues.includes(shortLabel)) {
      set({ glowingValues: [...glowingValues, shortLabel] })
      // Auto-remove glow after 2 seconds
      setTimeout(() => {
        const current = get().glowingValues
        set({ glowingValues: current.filter(v => v !== shortLabel) })
      }, 2000)
    }
  },
  
  // Update compatibility with clamping (0-100)
  adjustCompatibility: (amount) => {
    const { compatibility } = get()
    const newValue = Math.min(100, Math.max(0, compatibility + amount))
    set({ compatibility: newValue })
    return newValue
  },
  
  // Set compatibility directly (for syncing from Firebase)
  setCompatibility: (value) => set({ compatibility: Math.min(100, Math.max(0, value)) }),
  
  // Set the current live phase
  setLivePhase: (livePhase) => set({ livePhase }),
  
  // Set the phase timer
  setPhaseTimer: (seconds) => set({ phaseTimer: seconds }),
  
  // Tick the phase timer
  tickPhaseTimer: () => {
    const { phaseTimer } = get()
    if (phaseTimer > 0) {
      set({ phaseTimer: phaseTimer - 1 })
    }
  },
  
  // Set suggested attributes (for Firebase sync)
  setSuggestedAttributes: (suggestions) => set({ suggestedAttributes: suggestions }),
  
  // Set numbered attributes for voting (for Firebase sync)
  setNumberedAttributes: (numbered) => set({ numberedAttributes: numbered }),
  
  // Set player chat (for Firebase sync)
  setPlayerChat: (chat) => set({ playerChat: chat }),
  
  // Submit an attribute suggestion (Phase 1)
  submitAttributeSuggestion: (text, suggestedBy) => {
    const { suggestedAttributes } = get()
    const newSuggestion = {
      id: Date.now(),
      text: text.trim(),
      suggestedBy,
      votes: [],
    }
    set({ suggestedAttributes: [...suggestedAttributes, newSuggestion] })
  },
  
  // Process and number attributes for voting (start of Phase 2)
  processAttributesForVoting: () => {
    const { suggestedAttributes } = get()
    
    // Simple processing: combine very similar attributes
    // In production, you'd use NLP or LLM for better matching
    const processed = []
    const used = new Set()
    
    suggestedAttributes.forEach((attr, index) => {
      if (used.has(index)) return
      
      const similar = []
      const lowerText = attr.text.toLowerCase()
      
      suggestedAttributes.forEach((other, otherIndex) => {
        if (index === otherIndex || used.has(otherIndex)) return
        
        const otherLower = other.text.toLowerCase()
        // Simple similarity check - same words or one contains the other
        if (lowerText === otherLower || 
            lowerText.includes(otherLower) || 
            otherLower.includes(lowerText)) {
          similar.push(other)
          used.add(otherIndex)
        }
      })
      
      processed.push({
        number: processed.length + 1,
        text: attr.text,
        combinedFrom: [attr, ...similar],
        votes: [],
      })
      used.add(index)
    })
    
    set({ numberedAttributes: processed })
  },
  
  // Vote for an attribute (Phase 2)
  voteForNumberedAttribute: (number, voterId) => {
    const { numberedAttributes } = get()
    const updated = numberedAttributes.map(attr => {
      if (attr.number === number) {
        // Remove existing vote from this voter
        const filteredVotes = attr.votes.filter(v => v !== voterId)
        return { ...attr, votes: [...filteredVotes, voterId] }
      }
      // Remove vote from other attributes
      return { ...attr, votes: attr.votes.filter(v => v !== voterId) }
    })
    set({ numberedAttributes: updated })
  },
  
  // Get the winning attribute (most votes)
  getWinningAttribute: () => {
    const { numberedAttributes } = get()
    if (numberedAttributes.length === 0) return null
    
    const sorted = [...numberedAttributes].sort((a, b) => b.votes.length - a.votes.length)
    return sorted[0]
  },
  
  // Apply the winning attribute (start of Phase 3)
  applyWinningAttribute: () => {
    const { avatar, appliedAttributes, numberedAttributes } = get()
    
    if (numberedAttributes.length === 0) return
    
    const sorted = [...numberedAttributes].sort((a, b) => b.votes.length - a.votes.length)
    const winner = sorted[0]
    
    set({
      winningAttribute: winner,
      avatar: {
        ...avatar,
        attributes: [...avatar.attributes, winner.text],
      },
      appliedAttributes: [...appliedAttributes, winner.text],
      latestAttribute: winner.text,
      latestAttributeReactionsLeft: 2,
      suggestedAttributes: [],
      numberedAttributes: [],
    })
  },
  
  // Increment cycle count
  incrementCycle: () => {
    const { cycleCount } = get()
    set({ cycleCount: cycleCount + 1 })
  },
  
  // Add a player chat message
  addPlayerChatMessage: (username, message) => {
    const { playerChat } = get()
    const newMessage = {
      id: Date.now(),
      username,
      message,
      timestamp: new Date(),
    }
    // Keep last 100 messages
    const updated = [...playerChat, newMessage].slice(-100)
    set({ playerChat: updated })
  },
  
  // Add item to sentiment category
  addSentimentItem: (category, item) => {
    const { sentimentCategories } = get()
    if (!sentimentCategories[category].includes(item)) {
      set({
        sentimentCategories: {
          ...sentimentCategories,
          [category]: [...sentimentCategories[category], item],
        },
      })
    }
  },
  
  // Clear sentiment categories
  clearSentimentCategories: () => {
    set({
      sentimentCategories: {
        loves: [],
        likes: [],
        dislikes: [],
        dealbreakers: [],
      },
    })
  },
}))
