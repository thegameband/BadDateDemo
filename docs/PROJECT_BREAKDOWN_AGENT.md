# Bad Date -- Project Breakdown (Agent Friendly)

*Last updated: Feb 18, 2026*

---

## Project Identity

- **Name:** Bad Date (BadDateDemo)
- **Version:** 0.02.70
- **Type:** Multiplayer party game (1–20 players) with AI-driven conversation
- **Platform:** Mobile-first web app (SPA)
- **Repository root:** `/Users/seankearney/BadDateDemo`
- **Deployment:** Vercel (frontend) + PartyKit (multiplayer server)

---

## Tech Stack

| Layer | Technology | Version | Purpose |
|-------|-----------|---------|---------|
| Framework | React | 19.2.0 | UI rendering |
| Build | Vite | 7.2.4 | Dev server, bundler, HMR |
| State | Zustand | 5.0.9 | Client-side state management |
| Animation | Framer Motion | 12.25.0 | UI transitions, gestures, layout animations |
| Multiplayer | PartyKit | 0.0.115 | WebSocket-based real-time sync via Durable Objects |
| WebSocket Client | partysocket | 1.1.10 | Client-side PartyKit connection |
| AI/LLM | Anthropic Claude API | (via REST) | Dynamic character dialogue generation |
| TTS | ElevenLabs API | (via REST) | Voice synthesis for character dialogue |
| TTS Fallback | Web Speech API | (browser native) | Fallback when ElevenLabs unavailable |
| Avatar Portraits | DiceBear (avataaars) | (via URL) | Procedural character portrait generation |
| QR Codes | qrcode.react | 4.2.0 | Room join QR code generation |
| Screenshots | html2canvas | 1.4.1 | Share card generation at game end |
| Linting | ESLint | 9.39.1 | Code quality (flat config, React hooks/refresh plugins) |
| Testing | Puppeteer | 23.11.0 | Automated browser testing and playthrough recording |
| Module System | ES Modules | — | `"type": "module"` in package.json |

---

## Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `VITE_ANTHROPIC_API_KEY` | Optional (fallback exists) | Anthropic Claude API key for LLM responses |
| `VITE_ELEVENLABS_API_KEY` | Optional (browser TTS fallback) | ElevenLabs API key for voice synthesis |
| `VITE_PARTYKIT_HOST` | Required for multiplayer | PartyKit server URL |

---

## Directory Structure

