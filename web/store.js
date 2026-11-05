// Web build (iPhone/Safari, mọi browser): cùng schema settings như bản extension
// nhưng lưu bằng localStorage thay vì chrome.storage. Không chứa key ở server — key
// chỉ nằm trong localStorage của chính trang này.
import { normalizeSettings } from '../lib/storage.js';

const STORAGE_KEY = 'chatbeauty.settings';

/** @returns {ReturnType<typeof normalizeSettings>} */
export function getSettings() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return normalizeSettings(raw ? JSON.parse(raw) : null);
  } catch {
    return normalizeSettings(null);
  }
}

/** @param {object} patch */
export function saveSettings(patch) {
  const next = normalizeSettings({ ...getSettings(), ...patch });
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* chế độ private có thể chặn localStorage — bỏ qua, vẫn dùng được trong phiên */
  }
  return next;
}
