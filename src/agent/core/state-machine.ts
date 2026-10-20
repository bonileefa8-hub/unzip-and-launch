import { AgentError, type AssistantState } from "./types";

const TRANSITIONS: Record<AssistantState, AssistantState[]> = {
  idle: ["listening", "thinking", "speaking", "error"],
  listening: ["transcribing", "idle", "error", "cancelled"],
  transcribing: ["idle", "thinking", "error", "cancelled"],
  thinking: ["speaking", "idle", "error", "cancelled"],
  speaking: ["idle", "error", "cancelled", "listening", "thinking"],
  error: ["idle", "listening", "thinking"],
  cancelled: ["idle", "listening", "thinking"],
};

export function canTransition(from: AssistantState, to: AssistantState): boolean {
  return from === to || TRANSITIONS[from].includes(to);
}

export function assertTransition(from: AssistantState, to: AssistantState): void {
  if (!canTransition(from, to)) {
    throw new AgentError("invalid_transition", `Invalid state transition ${from} -> ${to}`);
  }
}
