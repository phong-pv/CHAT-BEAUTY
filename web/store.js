// Web build (iPhone/Safari, mọi browser): cùng schema settings như bản extension
// nhưng lưu bằng localStorage thay vì chrome.storage. Không chứa key ở server — key
// chỉ nằm trong localStorage của chính trang này.
import { normalizeSettings } from '../lib/storage.js';
import { makeHistory } from '../lib/history.js';

const STORAGE_KEY = 'chatbeauty.settings';
const HISTORY_KEY = 'chatbeauty.history';

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

/** Lịch sử trên bản web (localStorage, cùng logic FIFO 30 mục với extension). */
export const historyStore = makeHistory({
  read: () => {
    try {
      return JSON.parse(window.localStorage.getItem(HISTORY_KEY) ?? '[]');
    } catch {
      return [];
    }
  },
  write: (items) => {
    try {
      window.localStorage.setItem(HISTORY_KEY, JSON.stringify(items));
    } catch {
      /* bỏ qua */
    }
  },
});
