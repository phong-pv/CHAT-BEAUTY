// Preset provider + lớp HTTP dùng chung cho cả 3 protocol.
// P2: validateConfig / buildRequest / request / testConnection (không streaming).
// P3: generate() streaming sẽ tái sử dụng đúng buildRequest + parseText ở dưới.

/**
 * @typedef {Object} ProviderConfig
 * @property {string} provider  id preset (openai, openrouter, …, custom)
 * @property {'openai'|'gemini'|'anthropic'} protocol
 * @property {string} baseUrl
 * @property {string} model
 * @property {string} apiKey
 */

/** @typedef {{role:'system'|'user'|'assistant', content:string}} Message */

export const PROVIDER_PRESETS = {
  openai: {
    label: 'OpenAI',
    protocol: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    keyUrl: 'https://platform.openai.com/api-keys',
  },
  openrouter: {
    label: 'OpenRouter',
    protocol: 'openai',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'openai/gpt-4o-mini',
    keyUrl: 'https://openrouter.ai/keys',
    extraHeaders: { 'HTTP-Referer': 'https://github.com/chatbeauty', 'X-Title': 'ChatBeauty' },
  },
  groq: {
    label: 'Groq',
    protocol: 'openai',
    baseUrl: 'https://api.groq.com/openai/v1',
    model: 'llama-3.3-70b-versatile',
    keyUrl: 'https://console.groq.com/keys',
  },
  deepseek: {
    label: 'DeepSeek',
    protocol: 'openai',
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    keyUrl: 'https://platform.deepseek.com/api_keys',
  },
  gemini: {
    label: 'Google Gemini',
    protocol: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    model: 'gemini-2.0-flash', // chưa xác nhận — verify ở P3
    keyUrl: 'https://aistudio.google.com/apikey',
  },
  anthropic: {
    label: 'Anthropic',
    protocol: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    model: 'claude-3-5-haiku-latest', // chưa xác nhận — verify ở P3
    keyUrl: 'https://console.anthropic.com/settings/keys',
  },
  ollama: {
    label: 'Ollama (local)',
    protocol: 'openai',
    baseUrl: 'http://localhost:11434/v1',
    model: 'llama3.1',
    keyOptional: true,
  },
  custom: {
    label: 'Custom (OpenAI-compatible)',
    protocol: 'openai',
    baseUrl: '',
    model: '',
    keyOptional: true,
    custom: true,
  },
};

export const ANTHROPIC_VERSION = '2023-06-01';

export class ProviderError extends Error {
  /**
   * @param {string} message
   * @param {{status?:number, retryable?:boolean, settings?:boolean}} [meta]
   */
  constructor(message, { status = 0, retryable = false, settings = false } = {}) {
    super(message);
    this.name = 'ProviderError';
    this.status = status;
    this.retryable = retryable;
    this.settings = settings;
  }
}

export const trimSlash = (url) => String(url || '').trim().replace(/\/+$/, '');

export const protocolOf = (config) =>
  config?.protocol || PROVIDER_PRESETS[config?.provider]?.protocol || 'openai';

/** Origin dạng pattern cho `chrome.permissions.request({origins})`. */
export function originPattern(baseUrl) {
  return `${new URL(trimSlash(baseUrl)).origin}/*`;
}

/** @returns {string} chuỗi rỗng nếu config hợp lệ, ngược lại là message tiếng Việt. */
export function validateConfig(config) {
  const preset = PROVIDER_PRESETS[config?.provider] ?? {};
  const baseUrl = trimSlash(config?.baseUrl);
  if (!baseUrl) return 'Chưa có Base URL.';
  try {
    const parsed = new URL(baseUrl);
    if (!/^https?:$/.test(parsed.protocol)) return 'Base URL phải bắt đầu bằng http:// hoặc https://.';
  } catch {
    return 'Base URL không hợp lệ.';
  }
  if (!String(config?.model || '').trim()) return 'Chưa có model.';
  if (!String(config?.apiKey || '').trim() && !preset.keyOptional) return 'Chưa có API key.';
  return '';
}

