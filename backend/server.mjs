import http from 'node:http';
import { randomUUID } from 'node:crypto';

const PORT = process.env.PORT || 8787;
const sessions = new Map();

function json(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(JSON.stringify(data));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

function sendEvent(res, type, payload) {
  res.write(`event: ${type}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === 'OPTIONS') {
    return json(res, 204, {});
  }

  if (req.method === 'GET' && url.pathname === '/health') {
    return json(res, 200, { ok: true, service: 'live-translate-backend', sessions: sessions.size });
  }

  if (req.method === 'POST' && url.pathname === '/api/session/start') {
    try {
      const body = await parseBody(req);
      const sessionId = randomUUID();
      sessions.set(sessionId, {
        id: sessionId,
        createdAt: Date.now(),
        sourceLang: body.sourceLang || 'en-US',
        targetLang: body.targetLang || 'zh-TW',
        speechLocale: body.speechLocale || body.sourceLang || 'en-US',
        chunks: [],
        clients: new Set(),
      });
      return json(res, 200, {
        ok: true,
        sessionId,
        eventsUrl: `/api/session/${sessionId}/events`
      });
    } catch (e) {
      return json(res, 400, { ok: false, error: String(e?.message || e) });
    }
  }

  const matchEvents = url.pathname.match(/^\/api\/session\/([^/]+)\/events$/);
  if (req.method === 'GET' && matchEvents) {
    const session = sessions.get(matchEvents[1]);
    if (!session) return json(res, 404, { ok: false, error: 'session_not_found' });

    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });
    session.clients.add(res);
    sendEvent(res, 'status', { message: 'connected', sessionId: session.id });

    const timer = setInterval(() => {
      sendEvent(res, 'status', { message: 'heartbeat', at: Date.now() });
    }, 15000);

    req.on('close', () => {
      clearInterval(timer);
      session.clients.delete(res);
    });
    return;
  }

  const matchChunk = url.pathname.match(/^\/api\/session\/([^/]+)\/chunk$/);
  if (req.method === 'POST' && matchChunk) {
    const session = sessions.get(matchChunk[1]);
    if (!session) return json(res, 404, { ok: false, error: 'session_not_found' });
    try {
      const body = await parseBody(req);
      const item = {
        at: Date.now(),
        transcript: body.transcript || '',
        translation: body.translation || '',
        partial: !!body.partial
      };
      session.chunks.push(item);
      for (const client of session.clients) {
        if (item.partial) sendEvent(client, 'partial_transcript', { transcript: item.transcript });
        else {
          sendEvent(client, 'final_transcript', { transcript: item.transcript });
          if (item.translation) sendEvent(client, 'translation', { text: item.translation });
        }
      }
      return json(res, 200, { ok: true });
    } catch (e) {
      return json(res, 400, { ok: false, error: String(e?.message || e) });
    }
  }

  const matchStop = url.pathname.match(/^\/api\/session\/([^/]+)\/stop$/);
  if (req.method === 'POST' && matchStop) {
    const session = sessions.get(matchStop[1]);
    if (!session) return json(res, 404, { ok: false, error: 'session_not_found' });
    for (const client of session.clients) {
      try { sendEvent(client, 'status', { message: 'stopped' }); }
      catch {}
      try { client.end(); } catch {}
    }
    sessions.delete(session.id);
    return json(res, 200, { ok: true, stopped: true });
  }

  return json(res, 404, { ok: false, error: 'not_found' });
});

server.listen(PORT, () => {
  console.log(`live-translate-backend listening on http://0.0.0.0:${PORT}`);
});
