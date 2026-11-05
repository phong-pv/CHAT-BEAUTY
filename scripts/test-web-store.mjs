// Test cho web/store.js — localStorage stub, không cần browser.
import assert from 'node:assert/strict';
import test from 'node:test';

const bag = new Map();
globalThis.window = {
  localStorage: {
    getItem: (key) => (bag.has(key) ? bag.get(key) : null),
    setItem: (key, value) => bag.set(key, String(value)),
    removeItem: (key) => bag.delete(key),
  },
};

const { getSettings, saveSettings } = await import('../web/store.js');
const { DEFAULT_SETTINGS } = await import('../lib/storage.js');

test('getSettings: chưa có gì → default (cùng schema với extension)', () => {
  bag.clear();
  const settings = getSettings();
  assert.equal(settings.provider, DEFAULT_SETTINGS.provider);
  assert.equal(settings.tone, DEFAULT_SETTINGS.tone);
  assert.equal(settings.direction, DEFAULT_SETTINGS.direction);
  assert.equal(settings.apiKey, '');
});

test('saveSettings: lưu vào localStorage và giữ key cũ', () => {
  bag.clear();
  saveSettings({ apiKey: 'sk-web-1', tone: 'casual' });
  const settings = saveSettings({ model: 'gpt-4o' });
  assert.equal(settings.model, 'gpt-4o');
  assert.equal(settings.apiKey, 'sk-web-1');
  assert.equal(settings.tone, 'casual');
  assert.ok(bag.get('chatbeauty.settings'));
});

test('saveSettings: đổi provider thì protocol theo preset (không kế thừa protocol cũ)', () => {
  bag.clear();
  saveSettings({ provider: 'openai' });
  const settings = saveSettings({ provider: 'gemini' });
  assert.equal(settings.protocol, 'gemini');
});

test('getSettings: JSON hỏng → quay về default, không throw', () => {
  bag.clear();
  bag.set('chatbeauty.settings', '{broken');
  assert.equal(getSettings().provider, DEFAULT_SETTINGS.provider);
});
