import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const PORT = 8765;
const ROOT = '/var/minis/workspace/local-live-translate';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.map': 'application/json; charset=utf-8',
};

function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(data));
}

function serveFile(res, filePath) {
  const ext = path.extname(filePath);
  const type = MIME[ext] || 'application/octet-stream';
  try {
    const data = fs.readFileSync(filePath);
    res.writeHead(200, {
      'Content-Type': type,
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Resource-Policy': 'cross-origin',
      'Cache-Control': ext === '.wasm' ? 'public, max-age=31536000, immutable' : 'no-cache'
    });
    res.end(data);
  } catch (e) {
    sendJson(res, 404, { ok: false, error: 'not_found', path: filePath });
  }
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

const localeMap = {
  'zh-TW': 'zh-TW',
  'en-US': 'en-US',
  'th-TH': 'th-TH',
  'ja-JP': 'ja-JP',
  'ko-KR': 'ko-KR'
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    return res.end();
  }

  if (url.pathname === '/api/languages' && req.method === 'GET') {
    return sendJson(res, 200, {
      ok: true,
      languages: [
        { code: 'zh-TW', label: '繁體中文' },
        { code: 'en-US', label: 'English' },
        { code: 'th-TH', label: 'ไทย' },
        { code: 'ja-JP', label: '日本語' },
        { code: 'ko-KR', label: '한국어' },
      ]
    });
  }

  if (url.pathname === '/api/transcribe' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      const duration = Math.max(2, Math.min(8, Number(body.duration) || 3));
      const language = localeMap[body.language] || 'en-US';
      const args = ['transcribe', '--source', 'mic', '--duration', String(duration), '--language', language, '--on-device', '--compact'];
      const { stdout, stderr } = await execFileAsync('apple-speech', args, { timeout: (duration + 10) * 1000, maxBuffer: 1024 * 1024 });
      const text = (stdout || '').trim();
      let parsed;
      try { parsed = JSON.parse(text); } catch {
        return sendJson(res, 500, { ok: false, error: 'bad_json', raw: text, stderr });
      }
      const transcript = parsed?.data?.transcript || '';
      return sendJson(res, 200, { ok: !!parsed.ok, transcript, raw: parsed });
    } catch (e) {
      return sendJson(res, 500, { ok: false, error: String(e?.message || e) });
    }
  }

  let filePath = path.join(ROOT, url.pathname === '/' ? '/index.html' : url.pathname);
  if (!filePath.startsWith(ROOT)) {
    return sendJson(res, 403, { ok: false, error: 'forbidden' });
  }
  serveFile(res, filePath);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running at http://127.0.0.1:${PORT}`);
});
