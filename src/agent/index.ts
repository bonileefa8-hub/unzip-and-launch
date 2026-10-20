/**
 * Public entry point for Agent. A host app can do:
 *
 *   import { createAgent } from "@/agent";
 *   const { core, recognizer, synthesizer, dispose } = createAgent();
 *   core.subscribe(snapshot => render(snapshot));
 *   await core.send("What time is it?");
 *   dispose();
 *
 * Every dependency can be overridden (provider, clock, voice services).
 */
import { AgentCore, type AgentDeps } from "./core/agent";
import { HttpStreamingProvider } from "./core/provider";
import { BrowserSpeechRecognizer, BrowserSpeechSynthesizer } from "./voice/browser";
import type { SpeechRecognizer, SpeechSynthesizer } from "./voice/types";

export * from "./core/types";
export * from "./core/agent";
export * from "./core/provider";
export * from "./core/time-service";
export * from "./core/state-machine";
export * from "./voice/types";
export * from "./voice/browser";

export interface CreateAgentOptions extends Partial<AgentDeps> {
  recognizer?: SpeechRecognizer;
  synthesizer?: SpeechSynthesizer;
  lang?: string;
}

export function createAgent(opts: CreateAgentOptions = {}) {
  const core = new AgentCore({ ...opts, provider: opts.provider ?? new HttpStreamingProvider() });
  const recognizer = opts.recognizer ?? new BrowserSpeechRecognizer(opts.lang);
  const synthesizer = opts.synthesizer ?? new BrowserSpeechSynthesizer();
  return {
    core,
    recognizer,
    synthesizer,
    dispose() {
      recognizer.dispose();
      synthesizer.dispose();
      core.dispose();
    },
  };
}
