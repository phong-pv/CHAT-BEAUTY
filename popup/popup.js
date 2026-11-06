import {
  DEFAULT_DIRECTION,
  DEFAULT_TONE,
  DIRECTIONS,
  MAX_OUTPUT_TOKENS,
  PROMPT_VERSION,
  TONES,
  buildExplainMessages,
  buildMessages,
} from '../lib/prompt.js';
import { PROVIDER_PRESETS, generate } from '../lib/providers.js';
import {
  getSessionState,
  getSettings,
  hasApiKey,
  historyStore,
  saveSessionState,
  saveSettings,
} from '../lib/storage.js';
import { $, copyText, renderDiff, setStatus, showToast } from '../lib/ui.js';
import { diffWords, hasVisibleChange } from '../lib/diff.js';

const MAX_CHARS = 8000;
const INPUT_SAVE_DEBOUNCE_MS = 400;

const els = {
  input: $('#input'),
  counter: $('#counter'),
  tone: $('#tone'),
  direction: $('#direction'),
  improve: $('#improve'),
  stop: $('#stop'),
  status: $('#status'),
  output: $('#output'),
  copy: $('#copy'),
  explain: $('#explain'),
  explainWrap: $('#explain-wrap'),
  explainList: $('#explain-list'),
  toggleDiff: $('#toggle-diff'),
  historyWrap: $('#history-wrap'),
  historyList: $('#history-list'),
  historyCount: $('#history-count'),
  historyClear: $('#history-clear'),
  badge: $('#mode-badge'),
  settings: $('#open-settings'),
};

/** @type {AbortController|null} Đang chạy (viết lại hoặc giải thích). */
let controller = null;
/** Text kết quả đã nhận, giữ ở module scope để Copy/Explain dùng lại. */
let output = '';
/** Nội dung giải thích dạng thô, để lưu session. */
let explainText = '';
/** @type {Awaited<ReturnType<typeof getSettings>>|null} */
let settings = null;
let inputSaveTimer = 0;
/** Input + hướng của lần chạy gần nhất (dùng cho diff). */
let lastRunInput = '';
let lastDirection = '';
let diffMode = false;
/** @type {Array<{ts:number, input:string, output:string, model:string}>} */
let historyItems = [];

for (const tone of TONES) els.tone.append(new Option(tone.label, tone.id));
for (const direction of DIRECTIONS) els.direction.append(new Option(direction.label, direction.id));

els.input.addEventListener('input', () => {
  syncState();
  scheduleInputSave();
});
els.improve.addEventListener('click', improve);
els.explain.addEventListener('click', explainChanges);
els.stop.addEventListener('click', () => controller?.abort());
els.copy.addEventListener('click', onCopy);
els.tone.addEventListener('change', () => persist({ tone: els.tone.value }));
els.direction.addEventListener('change', () => persist({ direction: els.direction.value }));
els.settings.addEventListener('click', () => chrome.runtime.openOptionsPage());
els.toggleDiff.addEventListener('click', toggleDiffMode);
els.historyClear.addEventListener('click', clearHistory);
document.addEventListener('keydown', onKeyDown);

init();

async function init() {
  els.tone.value = DEFAULT_TONE;
  els.direction.value = DEFAULT_DIRECTION;

  const [loadedSettings, loadedSession] = await Promise.all([
    getSettings().catch(() => null),
    getSessionState().catch(() => null),
  ]);

  settings = loadedSettings;
  if (settings) {
    if (TONES.some((tone) => tone.id === settings.tone)) els.tone.value = settings.tone;
    if (DIRECTIONS.some((item) => item.id === settings.direction)) els.direction.value = settings.direction;
  }

  if (loadedSession) {
    els.input.value = loadedSession.input ?? '';
    output = loadedSession.output ?? '';
  }
  lastRunInput = loadedSession?.input ?? els.input.value;
  renderOutput();
  renderExplain(loadedSession?.explain ?? '');

  historyItems = await historyStore.list().catch(() => []);
  renderHistory();

  renderBadge();
  syncState();

  if (settings && !hasApiKey(settings)) {
    setStatus(els.status, 'Chưa có API key — đang chạy mock. Bấm Settings để nhập key.');
  } else if (output) {
    setStatus(els.status, 'Đã khôi phục kết quả lần trước.');
  }

  els.input.focus();
}

function renderBadge() {
  if (!settings) return;
  const live = hasApiKey(settings);
  const label = PROVIDER_PRESETS[settings.provider]?.label ?? settings.provider;
  els.badge.textContent = live ? label : 'mock';
  els.badge.title = live
    ? `${label} · ${settings.model}\n${settings.baseUrl}\nprompt ${PROMPT_VERSION}`
    : 'Chưa có API key — đang chạy dữ liệu giả lập. Mở Settings để nhập key.';
  els.badge.classList.toggle('ok', live);
}

function providerConfig() {
  return {
    provider: settings.provider,
    protocol: settings.protocol,
    baseUrl: settings.baseUrl,
    model: settings.model,
    apiKey: settings.apiKey,
  };
}

