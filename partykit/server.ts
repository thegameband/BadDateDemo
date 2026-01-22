import type * as Party from "partykit/server";

// Game state - single source of truth
interface GameState {
  phase: 'lobby' | 'starting-stats' | 'reaction' | 'phase1' | 'phase2' | 'phase3' | 'ended';
  players: Player[];
  host: string | null;
  hostConnectionId: string | null; // Track host's WebSocket connection ID
  dater: any | null;
  avatar: {
    name: string;
    attributes: string[];
  };
  compatibility: number;
  cycleCount: number;
  maxCycles: number;
  phaseTimer: number;
  
  // Phase-specific state
  suggestedAttributes: Suggestion[];
  numberedAttributes: NumberedAttribute[];
  votes: Record<string, number>; // odId -> attributeNumber
  winningAttribute: string | null;
  
  // Starting Stats
  startingStats: StartingStatsState | null;
  
  // Conversation
  daterBubble: string;
  avatarBubble: string;
  conversation: Message[];
  
  // Player chat
  playerChat: ChatMessage[];
  
  // Settings
  showTutorial: boolean;
  tutorialStep: number;
  startingStatsMode: boolean;
}

interface Player {
  odId: string;
  username: string;
  isHost: boolean;
  joinedAt: number;
  connectionId?: string; // Track WebSocket connection ID
}

interface Suggestion {
  id: string;
  text: string;
  username: string;
  odId: string;
}

interface NumberedAttribute {
  number: number;
  text: string;
  submittedBy: string;
}

interface Message {
  speaker: 'dater' | 'avatar';
  message: string;
  timestamp: number;
}

interface ChatMessage {
  id: string;
  username: string;
  message: string;
  timestamp: number;
}

interface StartingStatsState {
  currentQuestionIndex: number;
  activePlayerId: string | null;
  activePlayerName: string;
  currentQuestion: string;
  currentQuestionType: 'physical' | 'emotional' | 'name' | '';
  timer: number;
  answers: StartingStatsAnswer[];
  questionAssignments: QuestionAssignment[];
  avatarName: string;
}

interface StartingStatsAnswer {
  playerId: string;
  playerName: string;
  questionType: string;
  answer: string;
}

interface QuestionAssignment {
  questionIndex: number;
  playerId: string;
  playerName: string;
  questionType: string;
  question: string;
}

// Action types that clients can send
type GameAction = 
  | { type: 'JOIN'; odId: string; username: string }
  | { type: 'LEAVE'; odId: string }
  | { type: 'START_GAME'; showTutorial: boolean; startingStatsMode: boolean }
  | { type: 'SUBMIT_ATTRIBUTE'; text: string; username: string; odId: string }
  | { type: 'VOTE'; odId: string; attributeNumber: number }
  | { type: 'SET_PHASE'; phase: GameState['phase']; timer?: number }
  | { type: 'SET_TIMER'; timer: number }
  | { type: 'SUBMIT_STARTING_STAT'; odId: string; answer: string }
  | { type: 'ADVANCE_STARTING_STATS' }
  | { type: 'SET_DATER'; dater: any }
  | { type: 'SET_BUBBLES'; daterBubble?: string; avatarBubble?: string }
  | { type: 'ADD_MESSAGE'; speaker: 'dater' | 'avatar'; message: string }
  | { type: 'SET_COMPATIBILITY'; compatibility: number }
  | { type: 'ADD_AVATAR_ATTRIBUTE'; attribute: string }
  | { type: 'SET_WINNING_ATTRIBUTE'; attribute: string }
  | { type: 'CLEAR_SUGGESTIONS' }
  | { type: 'CLEAR_VOTES' }
  | { type: 'NEXT_ROUND' }
  | { type: 'END_GAME' }
  | { type: 'SET_TUTORIAL_STEP'; step: number }
  | { type: 'SYNC_STATE'; state: Partial<GameState> } // For host to sync complex state
  | { type: 'SEND_CHAT'; username: string; message: string };