```
BadDateDemo/
├── src/
│   ├── main.jsx                    # React entry point (StrictMode, renders App into #root)
│   ├── App.jsx                     # Phase router — switches component by gameStore.phase
│   ├── App.css                     # App-level styles
│   ├── index.css                   # Global styles, CSS variables, typography
│   ├── components/
│   │   ├── LiveLobby.jsx           # Main entry screen (909 lines): solo/multiplayer selection, room creation/joining, QR scanning, debug menu
│   │   ├── LiveGameLobby.jsx       # Pre-game lobby: player list, QR code, dater preview, host controls
│   │   ├── LiveDateScene.jsx       # Primary game scene (4000+ lines): Starting Stats, Phase 1 (submit), Phase 2 (vote), Phase 3 (conversation), Plot Twist
│   │   ├── DaterBioPage.jsx        # Dater intro screen: profile display, narrator TTS, START THE DATE button
│   │   ├── Lobby.jsx               # Legacy entry (redirects to LiveLobby)
│   │   ├── Matchmaking.jsx         # Tinder-style swipe interface (Framer Motion drag gestures)
│   │   ├── ChatPhase.jsx           # Pre-date chat with dater, trait discovery system
│   │   ├── DateScene.jsx           # Legacy single-player date scene (1200+ lines)
│   │   ├── Results.jsx             # End screen: compatibility display, share card generation
│   │   ├── GameHeader.jsx          # Top bar: phase label, timer, compatibility meter
│   │   └── AnimatedText.jsx        # Text animation utility component
│   ├── services/
│   │   ├── llmService.js           # Anthropic Claude integration (2500+ lines): getDaterChatResponse, getDaterDateResponse, getAvatarDateResponse, attribute classification, dater value generation, compatibility breakdown, fallback responses
│   │   ├── partyClient.ts          # PartyKit WebSocket client (TypeScript, 403 lines): room connection, action dispatch (JOIN, LEAVE, START_GAME, SUBMIT_ATTRIBUTE, VOTE, etc.), state subscription
│   │   ├── ttsService.js           # ElevenLabs TTS + browser fallback (435 lines): audio queue, voice profiles, callbacks
│   │   ├── expressionService.js    # Character portraits via DiceBear avataaars (457 lines): emotion-to-expression mapping, image preloading/caching, custom reaction images
│   │   ├── voiceProfiles.js        # Voice profile definitions: speech patterns, emotional guidance per character
│   │   └── promptChain.js          # Modular prompt system (700+ lines): attribute classification, avatar discovery, dater reactions, Gen-Z speech register, per-dater speech overlays
│   ├── store/
│   │   └── gameStore.js            # Zustand store (952 lines): all game state, phase transitions, player management, PartyKit sync, timed behaviors
│   ├── data/
│   │   └── daters.js               # Character definitions (555 lines): 4 daters (Leo, Maya, Kickflip, Adam), rich profiles with stats, buildDaterAgentPrompt()
│   └── assets/                     # Static assets
├── partykit/
│   ├── partykit.json               # PartyKit config: name "bad-date-demo", main "server.ts", parties: { roomregistry: "registry.ts" }
│   ├── server.ts                   # GameRoom server (590 lines): game state management, action processing (JOIN, LEAVE, START_GAME, SUBMIT_ATTRIBUTE, VOTE, SET_PHASE, SYNC_STATE, SEND_CHAT, SUBMIT_PLOT_TWIST_ANSWER, etc.), state persistence, broadcast
│   └── registry.ts                 # RoomRegistry server (132 lines): room discovery, stale room cleanup (5min TTL), REGISTER_ROOM, UPDATE_ROOM, REMOVE_ROOM
├── prompts/
│   ├── README.md                   # Prompt chain documentation with flow diagrams
│   ├── 01_CLASSIFY_ATTRIBUTE.md    # Determine visible vs non-visible attribute
│   ├── 02_AVATAR_NEW_ATTRIBUTE.md  # Avatar discovers new trait
│   ├── 03_AVATAR_PHYSICAL_TRAIT.md # Additional instructions for physical/visible traits
│   ├── 04_DATER_VISIBLE_REACTION.md # Dater reacts to what they SEE
│   ├── 05_DATER_INFER_REACTION.md  # Dater infers from what Avatar SAID
│   ├── 06_AVATAR_CORE_PERSONALITY.md # Avatar's fundamental personality
│   ├── 07_RESPONSE_RULES.md        # Formatting and length constraints
│   ├── 08_GENZ_DATING_SPEECH.md    # Gen-Z reality TV speech patterns for daters
│   └── voices/
│       ├── README.md               # Per-dater voice overlay template and instructions
│       └── adam_speech.md           # Adam's old English/Romantic prose speech overlay
├── docs/
│   ├── BAD_DATE_DESIGN_DOC.html    # Original design document (HTML)
│   ├── SINGLE_PLAYER_DAILY_DESIGN.md # Canonical game design: flow, reactions, compatibility system
│   ├── LINEAR_TASKS_VERTICAL_SLICE.md # Task tracking for vertical slice
│   ├── DESIGN_DOC_README.txt       # Design doc index
│   ├── PROJECT_BREAKDOWN_PEOPLE.md # People-friendly project overview
│   └── PROJECT_BREAKDOWN_AGENT.md  # This file
├── data/
│   └── docs/
│       ├── game-design.md          # Pointer to SINGLE_PLAYER_DAILY_DESIGN.md
│       └── tasks/
│           └── OVERVIEW.md         # Implementation task tracking (Tasks 1-7)
├── scripts/
│   ├── create-linear-issues.mjs    # Linear issue creation utility
│   └── linear-tasks.json           # Task definitions for Linear
├── public/                         # Static public files
├── dist/                           # Vite build output
├── index.html                      # HTML shell (single #root div)
├── package.json                    # Dependencies and scripts
├── vite.config.js                  # Vite config: react plugin only
├── eslint.config.js                # ESLint flat config: React hooks, refresh, browser globals
└── .vercel/project.json            # Vercel deployment config
```

