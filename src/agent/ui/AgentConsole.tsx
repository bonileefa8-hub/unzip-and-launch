import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import {
  Mic,
  Square,
  Send,
  Volume2,
  VolumeX,
  RotateCcw,
  X,
  Trash2,
  Clock,
  AlertTriangle,
} from "lucide-react";
import type { AssistantState, Message } from "@/agent";
import { useAgent } from "./use-agent";

const STATE_LABEL: Record<AssistantState, string> = {
  idle: "Ready",
  listening: "Listening…",
  transcribing: "Transcribing…",
  thinking: "Thinking…",
  speaking: "Speaking…",
  error: "Error",
  cancelled: "Cancelled",
};

export function AgentConsole() {
  const a = useAgent();
  const [draft, setDraft] = useState("");
  const [lastVoice, setLastVoice] = useState(false);
  const [now, setNow] = useState<Date | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const state = a.snapshot?.state ?? "idle";
  const messages = a.snapshot?.conversation.messages ?? [];
  const busy = state === "thinking";
  const listening = state === "listening" || state === "transcribing";

  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const lastContent = messages.at(-1)?.content;
  useEffect(() => {
    // Braces matter: newer browsers return a Promise from scrollIntoView,
    // which React would otherwise treat as the effect's cleanup function.
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, lastContent]);
  useEffect(() => {
    if (!busy && !listening) inputRef.current?.focus();
  }, [busy, listening]);

  const submit = () => {
    if (!draft.trim() || busy) return;
    const text = draft;
    setDraft("");
    void a.send(text, lastVoice ? "voice" : "text");
    setLastVoice(false);
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  const onMic = async () => {
    if (listening) return a.stopListening();
    const text = await a.listen();
    if (text) {
      setDraft((d) => (d.trim() ? `${d.trim()} ${text}` : text));
      setLastVoice(true);
      inputRef.current?.focus();
    }
  };

  const tz = a.time()?.timeZone;
  const lastFailed =
    messages.at(-1)?.role === "assistant" &&
    (messages.at(-1)?.status === "failed" || messages.at(-1)?.status === "cancelled");

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col md:flex-row">
      {/* Diagnostics */}
      <aside className="md:w-72 border-b md:border-b-0 md:border-r border-border p-5 space-y-6 text-sm">
        <div className="flex items-center gap-3">
          <div className="relative h-10 w-10 rounded-full bg-primary grid place-items-center">
            <span className="font-display text-lg text-primary-foreground">A</span>
            <span
              className={`absolute -right-0.5 -bottom-0.5 h-3 w-3 rounded-full border-2 border-background ${state === "error" ? "bg-destructive" : state === "idle" || state === "cancelled" ? "bg-muted-foreground" : "bg-accent animate-pulse"}`}
            />
          </div>
          <div>
            <h1 className="font-display text-2xl leading-none">Agent</h1>
            <p className="text-xs text-muted-foreground mt-1">Phase 1 · development console</p>
          </div>
        </div>

        <Section title="Status">
          <Row label="Assistant" value={STATE_LABEL[state]} live />
          <Row
            label="AI provider"
            value={
              a.providerConfigured === null
                ? "Checking…"
                : a.providerConfigured
                  ? "Lovable AI (server)"
                  : "Not configured"
            }
            tone={a.providerConfigured === false ? "warn" : undefined}
          />
          <Row
            label="Speech input"
            value={a.caps.stt ? "Browser Web Speech" : "Unavailable"}
            tone={a.caps.stt ? undefined : "warn"}
          />
          <Row
            label="Speech output"
            value={a.caps.tts ? "Browser speechSynthesis" : "Unavailable"}
            tone={a.caps.tts ? undefined : "warn"}
          />
        </Section>

        <Section title="Local clock">
          <div className="flex items-center gap-2 font-mono text-base">
            <Clock className="h-4 w-4 text-accent" />
            {now ? now.toLocaleTimeString() : "—"}
          </div>
          <p className="text-xs text-muted-foreground">{tz}</p>
        </Section>

        <Section title="Voice output">
          <label className="flex items-center justify-between gap-2">
            <span>Speak replies</span>
            <input
              type="checkbox"
              className="accent-[var(--accent)] h-4 w-4"
              checked={a.settings.voiceOutput}
              onChange={(e) => {
                a.setSettings({ ...a.settings, voiceOutput: e.target.checked });
                if (!e.target.checked) a.stopSpeaking();
              }}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs text-muted-foreground">Voice</span>
            <select
              className="w-full rounded-md bg-secondary border border-border px-2 py-1.5"
              value={a.settings.voiceURI ?? ""}
              onChange={(e) =>
                a.setSettings({ ...a.settings, voiceURI: e.target.value || undefined })
              }
            >
              <option value="">System default</option>
              {a.voices.map((v) => (
                <option key={v.voiceURI} value={v.voiceURI}>
                  {v.name} ({v.lang})
                </option>
              ))}
            </select>
          </label>
          <Slider
            label="Rate"
            min={0.5}
            max={2}
            value={a.settings.rate}
            onChange={(rate) => a.setSettings({ ...a.settings, rate })}
          />
          <Slider
            label="Volume"
            min={0}
            max={1}
            value={a.settings.volume}
            onChange={(volume) => a.setSettings({ ...a.settings, volume })}
          />
        </Section>

        <p className="text-xs text-muted-foreground leading-relaxed">
          Privacy: typed and recognized text is sent to the AI service, except time and date
          questions which are answered on this device. Browser speech recognition may send audio to
          your browser vendor. No recordings are stored.
        </p>
      </aside>

      {/* Conversation */}
      <main className="flex-1 flex flex-col min-h-0 h-screen">
        <header className="flex items-center justify-between px-6 py-3 border-b border-border">
          <div role="status" aria-live="polite" className="flex items-center gap-2 text-sm">
            <StateDot state={state} /> {STATE_LABEL[state]}
          </div>
          <div className="flex gap-2">
            {state === "speaking" && (
              <Btn onClick={a.stopSpeaking} label="Stop speaking">
                <Square className="h-4 w-4" /> Stop speaking
              </Btn>
            )}
            {busy && (
              <Btn onClick={a.cancel} label="Cancel response">
                <X className="h-4 w-4" /> Cancel
              </Btn>
            )}
            <Btn
              onClick={() => a.setSettings({ ...a.settings, voiceOutput: !a.settings.voiceOutput })}
              label="Toggle voice output"
            >
              {a.settings.voiceOutput ? (
                <Volume2 className="h-4 w-4" />
              ) : (
                <VolumeX className="h-4 w-4" />
              )}
            </Btn>
            <Btn onClick={a.reset} label="Clear conversation">
              <Trash2 className="h-4 w-4" />
            </Btn>
          </div>
        </header>

        {a.providerConfigured === false && (
          <Banner>
            No AI provider is configured, so general questions can't be answered. Time and date
            questions still work. Enable Lovable AI for this project to turn on full conversation.
          </Banner>
        )}

        <div className="flex-1 overflow-y-auto px-6 py-6">
          <div className="max-w-2xl mx-auto space-y-5">
            {messages.length === 0 && (
              <div className="text-center py-16 space-y-4">
                <p className="font-display text-4xl">How can I help?</p>
                <div className="flex flex-wrap justify-center gap-2">
                  {[
                    "What time is it?",
                    "What's today's date?",
                    "What time will it be in 30 minutes?",
                    "Give me a fun fact about octopuses",
                  ].map((s) => (
                    <button
                      key={s}
                      onClick={() => a.send(s)}
                      className="rounded-full border border-border px-3 py-1.5 text-sm hover:bg-secondary transition-colors"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m) => (
              <Bubble key={m.id} m={m} />
            ))}
            {lastFailed && (
              <div className="flex justify-start">
                <Btn onClick={a.retry} label="Retry">
                  <RotateCcw className="h-4 w-4" /> Retry
                </Btn>
              </div>
            )}
            <div ref={endRef} />
          </div>
        </div>

        {a.voiceError && (
          <Banner tone="error" onClose={a.clearVoiceError}>
            {a.voiceError.message}
          </Banner>
        )}

        <div className="border-t border-border p-4">
          <div className="max-w-2xl mx-auto">
            {listening && (
              <div className="mb-2 text-sm text-accent flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-accent animate-pulse" /> Recording —{" "}
                {a.interim || "speak now"}
              </div>
            )}
            <div className="flex items-end gap-2 rounded-2xl border border-border bg-card p-2 focus-within:ring-2 focus-within:ring-ring">
              <button
                type="button"
                onClick={onMic}
                disabled={!a.caps.stt || busy}
                aria-label={listening ? "Stop recording" : "Start voice input"}
                aria-pressed={listening}
                title={
                  a.caps.stt ? undefined : "Speech recognition isn't supported in this browser"
                }
                className={`h-10 w-10 shrink-0 grid place-items-center rounded-xl transition-colors disabled:opacity-40 ${listening ? "bg-accent text-accent-foreground" : "hover:bg-secondary"}`}
              >
                {listening ? <Square className="h-4 w-4" /> : <Mic className="h-5 w-5" />}
              </button>
              <textarea
                ref={inputRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={onKey}
                rows={1}
                placeholder="Message Agent…  (Enter to send, Shift+Enter for new line)"
                aria-label="Message"
                className="flex-1 resize-none bg-transparent outline-none py-2 max-h-40 placeholder:text-muted-foreground"
              />
              <button
                type="button"
                onClick={submit}
                disabled={!draft.trim() || busy}
                aria-label="Send"
                className="h-10 w-10 shrink-0 grid place-items-center rounded-xl bg-primary text-primary-foreground disabled:opacity-40"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function Bubble({ m }: { m: Message }) {
  const user = m.role === "user";
  const time = new Date(m.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return (
    <div className={`flex ${user ? "justify-end" : "justify-start"}`}>
      <div className="max-w-[85%] space-y-1">
        <div
          className={
            user
              ? "rounded-2xl rounded-br-md bg-primary text-primary-foreground px-4 py-2.5 whitespace-pre-wrap"
              : `whitespace-pre-wrap leading-relaxed ${m.status === "failed" ? "text-destructive" : m.status === "cancelled" ? "text-muted-foreground italic" : ""}`
          }
        >
          {m.status === "pending" ? (
            <span className="inline-flex gap-1">
              <Dot />
              <Dot d="150ms" />
              <Dot d="300ms" />
            </span>
          ) : null}
          {m.status === "failed" ? (
            <span className="inline-flex items-center gap-1.5">
              <AlertTriangle className="h-4 w-4" />
              {m.error?.message ?? "Failed"}
            </span>
          ) : (
            m.content
          )}
          {m.status === "cancelled" && !m.content && "Response cancelled."}
        </div>
        <div
          className={`text-[11px] text-muted-foreground flex gap-2 ${user ? "justify-end" : ""}`}
        >
          <span>{time}</span>
          {m.inputSource === "voice" && <span>· voice</span>}
          {m.metadata?.source === "local-time" && <span>· local clock</span>}
          {m.metadata?.source === "ai-provider" && <span>· {m.metadata.model}</span>}
          {m.status === "cancelled" && m.content && <span>· stopped</span>}
        </div>
      </div>
    </div>
  );
}

const Dot = ({ d = "0ms" }: { d?: string }) => (
  <span
    className="h-2 w-2 rounded-full bg-muted-foreground animate-bounce"
    style={{ animationDelay: d }}
  />
);

function StateDot({ state }: { state: AssistantState }) {
  const cls =
    state === "error"
      ? "bg-destructive"
      : state === "idle" || state === "cancelled"
        ? "bg-muted-foreground"
        : "bg-accent animate-pulse";
  return <span className={`h-2.5 w-2.5 rounded-full ${cls}`} />;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-[11px] uppercase tracking-widest text-muted-foreground">{title}</h2>
      {children}
    </section>
  );
}

function Row({
  label,
  value,
  tone,
  live,
}: {
  label: string;
  value: string;
  tone?: "warn" | undefined;
  live?: boolean;
}) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={tone === "warn" ? "text-destructive" : ""}
        aria-live={live ? "polite" : undefined}
      >
        {value}
      </span>
    </div>
  );
}

function Slider({
  label,
  min,
  max,
  value,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs text-muted-foreground flex justify-between">
        <span>{label}</span>
        <span className="font-mono">{value.toFixed(1)}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={0.1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[var(--accent)]"
      />
    </label>
  );
}

function Btn({
  onClick,
  label,
  children,
}: {
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-sm hover:bg-secondary transition-colors"
    >
      {children}
    </button>
  );
}

function Banner({
  children,
  tone,
  onClose,
}: {
  children: React.ReactNode;
  tone?: "error";
  onClose?: () => void;
}) {
  return (
    <div
      role={tone === "error" ? "alert" : "note"}
      className={`mx-6 mt-3 rounded-lg border px-4 py-2.5 text-sm flex items-start gap-2 ${tone === "error" ? "border-destructive/50 text-destructive" : "border-border bg-secondary text-secondary-foreground"}`}
    >
      <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
      <span className="flex-1">{children}</span>
      {onClose && (
        <button onClick={onClose} aria-label="Dismiss">
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
