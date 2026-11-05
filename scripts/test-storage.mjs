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
  SESSION_KEY,
  SETTINGS_KEY,
  clearApiKey,
  clearSessionState,
  getSessionState,
  getSettings,
  hasApiKey,
  maskKey,
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
