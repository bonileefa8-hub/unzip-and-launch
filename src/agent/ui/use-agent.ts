import { useCallback, useEffect, useRef, useState } from "react";
import { createAgent, AgentError, type AgentSnapshot, type Message } from "@/agent";

type AgentBundle = ReturnType<typeof createAgent>;

export interface VoiceSettings {
  voiceOutput: boolean;
  voiceURI?: string | undefined;
  rate: number;
  volume: number;
}

/** React binding for the Agent core + voice services. UI-only glue. */
export function useAgent(factory: () => AgentBundle = () => createAgent()) {
  const ref = useRef<AgentBundle | null>(null);
  const [snap, setSnap] = useState<AgentSnapshot | null>(null);
  const [interim, setInterim] = useState("");
  const [voiceError, setVoiceError] = useState<AgentError | null>(null);
  const [providerConfigured, setProviderConfigured] = useState<boolean | null>(null);
  const [caps, setCaps] = useState({ stt: false, tts: false });
  const [voices, setVoices] = useState<ReturnType<AgentBundle["synthesizer"]["getVoices"]>>([]);
  const [settings, setSettings] = useState<VoiceSettings>({
    voiceOutput: true,
    rate: 1,
    volume: 1,
  });
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  useEffect(() => {
    const bundle = factory();
    ref.current = bundle;
    const unsub = bundle.core.subscribe(setSnap);
    setCaps({ stt: bundle.recognizer.isAvailable(), tts: bundle.synthesizer.isAvailable() });
    const loadVoices = () => setVoices(bundle.synthesizer.getVoices());
    loadVoices();
    const synth = typeof window !== "undefined" ? window.speechSynthesis : undefined;
    synth?.addEventListener?.("voiceschanged", loadVoices);
    bundle.core.isProviderConfigured().then(setProviderConfigured);
    return () => {
      synth?.removeEventListener?.("voiceschanged", loadVoices);
      unsub();
      bundle.dispose();
      ref.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const speak = useCallback(async (msg: Message) => {
    const b = ref.current;
    const s = settingsRef.current;
    if (!b || !s.voiceOutput || !b.synthesizer.isAvailable() || msg.status !== "completed") return;
    try {
      b.core.setState("speaking");
      await b.synthesizer.speak(msg.content, {
        voiceURI: s.voiceURI,
        rate: s.rate,
        volume: s.volume,
      });
      if (b.core.snapshot().state === "speaking") b.core.setState("idle");
    } catch (e) {
      setVoiceError(
        e instanceof AgentError ? e : new AgentError("speech_unavailable", "Speech output failed."),
      );
      if (b.core.snapshot().state === "speaking") b.core.setState("idle");
    }
  }, []);

  const stopSpeaking = useCallback(() => {
    const b = ref.current;
    if (!b) return;
    b.synthesizer.stop();
    if (b.core.snapshot().state === "speaking") b.core.setState("idle");
  }, []);

  const send = useCallback(
    async (text: string, source: "text" | "voice" = "text") => {
      const b = ref.current;
      if (!b) return;
      stopSpeaking();
      setVoiceError(null);
      try {
        const reply = await b.core.send(text, source);
        await speak(reply);
      } catch {
        /* surfaced through snapshot / message status */
      }
    },
    [speak, stopSpeaking],
  );

  /** Listen and return the transcript (caller decides whether to edit or submit). */
  const listen = useCallback(async (): Promise<string | null> => {
    const b = ref.current;
    if (!b) return null;
    stopSpeaking();
    setVoiceError(null);
    setInterim("");
    try {
      b.core.setState("listening");
      const text = await b.recognizer.listen({ onInterim: setInterim });
      b.core.setState("transcribing");
      b.core.setState("idle");
      return text;
    } catch (e) {
      const err =
        e instanceof AgentError ? e : new AgentError("speech_unavailable", "Microphone error.");
      if (err.code !== "cancelled") setVoiceError(err);
      const st = b.core.snapshot().state;
      if (st === "listening" || st === "transcribing") b.core.setState("idle");
      return null;
    } finally {
      setInterim("");
    }
  }, [stopSpeaking]);

  const stopListening = useCallback(() => ref.current?.recognizer.stop(), []);
  const cancelListening = useCallback(() => ref.current?.recognizer.abort(), []);

  const cancel = useCallback(() => {
    const b = ref.current;
    if (!b) return;
    b.recognizer.abort();
    b.synthesizer.stop();
    b.core.cancel();
    const st = b.core.snapshot().state;
    if (st !== "idle" && st !== "error") b.core.setState("idle");
  }, []);

  const retry = useCallback(async () => {
    const b = ref.current;
    if (!b) return;
    try {
      const r = await b.core.retry();
      if (r) await speak(r);
    } catch {
      /* shown in UI */
    }
  }, [speak]);

  return {
    snapshot: snap,
    interim,
    voiceError,
    clearVoiceError: () => setVoiceError(null),
    providerConfigured,
    caps,
    voices,
    settings,
    setSettings,
    send,
    listen,
    stopListening,
    cancelListening,
    stopSpeaking,
    cancel,
    retry,
    reset: () => {
      stopSpeaking();
      ref.current?.core.reset();
    },
    time: () => ref.current?.core.time,
    speak,
  };
}