// Initial state factory
function createInitialState(): GameState {
  return {
    phase: 'lobby',
    players: [],
    host: null,
    hostConnectionId: null,
    dater: null,
    avatar: {
      name: '',
      attributes: []
    },
    compatibility: 50,
    cycleCount: 0,
    maxCycles: 5,
    phaseTimer: 0,
    suggestedAttributes: [],
    numberedAttributes: [],
    votes: {},
    winningAttribute: null,
    startingStats: null,
    daterBubble: '',
    avatarBubble: '',
    conversation: [],
    playerChat: [],
    showTutorial: false,
    tutorialStep: 0,
    startingStatsMode: true,
  };
}

export default class GameRoom implements Party.Server {
  state: GameState;
  timerInterval: ReturnType<typeof setInterval> | null = null;

  constructor(readonly room: Party.Room) {
    this.state = createInitialState();
  }

  // Called when the room is created or loaded from storage
  async onStart() {
    // Load state from storage if it exists
    const stored = await this.room.storage.get<GameState>("state");
    if (stored) {
      this.state = stored;
    }
  }

  // Called when a client connects
  async onConnect(conn: Party.Connection, ctx: Party.ConnectionContext) {
    // Send current state to the new connection
    conn.send(JSON.stringify({ type: 'STATE_SYNC', state: this.state }));
  }

  // Called when a client disconnects
  async onClose(conn: Party.Connection) {
    // Could implement player removal here if needed
    // For now, players stay in the list until explicitly removed
  }

  // Called when a client sends a message
  async onMessage(message: string, sender: Party.Connection) {
    const action: GameAction = JSON.parse(message);
    
    // Process the action and update state
    this.processAction(action, sender.id);
    
    // Broadcast updated state to ALL clients
    this.broadcastState();
    
    // Persist state
    await this.room.storage.put("state", this.state);
  }

