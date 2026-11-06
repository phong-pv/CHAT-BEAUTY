// Bản web (iPhone/Safari, iPad, mọi browser). Dùng CHUNG lib/prompt.js + lib/providers.js
// với extension, chỉ thay lớp lưu trữ (localStorage) — xem docs/ios.md.
import { DIRECTIONS, MAX_OUTPUT_TOKENS, PROMPT_VERSION, TONES, buildExplainMessages, buildMessages } from '../lib/prompt.js';
import { PROVIDER_PRESETS, generate, testConnection, validateConfig } from '../lib/providers.js';
import { exportSettings, maskKey, parseSettingsJson } from '../lib/storage.js';
import { $, copyText, renderDiff, setStatus, showToast } from '../lib/ui.js';
import { diffWords, hasVisibleChange } from '../lib/diff.js';
import { historyStore, getSettings, saveSettings } from './store.js';

const MAX_CHARS = 8000;
const STATE_KEY = 'chatbeauty.state';

const els = {
  panel: $('#settings'),
  toggle: $('#toggle-settings'),
  provider: $('#provider'),
  model: $('#model'),
  baseUrl: $('#baseUrl'),
  apiKey: $('#apiKey'),
  keyMask: $('#key-mask'),
  customInstructions: $('#customInstructions'),
  settingsJson: $('#settings-json'),
  exportSettings: $('#export-settings'),
  importSettings: $('#import-settings'),
  save: $('#save'),
  test: $('#test'),
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
  versionHint: $('#version-hint'),
};

let settings = getSettings();
let controller = null;
let output = '';
let explainText = '';
let lastRunInput = '';
let lastDirection = '';
let diffMode = false;
/** @type {Array<{ts:number, input:string, output:string, direction:string, model:string}>} */
let historyItems = [];

for (const [id, preset] of Object.entries(PROVIDER_PRESETS)) {
  els.provider.append(new Option(preset.label, id));
}
for (const tone of TONES) els.tone.append(new Option(tone.label, tone.id));
for (const direction of DIRECTIONS) els.direction.append(new Option(direction.label, direction.id));

els.toggle.addEventListener('click', () => {
  const open = els.panel.hidden;
  els.panel.hidden = !open;
  els.toggle.setAttribute('aria-expanded', String(open));
});
els.provider.addEventListener('change', onProviderChange);
els.save.addEventListener('click', onSave);
els.test.addEventListener('click', onTest);
els.input.addEventListener('input', () => {
  syncState();
  persistState();
});
els.improve.addEventListener('click', improve);
els.stop.addEventListener('click', () => controller?.abort());
els.copy.addEventListener('click', onCopy);
els.explain.addEventListener('click', explainChanges);
els.toggleDiff.addEventListener('click', () => {
  diffMode = !diffMode;
  renderOutput();
  syncState();
});
els.historyClear.addEventListener('click', async () => {
  historyItems = await historyStore.clear().catch(() => []);
  renderHistory();
});
els.exportSettings.addEventListener('click', () => {
  els.settingsJson.value = exportSettings(settings);
  setStatus(els.status, 'Đã xuất cấu hình ra ô JSON (không có key).', 'ok');
});
els.importSettings.addEventListener('click', () => {
  try {
    settings = saveSettings(parseSettingsJson(els.settingsJson.value));
    applySettingsToForm();
    syncState();
    setStatus(els.status, 'Đã nhập cấu hình từ JSON.', 'ok');
    showToast('Đã nhập');
  } catch (error) {
    setStatus(els.status, error?.message ?? String(error), 'error');
  }
});
els.tone.addEventListener('change', () => {
  settings = saveSettings({ tone: els.tone.value });
});
els.direction.addEventListener('change', () => {
  settings = saveSettings({ direction: els.direction.value });
});

init();

