import { Link } from "@tanstack/react-router";
import { MessageSquare, Info } from "lucide-react";
import { useAgentCtx } from "./AgentProvider";

/** Shows the conversation the agent actually holds. Saved history does not exist yet. */
export function HistoryPage() {
  const { agent: a } = useAgentCtx();
  const msgs = a.snapshot?.conversation.messages ?? [];
  const firstUser = msgs.find((m) => m.role === "user");
  const last = msgs.at(-1);

  return (
    <main className="flex-1 overflow-y-auto px-6 py-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <header>
          <h1 className="text-3xl font-semibold">Conversation History</h1>
        </header>

        <div role="note" className="glass rounded-2xl p-4 text-sm flex gap-2 text-muted-foreground">
          <Info className="h-4 w-4 mt-0.5 shrink-0 text-accent" />
          Conversations aren't saved yet, so only the current conversation appears here. It clears
          when you reload the page or press Clear.
        </div>

        {msgs.length === 0 ? (
          <p className="text-center text-muted-foreground py-12">No conversation yet.</p>
        ) : (
          <Link
            to="/"
            className="glass rounded-3xl p-5 flex items-start gap-4 hover:border-glow transition-colors"
          >
            <div
              className="h-10 w-10 rounded-2xl grid place-items-center text-primary-foreground shrink-0"
              style={{ background: "var(--gradient-neon)" }}
            >
              <MessageSquare className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-medium truncate">{firstUser?.content || "Current conversation"}</p>
              <p className="text-xs text-muted-foreground mt-1">
                Current session · {msgs.length} messages
                {last && ` · ${new Date(last.createdAt).toLocaleString()}`}
              </p>
              <p className="text-sm text-accent mt-2">Continue on Home →</p>
            </div>
          </Link>
        )}
      </div>
    </main>
  );
}
