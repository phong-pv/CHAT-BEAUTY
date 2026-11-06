// So sánh từ-level để highlight "đã sửa gì" (U1). Không dependency, giới hạn token để không chậm.

/** Tách thành token giữ cả khoảng trắng và dấu câu để render lại đúng như bản gốc. */
const TOKEN_RE = /(\s+)|([\p{L}\p{N}_'’-]+)|([^\s\p{L}\p{N}_])/gu;

export function tokenize(text) {
  return String(text ?? '').match(TOKEN_RE) ?? [];
}

/**
 * LCS word-level. Trả về mảng segment đã gộp: [{op:'same'|'add'|'del', text}].
 * `add` = có trong bản mới, `del` = chỉ có ở bản cũ.
 * @param {string} before
 * @param {string} after
 * @param {{maxTokens?:number}} [options] giới hạn để tránh O(n·m) quá lớn
 */
export function diffWords(before, after, { maxTokens = 1200 } = {}) {
  const a = tokenize(before).slice(0, maxTokens);
  const b = tokenize(after).slice(0, maxTokens);
  const n = a.length;
  const m = b.length;

  // dp[i][j] = độ dài LCS của a[i..] và b[j..]
  const width = m + 1;
  const dp = new Int32Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      dp[i * width + j] =
        a[i] === b[j]
          ? dp[(i + 1) * width + j + 1] + 1
          : Math.max(dp[(i + 1) * width + j], dp[i * width + j + 1]);
    }
  }

  const segments = [];
  const push = (op, text) => {
    if (!text) return;
    const last = segments[segments.length - 1];
    if (last && last.op === op) last.text += text;
    else segments.push({ op, text });
  };

  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      push('same', a[i]);
      i += 1;
      j += 1;
    } else if (dp[(i + 1) * width + j] >= dp[i * width + j + 1]) {
      push('del', a[i]);
      i += 1;
    } else {
      push('add', b[j]);
      j += 1;
    }
  }
  while (i < n) push('del', a[i++]);
  while (j < m) push('add', b[j++]);

  return segments;
}

/** Đếm số token thêm/bớt (đã bỏ khoảng trắng thuần). */
export function diffStats(segments) {
  let added = 0;
  let removed = 0;
  for (const segment of segments) {
    if (segment.op === 'add' && segment.text.trim()) added += 1;
    if (segment.op === 'del' && segment.text.trim()) removed += 1;
  }
  return { added, removed };
}

/** Có thay đổi đáng hiển thị không (bỏ qua khác biệt khoảng trắng). */
export function hasVisibleChange(segments) {
  const { added, removed } = diffStats(segments);
  return added > 0 || removed > 0;
}