  processAction(action: GameAction, senderId: string) {
    switch (action.type) {
      case 'JOIN': {
        // Check if player already exists
        const existingPlayer = this.state.players.find(p => p.odId === action.odId);
        if (existingPlayer) {
          // Update their connection ID in case they reconnected
          existingPlayer.connectionId = senderId;
          if (existingPlayer.isHost) {
            this.state.hostConnectionId = senderId;
          }
          console.log(`Player ${action.username} reconnected`);
          return;
        }
        
        // First player becomes host
        const isHost = this.state.players.length === 0;
        
        this.state.players.push({
          odId: action.odId,
          username: action.username,
          isHost,
          joinedAt: Date.now(),
          connectionId: senderId
        });
        
        if (isHost) {
          this.state.host = action.odId;
          this.state.hostConnectionId = senderId;
        }
        
        console.log(`Player ${action.username} joined. Total: ${this.state.players.length}`);
        break;
      }
      
      case 'LEAVE': {
        this.state.players = this.state.players.filter(p => p.odId !== action.odId);
        
        // If host left, assign new host
        if (this.state.host === action.odId && this.state.players.length > 0) {
          this.state.players[0].isHost = true;
          this.state.host = this.state.players[0].odId;
        }
        break;
      }
      
      case 'START_GAME': {
        // Only host can start (check connection ID)
        if (senderId !== this.state.hostConnectionId) {
          console.log(`START_GAME rejected: senderId=${senderId} hostConnectionId=${this.state.hostConnectionId}`);
          return;
        }
        
        console.log(`START_GAME accepted: tutorial=${action.showTutorial} startingStats=${action.startingStatsMode}`);
        
        this.state.showTutorial = action.showTutorial;
        this.state.startingStatsMode = action.startingStatsMode;
        this.state.compatibility = 50;
        this.state.cycleCount = 0;
        this.state.conversation = [];
        
        if (action.showTutorial) {
          this.state.phase = 'phase1'; // Tutorial runs during phase1
          this.state.tutorialStep = 1;
          this.state.phaseTimer = 0;
        } else if (action.startingStatsMode) {
          this.state.phase = 'starting-stats';
          this.state.phaseTimer = 15;
          this.initializeStartingStats();
        } else {
          this.state.phase = 'phase1';
          this.state.phaseTimer = 30;
        }
        
        console.log(`Game started! Phase: ${this.state.phase}`);
        break;
      }
      
      case 'SUBMIT_ATTRIBUTE': {
        // Don't allow duplicates from same player
        const alreadySubmitted = this.state.suggestedAttributes.some(
          s => s.odId === action.odId
        );
        if (alreadySubmitted) return;
        
        this.state.suggestedAttributes.push({
          id: `suggestion_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          text: action.text,
          username: action.username,
          odId: action.odId
        });
        
        // Also add to chat so everyone sees the suggestion
        const truncatedText = action.text.length > 35 ? action.text.substring(0, 35) + '...' : action.text;
        const chatMsg: ChatMessage = {
          id: `chat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          username: action.username,
          message: `💡 ${truncatedText}`,
          timestamp: Date.now(),
        };
        this.state.playerChat = [...this.state.playerChat.slice(-50), chatMsg];
        break;
      }
      
      case 'VOTE': {
        // Record vote (overwrites previous vote)
        this.state.votes[action.odId] = action.attributeNumber;
        break;
      }
      
      case 'SET_PHASE': {
        this.state.phase = action.phase;
        if (action.timer !== undefined) {
          this.state.phaseTimer = action.timer;
        }
        break;
      }
      
      case 'SET_TIMER': {
        this.state.phaseTimer = action.timer;
        break;
      }
      
      case 'SUBMIT_STARTING_STAT': {
        if (!this.state.startingStats) return;
        
        const currentAssignment = this.state.startingStats.questionAssignments[
          this.state.startingStats.currentQuestionIndex
        ];
        
        if (currentAssignment && currentAssignment.playerId === action.odId) {
          this.state.startingStats.answers.push({
            playerId: action.odId,
            playerName: currentAssignment.playerName,
            questionType: currentAssignment.questionType,
            answer: action.answer
          });
          
          // If this was the name question, set the avatar name
          if (currentAssignment.questionType === 'name') {
            this.state.avatar.name = action.answer;
          } else {
            // Add as attribute
            this.state.avatar.attributes.push(action.answer);
          }
        }
        break;
      }
      
      case 'ADVANCE_STARTING_STATS': {
        if (!this.state.startingStats) return;
        
        const nextIndex = this.state.startingStats.currentQuestionIndex + 1;
        
        if (nextIndex >= this.state.startingStats.questionAssignments.length) {
          // Starting stats complete, move to reaction round
          this.state.phase = 'reaction';
          this.state.phaseTimer = 0;
        } else {
          // Move to next question
          const nextAssignment = this.state.startingStats.questionAssignments[nextIndex];
          this.state.startingStats.currentQuestionIndex = nextIndex;
          this.state.startingStats.activePlayerId = nextAssignment.playerId;
          this.state.startingStats.activePlayerName = nextAssignment.playerName;
          this.state.startingStats.currentQuestion = nextAssignment.question;
          this.state.startingStats.currentQuestionType = nextAssignment.questionType as any;
          this.state.startingStats.timer = 15;
        }
        break;
      }
      
      case 'SET_DATER': {
        this.state.dater = action.dater;
        break;
      }
      
      case 'SET_BUBBLES': {
        if (action.daterBubble !== undefined) {
          this.state.daterBubble = action.daterBubble;
        }
        if (action.avatarBubble !== undefined) {
          this.state.avatarBubble = action.avatarBubble;
        }
        break;
      }
      
      case 'ADD_MESSAGE': {
        this.state.conversation.push({
          speaker: action.speaker,
          message: action.message,
          timestamp: Date.now()
        });
        break;
      }
      
      case 'SET_COMPATIBILITY': {
        this.state.compatibility = Math.max(0, Math.min(100, action.compatibility));
        break;
      }
      
      case 'ADD_AVATAR_ATTRIBUTE': {
        if (!this.state.avatar.attributes.includes(action.attribute)) {
          this.state.avatar.attributes.push(action.attribute);
        }
        break;
      }
      
      case 'SET_WINNING_ATTRIBUTE': {
        this.state.winningAttribute = action.attribute;
        break;
      }
      
      case 'CLEAR_SUGGESTIONS': {
        this.state.suggestedAttributes = [];
        break;
      }
      
      case 'CLEAR_VOTES': {
        this.state.votes = {};
        this.state.numberedAttributes = [];
        break;
      }
      
      case 'NEXT_ROUND': {
        this.state.cycleCount++;
        this.state.winningAttribute = null;
        this.state.suggestedAttributes = [];
        this.state.numberedAttributes = [];
        this.state.votes = {};
        
        if (this.state.cycleCount >= this.state.maxCycles) {
          this.state.phase = 'ended';
        } else {
          this.state.phase = 'phase1';
          this.state.phaseTimer = 30;
        }
        break;
      }
      
      case 'END_GAME': {
        this.state.phase = 'ended';
        break;
      }
      
      case 'SET_TUTORIAL_STEP': {
        this.state.tutorialStep = action.step;
        break;
      }
      
      case 'SYNC_STATE': {
        // Allow host to sync complex state updates
        Object.assign(this.state, action.state);
        break;
      }
      
      case 'SEND_CHAT': {
        // Add chat message from any player
        const chatMsg: ChatMessage = {
          id: `chat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          username: action.username,
          message: action.message,
          timestamp: Date.now(),
        };
        this.state.playerChat = [...this.state.playerChat.slice(-50), chatMsg]; // Keep last 50 messages
        break;
      }
    }
  }

  initializeStartingStats() {
    // Players build the Avatar (the dater going on the date)
    const QUESTIONS = [
      { type: 'physical', question: "What physical attribute do YOU have?" },
      { type: 'physical', question: "What physical attribute do YOU have?" },
      { type: 'physical', question: "What physical attribute do YOU have?" },
      { type: 'emotional', question: "What emotional state are YOU in?" },
      { type: 'emotional', question: "What emotional state are YOU in?" },
      { type: 'name', question: "What is YOUR name?" },
    ];
    
    const shuffledPlayers = [...this.state.players].sort(() => Math.random() - 0.5);
    const assignments: QuestionAssignment[] = [];
    const playerQuestionCount: Record<string, boolean> = {};
    
    for (let i = 0; i < QUESTIONS.length; i++) {
      const questionDef = QUESTIONS[i];
      
      // Find a player who hasn't answered this type yet
      let assignedPlayer = null;
      for (const player of shuffledPlayers) {
        const key = `${player.odId}-${questionDef.type}`;
        if (!playerQuestionCount[key]) {
          assignedPlayer = player;
          playerQuestionCount[key] = true;
          break;
        }
      }
      
      if (assignedPlayer) {
        assignments.push({
          questionIndex: i,
          playerId: assignedPlayer.odId,
          playerName: assignedPlayer.username,
          questionType: questionDef.type,
          question: questionDef.question,
        });
      }
    }
    
    if (assignments.length > 0) {
      const first = assignments[0];
      this.state.startingStats = {
        currentQuestionIndex: 0,
        activePlayerId: first.playerId,
        activePlayerName: first.playerName,
        currentQuestion: first.question,
        currentQuestionType: first.questionType as any,
        timer: 15,
        answers: [],
        questionAssignments: assignments,
        avatarName: '',
      };
    }
  }

  broadcastState() {
    this.room.broadcast(JSON.stringify({ 
      type: 'STATE_SYNC', 
      state: this.state 
    }));
  }
}
