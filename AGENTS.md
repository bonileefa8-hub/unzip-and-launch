<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture
- Agent lives in `src/agent/`: `core/` (UI-free orchestration, models, time service, provider interface), `voice/` (STT/TTS abstractions + browser impls), `ui/` (dev console). Core must never import UI or voice code — keeps it embeddable in a larger host.
- AI calls go through the server route `src/routes/api/agent/chat.ts`; the browser only talks to it via `HttpStreamingProvider` so the API key stays server-side.
- Time/date questions are answered by `TimeService` locally, never by the model — they must reflect the real clock.