---

## Game Architecture

### Phase System

The game is phase-driven. `gameStore.phase` determines which component renders via `App.jsx`:

| Phase | Component | Description |
|-------|-----------|-------------|
| `lobby` | `LiveLobby` | Redirects to LiveLobby (legacy) |
| `live-lobby` | `LiveLobby` | Main entry: solo/multiplayer selection, room create/join |
| `matchmaking` | `Matchmaking` | Tinder-style dater selection (swipe interface) |
| `chatting` | `ChatPhase` | Pre-date chat with dater |
| `dater-bio` | `DaterBioPage` | Dater profile display before date starts |
| `live-game-lobby` | `LiveGameLobby` | Multiplayer pre-game lobby (player list, host controls) |
| `live-date` | `LiveDateScene` | Main game loop (the primary gameplay component) |
| `smalltalk`, `voting`, `applying`, `hotseat` | `DateScene` | Legacy single-player phases |
| `results` | `Results` | End screen with compatibility and share card |

### LiveDateScene Internal Phases

`LiveDateScene.jsx` is the main game component (~4000 lines). It manages sub-phases internally:

1. **Starting Stats** (3 questions) -- Players answer questions to build the Avatar
2. **Reaction** -- Dater reacts to initial Avatar attributes
3. **Phase 1** (Submit) -- Players type attribute suggestions
4. **Answer Selection** -- In multiplayer: voting/wheel; in single-player: direct submission
5. **Phase 3** (Conversation) -- AI-generated Avatar and Dater dialogue about the winning attribute
6. **Plot Twist** (after round 3) -- Interstitial, player input, reveal, dater reaction
7. **Ended** -- Game over, transition to results

### State Management (Zustand)

`src/store/gameStore.js` (952 lines) holds all client-side state:

**Core state:** phase, isLiveMode, dater (selected character), avatar (name + attributes), compatibility (0-100, starts at 50), conversation history, cycleCount/maxCycles.

**Live mode state:** roomCode, players array, partyClient instance, host identification.

**Sentiment/compatibility:** sentimentCategories (loves/likes/dislikes/dealbreakers arrays), daterValues (hidden values generated by LLM).

**Phase-specific:** suggestedAttributes, numberedAttributes, votes, winningAttribute, startingStats state, plotTwist state.

**Actions:** Phase transitions, attribute submission, compatibility updates, PartyKit sync dispatchers, timed behavior management.

### Multiplayer Architecture (PartyKit)

Two PartyKit servers run on Cloudflare Durable Objects:

**GameRoom (`partykit/server.ts`):**
- One instance per game room
- Maintains authoritative `GameState` with: phase, players, host, dater, avatar, compatibility, suggestions, votes, conversation, chat, plot twist state, starting stats
- Processes typed actions: `JOIN`, `LEAVE`, `START_GAME`, `SUBMIT_ATTRIBUTE`, `VOTE`, `SET_PHASE`, `SET_TIMER`, `SUBMIT_STARTING_STAT`, `ADVANCE_STARTING_STATS`, `SET_DATER`, `SET_BUBBLES`, `ADD_MESSAGE`, `SET_COMPATIBILITY`, `ADD_AVATAR_ATTRIBUTE`, `SET_WINNING_ATTRIBUTE`, `CLEAR_SUGGESTIONS`, `CLEAR_VOTES`, `NEXT_ROUND`, `END_GAME`, `SET_TUTORIAL_STEP`, `SYNC_STATE`, `SEND_CHAT`, `SUBMIT_PLOT_TWIST_ANSWER`
- Broadcasts full state to all clients on every action
- Persists state to Durable Object storage
- Host validation: first player becomes host; only host connection can START_GAME
- Privacy: `clearPlayerAnswerData()` wipes player submissions when game ends

