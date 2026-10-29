# Server Integration Guide

How the Mirai web app talks to its backend. The system has three layers:

```
Browser (chatApi.js)  ->  Cloudflare Worker (src/worker.js)  ->  Backend (Hugging Face Space, FastAPI)
```

The browser only ever calls same-origin routes on the Worker. The Worker validates and clamps the
request, picks the upstream URL, and adds the API key. The full backend contract (request and
response fields, error codes, lip-sync payload, env vars) is maintained in the backend repo at
`Mirai/docs/API.md`. This file documents only what the browser sees and where it differs.

## Browser-facing routes (Worker)

All routes also answer under an `/api` prefix (`/api/chat`, `/api/tts`, `/api/health`).

| Route | Method | Purpose |
| --- | --- | --- |
| `/chat` | POST | Send a message, get Mirai's reply. |
| `/tts` | POST | Synthesize speech for text that is already on screen. |
| `/health` | GET | Backend state. Cached by the Worker for 30 s (200) or 5 s (503). |
| `/api/models` | GET | `{ "default": "mirai-8b", "models": ["mirai-8b", ...] }`. |

Anything else under `/api/` is `404`; every other path is served from the static SPA assets.

### `POST /chat`

```json
{
  "message": "Xin chào",
  "history": [{ "role": "user", "content": "..." }, { "role": "assistant", "content": "..." }],
  "model": "mirai-8b",
  "max_words": 40,
  "max_tokens": 128,
  "tts": false
}
```

- `message` is required. The Worker trims it and cuts it to 1000 characters.
- `history` holds the last 12 turns, each cut to 500 characters. Entries with another `role` are dropped.
- `model` is a **key**, never a URL. Unknown keys fall back to `mirai-8b`. `mirai-small` exists only when the Worker has `SMALL_SPACE_URL` set. The Worker does not forward `model` upstream.
- `max_words` and `max_tokens` are clamped to 60 and 192.
- Only `message`, `history`, `max_words`, `max_tokens` and (when `false`) `tts` reach the backend. Unknown fields, including any `instruction`, are discarded.
- `chatApi.js` always sends `tts: false` so the text appears as soon as the LLM finishes, then calls `/tts`.

The response is the backend's, unchanged:

```json
{
  "text": "Chào bạn!",
  "reply": "Chào bạn!",
  "emotion": "happy",
  "audio": null,
  "audioFormat": "mp3",
  "audioError": null,
  "lipSync": null,
  "sources": [],
  "meta": { "latency_ms": 9000 }
}
```

`chatApi.js` reads `text` (falling back to `reply`, `message`, `response`, `content`), `emotion`
(lower-cased, or `null`), `audio`, `lipSync` and `sources`.

### `POST /tts`

Request `{ "text": "...", "model": "mirai-8b" }` (text cut to 1000 characters). Response
`{ "audio": "<base64 mp3>", "audioFormat": "mp3", "audioError": null, "lipSync": { ... } }`. The
app treats any failure as "no voice" and never shows an error for it.

### `GET /health`

Returns the backend's `{ "status", "model" }`. `200` means ready; `503` means the model is still
loading (`state: loading` in the UI); anything else, or no answer, is offline.

### Errors

Worker errors are `{ "error": "..." }`; errors forwarded from the backend are `{ "detail": "..." }`.
`chatApi.js` reads either and exposes `error.status`, `error.retryAfter` and `error.detail`.

| Status | Source | Meaning |
| --- | --- | --- |
| 400 | Worker / backend | Empty message or invalid JSON. |
| 401 | Backend | API key missing or wrong (Worker secret misconfigured). |
| 403 | Worker | Cross-origin request (`Origin` differs from the site). |
| 405 | Worker | Wrong method. |
| 413 | Worker / backend | Payload (over 16 KB) or message too long. |
| 429 | Worker | Rate limit: 20 requests per minute per IP, with a separate bucket for `/tts`. |
| 502 | Worker | Upstream unreachable. |
| 503 | Backend | Model loading or queue full; honour `Retry-After`. |
| 504 | Worker | Upstream did not answer within 110 s. |

## Configuration

### Frontend env (`.env.local`, optional)

```
VITE_API_URL=http://localhost:3000   # override the backend base URL for local development only
VITE_MIRAI_MAX_TOKENS=128            # sent as max_tokens
VITE_MIRAI_MAX_WORDS=40              # sent as max_words
VITE_MIRAI_MODEL=                    # model key, empty = Worker default
```

Never put API keys in `VITE_*` variables: they ship to the browser.

### Worker (Cloudflare)

| Name | Kind | Purpose |
| --- | --- | --- |
| `SPACE_API_KEY` | secret (`wrangler secret put SPACE_API_KEY`) | Sent upstream as `Authorization: Bearer` and `X-Api-Key`. Must match the Space's `SPACE_API_KEY`. |
| `SMALL_SPACE_URL` | variable | Optional URL of a second, smaller Space, exposed as model `mirai-small`. |
| `CHAT_LIMITER` | rate-limit binding (`wrangler.jsonc`) | 20 requests / 60 s. |

The default upstream is `https://tamek-mirai.hf.space` (`getModels()` in `src/worker.js`).

## Keeping limits in sync

The same limits live in `src/worker.js`, `src/services/chatApi.js` and the backend. See the table
in `Mirai/docs/API.md` ("Limits and where they are enforced") and update all places together.
Timeouts must stay ordered: backend generation deadline < Worker 110 s < browser 120 s.

## Local testing

1. Run a backend (see the `Mirai` repo), or point `VITE_API_URL` at a deployed Space.
2. `npm run dev` and open http://localhost:5173/chat.
3. The status pill should read Online (Starting while the model loads). Send a message and check
   that the reply appears first and the voice follows a moment later.

For the production path (Worker plus assets) use `npm run preview`, which builds and runs `wrangler dev`.

## Troubleshooting

- **Offline:** backend not running, wrong `VITE_API_URL`, or the Space is asleep. Check the Network tab for `/health`.
- **Starting never ends:** the model failed to load; open the Space logs. `/health` returns `status: "error"`.
- **401 from every request:** `SPACE_API_KEY` differs between the Worker secret and the Space.
- **403 Forbidden origin:** the page is served from a different origin than the Worker that handles the call.
- **429:** too many requests from one IP; wait a minute.
- **Reply shows but there is no voice:** `/tts` failed or timed out (edge-tts is an external service). It is optional by design.
