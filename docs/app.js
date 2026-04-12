import { pipeline, env } from './vendor/transformers.min.js';

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

const FALLBACK_MULTILINGUAL_MODEL = null;

const DIRECT_MODEL_MAP = {};

const MODEL_OPTIONS = {};

const LABELS = {
  'zh-TW': '繁體中文',
  'en-US': 'English',
  'th-TH': 'ไทย',
  'ja-JP': '日本語',
  'ko-KR': '한국어'
};

const M2M_LANG = {
  'zh-TW': 'zh',
  'en-US': 'en',
  'th-TH': 'th',
  'ja-JP': 'ja',
  'ko-KR': 'ko'
};

const translatorCache = new Map();
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

function setupEnv() {
  env.allowRemoteModels = true;
  env.allowLocalModels = false;
  env.backends.onnx.wasm.wasmPaths = {
    mjs: `${location.origin}${location.pathname.replace(/\/[^/]*$/, '/') }vendor/ort-wasm-simd-threaded.mjs`,
    wasm: `${location.origin}${location.pathname.replace(/\/[^/]*$/, '/') }vendor/ort-wasm-simd-threaded.wasm`
  };
  env.backends.onnx.wasm.numThreads = 1;
  env.backends.onnx.wasm.simd = true;
  env.backends.onnx.wasm.proxy = false;
}

function getDirectModel(src, tgt) {
  return DIRECT_MODEL_MAP[`${src}->${tgt}`] || null;
}

function getTranslationPlan(src, tgt) {
  if (src === tgt) return { type: 'identity' };
  const direct = getDirectModel(src, tgt);
  if (direct) return { type: 'direct', models: [direct] };
  if (src !== 'en-US' && tgt !== 'en-US') {
    const toEn = getDirectModel(src, 'en-US') || DIRECT_MODEL_MAP[`${src}->en-US#alt`];
    const fromEn = getDirectModel('en-US', tgt);
    if (toEn && fromEn) return { type: 'pivot', models: [toEn, fromEn] };
  }
  return { type: 'unsupported', models: [] };
}

async function loadTranslator(modelId) {
  setupEnv();
  if (translatorCache.has(modelId)) return translatorCache.get(modelId);
  setStatus(`載入模型中：${modelId}`);
  const t = await pipeline('translation', modelId, {
    ...(MODEL_OPTIONS[modelId] || {}),
    progress_callback: x => {
      if (x.status) setStatus(`模型 ${modelId}：${x.status}${x.file ? ' / ' + x.file : ''}`);
    }
  });
  translatorCache.set(modelId, t);
  setStatus(`模型已載入：${modelId}`);
  return t;
}

async function runModel(modelId, text, src, tgt) {
  const t = await loadTranslator(modelId);
  const options = modelId === FALLBACK_MULTILINGUAL_MODEL
    ? { src_lang: M2M_LANG[src], tgt_lang: M2M_LANG[tgt] }
    : {};
  const out = await t(text, options);
  return Array.isArray(out) ? (out[0]?.translation_text || '') : '';
}

async function translateText(text, src, tgt) {
  if (!text.trim()) return '';
  if (src === tgt) return text;
  throw new Error('目前線上版已切換為安全模式：暫停瀏覽器端大型本地翻譯模型，避免 UI 崩潰。可先使用麥克風字幕流程或等待下一輪更穩的翻譯引擎。');
}

function renderSupport() {
  const src = getSourceLang();
  const tgt = getTargetLang();
  let text = `目前方向：${LABELS[src]} → ${LABELS[tgt]}｜`;
  if (src === tgt) text += '可作為同語字幕模式';
  else text += '安全模式：暫停瀏覽器端大型本地翻譯模型，避免 UI 崩潰';
  supportMatrixEl.textContent = text;
}

async function preloadForCurrentPair() {
  throw new Error('安全模式：已停用瀏覽器端大型本地翻譯模型預載，避免 UI 崩潰。');
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
  preloadBtn.disabled = true;
  try { await preloadForCurrentPair(); }
  catch (e) { setStatus(`模型載入失敗：${e.message || e}`); }
  finally { preloadBtn.disabled = false; renderSupport(); }
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
setStatus('可先預載模型，或先用手動文字測試翻譯鏈路');
