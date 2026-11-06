// Lịch sử 30 mục gần nhất (U3). Logic thuần, nhận storage adapter để dùng được
// ở cả extension (chrome.storage.local) và bản web (localStorage).

export const HISTORY_LIMIT = 30;

const clean = (value, max = 8000) => String(value ?? '').slice(0, max);

/** Chuẩn hoá 1 entry: luôn có ts, ép kiểu, cắt độ dài để không phình storage. */
export function normalizeEntry(entry = {}) {
  return {
    ts: Number(entry.ts) || Date.now(),
    input: clean(entry.input),
    output: clean(entry.output),
    tone: clean(entry.tone, 32),
    direction: clean(entry.direction, 32),
    model: clean(entry.model, 120),
  };
}

function sortAndCap(items) {
  if (!Array.isArray(items)) return [];
  return items
    .filter((item) => item && typeof item === 'object' && (item.input || item.output))
    .map(normalizeEntry)
    .sort((a, b) => b.ts - a.ts)
    .slice(0, HISTORY_LIMIT);
}

/**
 * @param {{read:()=>Promise<unknown>, write:(items:Array<object>)=>Promise<void>}} store
 */
export function makeHistory({ read, write }) {
  return {
    /** @returns {Promise<Array<ReturnType<typeof normalizeEntry>>>} */
    async list() {
      try {
        return sortAndCap(await read());
      } catch {
        return [];
      }
    },

    async add(entry) {
      const items = await this.list();
      const next = sortAndCap([normalizeEntry(entry), ...items]);
      await write(next);
      return next;
    },

    /** Xoá 1 mục theo `ts`. */
    async remove(ts) {
      const items = await this.list();
      const next = items.filter((item) => item.ts !== Number(ts));
      await write(next);
      return next;
    },

    async clear() {
      await write([]);
      return [];
    },
  };
}