**RoomRegistry (`partykit/registry.ts`):**
- Single shared instance for room discovery
- Tracks active rooms: code, host, dater name, player count, timestamps
- Auto-cleans stale rooms after 5 minutes of inactivity
- Actions: `GET_ROOMS`, `REGISTER_ROOM`, `UPDATE_ROOM`, `REMOVE_ROOM`, `CLEAR_ALL_ROOMS`
- Broadcasts updated room list to all connected registry clients

**Client (`src/services/partyClient.ts`):**
- TypeScript WebSocket client (403 lines)
- Connects to both GameRoom and RoomRegistry
- Exposes typed action dispatch methods
- State subscription system for React components
- Room code generation utilities

---

## LLM Integration

### Service Layer (`src/services/llmService.js`, ~2500 lines)

Calls Anthropic Claude API via REST. Key functions:

- `getDaterChatResponse(dater, messages)` -- Pre-date chat responses
- `getDaterDateResponse(dater, context)` -- Date conversation responses
- `getAvatarDateResponse(avatar, context)` -- Avatar dialogue
- `classifyAttribute(attribute)` -- Visible vs non-visible determination
- `generateDaterValues(dater)` -- Hidden sentiment values (loves/likes/dislikes/dealbreakers)
- `generateCompatibilityBreakdown(dater, avatar, conversation)` -- End-game analysis

Fallback: when `VITE_ANTHROPIC_API_KEY` is missing, functions return hardcoded/random responses so the game remains playable without AI.

### Prompt Chain System (`src/services/promptChain.js` + `prompts/`)

Modular prompt architecture. Prompts are combined based on context:

**Classification flow:**
1. `01_CLASSIFY_ATTRIBUTE` -- Is the attribute visible (physical) or non-visible?

**Avatar response chain (visible):** `02` + `03` + `06` + `07`
**Avatar response chain (non-visible):** `02` + `06` + `07`
**Dater response chain (visible):** `04` + `08` + [per-dater overlay] + `05B` + `07`
**Dater response chain (non-visible):** `05` + `08` + [per-dater overlay] + `05B` + `07`

Prompts use `[bracket]` placeholders replaced at runtime: `[attribute]`, `[avatarLastMessage]`, `[daterLastMessage]`, `[avatarName]`, `[allAttributes]`, `[allVisibleAttributes]`, `[conversationHistory]`, `[daterPersonality]`.

Per-dater voice overlays (e.g., `voices/adam_speech.md`) layer on top of the Gen-Z base speech register for character-specific speech patterns.

---

## TTS Integration (`src/services/ttsService.js`)

- Primary: ElevenLabs API with per-character voice IDs (defined in dater profiles and `voiceProfiles.js`)
- Fallback: browser Web Speech API (SpeechSynthesis)
- Audio queue system prevents overlapping speech
- Callbacks for audio start/end events (used for UI synchronization)
- Separate voice profiles for: dater, avatar, narrator

---

## Character System (`src/data/daters.js`)

4 daters, each with:

```
{
  id, name, pronouns, age, photo, voiceId,
  archetype, tagline, description, backstory,
  upbringing, hometown, friends, spirituality,
  values, beliefs, admires,
  formality, complexity, quirk, talkingTraits, characterReferences,
  stats: {
    chattiness, steering, adaptability, inquisitiveness,
    empathy, supportiveness, reassurance, depth,
    agreeableness, vulnerability, directness, sensitivity,
    flirtatiousness, shyness
  },
  idealPartner: [...],
  dealbreakers: [...],
  reactionImages: { neutral, loves, likes, dislikes, dealbreakers } // Optional (Adam has custom)
}
```

