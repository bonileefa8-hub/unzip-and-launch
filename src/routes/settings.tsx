import { createFileRoute } from "@tanstack/react-router";
import { SettingsPage } from "@/agent/ui/SettingsPage";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Agent" },
      { name: "description", content: "Adjust Agent's AI, voice, privacy and appearance settings." },
      { property: "og:title", content: "Settings — Agent" },
      { property: "og:description", content: "Adjust Agent's AI, voice, privacy and appearance settings." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SettingsPage,
});
