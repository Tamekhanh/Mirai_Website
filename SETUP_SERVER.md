# Server Integration Guide

This guide explains how to connect the Mirai Chat application to your backend server.

## Setup

### 1. Environment Configuration

Create a `.env.local` file in the project root (copy from `.env.example`):

```
VITE_API_URL=http://localhost:3000
VITE_MIRAI_MAX_TOKENS=40
VITE_MIRAI_MAX_WORDS=40
```

Use `VITE_API_URL` only for a non-secret backend override during local development. In production, the frontend can call the same-origin `/chat` and `/health` routes directly, or go through the Cloudflare Worker proxy if you deploy that path.

`VITE_MIRAI_MAX_TOKENS` is a safety cap for generation length, while `VITE_MIRAI_MAX_WORDS` adds an explicit 40-word instruction to the request.

### 2. Backend API Requirements

Your backend must implement the following endpoints:

#### `POST /chat`
Sends a user message and returns Mirai's response.

**Request:**
```json
{
  "message": "Hello!",
  "instruction": "Reply in 40 words or fewer.",
  "max_words": 40,
  "max_tokens": 255,
  "timestamp": "2026-03-30T10:30:00Z"
}
```

`max_tokens` is sent by the frontend on every chat request so the backend can cap Mirai output length. `max_words` and `instruction` are extra hints for backends that support them.

**Response:**
```json
{
  "reply": "Hello! How can I help you today?",
  "message": "Hello! How can I help you today?"
}
```

#### `GET /health`
Health check endpoint to verify server status.

**Response:** HTTP 200 OK (any content)

#### `GET /history`
Optional endpoint to fetch chat history.

**Response:**
```json
{
  "messages": [
    {
      "id": 1,
      "sender": "user",
      "text": "Hello"
    },
    {
      "id": 2,
      "sender": "mirai",
      "text": "Hi there!"
    }
  ]
}
```

## Features Implemented

✅ **Message Sending** - Send user messages to server  
✅ **Server Responses** - Display server replies in chat  
✅ **Loading State** - Shows "Sending..." while waiting for response  
✅ **Error Handling** - Displays error messages if request fails  
✅ **Online Status** - Automatically checks and displays server status  
✅ **Status Updates** - Checks server every 10 seconds  

## Testing

1. Start your backend server on `http://localhost:3000` if you are testing locally.
2. Run the Mirai Chat app: `npm run dev`
3. Open http://localhost:5173 in your browser
4. Check if the Online/Offline status indicator shows "Online"
5. Send a test message and verify the server response appears in the chat

## Troubleshooting

### "Offline" status
- Check if your backend server is running
- Verify the `VITE_API_URL` in `.env.local` matches your non-secret backend override, or leave it unset to use the default same-origin routing
- Check browser console for network errors (F12 → Console)

### Messages not being sent
- Verify backend is responding to POST requests on `/chat`
- Check that the response includes a `reply` or `message` field
- Look for CORS errors in browser console

### Connection refused
- Make sure your backend server is running
- Confirm you're using the correct server URL

### Secret key exposure
- Never put Hugging Face API keys in `VITE_*` variables
- Store secrets in Cloudflare with `wrangler secret put SPACE_API_KEY`
- Let the Worker proxy `/chat` and `/health` to the upstream Space
