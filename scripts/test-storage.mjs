// Test cho lib/storage.js — Node thuần với chrome.storage stub (không cần Chrome).
import assert from 'node:assert/strict';
import test from 'node:test';

const data = { local: {}, session: {} };

globalThis.chrome = {
  storage: {
    local: {
      get: async (key) => (key in data.local ? { [key]: data.local[key] } : {}),
      set: async (patch) => Object.assign(data.local, patch),
      remove: async (key) => delete data.local[key],
    },
    session: {
      get: async (key) => (key in data.session ? { [key]: data.session[key] } : {}),
      set: async (patch) => Object.assign(data.session, patch),
      remove: async (key) => delete data.session[key],
    },
    onChanged: { addListener() {}, removeListener() {} },
  },
};

const {
  DEFAULT_SETTINGS,
  HISTORY_KEY,
  SESSION_KEY,
  SETTINGS_KEY,
  clearApiKey,
  clearSessionState,
  exportSettings,
  getSessionState,
  getSettings,
  hasApiKey,
  historyStore,
  maskKey,
  parseSettingsJson,
  saveSessionState,
  saveSettings,
} = await import('../lib/storage.js');

const reset = () => {
  data.local = {};
  data.session = {};
};

test('getSettings: trả default khi chưa lưu gì', async () => {
  reset();
  const settings = await getSettings();
  assert.deepEqual(settings, DEFAULT_SETTINGS);
  assert.equal(settings.provider, 'openai');
  assert.equal(settings.tone, 'natural');
  assert.equal(settings.direction, 'auto');
  assert.equal(settings.apiKey, '');
});

test('saveSettings: gộp patch, giữ key, luôn có v', async () => {
  reset();
  await saveSettings({ apiKey: 'sk-test-1', tone: 'casual' });
  const settings = await saveSettings({ model: 'gpt-4o' });
  assert.equal(settings.model, 'gpt-4o');
  assert.equal(settings.apiKey, 'sk-test-1', 'không mất key khi patch thiếu apiKey');
  assert.equal(settings.tone, 'casual');
  assert.equal(settings.v, 1);
  assert.equal(data.local[SETTINGS_KEY].model, 'gpt-4o', 'đã ghi vào storage.local');
});

test('getSettings: bù default cho bản ghi cũ/thiếu field', async () => {
  reset();
  data.local[SETTINGS_KEY] = { provider: 'gemini', apiKey: 'AIza-x' };
  const settings = await getSettings();
  assert.equal(settings.protocol, 'gemini', 'protocol suy ra từ preset');
  assert.equal(settings.tone, DEFAULT_SETTINGS.tone);
  assert.equal(settings.direction, DEFAULT_SETTINGS.direction);
  assert.equal(settings.apiKey, 'AIza-x');
  assert.equal(settings.v, 1);
});

test('getSettings: protocol cũ không được giữ khi đổi provider', async () => {
  reset();
  data.local[SETTINGS_KEY] = {
    provider: 'anthropic',
    protocol: 'openai', // bản ghi cũ/stale
    baseUrl: 'https://api.anthropic.com',
    model: 'claude-3-5-haiku-latest',
  };
  const settings = await getSettings();
  assert.equal(settings.protocol, 'anthropic', 'protocol luôn theo preset của provider');
});

test('maskKey: che key, không lộ phần giữa', () => {
  assert.equal(maskKey(''), '');
  assert.equal(maskKey('short'), '•••••');
  assert.equal(maskKey('sk-proj-abcdefghijkl3f9a'), 'sk-p…3f9a');
  assert.equal(maskKey('   '), '');
});

test('hasApiKey: provider local được phép không có key', async () => {
  assert.equal(hasApiKey({ provider: 'openai', apiKey: 'sk-x' }), true);
  assert.equal(hasApiKey({ provider: 'openai', apiKey: '   ' }), false);
  assert.equal(hasApiKey({ provider: 'ollama', apiKey: '' }), true);
  assert.equal(hasApiKey({ provider: 'custom', apiKey: '' }), true);
});

test('clearApiKey: xoá key nhưng giữ phần còn lại', async () => {
  reset();
  await saveSettings({ apiKey: 'sk-test-2', model: 'gpt-4o-mini' });
  const settings = await clearApiKey();
  assert.equal(settings.apiKey, '');
  assert.equal(settings.model, 'gpt-4o-mini');
});

