export interface RecognitionCallbacks {
  onInterim?: (text: string) => void;
}

/** Speech-to-text abstraction (browser, local model, or cloud can implement it). */
export interface SpeechRecognizer {
  readonly name: string;
  isAvailable(): boolean;
  /** Starts listening; resolves with the final transcript when speech ends or stop() is called. */
  listen(cb?: RecognitionCallbacks): Promise<string>;
  stop(): void;
  abort(): void;
  dispose(): void;
}

export interface SpeakOptions {
  voiceURI?: string | undefined;
  rate?: number;
  volume?: number;
  onStart?: () => void;
}

/** Text-to-speech abstraction. */
export interface SpeechSynthesizer {
  readonly name: string;
  isAvailable(): boolean;
  getVoices(): { voiceURI: string; name: string; lang: string; localService: boolean }[];
  speak(text: string, opts?: SpeakOptions): Promise<void>;
  stop(): void;
  pause(): void;
  resume(): void;
  readonly speaking: boolean;
  dispose(): void;
}
