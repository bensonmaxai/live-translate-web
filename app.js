import { pipeline, env } from './vendor/transformers.min.js';

const sourceLangEl = document.getElementById('sourceLang');
const targetLangEl = document.getElementById('targetLang');
const durationEl = document.getElementById('duration');
const loadModelBtn = document.getElementById('loadModelBtn');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const clearBtn = document.getElementById('clearBtn');
const statusEl = document.getElementById('status');
const liveOriginalEl = document.getElementById('liveOriginal');
const liveTranslatedEl = document.getElementById('liveTranslated');
const historyEl = document.getElementById('history');

const LABELS = {
  'zh-TW': '繁體中文',
  'en-US': 'English',
  'th-TH': 'ไทย',
  'ja-JP': '日本語',
  'ko-KR': '한국어',
};

const MODEL_CANDIDATES = [
  'Xenova/opus-mt-en-zh',
  'Xenova/opus-mt-zh-en',
  'Xenova/opus-mt-ja-en',
  'Xenova/opus-mt-jap-en',
  'Xenova/opus-mt-en-jap'
];

const DIRECT_MODEL_MAP = {
  'en-US->zh-TW': 'Xenova/opus-mt-en-zh',
  'zh-TW->en-US': 'Xenova/opus-mt-zh-en',
  'ja-JP->en-US': 'Xenova/opus-mt-ja-en',
  'ja-JP->en-US#alt': 'Xenova/opus-mt-jap-en',
  'en-US->ja-JP': 'Xenova/opus-mt-en-jap',
  'ko-KR->en-US': 'Xenova/opus-mt-ko-en',
  'th-TH->en-US': 'Xenova/opus-mt-th-en'
};

const MODEL_OPTIONS = {
  'Xenova/opus-mt-en-zh': { dtype: 'int8' },
  'Xenova/opus-mt-zh-en': { dtype: 'int8' },
  'Xenova/opus-mt-ja-en': { dtype: 'int8' },
  'Xenova/opus-mt-jap-en': { dtype: 'int8' },
  'Xenova/opus-mt-en-jap': { dtype: 'int8' },
  'Xenova/opus-mt-ko-en': { dtype: 'int8' },
  'Xenova/opus-mt-th-en': { dtype: 'int8' }
};

const translatorCache = new Map();

function setStatus(text) {
  statusEl.textContent = text;
}

function getSourceLang() {
  return sourceLangEl.value || 'en-US';
}

function getTargetLang() {
  return targetLangEl.value || 'zh-TW';
}

function addHistory(src, tgt) {
  const div = document.createElement('div');
  div.className = 'item';
  div.innerHTML = `<div class="meta">${new Date().toLocaleTimeString()}</div><div class="src">${escapeHtml(src)}</div><div class="tgt">${escapeHtml(tgt)}</div>`;
  historyEl.prepend(div);
}

function escapeHtml(s) {
  return (s || '').replace(/[&<>\"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

async function initLanguages() {
  const res = await fetch('/api/languages');
  const data = await res.json();
  const options = data.languages.map(x => `<option value="${x.code}">${x.label}</option>`).join('');
  sourceLangEl.innerHTML = options;
  targetLangEl.innerHTML = options;
  sourceLangEl.value = 'en-US';
  targetLangEl.value = 'zh-TW';
}

function setupEnv() {
  env.allowRemoteModels = true;
  env.allowLocalModels = false;
  env.backends.onnx.wasm.wasmPaths = {
    mjs: `${location.origin}/vendor/ort-wasm-simd-threaded.mjs`,
    wasm: `${location.origin}/vendor/ort-wasm-simd-threaded.wasm`
  };
  env.backends.onnx.wasm.numThreads = 1;
  env.backends.onnx.wasm.simd = true;
  env.backends.onnx.wasm.proxy = false;
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

function getDirectModel(src, tgt) {
  return DIRECT_MODEL_MAP[`${src}->${tgt}`] || null;
}

async function runModel(modelId, text) {
  const t = await loadTranslator(modelId);
  const out = await t(text);
  return Array.isArray(out) ? (out[0]?.translation_text || '') : '';
}

async function translateText(text, src, tgt) {
  if (!text.trim()) return '';
  if (src === tgt) return text;

  const direct = getDirectModel(src, tgt);
  if (direct) return await runModel(direct, text);

  if (src !== 'en-US' && tgt !== 'en-US') {
    const toEn = getDirectModel(src, 'en-US') || DIRECT_MODEL_MAP[`${src}->en-US#alt`];
    const fromEn = getDirectModel('en-US', tgt);
    if (toEn && fromEn) {
      const english = await runModel(toEn, text);
      return await runModel(fromEn, english);
    }
  }

  throw new Error('目前本地模型尚不支援這個語言方向');
}

async function transcribeOnce() {
  const res = await fetch('/api/transcribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ language: getSourceLang(), duration: Number(durationEl.value) })
  });
  return await res.json();
}

async function loop() {
  while (running) {
    try {
      setStatus('本地辨識中...');
      const result = await transcribeOnce();
      const text = result.transcript || '';
      if (!text.trim()) {
        setStatus('未辨識到語音，繼續下一段');
        continue;
      }
      liveOriginalEl.textContent = text;
      setStatus('本地翻譯中...');
      const translated = await translateText(text, getSourceLang(), getTargetLang());
      liveTranslatedEl.textContent = translated || '(翻譯失敗或模型不支援此語對)';
      addHistory(text, translated || '(翻譯失敗或模型不支援此語對)');
      setStatus('完成一段，持續監聽中...');
    } catch (e) {
      console.error(e);
      setStatus(`錯誤：${e.message || e}`);
      await new Promise(r => setTimeout(r, 800));
    }
  }
}

loadModelBtn.addEventListener('click', async () => {
  loadModelBtn.disabled = true;
  try {
    const src = getSourceLang();
    const tgt = getTargetLang();
    const direct = getDirectModel(src, tgt);
    if (direct) {
      await loadTranslator(direct);
    } else if (src !== 'en-US' && tgt !== 'en-US') {
      const toEn = getDirectModel(src, 'en-US') || DIRECT_MODEL_MAP[`${src}->en-US#alt`];
      const fromEn = getDirectModel('en-US', tgt);
      if (!toEn || !fromEn) throw new Error('缺少英文中繼本地模型');
      await loadTranslator(toEn);
      await loadTranslator(fromEn);
    } else {
      throw new Error('目前本地模型尚不支援此方向');
    }
  }
  catch (e) { setStatus(`模型載入失敗：${e.message || e}`); }
  finally { loadModelBtn.disabled = false; }
});

startBtn.addEventListener('click', async () => {
  running = true;
  startBtn.disabled = true;
  stopBtn.disabled = false;
  sourceLangEl.disabled = true;
  targetLangEl.disabled = true;
  durationEl.disabled = true;
  loop();
});

stopBtn.addEventListener('click', () => {
  running = false;
  startBtn.disabled = false;
  stopBtn.disabled = true;
  sourceLangEl.disabled = false;
  targetLangEl.disabled = false;
  durationEl.disabled = false;
  setStatus('已停止');
});

clearBtn.addEventListener('click', () => {
  historyEl.innerHTML = '';
  liveOriginalEl.textContent = '...';
  liveTranslatedEl.textContent = '...';
});

await initLanguages();
setStatus('請先載入模型，再開始測試');