test('session: chưa có gì → null', async () => {
  reset();
  assert.equal(await getSessionState(), null);
});

test('session: save → get round-trip', async () => {
  reset();
  await saveSessionState({ input: 'hello', output: 'Hello.' });
  const state = await getSessionState();
  assert.equal(state.input, 'hello');
  assert.equal(state.output, 'Hello.');
  assert.equal(state.explain, '');
  assert.ok(state.ts > 0);
  assert.ok(data.session[SESSION_KEY], 'ghi vào storage.session (không phải local)');
  assert.equal(data.local[SESSION_KEY], undefined);
});

test('session: bỏ qua state cũ hơn 6 giờ', async () => {
  reset();
  data.session[SESSION_KEY] = { input: 'old', output: 'Old.', explain: '', ts: Date.now() - 7 * 60 * 60 * 1000 };
  assert.equal(await getSessionState(), null);
});

test('session: clearSessionState xoá state', async () => {
  reset();
  await saveSessionState({ input: 'x', output: 'X.' });
  await clearSessionState();
  assert.equal(await getSessionState(), null);
});

// ---------------------------------------------------------------------------
// Export / import settings (U7) + lịch sử (U3)
// ---------------------------------------------------------------------------

test('exportSettings: KHÔNG chứa apiKey, có đủ field cấu hình', () => {
  const json = exportSettings({
    ...DEFAULT_SETTINGS,
    apiKey: 'sk-secret-should-not-appear',
    model: 'gpt-4o',
    customInstructions: 'Gọi tôi là Phong',
  });
  assert.ok(!json.includes('sk-secret-should-not-appear'), 'không được lộ key');
  assert.ok(!json.includes('apiKey'));
  const parsed = JSON.parse(json);
  assert.equal(parsed.model, 'gpt-4o');
  assert.equal(parsed.customInstructions, 'Gọi tôi là Phong');
  assert.equal(parsed.provider, DEFAULT_SETTINGS.provider);
});

test('parseSettingsJson: roundtrip với exportSettings', () => {
  const settings = { ...DEFAULT_SETTINGS, provider: 'groq', tone: 'casual', direction: 'vi-to-en' };
  const patch = parseSettingsJson(exportSettings(settings));
  assert.equal(patch.provider, 'groq');
  assert.equal(patch.tone, 'casual');
  assert.equal(patch.direction, 'vi-to-en');
  assert.equal(patch.apiKey, undefined);
});

test('parseSettingsJson: bỏ qua apiKey nếu JSON có', () => {
  const patch = parseSettingsJson(JSON.stringify({ model: 'x', apiKey: 'sk-from-json' }));
  assert.equal(patch.model, 'x');
  assert.equal(patch.apiKey, undefined);
});

test('parseSettingsJson: JSON lỗi/không hợp lệ → throw message tiếng Việt', () => {
  assert.throws(() => parseSettingsJson('{broken'), /JSON không hợp lệ/);
  assert.throws(() => parseSettingsJson('[1,2]'), /phải là một object/);
  assert.throws(() => parseSettingsJson('{}'), /Không có field nào/);
  assert.throws(() => parseSettingsJson('{"provider":"nope"}'), /provider không tồn tại/);
  assert.throws(() => parseSettingsJson('{"tone":"angry"}'), /tone không hợp lệ/);
  assert.throws(() => parseSettingsJson('{"direction":"xx-to-yy"}'), /direction không hợp lệ/);
});

test('DEFAULT_SETTINGS có customInstructions rỗng', () => {
  assert.equal(DEFAULT_SETTINGS.customInstructions, '');
});

test('historyStore: lưu vào chrome.storage.local (không phải session), FIFO + xoá', async () => {
  reset();
  await historyStore.add({ ts: 10, input: 'a', output: 'A.', model: 'gpt-4o-mini' });
  await historyStore.add({ ts: 20, input: 'b', output: 'B.' });

  assert.ok(Array.isArray(data.local[HISTORY_KEY]), 'ghi vào storage.local');
  assert.equal(data.session[HISTORY_KEY], undefined);

  const list = await historyStore.list();
  assert.deepEqual(
    list.map((item) => item.input),
    ['b', 'a'],
  );

  await historyStore.remove(20);
  assert.deepEqual(
    (await historyStore.list()).map((item) => item.input),
    ['a'],
  );

  await historyStore.clear();
  assert.deepEqual(await historyStore.list(), []);
});
