// Settings của extension: 1 object duy nhất trong chrome.storage.local (KHÔNG dùng storage.sync
// vì sẽ làm API key rời khỏi máy). Schema versioned để migrate về sau — xem docs/adr/0002.
import { DEFAULT_DIRECTION, DEFAULT_TONE, DIRECTIONS, TONES } from './prompt.js';
import { PROVIDER_PRESETS } from './providers.js';
import { makeHistory } from './history.js';

export const SETTINGS_KEY = 'settings';
export const SCHEMA_VERSION = 1;

const DEFAULT_PRESET = PROVIDER_PRESETS.openai;

/** @typedef {{v:number, provider:string, protocol:string, baseUrl:string, model:string, apiKey:string, tone:string, direction:string}} Settings */

/** @type {Readonly<Settings>} */
export const DEFAULT_SETTINGS = Object.freeze({
  v: SCHEMA_VERSION,
  provider: 'openai',
  protocol: DEFAULT_PRESET.protocol,
  baseUrl: DEFAULT_PRESET.baseUrl,
  model: DEFAULT_PRESET.model,
  apiKey: '',
  tone: DEFAULT_TONE,
  direction: DEFAULT_DIRECTION,
  customInstructions: '',
});

/** Che key để hiển thị: giữ 4 ký tự đầu/cuối. Không phải mã hoá. */
export function maskKey(key) {
  const value = String(key || '').trim();
  if (!value) return '';
  if (value.length <= 8) return '•'.repeat(value.length);
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

/** Có key để gọi API chưa (provider local được phép không có key). */
export function hasApiKey(settings) {
  if (String(settings?.apiKey || '').trim()) return true;
  return Boolean(PROVIDER_PRESETS[settings?.provider]?.keyOptional);
}

export function normalizeSettings(raw) {
  const stored = raw && typeof raw === 'object' ? raw : {};
  const merged = { ...DEFAULT_SETTINGS, ...stored };
  merged.v = SCHEMA_VERSION;
  // `protocol` luôn suy ra từ provider: tránh trường hợp bản ghi cũ (hoặc đổi provider)
  // còn giữ protocol cũ → build request sai schema. Nếu sau này có preset cho phép
  // override protocol thì phải thêm field riêng, đừng nới lỏng chỗ này.
  merged.protocol = PROVIDER_PRESETS[merged.provider]?.protocol ?? 'openai';
  return merged;
}

function normalize(raw) {
  return normalizeSettings(raw);
}

/** @returns {Promise<Settings>} */
export async function getSettings() {
  const stored = await chrome.storage.local.get(SETTINGS_KEY);
  return normalize(stored?.[SETTINGS_KEY]);
}

/**
 * Gộp patch vào settings hiện tại rồi lưu.
 * @param {Partial<Settings>} patch
 * @returns {Promise<Settings>}
 */
export async function saveSettings(patch) {
  const next = normalize({ ...(await getSettings()), ...patch });
  await chrome.storage.local.set({ [SETTINGS_KEY]: next });
  return next;
}

export async function clearApiKey() {
  return saveSettings({ apiKey: '' });
}

// ---------------------------------------------------------------------------
// Session state (P4): giữ input/output khi popup bị đóng (chrome.storage.session
// tự xoá khi đóng browser). Không chứa API key.
// ---------------------------------------------------------------------------

export const SESSION_KEY = 'sessionState';
const SESSION_MAX_AGE_MS = 6 * 60 * 60 * 1000; // 6 giờ

const EMPTY_SESSION = Object.freeze({ input: '', output: '', explain: '', ts: 0 });

/** @returns {Promise<{input:string, output:string, explain:string, ts:number}|null>} */
export async function getSessionState() {
  if (!chrome?.storage?.session) return null;
  const stored = await chrome.storage.session.get(SESSION_KEY);
  const state = stored?.[SESSION_KEY];
  if (!state || typeof state !== 'object') return null;
  if (state.ts && Date.now() - state.ts > SESSION_MAX_AGE_MS) return null;
  return { ...EMPTY_SESSION, ...state };
}

/** @param {{input?:string, output?:string, explain?:string}} patch */
export async function saveSessionState(patch) {
  if (!chrome?.storage?.session) return null;
  const next = { ...EMPTY_SESSION, ...(patch ?? {}), ts: Date.now() };
  await chrome.storage.session.set({ [SESSION_KEY]: next });
  return next;
}

export async function clearSessionState() {
  if (!chrome?.storage?.session) return;
  await chrome.storage.session.remove(SESSION_KEY);
}

// ---------------------------------------------------------------------------
// Lịch sử 30 mục (U3) + export/import settings (U7)
// ---------------------------------------------------------------------------

export const HISTORY_KEY = 'history';

export const historyStore = makeHistory({
  read: async () => (await chrome.storage.local.get(HISTORY_KEY))?.[HISTORY_KEY] ?? [],
  write: async (items) => chrome.storage.local.set({ [HISTORY_KEY]: items }),
});

/** Field được phép export/import. Cố tình KHÔNG có apiKey. */
export const EXPORTABLE_KEYS = ['provider', 'baseUrl', 'model', 'tone', 'direction', 'customInstructions'];

/** JSON cấu hình (không có key) để copy/share giữa extension và bản web. */
export function exportSettings(settings = DEFAULT_SETTINGS) {
  const payload = { v: SCHEMA_VERSION };
  for (const key of EXPORTABLE_KEYS) payload[key] = settings?.[key] ?? '';
  return JSON.stringify(payload, null, 2);
}

/**
 * Đọc JSON do `exportSettings()` tạo ra → patch hợp lệ cho `saveSettings()`.
 * Không bao giờ trả `apiKey` (an toàn khi dán JSON từ nơi khác).
 * @param {string} text
 * @returns {object}
 */
export function parseSettingsJson(text) {
  let parsed;
  try {
    parsed = JSON.parse(String(text ?? ''));
  } catch {
    throw new Error('JSON không hợp lệ.');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('JSON phải là một object.');
  }

  const patch = {};
  for (const key of EXPORTABLE_KEYS) {
    if (typeof parsed[key] === 'string') patch[key] = parsed[key];
  }
  if (!Object.keys(patch).length) {
    throw new Error('Không có field nào để nhập (provider, baseUrl, model, tone, direction…).');
  }
  if (patch.provider && !PROVIDER_PRESETS[patch.provider]) {
    throw new Error(`provider không tồn tại: ${patch.provider}`);
  }
  if (patch.tone && !TONES.some((tone) => tone.id === patch.tone)) {
    throw new Error(`tone không hợp lệ: ${patch.tone}`);
  }
  if (patch.direction && !DIRECTIONS.some((item) => item.id === patch.direction)) {
    throw new Error(`direction không hợp lệ: ${patch.direction}`);
  }
  return patch;
}

/** Lắng nghe settings thay đổi (dùng khi Options mở ở tab khác). */
export function onSettingsChanged(listener) {
  const handler = (changes, area) => {
    if (area === 'local' && changes[SETTINGS_KEY]) listener(normalize(changes[SETTINGS_KEY].newValue));
  };
  chrome.storage.onChanged.addListener(handler);
  return () => chrome.storage.onChanged.removeListener(handler);
}
