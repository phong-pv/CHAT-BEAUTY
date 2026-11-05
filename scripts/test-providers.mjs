// Test cho lib/providers.js — chạy bằng Node, KHÔNG cần Chrome, KHÔNG cần API key.
//   npm test            (node --test scripts/)
// fetch được stub để kiểm tra URL/header/body, parse response và map lỗi.
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PROVIDER_PRESETS,
  ProviderError,
  buildRequest,
  deltaFromChunk,
  finishFromChunk,
  generate,
  isTruncated,
  originPattern,
  parseText,
  request,
  sseEvents,
  testConnection,
  validateConfig,
} from '../lib/providers.js';

const OPENAI = {
  provider: 'openai',
  protocol: 'openai',
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-4o-mini',
  apiKey: 'sk-test-123456',
};
const GEMINI = {
  provider: 'gemini',
  protocol: 'gemini',
  baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
  model: 'gemini-2.0-flash',
  apiKey: 'AIza-test',
};
const ANTHROPIC = {
  provider: 'anthropic',
  protocol: 'anthropic',
  baseUrl: 'https://api.anthropic.com',
  model: 'claude-3-5-haiku-latest',
  apiKey: 'sk-ant-test',
};
const MESSAGES = [
  { role: 'system', content: 'SYSTEM' },
  { role: 'user', content: 'hello there' },
];

/** Gắn fetch giả. Trả về mảng để kiểm tra số lần gọi. */
function stubFetch(handler) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return handler(url, init);
  };
  return calls;
}

const jsonResponse = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
  text: async () => JSON.stringify(body),
});

test('buildRequest: openai-compatible', () => {
  const { url, init } = buildRequest({ config: OPENAI, messages: MESSAGES });
  assert.equal(url, 'https://api.openai.com/v1/chat/completions');
  assert.equal(init.method, 'POST');
  assert.equal(init.headers.authorization, 'Bearer sk-test-123456');
  const body = JSON.parse(init.body);
  assert.equal(body.model, 'gpt-4o-mini');
  assert.equal(body.stream, undefined);
  assert.deepEqual(body.messages, MESSAGES);
});

test('buildRequest: openai stream + baseUrl dư dấu /', () => {
  const { url, init } = buildRequest({
    config: { ...OPENAI, baseUrl: 'https://api.openai.com/v1//' },
    messages: MESSAGES,
    stream: true,
  });
  assert.equal(url, 'https://api.openai.com/v1/chat/completions');
  assert.equal(JSON.parse(init.body).stream, true);
});

test('buildRequest: openrouter thêm header xếp hạng', () => {
  const { init } = buildRequest({
    config: { ...OPENAI, provider: 'openrouter', baseUrl: PROVIDER_PRESETS.openrouter.baseUrl },
    messages: MESSAGES,
  });
  assert.equal(init.headers['X-Title'], 'ChatBeauty');
});

test('buildRequest: gemini tách systemInstruction, key ở header', () => {
  const { url, init } = buildRequest({ config: GEMINI, messages: MESSAGES });
  assert.equal(
    url,
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
  );
  assert.equal(init.headers['x-goog-api-key'], 'AIza-test');
  const body = JSON.parse(init.body);
  assert.deepEqual(body.systemInstruction, { parts: [{ text: 'SYSTEM' }] });
  assert.equal(body.contents.length, 1);
  assert.equal(body.contents[0].role, 'user');
  assert.ok(!url.includes('AIza-test'), 'key không được nằm trong URL');
});

test('buildRequest: gemini stream dùng alt=sse', () => {
  const { url } = buildRequest({ config: GEMINI, messages: MESSAGES, stream: true });
  assert.ok(url.endsWith(':streamGenerateContent?alt=sse'), url);
});

test('buildRequest: anthropic header bắt buộc cho browser', () => {
  const { url, init } = buildRequest({ config: ANTHROPIC, messages: MESSAGES });
  assert.equal(url, 'https://api.anthropic.com/v1/messages');
  assert.equal(init.headers['x-api-key'], 'sk-ant-test');
  assert.equal(init.headers['anthropic-version'], '2023-06-01');
  assert.equal(init.headers['anthropic-dangerous-direct-browser-access'], 'true');
  const body = JSON.parse(init.body);
  assert.equal(body.system, 'SYSTEM');
  assert.equal(body.messages.length, 1);
});

test('buildRequest: anthropic baseUrl đã có /v1 thì không lặp', () => {
  const { url } = buildRequest({
    config: { ...ANTHROPIC, baseUrl: 'https://api.anthropic.com/v1' },
    messages: MESSAGES,
  });
  assert.equal(url, 'https://api.anthropic.com/v1/messages');
});