async function persist(patch) {
  try {
    settings = await saveSettings(patch);
    renderBadge();
  } catch (error) {
    setStatus(els.status, `Không lưu được settings: ${error?.message ?? error}`, 'error');
  }
}

function syncState() {
  const len = els.input.value.length;
  els.counter.textContent = `${len} / ${MAX_CHARS}`;
  els.counter.classList.toggle('warn', len > MAX_CHARS * 0.9);

  const busy = Boolean(controller);
  const live = Boolean(settings && hasApiKey(settings));

  document.body.dataset.busy = String(busy);
  els.output.setAttribute('aria-busy', String(busy));

  els.improve.disabled = busy || len === 0;
  els.stop.hidden = !busy;
  els.copy.disabled = output.length === 0;

  const canDiff = output.length > 0 && lastDirection === 'en-polish';
  if (!canDiff && diffMode) {
    diffMode = false;
    renderOutput();
  }
  els.toggleDiff.hidden = !canDiff;
  els.toggleDiff.textContent = diffMode ? 'Ẩn thay đổi' : 'Hiện thay đổi';
  els.toggleDiff.setAttribute('aria-pressed', String(diffMode));

  els.explain.disabled = busy || output.length === 0 || !live;
  els.explain.title = !live
    ? 'Cần API key để giải thích'
    : output.length === 0
      ? 'Chạy viết lại trước đã'
      : 'Giải thích những thay đổi';
}

function onKeyDown(event) {
  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
    event.preventDefault();
    improve();
    return;
  }
  if (event.key === 'Escape' && controller) {
    event.preventDefault();
    controller.abort();
  }
}

async function improve() {
  const text = els.input.value.trim();
  if (!text || controller) return;

  const plan = buildMessages({
    text,
    direction: els.direction.value,
    tone: els.tone.value,
    customInstructions: settings?.customInstructions ?? '',
  });
  const directionLabel = DIRECTIONS.find((item) => item.id === plan.direction)?.label ?? plan.direction;
  const live = Boolean(settings && hasApiKey(settings));

  controller = new AbortController();
  output = '';
  lastRunInput = text;
  lastDirection = plan.direction;
  diffMode = false;
  renderOutput();
  renderExplain('');
  setStatus(els.status, '');
  syncState();

  const append = (chunk) => {
    output += chunk;
    renderOutput();
  };

  try {
    if (live) {
      const run = (maxTokens) =>
        generate({
          config: providerConfig(),
          messages: plan.messages,
          maxTokens,
          onDelta: append,
          signal: controller.signal,
        });

      let result = await run(plan.maxTokens);

      // Model dừng vì hết budget token → thử lại 1 lần với budget gấp đôi (maxTokens chỉ là trần).
      if (result.truncated) {
        output = '';
        renderOutput();
        result = await run(Math.min(MAX_OUTPUT_TOKENS, plan.maxTokens * 2));
      }

      const short = plan.direction === 'en-polish' && output.length < text.length * 0.4;
      const head = `Xong · ${settings.model} · ${directionLabel} · ${output.length} ký tự · ${result.ms}ms`;

      if (result.truncated) {
        setStatus(els.status, `${head} — kết quả có thể bị cắt (giới hạn token). Thử lại hoặc đổi model.`, 'warn');
      } else if (short) {
        setStatus(els.status, `${head} — ngắn hơn nhiều so với input, kiểm tra lại kết quả.`, 'warn');
      } else {
        setStatus(els.status, head, 'ok');
      }

      await addHistory(text, plan.direction);
    } else {
      await streamMock(text, { signal: controller.signal, onDelta: append });
      setStatus(
        els.status,
        `Xong (mock, ${directionLabel}) — mock không dịch. Nhập API key trong Settings để chạy thật.`,
        'ok',
      );
    }
  } catch (error) {
    if (error?.name === 'AbortError') {
      setStatus(els.status, output ? 'Đã dừng — giữ phần đã nhận.' : 'Đã dừng.');
    } else {
      const suffix = error?.settings ? ' Kiểm tra lại trong Settings.' : '';
      setStatus(els.status, `${error?.message || 'Có lỗi không xác định.'}${suffix}`, 'error');
    }
  } finally {
    controller = null;
    syncState();
    persistSession();
  }
}

async function explainChanges() {
  if (controller || !output || !settings || !hasApiKey(settings)) return;

  const plan = buildExplainMessages({ original: els.input.value, improved: output });
  controller = new AbortController();
  els.explain.textContent = 'Đang…';
  setStatus(els.status, 'Đang giải thích…');
  syncState();

  try {
    renderExplain('');
    let streamed = '';
    const { text } = await generate({
      config: providerConfig(),
      messages: plan.messages,
      maxTokens: plan.maxTokens,
      temperature: 0,
      signal: controller.signal,
      onDelta: (chunk) => {
        streamed += chunk;
        renderExplain(streamed);
      },
    });
    renderExplain(text);
    setStatus(els.status, 'Đã giải thích thay đổi.', 'ok');
  } catch (error) {
    if (error?.name === 'AbortError') {
      setStatus(els.status, 'Đã dừng giải thích.');
    } else {
      const suffix = error?.settings ? ' Kiểm tra lại trong Settings.' : '';
      setStatus(els.status, `${error?.message || 'Không giải thích được.'}${suffix}`, 'error');
    }
  } finally {
    controller = null;
    els.explain.textContent = 'Giải thích';
    syncState();
    persistSession();
  }
}

