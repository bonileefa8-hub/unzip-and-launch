import { createFileRoute } from "@tanstack/react-router";

const MODEL = "openai/gpt-6-astra";
const GATEWAY = "https://ai.gateway.lovable.dev/v1/responses";
const SYSTEM = `You are Agent, a responsive, friendly voice and text assistant.
Answers may be read aloud, so keep them concise and conversational (usually 1-3 short sentences) unless the user asks for detail.
Avoid heavy markdown, tables or code unless explicitly requested.
You do not have access to the current time or date; if asked, say the local clock handles that and suggest asking "What time is it?".`;

type Msg = { role: "user" | "assistant"; content: string };

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export const Route = createFileRoute("/api/agent/chat")({
  server: {
    handlers: {
      GET: async () => json(200, { configured: !!process.env["LOVABLE_API_KEY"], model: MODEL }),
      POST: async ({ request }) => {
        const key = process.env["LOVABLE_API_KEY"];
        if (!key) return json(503, { error: "AI provider is not configured on the server." });

        let messages: Msg[];
        try {
          const body = (await request.json()) as { messages?: unknown };
          if (!Array.isArray(body.messages)) throw new Error();
          messages = body.messages
            .filter(
              (m): m is Msg =>
                !!m &&
                (m.role === "user" || m.role === "assistant") &&
                typeof m.content === "string",
            )
            .slice(-40)
            .map((m) => ({ role: m.role, content: m.content.slice(0, 8000) }));
          if (!messages.length) throw new Error();
        } catch {
          return json(400, { error: "Invalid request." });
        }

        let upstream: Response | null;
        try {
          upstream = await fetch(GATEWAY, {
            method: "POST",
            signal: request.signal,
            headers: {
              "content-type": "application/json",
              authorization: `Bearer ${key}`,
              "Lovable-API-Key": key,
              "X-Lovable-AIG-SDK": "fetch",
            },
            body: JSON.stringify({
              model: MODEL,
              instructions: SYSTEM,
              input: messages.map((m) => ({ role: m.role, content: m.content })),
              reasoning: { effort: "low" },
              store: false,
              stream: true,
            }),
          });
        } catch (e) {
          // Client pressed Cancel / navigated away: expected, not a server error.
          if (request.signal.aborted || (e as Error)?.name === "AbortError")
            return new Response(null, { status: 499 });
          upstream = null;
        }

        if (!upstream) return json(502, { error: "Couldn't reach the AI provider." });
        if (!upstream.ok || !upstream.body) {
          let msg = "The AI provider returned an error.";
          try {
            const e = (await upstream.json()) as {
              error?: { message?: string } | string;
              message?: string;
            };
            msg = (typeof e.error === "object" ? e.error?.message : e.error) ?? e.message ?? msg;
          } catch {
            /* ignore */
          }
          if (upstream.status === 429) msg = "Rate limited. Please wait a moment and try again.";
          if (upstream.status === 402) msg = msg || "AI credits are exhausted.";
          console.error("agent chat upstream", upstream.status);
          return json(upstream.status, { error: msg });
        }

        const reader = upstream.body.getReader();
        const decoder = new TextDecoder();
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
          async start(controller) {
            let buf = "";
            try {
              for (;;) {
                const { done, value } = await reader.read();
                if (done) break;
                buf += decoder.decode(value, { stream: true });
                let idx;
                while ((idx = buf.indexOf("\n")) >= 0) {
                  const line = buf.slice(0, idx).trim();
                  buf = buf.slice(idx + 1);
                  if (!line.startsWith("data:")) continue;
                  const data = line.slice(5).trim();
                  if (!data || data === "[DONE]") continue;
                  try {
                    const ev = JSON.parse(data) as {
                      type?: string;
                      delta?: string;
                      response?: { error?: { message?: string } };
                    };
                    if (ev.type === "response.output_text.delta" && ev.delta)
                      controller.enqueue(encoder.encode(ev.delta));
                    else if (ev.type === "response.failed" || ev.type === "error")
                      controller.enqueue(
                        encoder.encode(
                          `\u0000ERROR:${ev.response?.error?.message ?? "Generation failed."}`,
                        ),
                      );
                  } catch {
                    /* partial line */
                  }
                }
              }
              controller.close();
            } catch {
              try {
                controller.close();
              } catch {
                /* closed */
              }
            }
          },
          cancel() {
            reader.cancel().catch(() => {});
          },
        });

        const headers = new Headers({
          "content-type": "text/plain; charset=utf-8",
          "cache-control": "no-store",
          "x-agent-model": MODEL,
        });
        upstream.headers.forEach((v, k) => {
          if (k.toLowerCase().startsWith("x-lovable-aig-")) headers.set(k, v);
        });
        return new Response(stream, { headers });
      },
    },
  },
});
