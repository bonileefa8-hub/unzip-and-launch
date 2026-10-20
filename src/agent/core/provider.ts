import { AgentError, type Message } from "./types";

export interface ProviderMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ProviderRequest {
  messages: ProviderMessage[];
  signal: AbortSignal;
  onDelta?: (text: string) => void; // optional streaming
}

export interface ProviderResult {
  text: string;
  model?: string | undefined;
}

/** Vendor-independent conversational provider. */
export interface AIProvider {
  readonly name: string;
  isConfigured(): Promise<boolean>;
  respond(req: ProviderRequest): Promise<ProviderResult>;
}

export function toProviderMessages(messages: Message[]): ProviderMessage[] {
  return messages
    .filter(
      (m) =>
        (m.role === "user" || m.role === "assistant") &&
        m.status === "completed" &&
        m.content.trim(),
    )
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
}

/** Used when no AI provider is configured. Never fabricates an answer. */
export class UnconfiguredProvider implements AIProvider {
  readonly name = "none";
  async isConfigured() {
    return false;
  }
  async respond(): Promise<ProviderResult> {
    throw new AgentError(
      "provider_unavailable",
      "No AI provider is configured. Time and date questions still work locally.",
    );
  }
}

/**
 * Calls the app's server-side adapter (/api/agent/chat). The API key never
 * reaches the browser. Streams plain-text deltas.
 */
export class HttpStreamingProvider implements AIProvider {
  readonly name = "lovable-ai";
  constructor(
    private endpoint = "/api/agent/chat",
    private fetchImpl: typeof fetch = (...a) => fetch(...a),
  ) {}

  async isConfigured() {
    try {
      const res = await this.fetchImpl(this.endpoint, { method: "GET" });
      if (!res.ok) return false;
      const data = (await res.json()) as { configured?: boolean };
      return !!data.configured;
    } catch {
      return false;
    }
  }

  async respond({ messages, signal, onDelta }: ProviderRequest): Promise<ProviderResult> {
    let res: Response;
    try {
      res = await this.fetchImpl(this.endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages }),
        signal,
      });
    } catch (e) {
      if (signal.aborted)
        throw signal.reason instanceof AgentError
          ? signal.reason
          : new AgentError("cancelled", "Request cancelled.");
      throw new AgentError("network", "Couldn't reach the assistant service.", true);
    }
    if (!res.ok) {
      let msg = "The AI provider returned an error.";
      try {
        msg = ((await res.json()) as { error?: string }).error ?? msg;
      } catch {
        /* ignore */
      }
      if (res.status === 503) throw new AgentError("provider_unavailable", msg);
      if (res.status === 429) throw new AgentError("rate_limited", msg, true);
      if (res.status === 402) throw new AgentError("credits_exhausted", msg);
      throw new AgentError("provider_error", msg, res.status >= 500);
    }
    const model = res.headers.get("x-agent-model") ?? undefined;
    const reader = res.body?.getReader();
    if (!reader) return { text: await res.text(), model };
    const decoder = new TextDecoder();
    let text = "";
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        if (chunk.includes("\u0000ERROR:")) {
          throw new AgentError(
            "provider_error",
            chunk.split("\u0000ERROR:")[1] || "Stream failed.",
            true,
          );
        }
        text += chunk;
        onDelta?.(text);
      }
    } catch (e) {
      if (e instanceof AgentError) throw e;
      if (signal.aborted) throw new AgentError("cancelled", "Request cancelled.");
      throw new AgentError("network", "Connection lost while receiving the answer.", true);
    }
    return { text, model };
  }
}
