import { createFileRoute } from "@tanstack/react-router";
import { AgentConsole } from "@/agent/ui/AgentConsole";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Agent — Voice & Text Assistant" },
      {
        name: "description",
        content:
          "Talk or type to Agent: a conversational assistant with speech input, spoken replies and real local time.",
      },
      { property: "og:title", content: "Agent — Voice & Text Assistant" },
      {
        property: "og:description",
        content: "Talk or type to Agent with speech input, spoken replies and real local time.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AgentConsole,
});
