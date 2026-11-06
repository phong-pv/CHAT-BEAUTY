import { DIRECTIONS, PROMPT_VERSION, TONES } from '../lib/prompt.js';
import { PROVIDER_PRESETS, originPattern, testConnection, validateConfig } from '../lib/providers.js';
import { SCHEMA_VERSION, clearApiKey, exportSettings, getSettings, maskKey, parseSettingsJson, saveSettings } from '../lib/storage.js';
import { $, setStatus, showToast } from '../lib/ui.js';

const els = {
  provider: $('#provider'),
  baseUrl: $('#baseUrl'),
  model: $('#model'),
  apiKey: $('#apiKey'),
  keyMask: $('#key-mask'),
  keyLink: $('#key-link'),
  presetHint: $('#preset-hint'),
  clearKey: $('#clear-key'),
  tone: $('#tone'),
  direction: $('#direction'),
  directionHint: $('#direction-hint'),
  customInstructions: $('#customInstructions'),
  settingsJson: $('#settings-json'),
  exportSettings: $('#export-settings'),
  importSettings: $('#import-settings'),
  versionHint: $('#version-hint'),
  save: $('#save'),
  test: $('#test'),
  status: $('#status'),
};

/** @type {Awaited<ReturnType<typeof getSettings>>} */
let currentSettings = null;

for (const [id, preset] of Object.entries(PROVIDER_PRESETS)) {
  els.provider.append(new Option(preset.label, id));
}
for (const tone of TONES) els.tone.append(new Option(`${tone.label} — ${tone.hint}`, tone.id));
for (const direction of DIRECTIONS) els.direction.append(new Option(direction.label, direction.id));

els.provider.addEventListener('change', onProviderChange);
els.direction.addEventListener('change', renderDirectionHint);
els.save.addEventListener('click', onSave);
els.test.addEventListener('click', onTest);
els.clearKey.addEventListener('click', onClearKey);
els.exportSettings.addEventListener('click', onExportSettings);
els.importSettings.addEventListener('click', onImportSettings);

init();

async function init() {
  try {
    currentSettings = await getSettings();
  } catch (error) {
    setStatus(els.status, `Không đọc được settings: ${error?.message ?? error}`, 'error');
    return;
  }

  els.provider.value = PROVIDER_PRESETS[currentSettings.provider] ? currentSettings.provider : 'custom';
  els.baseUrl.value = currentSettings.baseUrl;
  els.model.value = currentSettings.model;
  els.tone.value = currentSettings.tone;
  els.direction.value = currentSettings.direction;
  els.customInstructions.value = currentSettings.customInstructions ?? '';

  renderKeyMask(currentSettings.apiKey);
  renderPresetHint(els.provider.value);
  renderDirectionHint();
  const version = chrome?.runtime?.getManifest?.()?.version ?? '';
  els.versionHint.textContent = `prompt ${PROMPT_VERSION} · settings schema v${SCHEMA_VERSION}${version ? ` · ChatBeauty ${version}` : ''}`;
}

function onProviderChange() {
  const preset = PROVIDER_PRESETS[els.provider.value] ?? {};
  if (!preset.custom) {
    els.baseUrl.value = preset.baseUrl ?? '';
    els.model.value = preset.model ?? '';
  }
  renderPresetHint(els.provider.value);
}

function renderPresetHint(providerId) {
  const preset = PROVIDER_PRESETS[providerId] ?? {};
  els.keyLink.hidden = !preset.keyUrl;
  if (preset.keyUrl) els.keyLink.href = preset.keyUrl;

  const notes = [`protocol: ${preset.protocol ?? 'openai'}`];
  if (preset.keyOptional) notes.push('có thể không cần API key');
  if (preset.custom) notes.push('Base URL dạng OpenAI-compatible, thường kết thúc bằng /v1');
  els.presetHint.textContent = `· ${notes.join(' · ')}`;
}

function renderDirectionHint() {
  const hint = DIRECTIONS.find((item) => item.id === els.direction.value)?.hint ?? '';
  els.directionHint.textContent = hint;
}

function renderKeyMask(apiKey) {
  const masked = maskKey(apiKey);
  els.keyMask.textContent = masked || '(chưa có key)';
  els.keyMask.title = masked ? 'Chỉ hiển thị 4 ký tự đầu/cuối' : '';
  els.clearKey.disabled = !masked;
}

