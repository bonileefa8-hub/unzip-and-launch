export type MessageRole = "user" | "assistant" | "system" | "tool";
export type MessageStatus = "pending" | "streaming" | "completed" | "failed" | "cancelled";
export type InputSource = "text" | "voice" | "system";

export type AssistantState =
  "idle" | "listening" | "transcribing" | "thinking" | "speaking" | "error" | "cancelled";

export interface ResponseMetadata {
  source: "local-time" | "ai-provider" | "demo-fallback";
  provider?: string | undefined;
  model?: string | undefined;
  durationMs?: number | undefined;
}

export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  status: MessageStatus;
  createdAt: number; // epoch ms
  inputSource?: InputSource;
  metadata?: ResponseMetadata;
  error?: AgentError;
}

export interface Conversation {
  id: string;
  messages: Message[];
  createdAt: number;
}

export type AgentErrorCode =
  | "empty_message"
  | "busy"
  | "provider_unavailable"
  | "provider_error"
  | "rate_limited"
  | "credits_exhausted"
  | "timeout"
  | "cancelled"
  | "network"
  | "invalid_transition"
  | "permission_denied"
  | "speech_unavailable"
  | "no_speech"
  | "unknown";

export class AgentError extends Error {
  readonly code: AgentErrorCode;
  readonly retryable: boolean;
  constructor(code: AgentErrorCode, message: string, retryable = false) {
    super(message);
    this.name = "AgentError";
    this.code = code;
    this.retryable = retryable;
  }
}

export type Clock = () => Date;
export const systemClock: Clock = () => new Date();
