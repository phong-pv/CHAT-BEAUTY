// Settings của extension: 1 object duy nhất trong chrome.storage.local (KHÔNG dùng storage.sync
// vì sẽ làm API key rời khỏi máy). Schema versioned để migrate về sau — xem docs/adr/0002.
import { DEFAULT_DIRECTION, DEFAULT_TONE } from './prompt.js';
import { PROVIDER_PRESETS } from './providers.js';

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

/** Lắng nghe settings thay đổi (dùng khi Options mở ở tab khác). */
export function onSettingsChanged(listener) {
  const handler = (changes, area) => {
    if (area === 'local' && changes[SETTINGS_KEY]) listener(normalize(changes[SETTINGS_KEY].newValue));
  };
  chrome.storage.onChanged.addListener(handler);
  return () => chrome.storage.onChanged.removeListener(handler);
}