test('parseText: 3 schema', () => {
  assert.equal(parseText('openai', { choices: [{ message: { content: 'A' } }] }), 'A');
  assert.equal(
    parseText('gemini', { candidates: [{ content: { parts: [{ text: 'B1' }, { text: 'B2' }] } }] }),
    'B1B2',
  );
  assert.equal(parseText('anthropic', { content: [{ type: 'text', text: 'C' }, { type: 'tool_use' }] }), 'C');
  assert.equal(parseText('openai', null), '');
});

test('validateConfig: bắt lỗi thiếu trường, cho phép provider local', () => {
  assert.equal(validateConfig(OPENAI), '');
  assert.equal(validateConfig({ ...OPENAI, baseUrl: '' }), 'Chưa có Base URL.');
  assert.equal(
    validateConfig({ ...OPENAI, baseUrl: 'ftp://x' }),
    'Base URL phải bắt đầu bằng http:// hoặc https://.',
  );
  assert.equal(validateConfig({ ...OPENAI, baseUrl: 'not a url' }), 'Base URL không hợp lệ.');
  assert.equal(validateConfig({ ...OPENAI, model: '  ' }), 'Chưa có model.');
  assert.equal(validateConfig({ ...OPENAI, apiKey: '' }), 'Chưa có API key.');
  assert.equal(validateConfig({ ...OPENAI, provider: 'ollama', apiKey: '' }), '');
  assert.equal(validateConfig({ ...OPENAI, provider: 'custom', apiKey: '' }), '');
});

test('originPattern: lấy origin cho chrome.permissions', () => {
  assert.equal(originPattern('https://api.openai.com/v1'), 'https://api.openai.com/*');
  assert.equal(originPattern('http://localhost:11434/v1'), 'http://localhost:11434/*');
});

test('request: 200 → trả text + ms', async () => {
  const calls = stubFetch(() => jsonResponse({ choices: [{ message: { content: ' ok ' } }] }));
  const result = await request({ config: OPENAI, messages: MESSAGES });
  assert.equal(result.text, ' ok ');
  assert.equal(typeof result.ms, 'number');
  assert.equal(calls.length, 1);
});

test('request: 401 → message tiếng Việt, settings=true, không lộ key', async () => {
  stubFetch(() => jsonResponse({ error: { message: 'Incorrect API key provided: sk-test-123456' } }, 401));
  await assert.rejects(
    () => request({ config: OPENAI, messages: MESSAGES }),
    (error) => {
      assert.ok(error instanceof ProviderError);
      assert.match(error.message, /API key không hợp lệ/);
      assert.equal(error.settings, true);
      assert.ok(!error.message.includes('sk-test-123456'), 'key không được xuất hiện trong message');
      return true;
    },
  );
});

test('request: 429 → retryable, giữ message của provider', async () => {
  stubFetch(() => jsonResponse({ error: { message: 'Rate limit reached' } }, 429));
  await assert.rejects(
    () => request({ config: OPENAI, messages: MESSAGES }),
    (error) => {
      assert.equal(error.retryable, true);
      assert.match(error.message, /rate limit/i);
      assert.match(error.message, /Rate limit reached/);
      return true;
    },
  );
});

test('request: lỗi mạng → message có host', async () => {
  globalThis.fetch = async () => {
    throw new TypeError('Failed to fetch');
  };
  await assert.rejects(
    () => request({ config: OPENAI, messages: MESSAGES }),
    (error) => {
      assert.match(error.message, /Không kết nối được tới api\.openai\.com/);
      assert.equal(error.retryable, true);
      return true;
    },
  );
});

test('request: 200 nhưng không phải JSON → báo lỗi đọc dữ liệu', async () => {
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => {
      throw new SyntaxError('Unexpected token <');
    },
  });
  await assert.rejects(() => request({ config: OPENAI, messages: MESSAGES }), /không đọc được/);
});

test('request: config sai thì không gọi mạng', async () => {
  const calls = stubFetch(() => jsonResponse({}));
  await assert.rejects(
    () => request({ config: { ...OPENAI, apiKey: '' }, messages: MESSAGES }),
    /Chưa có API key/,
  );
  assert.equal(calls.length, 0);
});

test('testConnection: trả ms + sample', async () => {
  stubFetch(() => jsonResponse({ choices: [{ message: { content: 'ok' } }] }));
  const { ms, sample } = await testConnection(OPENAI);
  assert.equal(typeof ms, 'number');
  assert.equal(sample, 'ok');
});