/**
 * Dựng URL + fetch init cho mọi protocol.
 * @param {{config:ProviderConfig, messages:Message[], stream?:boolean, maxTokens?:number, temperature?:number}} input
 * @returns {{url:string, init:RequestInit}}
 */
export function buildRequest({ config, messages, stream = false, maxTokens = 1024, temperature = 0.4 }) {
  const protocol = protocolOf(config);
  const base = trimSlash(config.baseUrl);
  const key = String(config.apiKey || '').trim();
  const system = messages
    .filter((message) => message.role === 'system')
    .map((message) => message.content)
    .join('\n\n');
  const chat = messages.filter((message) => message.role !== 'system');

  const json = (body, headers) => ({
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });

  if (protocol === 'gemini') {
    const method = stream ? 'streamGenerateContent?alt=sse' : 'generateContent';
    return {
      url: `${base}/models/${encodeURIComponent(config.model)}:${method}`,
      // key đi qua header để không lộ trong URL log
      init: json(
        {
          contents: chat.map((message) => ({
            role: message.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: message.content }],
          })),
          generationConfig: { temperature, maxOutputTokens: maxTokens },
          ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
        },
        { 'x-goog-api-key': key },
      ),
    };
  }

  if (protocol === 'anthropic') {
    return {
      url: /\/v1$/.test(base) ? `${base}/messages` : `${base}/v1/messages`,
      init: json(
        {
          model: config.model,
          max_tokens: maxTokens,
          temperature,
          ...(system ? { system } : {}),
          messages: chat,
          ...(stream ? { stream: true } : {}),
        },
        {
          'x-api-key': key,
          'anthropic-version': ANTHROPIC_VERSION,
          // bắt buộc để gọi Anthropic từ browser
          'anthropic-dangerous-direct-browser-access': 'true',
        },
      ),
    };
  }

  const preset = PROVIDER_PRESETS[config.provider] ?? {};
  return {
    url: `${base}/chat/completions`,
    init: json(
      {
        model: config.model,
        messages,
        temperature,
        max_tokens: maxTokens,
        ...(stream ? { stream: true } : {}),
      },
      { authorization: `Bearer ${key}`, ...(preset.extraHeaders ?? {}) },
    ),
  };
}

/** Rút text từ JSON response (mỗi protocol một schema). */
export function parseText(protocol, json) {
  if (protocol === 'gemini') {
    const parts = json?.candidates?.[0]?.content?.parts ?? [];
    return parts.map((part) => part?.text ?? '').join('');
  }
  if (protocol === 'anthropic') {
    const blocks = json?.content ?? [];
    return blocks
      .filter((block) => block?.type === 'text')
      .map((block) => block.text)
      .join('');
  }
  return json?.choices?.[0]?.message?.content ?? '';
}

const STATUS_MESSAGES = {
  400: 'Request bị provider từ chối.',
  401: 'API key không hợp lệ hoặc đã bị thu hồi.',
  402: 'Tài khoản provider hết credit.',
  403: 'API key không có quyền dùng model này.',
  404: 'Không tìm thấy model hoặc endpoint.',
  429: 'Bị rate limit. Thử lại sau vài giây.',
};

/** Xoá key khỏi text trước khi hiển thị/log (provider đôi khi echo lại key trong error). */
function redactSecrets(text, apiKey) {
  let out = String(text ?? '');
  const key = String(apiKey || '').trim();
  if (key) out = out.split(key).join('[redacted]');
  return out.replace(/\b(sk|AIza|sk-ant)[-_A-Za-z0-9]{6,}/g, '[redacted]');
}

