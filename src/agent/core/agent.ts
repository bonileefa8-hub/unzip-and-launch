import { assertTransition } from "./state-machine";
import { toProviderMessages, type AIProvider } from "./provider";
import { detectTimeIntent, TimeService } from "./time-service";
import {
  AgentError,
  systemClock,
  type AssistantState,
  type Clock,
  type Conversation,
  type InputSource,
  type Message,
} from "./types";

export interface AgentSnapshot {
  state: AssistantState;
  conversation: Conversation;
  lastError: AgentError | null;
}

export interface AgentDeps {
  provider: AIProvider;
  timeService?: TimeService;
  clock?: Clock;
  timeoutMs?: number;
  idFactory?: () => string;
}

type Listener = (s: AgentSnapshot) => void;

let counter = 0;
const defaultId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `id-${Date.now()}-${++counter}`;

/**
 * Agent Core: conversation orchestration, independent of any UI or audio code.
 * Subscribe for immutable snapshots; call dispose() when done.
 */
export class AgentCore {
  private provider: AIProvider;
  readonly time: TimeService;
  private clock: Clock;
  private timeoutMs: number;
  private newId: () => string;
  private state: AssistantState = "idle";
  private conversation: Conversation;
  private lastError: AgentError | null = null;
  private listeners = new Set<Listener>();
  private active: { controller: AbortController; messageId: string; token: number } | null = null;
  private token = 0;
  private disposed = false;

  constructor(deps: AgentDeps) {
    this.provider = deps.provider;
    this.clock = deps.clock ?? systemClock;
    this.time = deps.timeService ?? new TimeService({ clock: this.clock });
    this.timeoutMs = deps.timeoutMs ?? 60_000;
    this.newId = deps.idFactory ?? defaultId;
    this.conversation = { id: this.newId(), messages: [], createdAt: this.clock().getTime() };
  }

  get providerName() {
    return this.provider.name;
  }

  isProviderConfigured(): Promise<boolean> {
    return this.provider.isConfigured();
  }

  snapshot(): AgentSnapshot {
    return {
      state: this.state,
      conversation: { ...this.conversation, messages: [...this.conversation.messages] },
      lastError: this.lastError,
    };
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.snapshot());
    return () => this.listeners.delete(fn);
  }

  private emit() {
    const s = this.snapshot();
    this.listeners.forEach((l) => l(s));
  }

  /** Voice/UI layers report activity through this (validated). */
  setState(next: AssistantState) {
    assertTransition(this.state, next);
    this.state = next;
    if (next !== "error") this.lastError = null;
    this.emit();
  }

  get isBusy() {
    return this.active !== null;
  }

  private push(msg: Message) {
    this.conversation.messages.push(msg);
  }

  private patch(id: string, p: Partial<Message>) {
    this.conversation.messages = this.conversation.messages.map((m) =>
      m.id === id ? { ...m, ...p } : m,
    );
  }

  /**
   * Submit a user message. Resolves with the final assistant message.
   * Throws AgentError("empty_message" | "busy") synchronously-ish for invalid submissions.
   */
  async send(text: string, source: InputSource = "text"): Promise<Message> {
    if (this.disposed) throw new AgentError("unknown", "Agent has been disposed.");
    const content = text.trim();
    if (!content) throw new AgentError("empty_message", "Message is empty.");
    if (this.active)
      throw new AgentError("busy", "Agent is still working on the previous message.");

    const now = () => this.clock().getTime();
    this.push({
      id: this.newId(),
      role: "user",
      content,
      status: "completed",
      createdAt: now(),
      inputSource: source,
    });

    const intent = detectTimeIntent(content);
    if (intent) {
      const reply: Message = {
        id: this.newId(),
        role: "assistant",
        content: this.time.answer(intent),
        status: "completed",
        createdAt: now(),
        metadata: { source: "local-time" },
      };
      this.push(reply);
      if (this.state !== "idle") this.state = "idle";
      this.emit();
      return reply;
    }

    const assistantId = this.newId();
    const controller = new AbortController();
    const token = ++this.token;
    this.active = { controller, messageId: assistantId, token };
    const history = toProviderMessages(this.conversation.messages);
    this.push({
      id: assistantId,
      role: "assistant",
      content: "",
      status: "pending",
      createdAt: now(),
    });
    this.state = "thinking";
    this.lastError = null;
    this.emit();

    const started = now();
    const timer = setTimeout(
      () =>
        controller.abort(
          new AgentError("timeout", "The assistant took too long to respond.", true),
        ),
      this.timeoutMs,
    );
    try {
      const result = await this.provider.respond({
        messages: history,
        signal: controller.signal,
        onDelta: (partial) => {
          if (this.active?.token !== token) return;
          this.patch(assistantId, { content: partial, status: "streaming" });
          this.emit();
        },
      });
      if (this.active?.token !== token) throw new AgentError("cancelled", "Request cancelled.");
      if (!result.text.trim())
        throw new AgentError("provider_error", "The AI provider returned an empty answer.", true);
      this.patch(assistantId, {
        content: result.text,
        status: "completed",
        metadata: {
          source: "ai-provider",
          provider: this.provider.name,
          model: result.model,
          durationMs: now() - started,
        },
      });
      this.state = "idle";
      this.emit();
      return this.conversation.messages.find((m) => m.id === assistantId)!;
    } catch (e) {
      let err = e instanceof AgentError ? e : new AgentError("unknown", "Something went wrong.");
      const reason = controller.signal.reason;
      if (controller.signal.aborted && reason instanceof AgentError) err = reason;
      if (this.active?.token === token || err.code === "cancelled") {
        const cancelled = err.code === "cancelled";
        this.patch(assistantId, { status: cancelled ? "cancelled" : "failed", error: err });
        this.state = cancelled ? "cancelled" : "error";
        this.lastError = cancelled ? null : err;
        this.emit();
      }
      throw err;
    } finally {
      clearTimeout(timer);
      if (this.active?.token === token) this.active = null;
    }
  }

  /** Cancel the in-flight request; a late response will be ignored. */
  cancel() {
    if (!this.active) return;
    const { controller, messageId } = this.active;
    this.active = null;
    this.patch(messageId, {
      status: "cancelled",
      error: new AgentError("cancelled", "Cancelled."),
    });
    this.state = "cancelled";
    this.emit();
    controller.abort(new AgentError("cancelled", "Request cancelled."));
  }

  /** Retry the last failed user message. */
  async retry(): Promise<Message | undefined> {
    const msgs = this.conversation.messages;
    const last = msgs[msgs.length - 1];
    if (
      !last ||
      last.role !== "assistant" ||
      (last.status !== "failed" && last.status !== "cancelled")
    )
      return;
    const user = msgs[msgs.length - 2];
    if (!user) return;
    this.conversation.messages = msgs.slice(0, -2);
    return this.send(user.content, user.inputSource);
  }

  reset() {
    this.cancel();
    this.conversation = { id: this.newId(), messages: [], createdAt: this.clock().getTime() };
    this.state = "idle";
    this.lastError = null;
    this.emit();
  }

  dispose() {
    this.cancel();
    this.listeners.clear();
    this.disposed = true;
  }
}