/** Config hiện tại trên form (key rỗng = giữ key đã lưu). */
function collectConfig({ keepSavedKey = true } = {}) {
  const provider = els.provider.value;
  const preset = PROVIDER_PRESETS[provider] ?? {};
  const typedKey = els.apiKey.value.trim();
  const savedKey = keepSavedKey ? String(currentSettings?.apiKey ?? '') : '';
  return {
    provider,
    protocol: preset.protocol ?? 'openai',
    baseUrl: els.baseUrl.value.trim(),
    model: els.model.value.trim(),
    apiKey: typedKey || savedKey,
  };
}

/**
 * Xin quyền host cho baseUrl hiện tại. Phải gọi trong user gesture (click handler).
 * @param {string} baseUrl
 * @returns {Promise<boolean>}
 */
async function ensureHostPermission(baseUrl) {
  if (!chrome?.permissions?.request) return true;
  let pattern;
  try {
    pattern = originPattern(baseUrl);
  } catch {
    return false;
  }
  try {
    return await chrome.permissions.request({ origins: [pattern] });
  } catch {
    return false;
  }
}

async function onSave() {
  const config = collectConfig();
  const invalid = validateConfig(config);
  if (invalid) {
    setStatus(els.status, invalid, 'error');
    return;
  }

  if (!(await ensureHostPermission(config.baseUrl))) {
    setStatus(els.status, 'Chưa được cấp quyền truy cập host này nên chưa gọi được API.', 'error');
    return;
  }

  try {
    currentSettings = await saveSettings({
      provider: config.provider,
      protocol: config.protocol,
      baseUrl: config.baseUrl,
      model: config.model,
      apiKey: config.apiKey,
      tone: els.tone.value,
      direction: els.direction.value,
      customInstructions: els.customInstructions.value.trim(),
    });
    els.apiKey.value = '';
    renderKeyMask(currentSettings.apiKey);
    setStatus(els.status, 'Đã lưu settings.', 'ok');
    showToast('Đã lưu');
  } catch (error) {
    setStatus(els.status, `Không lưu được: ${error?.message ?? error}`, 'error');
  }
}

async function onTest() {
  const config = collectConfig();
  const invalid = validateConfig(config);
  if (invalid) {
    setStatus(els.status, invalid, 'error');
    return;
  }

  if (!(await ensureHostPermission(config.baseUrl))) {
    setStatus(els.status, 'Chưa được cấp quyền truy cập host này nên chưa gọi được API.', 'error');
    return;
  }

  els.test.disabled = true;
  setStatus(els.status, 'Đang kiểm tra kết nối…');
  try {
    const { ms, sample } = await testConnection(config);
    const suffix = sample ? ` · trả lời: "${sample}"` : '';
    setStatus(els.status, `Kết nối OK · ${config.model} · ${ms}ms${suffix}`, 'ok');
  } catch (error) {
    setStatus(els.status, error?.message ?? String(error), 'error');
  } finally {
    els.test.disabled = false;
  }
}

async function onClearKey() {
  try {
    currentSettings = await clearApiKey();
    els.apiKey.value = '';
    renderKeyMask(currentSettings.apiKey);
    setStatus(els.status, 'Đã xoá API key khỏi máy.', 'ok');
    showToast('Đã xoá key');
  } catch (error) {
    setStatus(els.status, `Không xoá được: ${error?.message ?? error}`, 'error');
  }
}

/** Đổ settings vào form (dùng sau khi nhập JSON). */
function fillForm(settings) {
  els.provider.value = PROVIDER_PRESETS[settings.provider] ? settings.provider : 'custom';
  els.baseUrl.value = settings.baseUrl;
  els.model.value = settings.model;
  els.tone.value = settings.tone;
  els.direction.value = settings.direction;
  els.customInstructions.value = settings.customInstructions ?? '';
  renderKeyMask(settings.apiKey);
  renderPresetHint(els.provider.value);
  renderDirectionHint();
}

function onExportSettings() {
  els.settingsJson.value = exportSettings(currentSettings ?? undefined);
  setStatus(els.status, 'Đã xuất cấu hình ra ô JSON (không có API key).', 'ok');
}

async function onImportSettings() {
  try {
    const patch = parseSettingsJson(els.settingsJson.value);
    currentSettings = await saveSettings(patch);
    fillForm(currentSettings);
    setStatus(els.status, 'Đã nhập cấu hình từ JSON.', 'ok');
    showToast('Đã nhập');
  } catch (error) {
    setStatus(els.status, error?.message ?? String(error), 'error');
  }
}
