export interface ModelPart {
  text: string;
  thought_signature?: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "model";
  text: string;
  timestamp: number;
  /** Opaque model parts with thought signatures, stored for round-tripping. */
  parts?: ModelPart[];
}

export interface CurrentPage {
  title: string;
  path: string;
}

export interface ChatRequest {
  conversationId: string;
  currentPage: CurrentPage;
  messages: {role: "user" | "model"; text: string; parts?: ModelPart[]}[];
}

export interface ChatResponse {
  reply: string;
  conversationId: string;
  modelParts?: ModelPart[];
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
