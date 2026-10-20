import { useState } from "react";
import { Bot, Mic, Volume2, ShieldCheck, Palette, Wrench, ChevronDown } from "lucide-react";
import { useAgentCtx } from "./AgentProvider";
import { Row, Slider, ThemeToggle, STATE_LABEL } from "./AgentConsole";

const SECTIONS = [
  { id: "ai", label: "AI Provider", icon: Bot },
  { id: "voice-in", label: "Voice Input", icon: Mic },
  { id: "voice-out", label: "Voice Output", icon: Volume2 },
  { id: "privacy", label: "Privacy & Security", icon: ShieldCheck },
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "advanced", label: "Advanced", icon: Wrench },
] as const;

export function SettingsPage() {
  const { agent: a, theme, setTheme } = useAgentCtx();
  const [advOpen, setAdvOpen] = useState(false);
  const providerLabel =
    a.providerConfigured === null ? "Checking…" : a.providerConfigured ? "Ready" : "Unavailable";

  return (
    <main className="flex-1 overflow-y-auto px-6 py-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <header>
          <h1 className="text-3xl font-semibold">Settings</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Changes apply right away and last until you reload the page.
          </p>
        </header>

        <nav aria-label="Settings sections" className="flex flex-wrap gap-2">
          {SECTIONS.map(({ id, label, icon: Icon }) => (
            <a
              key={id}
              href={`#${id}`}
              className="glass rounded-full px-3 py-1.5 text-sm flex items-center gap-1.5 hover:border-glow transition-colors"
            >
              <Icon className="h-4 w-4 text-accent" /> {label}
            </a>
          ))}
        </nav>

        <Card id="ai" title="AI Provider and Model" icon={Bot}>
          <Row label="Provider" value="Lovable AI" />
          <Row
            label="Status"
            value={providerLabel}
            tone={a.providerConfigured === false ? "warn" : undefined}
          />
          <p className="text-xs text-muted-foreground">
            Time and date questions are always answered by this device's clock.
          </p>
        </Card>

        <Card id="voice-in" title="Voice Input" icon={Mic}>
          <Row label="Speech recognition" value="Browser Web Speech" />
          <Row
            label="Availability"
            value={a.caps.stt ? "Available" : "Not supported in this browser"}
            tone={a.caps.stt ? undefined : "warn"}
          />
          <p className="text-xs text-muted-foreground">
            Use the microphone button on Home to talk. Your browser asks for microphone permission
            the first time.
          </p>
        </Card>

        <Card id="voice-out" title="Voice Output" icon={Volume2}>
          <Row
            label="Speech output"
            value={a.caps.tts ? "Available" : "Not supported in this browser"}
            tone={a.caps.tts ? undefined : "warn"}
          />
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
              className="w-full rounded-xl bg-secondary border border-border px-2 py-1.5"
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
        </Card>

        <Card id="privacy" title="Privacy and Security" icon={ShieldCheck}>
          <ul className="text-sm space-y-1.5 list-disc pl-5 text-muted-foreground">
            <li>What you type or say is sent to the AI service to get a reply.</li>
            <li>Time and date questions are answered on this device.</li>
            <li>Browser speech recognition may send audio to your browser maker.</li>
            <li>No recordings are stored.</li>
          </ul>
        </Card>

        <Card id="appearance" title="Appearance" icon={Palette}>
          <div className="flex items-center justify-between gap-2">
            <span>Theme</span>
            <ThemeToggle theme={theme} onChange={setTheme} />
          </div>
        </Card>

        <section id="advanced" className="glass rounded-3xl">
          <button
            type="button"
            aria-expanded={advOpen}
            onClick={() => setAdvOpen((o) => !o)}
            className="w-full flex items-center justify-between p-5 text-left"
          >
            <span className="flex items-center gap-2 font-medium">
              <Wrench className="h-4 w-4 text-accent" /> Advanced
            </span>
            <ChevronDown className={`h-4 w-4 transition-transform ${advOpen ? "rotate-180" : ""}`} />
          </button>
          {advOpen && (
            <div className="px-5 pb-5 space-y-2 text-sm">
              <Row label="Assistant state" value={STATE_LABEL[a.snapshot?.state ?? "idle"]} live />
              <Row label="AI route" value="Server-side (key never in browser)" />
              <Row label="Speech input engine" value={a.caps.stt ? "Web Speech API" : "Unavailable"} />
              <Row label="Speech output engine" value={a.caps.tts ? "speechSynthesis" : "Unavailable"} />
              <Row label="Voices loaded" value={String(a.voices.length)} />
              <Row label="Time zone" value={a.time()?.timeZone ?? "—"} />
              <Row label="Messages this session" value={String(a.snapshot?.conversation.messages.length ?? 0)} />
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function Card({
  id,
  title,
  icon: Icon,
  children,
}: {
  id: string;
  title: string;
  icon: typeof Bot;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="glass rounded-3xl p-5 space-y-3 text-sm scroll-mt-6">
      <h2 className="flex items-center gap-2 text-base font-medium">
        <Icon className="h-4 w-4 text-accent" /> {title}
      </h2>
      {children}
    </section>
  );
}
