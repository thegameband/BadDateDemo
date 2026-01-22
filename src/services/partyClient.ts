/**
 * PartyKit Client Service
 * 
 * This replaces Firebase for real-time game state synchronization.
 * All state is managed server-side, clients just send actions and receive state updates.
 */

import PartySocket from "partysocket";

// PartyKit server URL - update this after deployment
const PARTYKIT_HOST = import.meta.env.VITE_PARTYKIT_HOST || "localhost:1999";

// Types matching the server
export interface ChatMessage {
  id: string;
  username: string;
  message: string;
  timestamp: number;
}

export interface GameState {
  phase: 'lobby' | 'starting-stats' | 'reaction' | 'phase1' | 'phase2' | 'phase3' | 'ended';
  players: Player[];
  host: string | null;
  dater: any | null;
  avatar: {
    name: string;
    attributes: string[];
  };
  compatibility: number;
  cycleCount: number;
  maxCycles: number;
  phaseTimer: number;
  suggestedAttributes: Suggestion[];
  numberedAttributes: NumberedAttribute[];
  votes: Record<string, number>;
  winningAttribute: string | null;
  startingStats: StartingStatsState | null;
  daterBubble: string;
  avatarBubble: string;
  conversation: Message[];
  playerChat: ChatMessage[];
  showTutorial: boolean;
  tutorialStep: number;
  startingStatsMode: boolean;
}

export interface Player {
  odId: string;
  username: string;
  isHost: boolean;
  joinedAt: number;
}

export interface Suggestion {
  text: string;
  username: string;
  odId: string;
}

export interface NumberedAttribute {
  number: number;
  text: string;
  submittedBy: string;
}

export interface Message {
  speaker: 'dater' | 'avatar';
  message: string;
  timestamp: number;
}

export interface StartingStatsState {
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

export interface StartingStatsAnswer {
  playerId: string;
  playerName: string;
  questionType: string;
  answer: string;
}

export interface QuestionAssignment {
  questionIndex: number;
  playerId: string;
  playerName: string;
  questionType: string;
  question: string;
}

// Action types
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
  | { type: 'SYNC_STATE'; state: Partial<GameState> }
  | { type: 'SEND_CHAT'; username: string; message: string };

// Callback type for state updates
type StateCallback = (state: GameState) => void;

/**
 * PartyKit Game Client
 * 
 * Usage:
 * 
 * // Create a client for a room
 * const client = new PartyGameClient('ROOM123');
 * 
 * // Subscribe to state changes
 * client.onStateChange((state) => {
 *   console.log('New state:', state);
 *   // Update your React state here
 * });
 * 
 * // Send actions
 * client.join('player-123', 'Alice');
 * client.submitAttribute('is a vampire', 'Alice', 'player-123');
 * client.vote('player-123', 2);
 * 
 * // Cleanup
 * client.disconnect();
 */
export class PartyGameClient {
  private socket: PartySocket;
  private stateCallbacks: StateCallback[] = [];
  private currentState: GameState | null = null;

  constructor(roomId: string) {
    this.socket = new PartySocket({
      host: PARTYKIT_HOST,
      room: roomId,
    });

    this.socket.addEventListener("message", (event) => {
      const data = JSON.parse(event.data);
      
      if (data.type === 'STATE_SYNC') {
        this.currentState = data.state;
        this.stateCallbacks.forEach(cb => cb(data.state));
      }
    });

    this.socket.addEventListener("open", () => {
      console.log(`🎉 Connected to PartyKit room: ${roomId}`);
    });

    this.socket.addEventListener("close", () => {
      console.log(`👋 Disconnected from PartyKit room: ${roomId}`);
    });

    this.socket.addEventListener("error", (error) => {
      console.error("PartyKit connection error:", error);
    });
  }

  // Subscribe to state changes
  onStateChange(callback: StateCallback): () => void {
    this.stateCallbacks.push(callback);
    
    // Immediately call with current state if available
    if (this.currentState) {
      callback(this.currentState);
    }
    
    // Return unsubscribe function
    return () => {
      this.stateCallbacks = this.stateCallbacks.filter(cb => cb !== callback);
    };
  }

  // Get current state synchronously
  getState(): GameState | null {
    return this.currentState;
  }