// ---------------------------------------------------------------------------
// Streaming
// ---------------------------------------------------------------------------

const encoder = new TextEncoder();
const sse = (obj) => `data: ${JSON.stringify(obj)}\n\n`;

/** Response giả có body stream từ danh sách chunk string. */
function streamResponse(chunks, status = 200) {
  const body = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return { ok: status < 300, status, body, text: async () => '', json: async () => ({}) };
}

async function collect(body) {
  const events = [];
  for await (const payload of sseEvents(body)) events.push(payload);
  return events;
}

test('sseEvents: chunk bị cắt giữa dòng', async () => {
  const response = streamResponse(['data: {"a"', ':1}\n\ndata: {"a":2}\n\n']);
  assert.deepEqual(await collect(response.body), ['{"a":1}', '{"a":2}']);
});

test('sseEvents: dừng ở [DONE], bỏ qua comment/dòng rỗng, hiểu CRLF', async () => {
  const response = streamResponse([
    ': ping\n\n',
    '\n',
    'data: {"a":1}\r\n\r\n',
    'data: [DONE]\n\n',
    'data: {"a":9}\n\n',
  ]);
  assert.deepEqual(await collect(response.body), ['{"a":1}']);
});

test('deltaFromChunk: 3 protocol', () => {
  assert.equal(deltaFromChunk('openai', { choices: [{ delta: { content: 'A' } }] }), 'A');
  assert.equal(deltaFromChunk('openai', { choices: [{ delta: {} }] }), '');
  assert.equal(
    deltaFromChunk('gemini', { candidates: [{ content: { parts: [{ text: 'B1' }, { text: 'B2' }] } }] }),
    'B1B2',
  );
  assert.equal(
    deltaFromChunk('anthropic', { type: 'content_block_delta', delta: { type: 'text_delta', text: 'C' } }),
    'C',
  );
  assert.equal(deltaFromChunk('anthropic', { type: 'message_start' }), '');
});

test('generate: openai stream gọi onDelta theo từng chunk', async () => {
  const calls = stubFetch(() =>
    streamResponse([
      sse({ choices: [{ delta: { content: 'Hello' } }] }),
      sse({ choices: [{ delta: { content: ' world' } }] }),
      'data: [DONE]\n\n',
    ]),
  );
  const deltas = [];
  const result = await generate({ config: OPENAI, messages: MESSAGES, onDelta: (d) => deltas.push(d) });
  assert.equal(result.text, 'Hello world');
  assert.deepEqual(deltas, ['Hello', ' world']);
  assert.equal(typeof result.ms, 'number');
  assert.equal(JSON.parse(calls[0].init.body).stream, true);
  assert.equal(calls[0].url, 'https://api.openai.com/v1/chat/completions');
});

test('generate: gemini stream', async () => {
  stubFetch(() =>
    streamResponse([
      sse({ candidates: [{ content: { parts: [{ text: 'Xin' }] } }] }),
      sse({ candidates: [{ content: { parts: [{ text: ' chào' }] } }] }),
    ]),
  );
  const result = await generate({ config: GEMINI, messages: MESSAGES });
  assert.equal(result.text, 'Xin chào');
});

test('generate: anthropic bỏ qua event không phải delta', async () => {
  stubFetch(() =>
    streamResponse([
      sse({ type: 'message_start' }),
      sse({ type: 'content_block_start' }),
      sse({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hi' } }),
      sse({ type: 'message_stop' }),
    ]),
  );
  const result = await generate({ config: ANTHROPIC, messages: MESSAGES });
  assert.equal(result.text, 'Hi');
});

test('generate: chunk JSON hỏng được bỏ qua, stream vẫn tiếp', async () => {
  stubFetch(() =>
    streamResponse(['data: {oops\n\n', sse({ choices: [{ delta: { content: 'ok' } }] }), 'data: [DONE]\n\n']),
  );
  const result = await generate({ config: OPENAI, messages: MESSAGES });
  assert.equal(result.text, 'ok');
});

test('generate: provider không stream → đọc JSON một lần', async () => {
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ choices: [{ message: { content: 'whole' } }] }),
  });
  const deltas = [];
  const result = await generate({ config: OPENAI, messages: MESSAGES, onDelta: (d) => deltas.push(d) });
  assert.equal(result.text, 'whole');
  assert.deepEqual(deltas, ['whole']);
});

