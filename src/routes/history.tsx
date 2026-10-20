import { createFileRoute } from "@tanstack/react-router";
import { HistoryPage } from "@/agent/ui/HistoryPage";

export const Route = createFileRoute("/history")({
  head: () => ({
    meta: [
      { title: "Conversation History — Agent" },
      { name: "description", content: "Review and continue your conversation with Agent." },
      { property: "og:title", content: "Conversation History — Agent" },
      { property: "og:description", content: "Review and continue your conversation with Agent." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: HistoryPage,
});