function init() {
  applySettingsToForm();
  restoreState();
  renderOutput();
  renderExplain('');
  syncState();
  els.versionHint.textContent = `prompt ${PROMPT_VERSION} · bản web (dùng chung logic với extension)`;
  historyStore
    .list()
    .then((items) => {
      historyItems = items;
      renderHistory();
    })
    .catch(() => {});
  if (!hasKey()) {
    setStatus(els.status, 'Chưa có API key — mở Cài đặt để nhập key trước khi Viết lại.');
  } else if (output) {
    setStatus(els.status, 'Đã khôi phục nội dung lần trước.');
  }
}

function applySettingsToForm() {
  els.provider.value = PROVIDER_PRESETS[settings.provider] ? settings.provider : 'custom';
  els.model.value = settings.model;
  els.baseUrl.value = settings.baseUrl;
  els.customInstructions.value = settings.customInstructions ?? '';
  els.tone.value = settings.tone;
  els.direction.value = settings.direction;
  renderKeyMask();
}

function renderKeyMask() {
  const masked = maskKey(settings.apiKey);
  els.keyMask.textContent = masked || '(chưa có)';
}

function hasKey() {
  return Boolean(String(settings.apiKey || '').trim()) || Boolean(PROVIDER_PRESETS[settings.provider]?.keyOptional);
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

function onProviderChange() {
  const preset = PROVIDER_PRESETS[els.provider.value] ?? {};
  els.baseUrl.value = preset.baseUrl ?? '';
  if (!preset.custom) els.model.value = preset.model ?? '';
  setStatus(els.status, preset.custom ? 'Nhập Base URL (thường kết thúc bằng /v1) và model bạn dùng.' : '');
}

function onSave() {
  const provider = els.provider.value;
  const preset = PROVIDER_PRESETS[provider] ?? {};
  const typedKey = els.apiKey.value.trim();

  settings = saveSettings({
    provider,
    baseUrl: els.baseUrl.value.trim() || preset.baseUrl,
    model: els.model.value.trim(),
    apiKey: typedKey || settings.apiKey,
    tone: els.tone.value,
    direction: els.direction.value,
    customInstructions: els.customInstructions.value.trim(),
  });

  els.apiKey.value = '';
  renderKeyMask();
  const invalid = validateConfig(providerConfig());
  setStatus(els.status, invalid ? invalid : 'Đã lưu.', invalid ? 'error' : 'ok');
  if (!invalid) showToast('Đã lưu');
  syncState();
}

async function onTest() {
  const invalid = validateConfig(providerConfig());
  if (invalid) {
    setStatus(els.status, invalid, 'error');
    return;
  }
  els.test.disabled = true;
  setStatus(els.status, 'Đang kiểm tra kết nối…');
  try {
    const { ms, sample } = await testConnection(providerConfig());
    setStatus(els.status, `Kết nối OK · ${settings.model} · ${ms}ms${sample ? ` · "${sample}"` : ''}`, 'ok');
  } catch (error) {
    setStatus(els.status, error?.message ?? String(error), 'error');
  } finally {
    els.test.disabled = false;
  }
}

function syncState() {
  const len = els.input.value.length;
  els.counter.textContent = `${len} / ${MAX_CHARS}`;
  els.counter.classList.toggle('warn', len > MAX_CHARS * 0.9);

  const busy = Boolean(controller);
  const ready = hasKey();

  document.body.dataset.busy = String(busy);
  els.output.setAttribute('aria-busy', String(busy));

  els.improve.disabled = busy || len === 0 || !ready;
  els.improve.title = ready ? '' : 'Cần API key — mở Cài đặt';
  els.stop.hidden = !busy;
  els.copy.disabled = output.length === 0;
  els.explain.disabled = busy || output.length === 0 || !ready;

  const canDiff = output.length > 0 && lastDirection === 'en-polish';
  if (!canDiff && diffMode) {
    diffMode = false;
    renderOutput();
  }
  els.toggleDiff.hidden = !canDiff;
  els.toggleDiff.textContent = diffMode ? 'Ẩn thay đổi' : 'Hiện thay đổi';
  els.toggleDiff.setAttribute('aria-pressed', String(diffMode));
}

async function improve() {
  const text = els.input.value.trim();
  if (!text || controller || !hasKey()) return;

  const plan = buildMessages({
    text,
    direction: els.direction.value,
    tone: els.tone.value,
    customInstructions: settings.customInstructions ?? '',
  });
  const directionLabel = DIRECTIONS.find((item) => item.id === plan.direction)?.label ?? plan.direction;

  controller = new AbortController();
  output = '';
  lastRunInput = text;
  lastDirection = plan.direction;
  diffMode = false;
  renderOutput();
  renderExplain('');
  setStatus(els.status, '');
  syncState();

  try {
    const run = (maxTokens) =>
      generate({
        config: providerConfig(),
        messages: plan.messages,
        maxTokens,
        signal: controller.signal,
        onDelta: (chunk) => {
          output += chunk;
          renderOutput();
        },
      });

    let result = await run(plan.maxTokens);

    // Hết budget token → thử lại 1 lần với budget gấp đôi.
    if (result.truncated) {
      output = '';
      renderOutput();
      result = await run(Math.min(MAX_OUTPUT_TOKENS, plan.maxTokens * 2));
    }

    const short = plan.direction === 'en-polish' && output.length < text.length * 0.4;
    const head = `Xong · ${settings.model} · ${directionLabel} · ${output.length} ký tự · ${result.ms}ms`;

    if (result.truncated) {
      setStatus(els.status, `${head} — kết quả có thể bị cắt (giới hạn token).`, 'warn');
    } else if (short) {
      setStatus(els.status, `${head} — ngắn hơn nhiều so với input, kiểm tra lại.`, 'warn');
    } else {
      setStatus(els.status, head, 'ok');
    }

    await addHistory(text, plan.direction);
  } catch (error) {
    if (error?.name === 'AbortError') {
      setStatus(els.status, output ? 'Đã dừng — giữ phần đã nhận.' : 'Đã dừng.');
    } else {
      const suffix = error?.settings ? ' Mở Cài đặt để kiểm tra key/base URL.' : '';
      setStatus(els.status, `${error?.message || 'Có lỗi không xác định.'}${suffix}`, 'error');
    }
  } finally {
    controller = null;
    syncState();
    persistState();
  }
}

async function explainChanges() {
  if (controller || !output || !hasKey()) return;

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
      setStatus(els.status, error?.message ?? 'Không giải thích được.', 'error');
    }
  } finally {
    controller = null;
    els.explain.textContent = 'Giải thích';
    syncState();
    persistState();
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
    remove.addEventListener('click', async () => {
      historyItems = await historyStore.remove(item.ts).catch(() => historyItems);
      renderHistory();
    });

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
  persistState();
}

async function addHistory(input, direction) {
  try {
    historyItems = await historyStore.add({
      input,
      output,
      tone: els.tone.value,
      direction,
      model: settings.model,
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

/** Tách bullet: chấp nhận "-", "*", "•", "1." và fallback cả đoạn văn. */
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

/** State tạm trong tab hiện tại (sessionStorage) — iPhone hay bị reload trang. */
function persistState() {
  try {
    window.sessionStorage.setItem(
      STATE_KEY,
      JSON.stringify({ input: els.input.value, output, explain: explainText }),
    );
  } catch {
    /* chế độ private chặn sessionStorage — không sao */
  }
}

function restoreState() {
  try {
    const raw = window.sessionStorage.getItem(STATE_KEY);
    if (!raw) return;
    const state = JSON.parse(raw);
    els.input.value = state.input ?? '';
    output = state.output ?? '';
    explainText = state.explain ?? '';
  } catch {
    /* bỏ qua state hỏng */
  }
  renderExplain(explainText);
}
