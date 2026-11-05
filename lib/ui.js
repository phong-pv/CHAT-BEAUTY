// DOM + clipboard helpers dùng chung cho popup và options. Không gọi mạng, không đọc storage.

/** @param {string} selector @param {ParentNode} [root] */
export const $ = (selector, root = document) => root.querySelector(selector);

/**
 * Ghi status line. kind: 'info' | 'error' | 'ok'
 * @param {HTMLElement|null} el
 * @param {string} message
 * @param {'info'|'error'|'ok'} [kind]
 */
export function setStatus(el, message, kind = 'info') {
  if (!el) return;
  el.textContent = message;
  el.dataset.kind = kind;
}

/**
 * Copy text, fallback cho trường hợp clipboard API bị từ chối.
 * @param {string} text
 * @returns {Promise<boolean>}
 */
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.top = '-1000px';
    ta.setAttribute('readonly', '');
    document.body.append(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }
}

let toastTimer = 0;

/** Toast ngắn ở đáy popup (element #toast). */
export function showToast(message, ms = 1600) {
  const el = $('#toast');
  if (!el) return;
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.hidden = true;
  }, ms);
}