`buildDaterAgentPrompt(dater)` compiles a dater's full profile into an LLM system prompt covering identity, personality, behavioral guidance, compatibility context, and response rules.

---

## Compatibility System

- Single integer, 0-100, starts at 50
- Updated only when the dater reacts to player input
- Sentiment categories and their score impact:

| Category | Change | Description |
|----------|--------|-------------|
| Love | +20 | Hits a core Love trait |
| Like | +5 | Hits a Like trait |
| Dislike | -5 | Hits a Dislike trait |
| Dealbreaker | -20 | Hits a Nope/Dealbreaker trait |

- Tie-breaking (Like vs Dislike ambiguity): compatibility > 50 = benefit of doubt (Like); < 50 = skepticism (Dislike); == 50 = random
- Love and Dealbreaker always override tie-breaking
- Clamped to [0, 100]
- Hidden dater values (loves/likes/dislikes/dealbreakers arrays) are generated per-game by the LLM or hand-defined

---

## Expression/Portrait System (`src/services/expressionService.js`)

- Generates character portraits using DiceBear avataaars API
- Maps emotions to facial expressions (eyes, eyebrows, mouth)
- Image preloading and caching for performance
- Adam has custom reaction images (not procedurally generated)

---

## Styling

- CSS Variables defined in `src/index.css`:
  - Colors: `--bg-dark`, `--accent-pink`, `--accent-coral`, `--accent-gold`
  - Gradients: `--gradient-love`, `--gradient-chaos`
  - Typography: Bricolage Grotesque (body), Caveat (handwritten), Space Mono (mono)
- Mobile-first responsive design
- Breakpoints: 768px (tablet/desktop), 380px (small phones)
- Touch-friendly: minimum 48px button heights
- Component-scoped CSS files

---

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start Vite dev server |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Preview production build locally |
| `npm run lint` | ESLint check |
| `npm run test-agent` | Puppeteer automated browser test |
| `npm run record-playthrough` | Record video playthrough via Puppeteer (`RECORD=1`) |

---

## Version Management

Game version is tracked in two places that must stay in sync:
1. `package.json` → `"version"`
2. `src/components/LiveLobby.jsx` → `GAME_VERSION` constant

---

## Key Design Decisions

1. **Host-authoritative multiplayer:** The PartyKit server is the source of truth. The host client drives game flow (LLM calls, phase transitions), then syncs state to the server, which broadcasts to all players.
2. **Prompt modularity:** LLM prompts are separated into numbered files that are composed at runtime, enabling independent testing and modification of each behavioral aspect.
3. **Graceful degradation:** The game functions without AI (fallback responses) and without TTS (browser speech synthesis), ensuring playability regardless of API availability.
4. **Phase-driven architecture:** All UI routing is controlled by a single `phase` string in the Zustand store, making state transitions explicit and debuggable.
5. **Privacy-conscious:** Player-submitted data (answers, chat, votes) is wiped from server state when the game ends via `clearPlayerAnswerData()`.
6. **Mobile-first:** Primary target is phone browsers. All UI is designed for touch interaction and small screens first, with desktop as secondary.

---

## Current Implementation Status

Per `data/docs/tasks/OVERVIEW.md`, the following tasks define the active development roadmap:

- **Tasks 1-4** (Done): Remove timers, remove answer wheel, ensure question+answer always sent to LLM, allow slightly more verbose dater responses.
- **Task 5** (Pending): Single answer input only (remove chat window in date mode).
- **Task 6** (Pending): Justify as full-screen takeover with "Justify Your Opinion" prompt.
- **Task 7** (Pending): Create Your Avatar: exactly 3 questions (look, feeling, name), no timer.

The canonical game design document is `docs/SINGLE_PLAYER_DAILY_DESIGN.md`.
