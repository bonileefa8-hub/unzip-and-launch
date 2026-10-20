import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Home, History, Settings } from "lucide-react";
import bgNight from "@/assets/bg-night.jpg";
import { useAgentCtx } from "./AgentProvider";

const NAV = [
  { to: "/", label: "Home", icon: Home },
  { to: "/history", label: "Conversation History", icon: History },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const { theme, agent } = useAgentCtx();
  const state = agent.snapshot?.state ?? "idle";
  return (
    <div className="relative min-h-screen text-foreground flex flex-col md:flex-row md:h-screen md:overflow-hidden bg-background">
      <div aria-hidden className="pointer-events-none fixed inset-0">
        <img
          src={bgNight}
          alt=""
          className={`h-full w-full object-cover transition-opacity duration-500 ${theme === "day" ? "opacity-25" : "opacity-100"}`}
        />
        <div className="absolute inset-0" style={{ background: "var(--scene-overlay)" }} />
      </div>

      <nav
        aria-label="Main"
        className="relative z-10 m-3 md:mr-0 md:w-60 glass rounded-3xl p-4 flex md:flex-col gap-4 items-center md:items-stretch"
      >
        <div className="flex items-center gap-3 md:px-1 md:pb-4">
          <div
            className="relative h-11 w-11 shrink-0 rounded-2xl grid place-items-center shadow-[var(--shadow-glow)]"
            style={{ background: "var(--gradient-neon)" }}
          >
            <span className="text-xl font-bold text-primary-foreground">A</span>
            <span
              aria-hidden
              className={`absolute -right-0.5 -bottom-0.5 h-3 w-3 rounded-full border-2 border-background ${state === "error" ? "bg-destructive" : state === "idle" || state === "cancelled" ? "bg-muted-foreground" : "bg-accent animate-pulse"}`}
            />
          </div>
          <div className="hidden md:block">
            <p className="text-xl font-bold tracking-[0.2em] leading-none">AGENT</p>
            <p className="text-xs text-muted-foreground mt-1">Your AI Assistant</p>
          </div>
        </div>
        <ul className="flex md:flex-col gap-2 flex-1 md:flex-none justify-end">
          {NAV.map(({ to, label, icon: Icon }) => (
            <li key={to}>
              <Link
                to={to}
                activeOptions={{ exact: true }}
                aria-label={label}
                className="flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm text-muted-foreground border border-transparent transition-all hover:text-foreground hover:bg-secondary focus-visible:outline-2 focus-visible:outline-ring data-[status=active]:text-primary-foreground data-[status=active]:shadow-[var(--shadow-glow)] data-[status=active]:[background:var(--gradient-neon)]"
              >
                <Icon className="h-5 w-5 shrink-0" />
                <span className="hidden md:inline">{label}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <div className="relative z-10 flex-1 flex flex-col min-h-0 md:h-screen">{children}</div>
    </div>
  );
}
