# MirAI Web

A VRM-powered AI companion web app — chat with an animated 3D avatar that reacts and lip-syncs to spoken replies, all in a single Three.js scene. Built with React 19 and Vite, deployed on Cloudflare, with the chat backend hosted on Hugging Face Spaces.

The avatar is **Mirai**, driven by a **Llama 3 8B (Q4_K_M)** fine-tuned model served from a Hugging Face Space. The Cloudflare Worker proxies all API traffic so no secrets ever reach the browser.

## Features

- **Real-time VRM avatar** — loads a `.vrm` model with `@pixiv/three-vrm`, plays a welcome animation, then loops an idle clip. Includes VRM 0 rotation correction and frustum-cull stabilization for skinned meshes.
- **Chat with the AI** — send messages and receive Mirai's replies from the Llama 3 8B backend, with an online/offline status indicator that health-checks the server.
- **Audio replies + lip-sync** — when the backend returns audio, the avatar mouth-cues are driven from a blendshape timeline (`aa`, `ih`, `ou`, `ee`, `oh`) with vowel aliasing and a mute toggle.
- **Blend-shape debug panel** — inspect and manually drive every available blend shape for development.
- **Custom VRM import** — drop in any `.vrm` file to preview it in the scene.
- **Music game prototype** — a rhythm-game hub with song selection and a beatmap-driven play mode (currently showing "Coming Soon").
- **Hub pages** — Home, Chat, About, and Games, routed with `react-router-dom`.

## Tech Stack

| Layer        | Tech                                                                     |
| ------------ | ------------------------------------------------------------------------ |
| Frontend     | React 19, Vite 8, React Router 7, Tailwind CSS 4 + plain CSS             |
| 3D / Avatar  | Three.js, `@pixiv/three-vrm`, `@pixiv/three-vrm-animation`               |
| Edge runtime | Cloudflare Workers (`@cloudflare/vite-plugin`, Wrangler)                  |
| AI backend   | Llama 3 8B (Q4_K_M) fine-tune, hosted as a Hugging Face Space            |
| 3D asset     | **Mirai Model casual** created in VRoid Studio (VRM format)              |

## Project Structure

```
mirai-chat/
├── public/
│   ├── Mirai_Assets/          # VRM model, animations, room backdrop, loading logo
│   ├── Game/                  # Music game audio + stage art
│   ├── About/                 # About-page images (VRoid, Llama)
│   └── Mirai_Logo.svg, favicon.svg
├── src/
│   ├── App.jsx                # Layout + routes (/, /chat, /about, /games)
│   ├── main.jsx               # React entry point
│   ├── worker.js              # Cloudflare Worker: proxies /chat & /health to HF Space
│   ├── services/
│   │   └── chatApi.js         # Fetch wrapper with timeout, health caching, send logic
│   ├── components/
│   │   └── VRMLoadingScreen.jsx
│   ├── pages/
│   │   ├── Home/              # Landing hub
│   │   ├── Mirai_chat/        # 3D viewer + chat UI + lip-sync + blendshape debug
│   │   ├── About/             # Project story, model & AI details, deploy notes
│   │   └── Game/MusicGame/    # Came Soon placeholder + beatmap play index
│   └── assets/game/MiraiMusic/# stage.json + beatmap JSON
├── wrangler.jsonc             # Cloudflare Workers config (name: "mirai", SPA assets)
├── vite.config.js             # Vite + React + Cloudflare plugin
└── SETUP_SERVER.md            # Backend API contract + integration guide
```

## Getting Started

### Prerequisites

- Node.js ( LTS )
- A running backend exposing `POST /chat` and `GET /health` (see [SETUP_SERVER.md](SETUP_SERVER.md))

### Install & Run Locally

```bash
npm install
npm run dev
```

The dev server starts on http://localhost:5173.

### Environment Variables

Copy `.env.example` to `.env.local` (the `.env` is git-ignored):

```
VITE_API_URL=http://localhost:3000   # optional: override the backend URL for local dev
VITE_MIRAI_MAX_TOKENS=40             # generation length safety cap
VITE_MIRAI_MAX_WORDS=40              # word-limit hint sent in the request body
```

> **Never** put Hugging Face API keys in `VITE_*` variables — those are exposed to the client. Store secrets in Cloudflare with `wrangler secret put SPACE_API_KEY` (see below).

## How the Chat Flow Works

1. The frontend calls `sendMessage()` in [chatApi.js](src/services/chatApi.js), which POSTs to same-origin `/chat` (or `/api/chat`).
2. The Cloudflare Worker in [worker.js](src/worker.js) proxies that request to the Hugging Face Space (`https://tamek-mirai.hf.space`), injecting a `Bearer SPACE_API_KEY` if set.
3. The Space runs the fine-tuned Llama 3 8B model and returns `{ reply }`.
4. If the response includes `audio` + `lipSync` mouth-cues, the avatar plays the audio and its blendshapes are driven frame-by-frame.
5. Health is checked via `GET /health` and cached for 60 seconds to avoid hammering the server.

### Backend Contract (summary)

- `POST /chat` — request `{ message, instruction, max_words, max_tokens, timestamp }`, response `{ reply | message | response }`
- `GET /health` — returns HTTP 200 when online
- `GET /history` (optional) — returns `{ messages: [...] }`

See [SETUP_SERVER.md](SETUP_SERVER.md) for the full spec and troubleshooting.

## Deploying to Cloudflare

The app is build static assets served by a Cloudflare Worker (SPA mode with `not_found_handling: "single-page-application"`).

1. Set the upstream token (secret, not in env):
   ```bash
   wrangler secret put SPACE_API_KEY
   ```
2. Build & deploy:
   ```bash
   npm run deploy
   ```
   This runs `vite build` then `wrangler deploy`.

To preview the deployed behavior locally:

```bash
npm run preview   # vite build && wrangler dev
```

## Available Scripts

| Script             | Description                                   |
| ------------------ | --------------------------------------------- |
| `npm run dev`      | Start the Vite dev server                      |
| `npm run build`    | Production build to `dist/`                    |
| `npm run preview`  | Build then run with Wrangler locally           |
| `npm run deploy`   | Build then deploy to Cloudflare                |
| `npm run lint`     | Run ESLint                                     |

## Notes & Current Limits

- The About page is informational; it doesn't expose runtime metrics.
- The blend-shape debug controls are still visible on the chat page and should be hidden for production.
- The backend contract is intentionally simple — richer memory/history features are room for growth.
- The music game shows "Coming Soon" while some songs are restricted by copyright.

## Credits

- **Avatar model:** Mirai Casual, created in [VRoid Studio](https://vroid.com/studio)
- **AI model:** Llama 3 8B (Q4_K_M quantization), fine-tuned
- **3D runtime:** [Three.js](https://threejs.org) + [@pixiv/three-vrm](https://github.com/pixiv/three-vrm)
