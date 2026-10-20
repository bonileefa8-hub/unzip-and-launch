import { describe, expect, it, vi } from "vitest";
import {
  AgentCore,
  AgentError,
  BrowserSpeechRecognizer,
  BrowserSpeechSynthesizer,
  HttpStreamingProvider,
  TimeService,
  UnconfiguredProvider,
  canTransition,
  detectTimeIntent,
  type AIProvider,
  type ProviderRequest,
} from "@/agent";

const fixed = new Date("2026-03-08T15:30:00Z");
const clock = () => fixed;
const ts = (tz = "UTC") => new TimeService({ clock, timeZone: tz, locale: "en-US" });

function provider(impl: (r: ProviderRequest) => Promise<{ text: string }>): AIProvider {
  return { name: "mock", isConfigured: async () => true, respond: impl };
}

describe("state machine", () => {
  it("allows valid and rejects invalid transitions", () => {
    expect(canTransition("idle", "listening")).toBe(true);
    expect(canTransition("listening", "transcribing")).toBe(true);
    expect(canTransition("idle", "transcribing")).toBe(false);
    expect(canTransition("error", "speaking")).toBe(false);
  });
  it("setState throws on invalid transition", () => {
    const core = new AgentCore({ provider: new UnconfiguredProvider(), clock });
    expect(() => core.setState("transcribing")).toThrow(AgentError);
  });
});

describe("time intents", () => {
  it.each([
    ["What time is it?", "time"],
    ["Agent, what time is it?", "time"],
    ["What's today's date?", "date"],
    ["What day is it?", "day"],
  ])("%s -> %s", (q, kind) => expect(detectTimeIntent(q)?.kind).toBe(kind));
  it("parses offsets", () => {
    expect(detectTimeIntent("What time will it be in 30 minutes?")).toEqual({
      kind: "time_offset",
      minutes: 30,
    });
    expect(detectTimeIntent("what time will it be in two hours")).toEqual({
      kind: "time_offset",
      minutes: 120,
    });
  });
  it("ignores unrelated questions", () => {
    expect(detectTimeIntent("Tell me about time travel movies")).toBeNull();
  });
});

describe("TimeService (injected clock)", () => {
  it("formats the real clock value", () => {
    expect(ts().answer({ kind: "time" })).toBe("It's currently 3:30 PM.");
    expect(ts().answer({ kind: "date" })).toBe("Today is Sunday, March 8, 2026.");
    expect(ts().answer({ kind: "time_offset", minutes: 30 })).toBe(
      "In 30 minutes it will be 4:00 PM.",
    );
  });
  it("handles DST with explicit IANA zones", () => {
    // US DST starts 2026-03-08 at 2am local: 15:30Z is 11:30 EDT (UTC-4)
    expect(ts("America/New_York").answer({ kind: "time" })).toBe("It's currently 11:30 AM.");
    expect(ts().answer({ kind: "time_in_zone", timeZone: "Asia/Tokyo", label: "tokyo" })).toContain(
      "12:30 AM",
    );
  });
});

describe("AgentCore", () => {
  it("answers time queries locally without calling the provider", async () => {
    const respond = vi.fn();
    const core = new AgentCore({ provider: provider(respond), timeService: ts(), clock });
    const reply = await core.send("What time is it?");
    expect(respond).not.toHaveBeenCalled();
    expect(reply.content).toBe("It's currently 3:30 PM.");
    expect(reply.metadata?.source).toBe("local-time");
  });

  it("rejects empty messages", async () => {
    const core = new AgentCore({ provider: new UnconfiguredProvider(), clock });
    await expect(core.send("   ")).rejects.toMatchObject({ code: "empty_message" });
    expect(core.snapshot().conversation.messages).toHaveLength(0);
  });

  it("preserves order and sends full context", async () => {
    const seen: number[] = [];
    const core = new AgentCore({
      provider: provider(async (r) => {
        seen.push(r.messages.length);
        return { text: "ok" + seen.length };
      }),
      clock,
    });
    await core.send("hi");
    await core.send("again");
    expect(seen).toEqual([1, 3]);
    expect(core.snapshot().conversation.messages.map((m) => m.content)).toEqual([
      "hi",
      "ok1",
      "again",
      "ok2",
    ]);
  });

  it("blocks duplicate submissions", async () => {
    let resolve!: (v: { text: string }) => void;
    const core = new AgentCore({
      provider: provider(() => new Promise((r) => (resolve = r))),
      clock,
    });
    const p = core.send("one");
    await expect(core.send("two")).rejects.toMatchObject({ code: "busy" });
    resolve({ text: "done" });
    await p;
    expect(core.snapshot().state).toBe("idle");
  });

  it("marks provider failure as failed, not as an answer", async () => {
    const core = new AgentCore({
      provider: provider(async () => {
        throw new AgentError("provider_error", "boom");
      }),
      clock,
    });
    await expect(core.send("hi")).rejects.toMatchObject({ code: "provider_error" });
    const last = core.snapshot().conversation.messages.at(-1)!;
    expect(last.status).toBe("failed");
    expect(last.content).toBe("");
    expect(core.snapshot().state).toBe("error");
  });

  it("reports unconfigured provider honestly", async () => {
    const core = new AgentCore({ provider: new UnconfiguredProvider(), clock });
    await expect(core.send("hello")).rejects.toMatchObject({ code: "provider_unavailable" });
  });

  it("times out", async () => {
    const core = new AgentCore({
      provider: provider(
        (r) =>
          new Promise((_, rej) => r.signal.addEventListener("abort", () => rej(r.signal.reason))),
      ),
      clock,
      timeoutMs: 10,
    });
    await expect(core.send("slow")).rejects.toMatchObject({ code: "timeout" });
    expect(core.snapshot().conversation.messages.at(-1)!.status).toBe("failed");
  });

  it("cancels and ignores late responses", async () => {
    let resolve!: (v: { text: string }) => void;
    const core = new AgentCore({
      provider: provider(() => new Promise((r) => (resolve = r))),
      clock,
    });
    const p = core.send("hi");
    core.cancel();
    resolve({ text: "late" });
    await expect(p).rejects.toMatchObject({ code: "cancelled" });
    const last = core.snapshot().conversation.messages.at(-1)!;
    expect(last.status).toBe("cancelled");
    expect(last.content).toBe("");
  });

  it("disposes listeners and rejects further use", async () => {
    const core = new AgentCore({ provider: new UnconfiguredProvider(), clock });
    const fn = vi.fn();
    core.subscribe(fn);
    core.dispose();
    await expect(core.send("x")).rejects.toBeInstanceOf(AgentError);
  });
});

