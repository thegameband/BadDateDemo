import { create } from 'zustand'

// Generate mock Daters with hidden attributes
const generateDaters = () => [
  {
    id: 1,
    name: 'Alex',
    age: 28,
    photo: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Alex&backgroundColor=ffdfbf',
    tagline: 'Adventure seeker & coffee enthusiast ☕',
    visibleTraits: ['Loves hiking', 'Works in tech'],
    hiddenAttributes: {
      job: 'Software Engineer',
      interests: ['hiking', 'coding', 'craft beer', 'board games'],
      dealbreakers: ['smoking', 'hates dogs', 'no sense of humor'],
      idealPartner: ['creative', 'outdoorsy', 'witty', 'dog lover'],
      personality: 'Nerdy but adventurous. Loves deep conversations and bad puns.',
    },
  },
  {
    id: 2,
    name: 'Jordan',
    age: 32,
    photo: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Jordan&backgroundColor=c0aede',
    tagline: 'Artist by day, DJ by night 🎨🎧',
    visibleTraits: ['Creative soul', 'Night owl'],
    hiddenAttributes: {
      job: 'Graphic Designer & DJ',
      interests: ['art', 'music', 'vinyl records', 'late night diners'],
      dealbreakers: ['boring', 'early bird', 'hates music'],
      idealPartner: ['spontaneous', 'creative', 'music lover', 'night owl'],
      personality: 'Eccentric and passionate. Lives for creative expression and good vibes.',
    },
  },
  {
    id: 3,
    name: 'Sam',
    age: 26,
    photo: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Sam&backgroundColor=ffd5dc',
    tagline: 'Gym rat with a heart of gold 💪❤️',
    visibleTraits: ['Fitness fanatic', 'Dog parent'],
    hiddenAttributes: {
      job: 'Personal Trainer',
      interests: ['fitness', 'nutrition', 'dogs', 'Netflix binges'],
      dealbreakers: ['lazy', 'mean to animals', 'negative attitude'],
      idealPartner: ['healthy lifestyle', 'positive', 'animal lover', 'supportive'],
      personality: 'Energetic and encouraging. Believes in balance between gains and couch time.',
    },
  },
  {
    id: 4,
    name: 'Morgan',
    age: 30,
    photo: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Morgan&backgroundColor=d1d4f9',
    tagline: 'Bookworm seeking plot twist 📚✨',
    visibleTraits: ['Literature lover', 'Tea obsessed'],
    hiddenAttributes: {
      job: 'Librarian',
      interests: ['reading', 'writing', 'tea', 'cozy cafes', 'cats'],
      dealbreakers: ['anti-intellectual', 'loud', 'impatient'],
      idealPartner: ['intellectual', 'calm', 'loves books', 'good listener'],
      personality: 'Quiet and thoughtful. Finds magic in words and comfortable silences.',
    },
  },
  {
    id: 5,
    name: 'Riley',
    age: 29,
    photo: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Riley&backgroundColor=baffc9',
    tagline: 'Chaos coordinator & meme lord 🔥😂',
    visibleTraits: ['Life of the party', 'Zero filter'],
    hiddenAttributes: {
      job: 'Event Planner',
      interests: ['parties', 'memes', 'karaoke', 'spicy food', 'pranks'],
      dealbreakers: ['uptight', 'no humor', 'party pooper'],
      idealPartner: ['funny', 'spontaneous', 'bold', 'can take a joke'],
      personality: 'Chaotic good energy. Will make you laugh until you cry.',
    },
  },
]

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
  
  // Daters
  daters: generateDaters(),
  currentDaterIndex: 0,
  votes: {}, // { daterId: { yes: count, no: count } }
  selectedDater: null,
  topThreeDaters: [],
  showingTopThree: false,
  
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
  
  // Matchmaking actions
  swipeDater: (daterId, direction) => {
    const { votes, daters, currentDaterIndex } = get()
    const newVotes = { ...votes }
    
    if (!newVotes[daterId]) {
      newVotes[daterId] = { yes: 0, no: 0 }
    }
    
    if (direction === 'right' || direction === 'yes') {
      newVotes[daterId].yes += 1
    } else {
      newVotes[daterId].no += 1
    }
    
    set({ votes: newVotes })
    
    // Check if we should advance (80% voted - simplified for demo)
    const totalVotes = newVotes[daterId].yes + newVotes[daterId].no
    if (totalVotes >= 3) { // Simplified threshold for demo
      // Check if we have 3 candidates with enough yes votes
      const yesVotedDaters = daters.filter(d => newVotes[d.id]?.yes >= 1)
      
      if (yesVotedDaters.length >= 3) {
        // Sort by yes votes and take top 3
        const topThree = [...yesVotedDaters]
          .sort((a, b) => (newVotes[b.id]?.yes || 0) - (newVotes[a.id]?.yes || 0))
          .slice(0, 3)
        set({ topThreeDaters: topThree, showingTopThree: true })
      } else if (currentDaterIndex < daters.length - 1) {
        set({ currentDaterIndex: currentDaterIndex + 1 })
      }
    }
  },
  
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
      daters: generateDaters(),
      currentDaterIndex: 0,
      votes: {},
      selectedDater: null,
      topThreeDaters: [],
      showingTopThree: false,
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

