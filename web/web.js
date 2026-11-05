// Bản web (iPhone/Safari, iPad, mọi browser). Dùng CHUNG lib/prompt.js + lib/providers.js
// với extension, chỉ thay lớp lưu trữ (localStorage) — xem docs/ios.md.
import { DIRECTIONS, MAX_OUTPUT_TOKENS, TONES, buildExplainMessages, buildMessages } from '../lib/prompt.js';
import { PROVIDER_PRESETS, generate, request, testConnection, validateConfig } from '../lib/providers.js';
import { maskKey } from '../lib/storage.js';
import { $, copyText, setStatus, showToast } from '../lib/ui.js';
import { getSettings, saveSettings } from './store.js';

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
};

let settings = getSettings();
let controller = null;
let output = '';
let explainText = '';

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
}

async function improve() {
  const text = els.input.value.trim();
  if (!text || controller || !hasKey()) return;

  const plan = buildMessages({ text, direction: els.direction.value, tone: els.tone.value });
  const directionLabel = DIRECTIONS.find((item) => item.id === plan.direction)?.label ?? plan.direction;

  controller = new AbortController();
  output = '';
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
    const { text } = await request({
      config: providerConfig(),
      messages: plan.messages,
      maxTokens: plan.maxTokens,
      temperature: 0,
      signal: controller.signal,
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
  els.output.textContent = output;
  els.output.scrollTop = els.output.scrollHeight;
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
