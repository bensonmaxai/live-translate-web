const $ = (s) => document.querySelector(s);
const sourceLangEl = $('#sourceLang');
const targetLangEl = $('#targetLang');
const speechLocaleEl = $('#speechLocale');
const backendUrlEl = $('#backendUrl');
const startSessionBtn = $('#startSessionBtn');
const sendMockBtn = $('#sendMockBtn');
const stopSessionBtn = $('#stopSessionBtn');
const clearBtn = $('#clearBtn');
const statusEl = $('#status');
const liveOriginalEl = $('#liveOriginal');
const liveTranslatedEl = $('#liveTranslated');
const historyEl = $('#history');

let sessionId = null;
let eventSource = null;
let mockCounter = 1;

function setStatus(text) { statusEl.textContent = text; }
function baseUrl() { return backendUrlEl.value.replace(/\/$/, ''); }
function addHistory(title, data) {
  const div = document.createElement('div');
  div.className = 'item';
  div.innerHTML = `<div class="meta">${new Date().toLocaleTimeString()} · ${title}</div><div class="src">${JSON.stringify(data)}</div>`;
  historyEl.prepend(div);
}

async function startSession() {
  const res = await fetch(`${baseUrl()}/api/session/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sourceLang: sourceLangEl.value,
      targetLang: targetLangEl.value,
      speechLocale: speechLocaleEl.value
    })
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'start_failed');
  sessionId = data.sessionId;
  const eventsUrl = `${baseUrl()}${data.eventsUrl}`;
  eventSource = new EventSource(eventsUrl);
  eventSource.addEventListener('status', (e) => addHistory('status', JSON.parse(e.data)));
  eventSource.addEventListener('partial_transcript', (e) => {
    const d = JSON.parse(e.data);
    liveOriginalEl.textContent = d.transcript;
    addHistory('partial_transcript', d);
  });
  eventSource.addEventListener('final_transcript', (e) => {
    const d = JSON.parse(e.data);
    liveOriginalEl.textContent = d.transcript;
    addHistory('final_transcript', d);
  });
  eventSource.addEventListener('translation', (e) => {
    const d = JSON.parse(e.data);
    liveTranslatedEl.textContent = d.text;
    addHistory('translation', d);
  });
  startSessionBtn.disabled = true;
  stopSessionBtn.disabled = false;
  setStatus(`session 已建立：${sessionId}`);
}

async function sendMock() {
  if (!sessionId) return setStatus('請先建立 session');
  const transcript = `mock transcript ${mockCounter}`;
  const translation = `mock translation ${mockCounter}`;
  mockCounter += 1;
  await fetch(`${baseUrl()}/api/session/${sessionId}/chunk`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transcript, translation, partial: false })
  });
  setStatus('已送出 mock 事件');
}

async function stopSession() {
  if (!sessionId) return;
  await fetch(`${baseUrl()}/api/session/${sessionId}/stop`, { method: 'POST' });
  if (eventSource) eventSource.close();
  eventSource = null;
  sessionId = null;
  startSessionBtn.disabled = false;
  stopSessionBtn.disabled = true;
  setStatus('session 已停止');
}

startSessionBtn.addEventListener('click', () => startSession().catch(e => setStatus(`建立失敗：${e.message || e}`)));
sendMockBtn.addEventListener('click', () => sendMock().catch(e => setStatus(`送出失敗：${e.message || e}`)));
stopSessionBtn.addEventListener('click', () => stopSession().catch(e => setStatus(`停止失敗：${e.message || e}`)));
clearBtn.addEventListener('click', () => {
  historyEl.innerHTML = '';
  liveOriginalEl.textContent = '...';
  liveTranslatedEl.textContent = '...';
  setStatus('已清除');
});
