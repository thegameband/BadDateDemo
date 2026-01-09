# Bad Date 💔

A synchronous multiplayer party game for 2–200 players where the audience collaboratively shapes a disastrous (or perfect?) first date.

## 🎮 How to Play

### Phase 1: Matchmaking
Swipe through potential Daters Tinder-style. Vote "Yes" or "No" on each candidate. Once three candidates have enough "Yes" votes, choose your favorite from the top 3!

### Phase 2: Chatting
Chat with your chosen Dater to gather intel. Ask about their job, interests, and dealbreakers. The more you learn, the better you can shape your Avatar later!

### Phase 3-6: The Date
Watch as your Avatar and the Dater go on their date. Submit attributes to shape who your Avatar becomes:
- **Small Talk**: Submit freeform attributes ("went to Harvard", "loves cats", "just got out of prison")
- **Voting**: Vote on submitted attributes to apply to your Avatar
- **Hot Seat**: One player gets randomly selected to instantly apply any attribute they want!

### Win Condition
- **80%+ Compatibility**: They kiss! 💋
- **Below 80%**: Awkward silence or rejection 💀

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

## 🎨 Features

- **Tinder-style swiping** for matchmaking
- **Real-time chat** with AI-powered Dater responses
- **Live date conversation** that reacts to player input
- **Compatibility meter** that fluctuates based on Avatar attributes
- **Hot Seat moments** for individual spotlight pressure
- **Beautiful animations** with Framer Motion

## 🛠️ Tech Stack

- **React 18** + **Vite**
- **Zustand** for state management
- **Framer Motion** for animations
- **CSS Variables** for theming

## 📁 Project Structure

```
src/
├── components/
│   ├── Lobby.jsx         # Start screen
│   ├── Matchmaking.jsx   # Tinder-style swipe interface
│   ├── ChatPhase.jsx     # Pre-date chat with Dater
│   ├── DateScene.jsx     # Main date with voting/hot seat
│   ├── Results.jsx       # End-game results screen
│   └── GameHeader.jsx    # Top bar with timer & compatibility
├── store/
│   └── gameStore.js      # Zustand game state
└── index.css             # Global styles & theme
```

## 🎯 Future Enhancements

- [ ] Real multiplayer with WebSockets
- [ ] LLM integration for dynamic conversations
- [ ] More Dater personalities and hidden attributes
- [ ] Sound effects and music
- [ ] Mobile-responsive design improvements

---

Built with 💔 for chaotic dating fun!
