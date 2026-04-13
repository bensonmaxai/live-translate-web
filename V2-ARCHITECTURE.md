# V2 Architecture

## Goal

Build an iPhone-friendly live subtitle / translation app that feels closer to immersive translation:

- continuous listening
- rolling subtitle updates
- better segmentation than browser-only speech APIs
- GitHub as the source of truth
- GitHub Pages for the frontend
- small backend service for streaming / chunked STT + translation

## Recommended deployment

- **Frontend:** GitHub Pages
- **Backend:** Railway or Render
- **Repo:** GitHub (`live-translate-web`)

## Why V2

The pure frontend version hit browser limits:

- unstable continuous speech recognition on iPhone Safari
- large browser-side translation models crash or hang UI
- not enough for immersive translation quality

## V2 split

### Frontend responsibilities

- microphone permission and capture
- send chunked audio to backend
- receive live subtitle events
- render rolling subtitles
- language and speech locale controls
- session state UI

### Backend responsibilities

- receive audio chunks
- session management
- streaming / near-real-time STT
- translation adapter
- subtitle event stream back to frontend

## Suggested API

### POST `/api/session/start`
Create a session.

Request:
```json
{
  "sourceLang": "zh-TW",
  "targetLang": "th-TH",
  "speechLocale": "zh-TW"
}
```

Response:
```json
{
  "ok": true,
  "sessionId": "...",
  "eventsUrl": "/api/session/<id>/events"
}
```

### POST `/api/session/:id/chunk`
Upload one audio chunk.

### GET `/api/session/:id/events`
Server-Sent Events stream.

Events:
- `partial_transcript`
- `final_transcript`
- `translation`
- `error`
- `status`

### POST `/api/session/:id/stop`
Stop and close the session.

## Translation strategy

### Initial practical strategy
- keep frontend simple
- let backend decide translation engine
- support source: zh / en / th / ja / ko
- support target: zh / en / th / ja / ko
- allow non-English to pivot through English when needed

## Adapter model

### STT adapter
Replaceable providers / engines.

### Translation adapter
Replaceable providers / engines.

This keeps GitHub Pages stable while engines evolve.

## Milestones

### V2.1
- backend skeleton
- session lifecycle
- SSE event channel
- frontend integration contract

### V2.2
- first real STT adapter
- first real translation adapter
- chunked subtitle flow

### V2.3
- improve rolling subtitles
- buffering / dedupe / punctuation cleanup
- latency tuning
