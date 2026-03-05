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

## 🎬 Record a video playthrough

To record a full playthrough (host view) as a WebM video:

1. **Install [ffmpeg](https://ffmpeg.org/)** (required for Puppeteer screencast):
   - macOS: `brew install ffmpeg`
   - Ubuntu: `sudo apt install ffmpeg`
2. Run:
   ```bash
   npm run record-playthrough
   ```
   This runs the automated test agent with 1 host + 2 clients and saves a timestamped `playthrough-*.webm` in the project root. Play with VLC, Chrome, or convert to MP4 with `ffmpeg -i playthrough-123.webm playthrough.mp4`.

## 🤖 AI + TTS (Optional)

LLM and ElevenLabs keys should be server-side only:

1. Create a `.env` file in the project root:
```bash
OPENAI_API_KEY=your_openai_key
ANTHROPIC_API_KEY=your_anthropic_key
ELEVENLABS_API_KEY=your_elevenlabs_key
OPENAI_MODEL=gpt-5.2
```

2. Keys are read by `/api` routes, not exposed to the browser.

Without server keys, the game runs in fallback/demo behavior.

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
