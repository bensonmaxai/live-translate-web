const $ = (s) => document.querySelector(s);
const sourceLangEl = $('#sourceLang');
const targetLangEl = $('#targetLang');
const preloadBtn = $('#preloadBtn');
const startBtn = $('#startBtn');
const stopBtn = $('#stopBtn');
const clearBtn = $('#clearBtn');
const manualInputEl = $('#manualInput');
const manualTranslateBtn = $('#manualTranslateBtn');
const statusEl = $('#status');
const supportMatrixEl = $('#supportMatrix');
const liveOriginalEl = $('#liveOriginal');
const liveTranslatedEl = $('#liveTranslated');
const historyEl = $('#history');
const speechSupportBadge = $('#speechSupportBadge');

const LABELS = {
  'zh-TW': '繁體中文',
  'en-US': 'English',
  'th-TH': 'ไทย',
  'ja-JP': '日本語',
  'ko-KR': '한국어'
};

const API_LANG = {
  'zh-TW': 'zh-TW',
  'en-US': 'en',
  'th-TH': 'th',
  'ja-JP': 'ja',
  'ko-KR': 'ko'
};

let recognition = null;
let recognizing = false;

function setStatus(text) { statusEl.textContent = text; }
function getSourceLang() { return sourceLangEl.value || 'en-US'; }
function getTargetLang() { return targetLangEl.value || 'zh-TW'; }
function escapeHtml(s) { return (s || '').replace(/[&<>\"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c])); }

function addHistory(src, tgt) {
  const div = document.createElement('div');
  div.className = 'item';
  div.innerHTML = `<div class="meta">${new Date().toLocaleTimeString()}</div><div class="src">${escapeHtml(src)}</div><div class="tgt">${escapeHtml(tgt)}</div>`;
  historyEl.prepend(div);
}

function renderSupport() {
  const src = getSourceLang();
  const tgt = getTargetLang();
  let text = `目前方向：${LABELS[src]} → ${LABELS[tgt]}｜`;
  if (src === tgt) text += '同語字幕模式';
  else text += '使用輕量翻譯 API fallback（目前為 MyMemory 測試版）';
  supportMatrixEl.textContent = text;
}

async function myMemoryTranslate(text, src, tgt) {
  const langpair = `${encodeURIComponent(API_LANG[src])}|${encodeURIComponent(API_LANG[tgt])}`;
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${langpair}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`翻譯 API 失敗 (${res.status})`);
  const data = await res.json();
  if (data.responseStatus !== 200) throw new Error(data.responseDetails || '翻譯 API 無法使用');
  return data.responseData?.translatedText || '';
}

async function translateText(text, src, tgt) {
  if (!text.trim()) return '';
  if (src === tgt) return text;
  return await myMemoryTranslate(text, src, tgt);
}

function getSpeechRecognitionClass() {
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

function setupSpeechSupport() {
  const SR = getSpeechRecognitionClass();
  if (SR) {
    speechSupportBadge.textContent = 'Speech recognition available';
    speechSupportBadge.classList.remove('muted');
  } else {
    speechSupportBadge.textContent = 'Speech recognition unavailable on this browser';
  }
}

async function handleTranscript(text) {
  if (!text.trim()) return;
  liveOriginalEl.textContent = text;
  setStatus('翻譯中...');
  try {
    const translated = await translateText(text, getSourceLang(), getTargetLang());
    liveTranslatedEl.textContent = translated || '(無翻譯結果)';
    addHistory(text, translated || '(無翻譯結果)');
    setStatus('完成');
  } catch (e) {
    liveTranslatedEl.textContent = '(翻譯失敗)';
    setStatus(`翻譯失敗：${e.message || e}`);
  }
}

function startRecognition() {
  const SR = getSpeechRecognitionClass();
  if (!SR) {
    setStatus('此瀏覽器目前不支援即時語音辨識，請先用手動翻譯測試。');
    return;
  }
  recognition = new SR();
  recognition.lang = getSourceLang();
  recognition.interimResults = true;
  recognition.continuous = true;
  recognition.onstart = () => {
    recognizing = true;
    startBtn.disabled = true;
    stopBtn.disabled = false;
    setStatus('正在聽取麥克風...');
  };
  recognition.onresult = async (event) => {
    let interim = '';
    let finalText = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript;
      if (event.results[i].isFinal) finalText += transcript;
      else interim += transcript;
    }
    if (interim) liveOriginalEl.textContent = interim;
    if (finalText) await handleTranscript(finalText.trim());
  };
  recognition.onerror = (e) => setStatus(`辨識錯誤：${e.error || 'unknown'}`);
  recognition.onend = () => {
    if (recognizing) {
      try { recognition.start(); } catch {}
    } else {
      startBtn.disabled = false;
      stopBtn.disabled = true;
      setStatus('已停止');
    }
  };
  recognition.start();
}

function stopRecognition() {
  recognizing = false;
  if (recognition) {
    try { recognition.stop(); } catch {}
  }
}

preloadBtn.addEventListener('click', async () => {
  setStatus('目前線上版不需要預載本地大型模型；已改走輕量翻譯 API。');
  renderSupport();
});

startBtn.addEventListener('click', startRecognition);
stopBtn.addEventListener('click', stopRecognition);
clearBtn.addEventListener('click', () => {
  historyEl.innerHTML = '';
  liveOriginalEl.textContent = '...';
  liveTranslatedEl.textContent = '...';
  setStatus('已清除');
});
manualTranslateBtn.addEventListener('click', async () => {
  const text = manualInputEl.value.trim();
  if (!text) return setStatus('請先輸入文字');
  await handleTranscript(text);
});
sourceLangEl.addEventListener('change', renderSupport);
targetLangEl.addEventListener('change', renderSupport);

setupSpeechSupport();
renderSupport();
setStatus('已切換為 API fallback 版：先確認翻譯流程與麥克風流程穩定。');