/** @returns {Promise<ProviderError>} */
async function errorFromResponse(response, apiKey) {
  const status = response.status;
  let detail = '';
  try {
    detail = (await response.text()).slice(0, 400);
  } catch {
    detail = '';
  }
  let providerMessage = '';
  try {
    const parsed = JSON.parse(detail);
    providerMessage = parsed?.error?.message ?? parsed?.message ?? '';
  } catch {
    providerMessage = '';
  }
  providerMessage = redactSecrets(providerMessage, apiKey);

  const base =
    STATUS_MESSAGES[status] ??
    (status >= 500 ? 'Provider đang lỗi. Thử lại sau.' : `Provider trả về lỗi ${status}.`);
  return new ProviderError(providerMessage ? `${base} (${providerMessage.slice(0, 160)})` : base, {
    status,
    retryable: status === 402 || status === 429 || status >= 500,
    settings: status === 401 || status === 403 || status === 404,
  });
}

/**
 * Request không streaming.
 * @param {{config:ProviderConfig, messages:Message[], signal?:AbortSignal, maxTokens?:number, temperature?:number}} input
 * @returns {Promise<{text:string, usage:unknown, ms:number}>}
 */
export async function request({ config, messages, signal, maxTokens = 1024, temperature = 0.4 }) {
  const invalid = validateConfig(config);
  if (invalid) throw new ProviderError(invalid, { settings: true });

  const protocol = protocolOf(config);
  const { url, init } = buildRequest({ config, messages, stream: false, maxTokens, temperature });
  const startedAt = Date.now();

  let response;
  try {
    response = await fetch(url, { ...init, signal });
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    throw new ProviderError(
      `Không kết nối được tới ${new URL(url).host}. Kiểm tra Base URL hoặc kết nối mạng.`,
      { retryable: true, settings: true },
    );
  }

  if (!response.ok) throw await errorFromResponse(response, config.apiKey);

  let json;
  try {
    json = await response.json();
  } catch {
    throw new ProviderError('Provider trả về dữ liệu không đọc được (không phải JSON).', {
      status: response.status,
      retryable: true,
    });
  }

  const finishReason =
    finishFromChunk(protocol, json) || (protocol === 'anthropic' ? (json?.stop_reason ?? '') : '');

  return {
    text: parseText(protocol, json),
    usage: json?.usage ?? null,
    ms: Date.now() - startedAt,
    finishReason,
    truncated: isTruncated(finishReason),
  };
}

/**
 * Gọi 1 request rất ngắn để kiểm tra key / baseUrl / model.
 * @param {ProviderConfig} config
 * @param {{signal?:AbortSignal}} [options]
 * @returns {Promise<{ms:number, sample:string}>}
 */
export async function testConnection(config, { signal } = {}) {
  const { text, ms } = await request({
    config,
    messages: [{ role: 'user', content: 'Reply with the single word: ok' }],
    maxTokens: 16,
    temperature: 0,
    signal,
  });
  return { ms, sample: String(text).trim().slice(0, 80) };
}

// ---------------------------------------------------------------------------
// Streaming (SSE) — docs/providers-byok.md §4
// ---------------------------------------------------------------------------

/** Rút text delta khỏi 1 object JSON trong stream (schema khác nhau mỗi protocol). */
export function deltaFromChunk(protocol, json) {
  if (protocol === 'gemini') {
    const parts = json?.candidates?.[0]?.content?.parts ?? [];
    return parts.map((part) => part?.text ?? '').join('');
  }
  if (protocol === 'anthropic') {
    if (json?.type !== 'content_block_delta') return '';
    return json?.delta?.text ?? '';
  }
  return json?.choices?.[0]?.delta?.content ?? '';
}

/** Lý do kết thúc stream (nếu provider gửi) — dùng để phát hiện output bị cắt. */
export function finishFromChunk(protocol, json) {
  if (protocol === 'gemini') return json?.candidates?.[0]?.finishReason ?? '';
  if (protocol === 'anthropic') {
    return json?.type === 'message_delta' ? (json?.delta?.stop_reason ?? '') : '';
  }
  return json?.choices?.[0]?.finish_reason ?? '';
}

