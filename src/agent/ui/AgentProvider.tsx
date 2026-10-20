import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useAgent } from "./use-agent";

export type Theme = "day" | "night";

type Ctx = { agent: ReturnType<typeof useAgent>; theme: Theme; setTheme: (t: Theme) => void };
const AgentCtx = createContext<Ctx | null>(null);

/**
 * Mounts ONE agent instance for the whole app so conversation and voice
 * settings survive moving between Home, History and Settings.
 */
export function AgentProvider({ children }: { children: ReactNode }) {
  const agent = useAgent();
  const [theme, setTheme] = useState<Theme>("night");
  // Presentation-only theme: read saved choice after hydration, apply as a class.
  useEffect(() => {
    if (localStorage.getItem("agent-theme") === "day") setTheme("day");
  }, []);
  useEffect(() => {
    document.documentElement.classList.toggle("day", theme === "day");
    localStorage.setItem("agent-theme", theme);
  }, [theme]);
  return <AgentCtx.Provider value={{ agent, theme, setTheme }}>{children}</AgentCtx.Provider>;
}

export function useAgentCtx() {
  const c = useContext(AgentCtx);
  if (!c) throw new Error("useAgentCtx must be used inside AgentProvider");
  return c;
}