  // Send an action to the server
  private send(action: GameAction) {
    if (this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(action));
    } else {
      console.warn("Socket not open, queueing action:", action.type);
      // Could implement a queue here for reliability
    }
  }

  // ============ Player Actions ============
  
  join(odId: string, username: string) {
    this.send({ type: 'JOIN', odId, username });
  }

  leave(odId: string) {
    this.send({ type: 'LEAVE', odId });
  }

  // ============ Host Actions ============
  
  startGame(showTutorial: boolean, startingStatsMode: boolean) {
    this.send({ type: 'START_GAME', showTutorial, startingStatsMode });
  }

  setDater(dater: any) {
    this.send({ type: 'SET_DATER', dater });
  }

  setPhase(phase: GameState['phase'], timer?: number) {
    this.send({ type: 'SET_PHASE', phase, timer });
  }

  setTimer(timer: number) {
    this.send({ type: 'SET_TIMER', timer });
  }

  setBubbles(daterBubble?: string, avatarBubble?: string) {
    this.send({ type: 'SET_BUBBLES', daterBubble, avatarBubble });
  }

  addMessage(speaker: 'dater' | 'avatar', message: string) {
    this.send({ type: 'ADD_MESSAGE', speaker, message });
  }

  setCompatibility(compatibility: number) {
    this.send({ type: 'SET_COMPATIBILITY', compatibility });
  }

  addAvatarAttribute(attribute: string) {
    this.send({ type: 'ADD_AVATAR_ATTRIBUTE', attribute });
  }

  setWinningAttribute(attribute: string) {
    this.send({ type: 'SET_WINNING_ATTRIBUTE', attribute });
  }

  clearSuggestions() {
    this.send({ type: 'CLEAR_SUGGESTIONS' });
  }

  clearVotes() {
    this.send({ type: 'CLEAR_VOTES' });
  }

  nextRound() {
    this.send({ type: 'NEXT_ROUND' });
  }

  endGame() {
    this.send({ type: 'END_GAME' });
  }

  setTutorialStep(step: number) {
    this.send({ type: 'SET_TUTORIAL_STEP', step });
  }

  syncState(state: Partial<GameState>) {
    this.send({ type: 'SYNC_STATE', state });
  }

  // ============ Game Actions ============
  
  submitAttribute(text: string, username: string, odId: string) {
    this.send({ type: 'SUBMIT_ATTRIBUTE', text, username, odId });
  }

  vote(odId: string, attributeNumber: number) {
    this.send({ type: 'VOTE', odId, attributeNumber });
  }

  submitStartingStat(odId: string, answer: string) {
    this.send({ type: 'SUBMIT_STARTING_STAT', odId, answer });
  }

  advanceStartingStats() {
    this.send({ type: 'ADVANCE_STARTING_STATS' });
  }

  sendChatMessage(username: string, message: string) {
    this.send({ type: 'SEND_CHAT', username, message });
  }

  // ============ Connection Management ============
  
  disconnect() {
    this.socket.close();
  }

  isConnected(): boolean {
    return this.socket.readyState === WebSocket.OPEN;
  }
}

// ============ Room Management (stateless utilities) ============

/**
 * Generate a random room code
 */
export function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

/**
 * Generate a unique player ID
 */
export function generatePlayerId(): string {
  return `od_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

// ============ React Hook (optional convenience) ============

import { useState, useEffect, useRef } from 'react';

/**
 * React hook for PartyKit game state
 * 
 * Usage:
 * const { state, client, isConnected } = usePartyGame('ROOM123');
 */
export function usePartyGame(roomId: string | null) {
  const [state, setState] = useState<GameState | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const clientRef = useRef<PartyGameClient | null>(null);

  useEffect(() => {
    if (!roomId) return;

    const client = new PartyGameClient(roomId);
    clientRef.current = client;

    const unsubscribe = client.onStateChange((newState) => {
      setState(newState);
      setIsConnected(true);
    });

    return () => {
      unsubscribe();
      client.disconnect();
      clientRef.current = null;
      setIsConnected(false);
    };
  }, [roomId]);

  return {
    state,
    client: clientRef.current,
    isConnected,
  };
}