/** Các giá trị finish reason nghĩa là "hết budget token" → output có thể bị cụt. */
const TRUNCATED_REASONS = new Set(['length', 'max_tokens', 'max_output_tokens', 'MAX_TOKENS', 'model_length']);

export const isTruncated = (reason) => TRUNCATED_REASONS.has(String(reason || ''));

/** Lấy payload của 1 dòng SSE. Trả về null nếu không phải dòng dữ liệu. */
function parseSseLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith(':')) return null;
  if (!trimmed.startsWith('data:')) return null;
  return trimmed.slice(5).trim();
}

/**
 * Đọc body stream → yield từng payload JSON (string), dừng ở `[DONE]`.
 * Chịu được: chunk cắt giữa dòng, dòng rỗng, comment `:` của SSE.
 * @param {ReadableStream<Uint8Array>} body
 */
export async function* sseEvents(body) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let newline;
      while ((newline = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        const payload = parseSseLine(line);
        if (payload === null) continue;
        if (payload === '[DONE]') return;
        yield payload;
      }
    }

    const tail = parseSseLine(buffer);
    if (tail && tail !== '[DONE]') yield tail;
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /* stream đã đóng */
    }
  }
}

/**
 * Gọi provider ở chế độ streaming, đẩy từng phần text qua `onDelta`.
 * @param {{config:ProviderConfig, messages:Message[], onDelta?:(text:string)=>void, signal?:AbortSignal, maxTokens?:number, temperature?:number}} input
 * @returns {Promise<{text:string, ms:number}>}
 */
export async function generate({
  config,
  messages,
  onDelta = () => {},
  signal,
  maxTokens = 1024,
  temperature = 0.4,
}) {
  const invalid = validateConfig(config);
  if (invalid) throw new ProviderError(invalid, { settings: true });

  const protocol = protocolOf(config);
  const { url, init } = buildRequest({ config, messages, stream: true, maxTokens, temperature });
  const startedAt = Date.now();

  let response;
  try {
    response = await fetch(url, { ...init, signal });
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    throw new ProviderError(
      `Không kết nối được tới ${new URL(url).host}. Kiểm tra Base URL hoặc kết nối mạng.`,
      { retryable: true, settings: true },
    );
  }

  if (!response.ok) throw await errorFromResponse(response, config.apiKey);

  // Provider (hoặc môi trường test) không trả stream → đọc JSON 1 lần.
  if (!response.body || typeof response.body.getReader !== 'function') {
    const json = await response.json().catch(() => null);
    if (!json) {
      throw new ProviderError('Provider trả về dữ liệu không đọc được (không phải JSON).', {
        status: response.status,
        retryable: true,
      });
    }
    const text = parseText(protocol, json);
    const finishReason =
      finishFromChunk(protocol, json) || (protocol === 'anthropic' ? (json?.stop_reason ?? '') : '');
    if (text) onDelta(text);
    return { text, ms: Date.now() - startedAt, finishReason, truncated: isTruncated(finishReason) };
  }

  let text = '';
  let sawPayload = false;
  let finishReason = '';

  for await (const payload of sseEvents(response.body)) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    let json;
    try {
      json = JSON.parse(payload);
    } catch {
      continue; // chunk hỏng → bỏ qua, không làm chết cả stream
    }
    sawPayload = true;

    finishReason = finishFromChunk(protocol, json) || finishReason;

    const delta = deltaFromChunk(protocol, json);
    if (!delta) continue;
    text += delta;
    onDelta(delta);
  }

  if (!sawPayload) {
    throw new ProviderError('Provider không trả về dữ liệu stream hợp lệ.', {
      status: response.status,
      retryable: true,
    });
  }
  if (!text.trim()) {
    throw new ProviderError('Model trả về nội dung rỗng. Thử lại hoặc đổi model.', { retryable: true });
  }

  return { text, ms: Date.now() - startedAt, finishReason, truncated: isTruncated(finishReason) };
}
