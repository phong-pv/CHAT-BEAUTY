// Test cho lib/history.js — storage giả in-memory (giữ mảng thật để assert).
import assert from 'node:assert/strict';
import test from 'node:test';

import { HISTORY_LIMIT, makeHistory, normalizeEntry } from '../lib/history.js';

function makeHarness(seed = []) {
  const state = { data: seed };
  const store = makeHistory({
    read: async () => state.data,
    write: async (items) => {
      state.data = items;
    },
  });
  return { store, state };
}

test('normalizeEntry: ép kiểu, cắt độ dài, luôn có ts', () => {
  const entry = normalizeEntry({ input: 'a'.repeat(9000), output: 'ok', tone: 'casual' });
  assert.equal(entry.input.length, 8000);
  assert.equal(entry.tone, 'casual');
  assert.equal(entry.direction, '');
  assert.ok(entry.ts > 0);
});

test('add: mới nhất lên đầu', async () => {
  const { store } = makeHarness();
  await store.add({ ts: 1, input: 'one', output: 'One.' });
  await store.add({ ts: 2, input: 'two', output: 'Two.' });
  const list = await store.list();
  assert.deepEqual(
    list.map((item) => item.input),
    ['two', 'one'],
  );
});

test('add: cắt còn 30 mục', async () => {
  const { store } = makeHarness();
  for (let i = 0; i < 35; i += 1) {
    await store.add({ ts: 1000 + i, input: `msg ${i}`, output: `Msg ${i}.` });
  }
  const list = await store.list();
  assert.equal(list.length, HISTORY_LIMIT);
  assert.equal(list[0].input, 'msg 34');
  assert.equal(list[HISTORY_LIMIT - 1].input, 'msg 5');
});

test('remove + clear', async () => {
  const { store, state } = makeHarness([
    { ts: 1, input: 'a', output: 'A.' },
    { ts: 2, input: 'b', output: 'B.' },
  ]);
  const afterRemove = await store.remove(1);
  assert.deepEqual(
    afterRemove.map((item) => item.ts),
    [2],
  );
  assert.equal(state.data.length, 1);

  const afterClear = await store.clear();
  assert.deepEqual(afterClear, []);
  assert.equal(state.data.length, 0);
});

test('read lỗi hoặc dữ liệu rác → list rỗng, không throw', async () => {
  const broken = makeHistory({
    read: async () => {
      throw new Error('boom');
    },
    write: async () => {},
  });
  assert.deepEqual(await broken.list(), []);

  const garbage = makeHistory({
    read: async () => ['not an entry', null, { input: '', output: '' }],
    write: async () => {},
  });
  assert.deepEqual(await garbage.list(), []);
});
