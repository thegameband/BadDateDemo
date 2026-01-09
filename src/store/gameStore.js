import { create } from 'zustand'
import { daters } from '../data/daters'

// Initial Avatar state
const initialAvatar = {
  name: 'Your Avatar',
  age: 27,
  occupation: 'Mystery Person',
  attributes: [],
  personality: 'A blank slate waiting to be shaped by the crowd.',
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
  
  // Date phase
  avatar: { ...initialAvatar },
  dateConversation: [],
  compatibility: 50,
  dateTimer: 300, // 5 minutes in seconds
  
  // Attribute submission & voting
  submittedAttributes: [],
  attributeVotes: {},
  appliedAttributes: [],
  
  // Hot seat
  hotSeatPlayer: null,
  hotSeatAttribute: null,
  
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
  
  startDate: () => {
    set({ phase: 'smalltalk', dateConversation: [], submittedAttributes: [] })
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
  
  // Attribute submission
  submitAttribute: (attribute) => {
    const { submittedAttributes } = get()
    if (submittedAttributes.length < 10) {
      set({
        submittedAttributes: [
          ...submittedAttributes,
          { id: Date.now(), text: attribute, votes: 0 },
        ],
      })
    }
    
    // Auto-transition to voting when threshold reached
    if (submittedAttributes.length >= 5) {
      set({ phase: 'voting' })
    }
  },
  
  voteForAttribute: (attributeId) => {
    const { submittedAttributes } = get()
    const updated = submittedAttributes.map(attr =>
      attr.id === attributeId ? { ...attr, votes: attr.votes + 1 } : attr
    )
    set({ submittedAttributes: updated })
  },
  
  applyTopAttributes: () => {
    const { submittedAttributes, avatar, appliedAttributes } = get()
    const topAttributes = [...submittedAttributes]
      .sort((a, b) => b.votes - a.votes)
      .slice(0, 3)
      .map(a => a.text)
    
    set({
      avatar: {
        ...avatar,
        attributes: [...avatar.attributes, ...topAttributes],
      },
      appliedAttributes: [...appliedAttributes, ...topAttributes],
      submittedAttributes: [],
      phase: 'applying',
    })
    
    // After applying, go to hot seat
    setTimeout(() => set({ phase: 'hotseat' }), 3000)
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
  
  // Compatibility
  updateCompatibility: (change) => {
    const { compatibility } = get()
    const newCompat = Math.max(0, Math.min(100, compatibility + change))
    set({ compatibility: newCompat })
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
      dateTimer: 300,
      submittedAttributes: [],
      attributeVotes: {},
      appliedAttributes: [],
      hotSeatPlayer: null,
      hotSeatAttribute: null,
    })
  },
}))
