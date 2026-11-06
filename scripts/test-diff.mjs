// Test cho lib/diff.js — Node thuần, không cần DOM.
import assert from 'node:assert/strict';
import test from 'node:test';

import { diffStats, diffWords, hasVisibleChange, tokenize } from '../lib/diff.js';

test('tokenize: giữ khoảng trắng và dấu câu', () => {
  assert.deepEqual(tokenize('Hi, there!'), ['Hi', ',', ' ', 'there', '!']);
  assert.deepEqual(tokenize(''), []);
  assert.deepEqual(tokenize('  '), ['  ']);
});

test('diffWords: giống nhau → chỉ 1 segment same', () => {
  const segments = diffWords('I went to the store.', 'I went to the store.');
  assert.equal(segments.length, 1);
  assert.equal(segments[0].op, 'same');
  assert.equal(hasVisibleChange(segments), false);
});

test('diffWords: sửa ngữ pháp (bỏ "has")', () => {
  const segments = diffWords('I has went to the store.', 'I went to the store.');
  const removed = segments.filter((s) => s.op === 'del').map((s) => s.text).join('');
  const added = segments.filter((s) => s.op === 'add').map((s) => s.text).join('');
  assert.equal(removed.trim(), 'has');
  assert.equal(added.trim(), '');
  assert.equal(hasVisibleChange(segments), true);
  assert.deepEqual(diffStats(segments), { added: 0, removed: 1 });
});

test('diffWords: thay từ (del + add)', () => {
  const segments = diffWords('He seemed not satisfied', 'He seemed unsatisfied');
  const stats = diffStats(segments);
  assert.ok(stats.added > 0);
  assert.ok(stats.removed > 0);
});

test('diffWords: thêm câu ở cuối', () => {
  const segments = diffWords('I will finish it', 'I will finish it by tomorrow');
  const added = segments.filter((s) => s.op === 'add').map((s) => s.text).join('');
  assert.match(added, /by tomorrow/);
});

test('diffWords: tiếng Việt + emoji không làm vỡ tokenizer', () => {
  const segments = diffWords('mai mình họp nhé 👍', 'mai mình họp lúc 9h nhé 👍');
  const added = segments.filter((s) => s.op === 'add').map((s) => s.text).join('');
  assert.match(added, /9h/);
});

test('diffWords: chuỗi rỗng', () => {
  assert.deepEqual(diffWords('', ''), []);
  const onlyAdd = diffWords('', 'hello');
  assert.deepEqual(diffStats(onlyAdd), { added: 1, removed: 0 });
  const onlyDel = diffWords('hello', '');
  assert.deepEqual(diffStats(onlyDel), { added: 0, removed: 1 });
});

test('diffWords: tôn trọng maxTokens (không nổ O(n·m))', () => {
  const long = 'word '.repeat(5000);
  const segments = diffWords(long, `${long}extra`, { maxTokens: 50 });
  const tokens = segments.reduce((sum, segment) => sum + tokenize(segment.text).length, 0);
  assert.ok(tokens <= 100, `số token phải bị cắt (thực tế ${tokens})`);
});