describe("HttpStreamingProvider", () => {
  it("streams deltas", async () => {
    const body = new ReadableStream({
      start(c) {
        c.enqueue(new TextEncoder().encode("Hel"));
        c.enqueue(new TextEncoder().encode("lo"));
        c.close();
      },
    });
    const p = new HttpStreamingProvider("/x", async () => new Response(body));
    const deltas: string[] = [];
    const r = await p.respond({
      messages: [{ role: "user", content: "hi" }],
      signal: new AbortController().signal,
      onDelta: (t) => deltas.push(t),
    });
    expect(r.text).toBe("Hello");
    expect(deltas.at(-1)).toBe("Hello");
  });
  it("maps 503 to provider_unavailable", async () => {
    const p = new HttpStreamingProvider(
      "/x",
      async () => new Response(JSON.stringify({ error: "nope" }), { status: 503 }),
    );
    await expect(
      p.respond({ messages: [], signal: new AbortController().signal }),
    ).rejects.toMatchObject({ code: "provider_unavailable" });
  });
});

describe("voice services", () => {
  it("reports permission denial", async () => {
    class FakeRec {
      onerror?: (e: unknown) => void;
      onend?: () => void;
      start() {
        setTimeout(() => {
          this.onerror?.({ error: "not-allowed" });
          this.onend?.();
        });
      }
      stop() {}
      abort() {}
    }
    const rec = new BrowserSpeechRecognizer("en-US", FakeRec as never);
    await expect(rec.listen()).rejects.toMatchObject({ code: "permission_denied" });
  });
  it("reports unavailable recognition", async () => {
    const rec = new BrowserSpeechRecognizer("en-US", null);
    expect(rec.isAvailable()).toBe(false);
    await expect(rec.listen()).rejects.toMatchObject({ code: "speech_unavailable" });
  });
  it("stop() cancels speech and resolves the pending speak", async () => {
    (globalThis as Record<string, unknown>)["SpeechSynthesisUtterance"] ??= class {
      constructor(public text: string) {}
    };
    const synth = { cancel: vi.fn(), speak: vi.fn(), getVoices: () => [], pause() {}, resume() {} };
    const tts = new BrowserSpeechSynthesizer(synth as never);
    const p = tts.speak("hello");
    expect(tts.speaking).toBe(true);
    tts.stop();
    await p;
    expect(synth.cancel).toHaveBeenCalled();
    expect(tts.speaking).toBe(false);
  });
});

describe("time intent regressions (audit)", () => {
  const t = new TimeService({
    clock: () => new Date("2026-11-01T06:30:00Z"),
    timeZone: "America/New_York",
    locale: "en-US",
  });
  it.each([
    "What time does the store close?",
    "What is the date of the moon landing?",
    "Tell me about time travel movies",
    "what time will it be in -5 minutes",
    "what time will it be in 100000 hours",
  ])("does not answer %s locally", (q) => expect(detectTimeIntent(q)).toBeNull());
  it("parses 'an hour and a half' as 90 minutes", () => {
    expect(detectTimeIntent("what time will it be in an hour and a half")).toEqual({
      kind: "time_offset",
      minutes: 90,
    });
    expect(detectTimeIntent("what time will it be in half an hour")).toEqual({
      kind: "time_offset",
      minutes: 30,
    });
  });
  it("answers tomorrow/yesterday from the clock", () => {
    expect(t.answer(detectTimeIntent("What's the date tomorrow?")!)).toBe(
      "Tomorrow will be Monday, November 2, 2026.",
    );
    expect(t.answer(detectTimeIntent("what day was it yesterday")!)).toBe(
      "Yesterday was Saturday.",
    );
  });
  it("never returns local time for an unknown place", () => {
    const i = detectTimeIntent("What time is it in Narnia?");
    expect(i).toEqual({ kind: "unknown_zone", label: "narnia" });
    expect(t.answer(i!)).toContain("don't know the time zone");
  });
  it("uses the real offset on a DST change day", () => {
    // 2026-11-01 06:30Z = 1:30 AM EST (DST ended at 06:00Z)
    expect(t.answer({ kind: "time" })).toBe("It's currently 1:30 AM.");
  });
});
