export interface ChatMessage {
  id: string;
  role: "user" | "bot";
  text: string;
  timestamp: number;
}

export interface ChatRequest {
  conversationId: string;
  message: string;
  turnstileToken?: string;
}

export interface ChatResponse {
  reply: string;
  conversationId: string;
}

export type AnimationState = "idle" | "talking" | "thinking" | "waving";

export interface SpriteAnimation {
  name: AnimationState;
  startFrame: number;
  endFrame: number;
  loop: boolean;
}

export interface SpriteSheet {
  src: string;
  frameWidth: number;
  frameHeight: number;
  animations: Record<AnimationState, SpriteAnimation>;
}

export interface UIState {
  isOpen: boolean;
  draftText: string;
}
