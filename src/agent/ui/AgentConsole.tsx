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
  Sun,
  Moon,
  CalendarDays,
} from "lucide-react";
import type { AssistantState, Message } from "@/agent";
import { useAgentCtx, type Theme } from "./AgentProvider";
import robot from "@/assets/robot.png";


export const STATE_LABEL: Record<AssistantState, string> = {
  idle: "Ready",
  listening: "Listening…",
  transcribing: "Transcribing…",
  thinking: "Thinking…",
  speaking: "Speaking…",
  error: "Error",
  cancelled: "Cancelled",
};

export function AgentConsole() {
  const { agent: a, theme, setTheme } = useAgentCtx();
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
    <>

      {/* Conversation */}
      <main className="flex-1 flex flex-col min-h-0 h-full">
        <header className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
          <div role="status" aria-live="polite" className="glass rounded-full px-4 py-1.5 flex items-center gap-2 text-sm">
            <StateDot state={state} /> {STATE_LABEL[state]}
          </div>
          <ThemeToggle theme={theme} onChange={setTheme} />
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

        <div className="flex-1 overflow-y-auto px-6 py-4">
          <div className="max-w-5xl mx-auto flex gap-6 items-start">
            <div className="flex-1 min-w-0 space-y-5">
              {messages.length === 0 && (
                <div className="text-center py-4 space-y-5">
                  <div className="relative mx-auto w-64 h-64">
                    <div aria-hidden className="absolute inset-4 rounded-full blur-3xl opacity-60" style={{ background: "var(--gradient-neon)" }} />
                    <div aria-hidden className="absolute left-1/2 bottom-2 -translate-x-1/2 w-72 h-14 rounded-[50%] border-2 border-glow/60 shadow-[var(--shadow-glow)]" />
                    <img src={robot} alt="Agent robot" width={1024} height={1024} className="relative w-full h-full object-contain animate-float drop-shadow-[0_0_30px_var(--glow)]" />
                  </div>
                  <p className="text-3xl font-semibold">How can I help?</p>
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
                        className="glass rounded-full px-4 py-1.5 text-sm hover:border-glow transition-colors"
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

            {/* Today's info — live local clock */}
            <section className="hidden lg:block w-64 shrink-0 glass rounded-3xl p-5 sticky top-0">
              <h2 className="flex items-center gap-2 text-sm font-medium">
                <CalendarDays className="h-4 w-4 text-accent" /> Today's Info
              </h2>
              <p className="mt-3 text-3xl font-semibold font-mono">
                {now ? now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}
              </p>
              <p className="text-sm text-muted-foreground">
                {now ? now.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric", year: "numeric" }) : ""}
              </p>
              <p className="mt-2 text-xs text-muted-foreground flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" /> {tz}
              </p>
            </section>
          </div>
        </div>

        {a.voiceError && (
          <Banner tone="error" onClose={a.clearVoiceError}>
            {a.voiceError.message}
          </Banner>
        )}

        <div className="p-4 pb-6">
          <div className="max-w-3xl mx-auto">
            {listening && (
              <div className="mb-2 text-sm text-accent flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-accent animate-pulse" /> Recording —{" "}
                {a.interim || "speak now"}
              </div>
            )}
            <div className="flex items-center gap-3 rounded-full glass p-2 border-glow/60 focus-within:ring-2 focus-within:ring-ring">
              <button
                type="button"
                onClick={onMic}
                disabled={!a.caps.stt || busy}
                aria-label={listening ? "Stop recording" : "Start voice input"}
                aria-pressed={listening}
                title={
                  a.caps.stt ? undefined : "Speech recognition isn't supported in this browser"
                }
                className={`h-14 w-14 shrink-0 grid place-items-center rounded-full text-primary-foreground shadow-[var(--shadow-glow)] ring-2 ring-violet/70 transition-transform hover:scale-105 disabled:opacity-40 ${listening ? "animate-pulse" : ""}`}
                style={{ background: "var(--gradient-neon)" }}
              >
                {listening ? <Square className="h-5 w-5" /> : <Mic className="h-6 w-6" />}
              </button>
              <textarea
                ref={inputRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={onKey}
                rows={1}
                placeholder="Speak or type a command…"
                aria-label="Message"
                className="flex-1 resize-none bg-transparent outline-none py-2 text-base max-h-40 placeholder:text-muted-foreground"
              />
              <button
                type="button"
                onClick={submit}
                disabled={!draft.trim() || busy}
                aria-label="Send"
                className="h-12 w-12 shrink-0 grid place-items-center rounded-full bg-primary text-primary-foreground shadow-[var(--shadow-glow)] disabled:opacity-40"
              >
                <Send className="h-5 w-5" />
              </button>
            </div>
            <p className="mt-2 text-center text-[11px] text-muted-foreground">
              Enter to send · Shift+Enter for new line
            </p>
          </div>
        </div>
      </main>
    </>
  );
}

export function ThemeToggle({ theme, onChange }: { theme: Theme; onChange: (t: Theme) => void }) {
  return (
    <div role="group" aria-label="Appearance" className="glass rounded-full p-1 flex text-sm">
      {(["day", "night"] as const).map((t) => (
        <button
          key={t}
          type="button"
          aria-pressed={theme === t}
          onClick={() => onChange(t)}
          className={`flex items-center gap-1.5 rounded-full px-3 py-1 transition-colors ${theme === t ? "bg-primary text-primary-foreground shadow-[var(--shadow-glow)]" : "text-muted-foreground hover:text-foreground"}`}
        >
          {t === "day" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          {t === "day" ? "Day" : "Night"}
        </button>
      ))}
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

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-[11px] uppercase tracking-widest text-muted-foreground">{title}</h2>
      {children}
    </section>
  );
}

export function Row({
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

export function Slider({
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

export function Btn({
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
      className="glass inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm hover:bg-secondary transition-colors"
    >
      {children}
    </button>
  );
}

export function Banner({
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