test('generate: 401 → message tiếng Việt, settings=true, không lộ key', async () => {
  stubFetch(() => ({
    ok: false,
    status: 401,
    text: async () => JSON.stringify({ error: { message: 'Incorrect API key provided: sk-test-123456' } }),
  }));
  await assert.rejects(
    () => generate({ config: OPENAI, messages: MESSAGES }),
    (error) => {
      assert.ok(error instanceof ProviderError);
      assert.match(error.message, /API key không hợp lệ/);
      assert.equal(error.settings, true);
      assert.ok(!error.message.includes('sk-test-123456'));
      return true;
    },
  );
});

test('generate: abort giữa stream → AbortError, giữ phần đã nhận', async () => {
  stubFetch(() =>
    streamResponse([
      sse({ choices: [{ delta: { content: 'a' } }] }),
      sse({ choices: [{ delta: { content: 'b' } }] }),
    ]),
  );
  const abort = new AbortController();
  let seen = '';
  await assert.rejects(
    () =>
      generate({
        config: OPENAI,
        messages: MESSAGES,
        signal: abort.signal,
        onDelta: (delta) => {
          seen += delta;
          abort.abort();
        },
      }),
    (error) => error.name === 'AbortError',
  );
  assert.equal(seen, 'a');
});

test('generate: stream toàn delta rỗng → báo nội dung rỗng', async () => {
  stubFetch(() => streamResponse([sse({ choices: [{ delta: {} }] }), 'data: [DONE]\n\n']));
  await assert.rejects(() => generate({ config: OPENAI, messages: MESSAGES }), /nội dung rỗng/);
});

test('generate: không có payload nào → báo stream không hợp lệ', async () => {
  stubFetch(() => streamResponse([': ping\n\n', 'data: [DONE]\n\n']));
  await assert.rejects(() => generate({ config: OPENAI, messages: MESSAGES }), /stream hợp lệ/);
});

// ---------------------------------------------------------------------------
// Phát hiện output bị cắt (finish_reason)
// ---------------------------------------------------------------------------

test('finishFromChunk: 3 protocol + nhận diện truncated', () => {
  assert.equal(finishFromChunk('openai', { choices: [{ finish_reason: 'stop' }] }), 'stop');
  assert.equal(finishFromChunk('gemini', { candidates: [{ finishReason: 'MAX_TOKENS' }] }), 'MAX_TOKENS');
  assert.equal(
    finishFromChunk('anthropic', { type: 'message_delta', delta: { stop_reason: 'max_tokens' } }),
    'max_tokens',
  );
  assert.equal(finishFromChunk('anthropic', { type: 'content_block_delta' }), '');
  assert.equal(finishFromChunk('openai', { choices: [{ delta: {} }] }), '');

  assert.equal(isTruncated('length'), true);
  assert.equal(isTruncated('max_tokens'), true);
  assert.equal(isTruncated('MAX_TOKENS'), true);
  assert.equal(isTruncated('stop'), false);
  assert.equal(isTruncated(''), false);
});

test('generate: finish_reason=length → truncated=true (output bị cụt)', async () => {
  stubFetch(() =>
    streamResponse([
      sse({ choices: [{ delta: { content: "I'll finish it by tomorrow" } }] }),
      sse({ choices: [{ delta: {}, finish_reason: 'length' }] }),
      'data: [DONE]\n\n',
    ]),
  );
  const result = await generate({ config: OPENAI, messages: MESSAGES });
  assert.equal(result.text, "I'll finish it by tomorrow");
  assert.equal(result.finishReason, 'length');
  assert.equal(result.truncated, true);
});

test('generate: finish_reason=stop → truncated=false', async () => {
  stubFetch(() =>
    streamResponse([
      sse({ choices: [{ delta: { content: 'done' } }] }),
      sse({ choices: [{ delta: {}, finish_reason: 'stop' }] }),
    ]),
  );
  const result = await generate({ config: OPENAI, messages: MESSAGES });
  assert.equal(result.truncated, false);
});

test('generate: gemini MAX_TOKENS trong stream → truncated=true', async () => {
  stubFetch(() =>
    streamResponse([
      sse({ candidates: [{ content: { parts: [{ text: 'Xin' }] } }] }),
      sse({ candidates: [{ content: { parts: [] }, finishReason: 'MAX_TOKENS' }] }),
    ]),
  );
  const result = await generate({ config: GEMINI, messages: MESSAGES });
  assert.equal(result.finishReason, 'MAX_TOKENS');
  assert.equal(result.truncated, true);
});

test('request: trả finishReason/truncated cho non-stream', async () => {
  stubFetch(() => jsonResponse({ choices: [{ message: { content: 'ok' }, finish_reason: 'length' }] }));
  const result = await request({ config: OPENAI, messages: MESSAGES });
  assert.equal(result.finishReason, 'length');
  assert.equal(result.truncated, true);
});