function renderOutput() {
  if (diffMode && lastDirection === 'en-polish' && lastRunInput && output) {
    const segments = diffWords(lastRunInput, output);
    renderDiff(els.output, hasVisibleChange(segments) ? segments : [{ op: 'same', text: output }]);
    els.output.scrollTop = 0;
    return;
  }
  els.output.textContent = output;
  els.output.scrollTop = els.output.scrollHeight;
}

function toggleDiffMode() {
  diffMode = !diffMode;
  renderOutput();
  syncState();
}

// ---------------------------------------------------------------------------
// Lịch sử (U3)
// ---------------------------------------------------------------------------

function renderHistory() {
  els.historyList.textContent = '';
  els.historyWrap.hidden = historyItems.length === 0;
  els.historyCount.textContent = historyItems.length ? `${historyItems.length} mục` : '';

  for (const item of historyItems) {
    const li = document.createElement('li');

    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'history-item';
    open.textContent = item.input.replace(/\s+/g, ' ').slice(0, 80) || '(trống)';
    open.title = item.input;
    open.addEventListener('click', () => loadHistoryEntry(item));

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'history-remove';
    remove.textContent = '×';
    remove.title = 'Xoá mục này';
    remove.setAttribute('aria-label', 'Xoá mục lịch sử');
    remove.addEventListener('click', () => removeHistoryEntry(item.ts));

    li.append(open, remove);
    els.historyList.append(li);
  }
}

function loadHistoryEntry(item) {
  els.input.value = item.input;
  output = item.output;
  lastRunInput = item.input;
  lastDirection = item.direction === 'vi-to-en' ? 'vi-to-en' : 'en-polish';
  diffMode = false;
  renderOutput();
  renderExplain('');
  syncState();
  setStatus(els.status, 'Đã nạp từ lịch sử.', 'ok');
  scheduleInputSave();
}

async function removeHistoryEntry(ts) {
  historyItems = await historyStore.remove(ts).catch(() => historyItems);
  renderHistory();
  syncState();
}

async function clearHistory() {
  historyItems = await historyStore.clear().catch(() => []);
  renderHistory();
  syncState();
}

async function addHistory(input, direction) {
  try {
    historyItems = await historyStore.add({
      input,
      output,
      tone: els.tone.value,
      direction,
      model: settings?.model ?? '',
    });
    renderHistory();
  } catch {
    /* lịch sử là phụ — lỗi không được làm hỏng luồng chính */
  }
}

function renderExplain(text) {
  explainText = String(text ?? '').trim();
  els.explainList.textContent = '';
  els.explainWrap.hidden = explainText.length === 0;
  if (!explainText) return;

  for (const bullet of toBullets(explainText)) {
    const item = document.createElement('li');
    item.textContent = bullet;
    els.explainList.append(item);
  }
}

/** Tách bullet từ output của model; chịu được "-", "•", "1." và cả đoạn văn không bullet. */
function toBullets(text) {
  const lines = String(text)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^([-*•]|\d+[.)])\s+/, '').trim())
    .filter(Boolean);
  return (lines.length ? lines : [String(text).trim()]).slice(0, 6);
}

async function onCopy() {
  if (!output) return;
  const ok = await copyText(output);
  showToast(ok ? 'Đã sao chép' : 'Không sao chép được');
}

// ---------------------------------------------------------------------------
// Session state: popup bị đóng khi click ra ngoài nên phải lưu input/output
// vào chrome.storage.session (tự xoá khi đóng browser, không chứa key).
// ---------------------------------------------------------------------------

function persistSession() {
  if (!output && !els.input.value) return;
  saveSessionState({ input: els.input.value, output, explain: explainText }).catch(() => {});
}

function scheduleInputSave() {
  clearTimeout(inputSaveTimer);
  inputSaveTimer = setTimeout(persistSession, INPUT_SAVE_DEBOUNCE_MS);
}

// ---------------------------------------------------------------------------
// Mock mode: dùng khi CHƯA có API key (không gọi mạng). Có key rồi thì
// improve() gọi generate() thật trong lib/providers.js.
// Mock không dịch Việt → Anh, chỉ kiểm tra UI/luồng.
// ---------------------------------------------------------------------------

async function streamMock(text, { signal, onDelta }) {
  const polished = polish(text);
  for (let i = 0; i < polished.length; i += 2) {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    onDelta(polished.slice(i, i + 2));
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return polished;
}

/** Viết lại "giả lập": gộp khoảng trắng, viết hoa đầu câu, thêm dấu kết câu. */
function polish(text) {
  const collapsed = text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  const capitalized = collapsed.charAt(0).toUpperCase() + collapsed.slice(1);
  return /[.!?…"']$/.test(capitalized) ? capitalized : `${capitalized}.`;
}
