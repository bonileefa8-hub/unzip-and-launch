import { AgentError } from "../core/types";
import type {
  RecognitionCallbacks,
  SpeakOptions,
  SpeechRecognizer,
  SpeechSynthesizer,
} from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any */
type RecCtor = new () => any;

function getRecognitionCtor(
  win: any = typeof window !== "undefined" ? window : undefined,
): RecCtor | null {
  return win?.SpeechRecognition ?? win?.webkitSpeechRecognition ?? null;
}

/**
 * Web Speech API recognizer (Chrome, Edge, Safari). Audio is processed by the
 * browser vendor's speech service (e.g. Google for Chrome); no recording is stored by this app.
 */
export class BrowserSpeechRecognizer implements SpeechRecognizer {
  readonly name = "Browser Web Speech API";
  private rec: any = null;
  constructor(
    private lang = "en-US",
    private ctor: RecCtor | null = getRecognitionCtor(),
  ) {}

  isAvailable() {
    return !!this.ctor;
  }

  listen(cb: RecognitionCallbacks = {}): Promise<string> {
    if (!this.ctor)
      return Promise.reject(
        new AgentError(
          "speech_unavailable",
          "Speech recognition isn't supported in this browser. Try Chrome, Edge or Safari, or type instead.",
        ),
      );
    this.abort();
    const rec = new this.ctor();
    this.rec = rec;
    rec.lang = this.lang;
    rec.interimResults = true;
    rec.continuous = false;
    let finalText = "";
    let failed: AgentError | null = null;
    return new Promise((resolve, reject) => {
      rec.onresult = (e: any) => {
        let interim = "";
        finalText = "";
        for (let i = 0; i < e.results.length; i++) {
          const r = e.results[i];
          if (r.isFinal) finalText += r[0].transcript;
          else interim += r[0].transcript;
        }
        cb.onInterim?.((finalText + interim).trim());
      };
      rec.onerror = (e: any) => {
        const code = e?.error;
        if (code === "not-allowed" || code === "service-not-allowed")
          failed = new AgentError(
            "permission_denied",
            "Microphone permission was denied. Allow it in your browser settings, or type instead.",
          );
        else if (code === "no-speech")
          failed = new AgentError("no_speech", "I didn't hear anything. Try again.", true);
        else if (code === "aborted") failed = new AgentError("cancelled", "Listening cancelled.");
        else if (code === "audio-capture")
          failed = new AgentError("speech_unavailable", "No microphone was found.");
        else
          failed = new AgentError(
            "speech_unavailable",
            `Speech recognition error (${code ?? "unknown"}).`,
            true,
          );
      };
      rec.onend = () => {
        this.rec = null;
        if (failed) reject(failed);
        else if (!finalText.trim())
          reject(new AgentError("no_speech", "I didn't catch that. Try again.", true));
        else resolve(finalText.trim());
      };
      try {
        rec.start();
      } catch {
        reject(new AgentError("speech_unavailable", "Couldn't start the microphone."));
      }
    });
  }

  stop() {
    this.rec?.stop();
  }
  abort() {
    this.rec?.abort();
    this.rec = null;
  }
  dispose() {
    this.abort();
  }
}

/** Browser speechSynthesis. Voices are whatever the OS/browser provides. */
export class BrowserSpeechSynthesizer implements SpeechSynthesizer {
  readonly name = "Browser speechSynthesis";
  private synth: SpeechSynthesis | null;
  private current: SpeechSynthesisUtterance | null = null;
  private finish: (() => void) | null = null;

  constructor(
    synth: SpeechSynthesis | null = typeof window !== "undefined"
      ? (window.speechSynthesis ?? null)
      : null,
  ) {
    this.synth = synth;
  }

  isAvailable() {
    return !!this.synth;
  }

  getVoices() {
    return (this.synth?.getVoices() ?? []).map((v) => ({
      voiceURI: v.voiceURI,
      name: v.name,
      lang: v.lang,
      localService: v.localService,
    }));
  }

  get speaking() {
    return !!this.current;
  }

  speak(text: string, opts: SpeakOptions = {}): Promise<void> {
    if (!this.synth)
      return Promise.reject(
        new AgentError("speech_unavailable", "Speech output isn't supported in this browser."),
      );
    this.stop(); // never speak over another response
    const u = new SpeechSynthesisUtterance(text);
    const voice = this.synth.getVoices().find((v) => v.voiceURI === opts.voiceURI);
    if (voice) u.voice = voice;
    u.rate = opts.rate ?? 1;
    u.volume = opts.volume ?? 1;
    this.current = u;
    return new Promise((resolve, reject) => {
      const done = () => {
        if (this.current === u) this.current = null;
        this.finish = null;
        resolve();
      };
      this.finish = done;
      u.onstart = () => opts.onStart?.();
      u.onend = done;
      u.onerror = (e) => {
        if (e.error === "interrupted" || e.error === "canceled") return done();
        if (this.current === u) this.current = null;
        reject(new AgentError("speech_unavailable", `Speech output failed (${e.error}).`));
      };
      this.synth!.speak(u);
    });
  }

  stop() {
    if (!this.synth) return;
    this.synth.cancel();
    this.current = null;
    this.finish?.();
  }
  pause() {
    this.synth?.pause();
  }
  resume() {
    this.synth?.resume();
  }
  dispose() {
    this.stop();
  }
}
