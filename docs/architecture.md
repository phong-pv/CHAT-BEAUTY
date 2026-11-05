# Architecture

## 1. Tổng quan

```
┌──────────────────────── Chrome Extension (MV3) ────────────────────────┐
│                                                                        │
│  popup/                     options/                                   │
│  (nhập text, tone,         (BYOK settings: provider,                   │
│   output, copy)             baseUrl, model, apiKey, tone mặc định)     │
│      │        │                  │                                     │
│      └────┬───┴──────────────────┘                                     │
│           ▼                                                            │
│      lib/storage.js   ← chrome.storage.local (settings, key)           │
│           │           ← chrome.storage.session (state phiên popup)      │
│           ▼                                                            │
│      lib/prompt.js    (system prompt + tone template)                  │
│      lib/providers.js (adapter per protocol: openai | gemini | anthropic)│
│           │                                                            │
└───────────┼────────────────────────────────────────────────────────────┘
            │ HTTPS trực tiếp từ browser, không qua server của mình
            ▼
   Provider API (OpenAI / OpenRouter / Groq / DeepSeek / Gemini / Anthropic / Ollama local)
```

**Không có backend.** Không có service worker xử lý nghiệp vụ ở MVP (chỉ khai báo nếu thực sự cần — xem ADR-0003).

## 2. Thành phần & trách nhiệm

| Thành phần | Trách nhiệm | Không làm |
|---|---|---|
| `popup/popup.js` | Điều phối UI: đọc input, resolve hướng, gọi provider, render streaming, copy, lưu tone/hướng | Không tự build URL/header (để `providers.js`) |
| `options/options.js` | CRUD settings, preset provider, Test connection, mask key, xin host permission | Không gọi API viết lại text |
| `lib/storage.js` | Schema versioned `{v:1,…}`, default values, get/save, mask key, `hasApiKey` | Không chứa logic HTTP |
| `lib/providers.js` | Preset, validate config, build request/header mỗi protocol, parse response, `generate()` streaming SSE, map lỗi | Không chạm DOM, không đọc storage (nhận config qua tham số) |
| `lib/prompt.js` | Tone, direction, auto-detect tiếng Việt, (P3) system prompt + `buildMessages` | Không gọi mạng |
| `lib/ui.js` | DOM helper, toast, copy, status line | Không gọi mạng |
| `css/theme.css` | Token màu (light/dark) + style form/button dùng chung cho popup và options | Không chứa layout riêng của trang |
| `web/web.js` + `web/store.js` | Bản web cho iPhone/Safari: cùng UI logic, lưu settings bằng `localStorage` (cùng schema) | Không gọi `chrome.*`; không có mock mode |

Ranh giới quan trọng: **`providers.js` là pure-ish module** (nhận `{config, messages, onDelta, signal}`) → test được
bằng Node với `fetch` stub, không cần Chrome. Xem `scripts/test-providers.mjs` (`npm test`).

## 3. Luồng dữ liệu — "Viết lại"

1. User dán text vào popup → bấm **Viết lại** (hoặc Ctrl/Cmd+Enter).
2. `popup.js` đọc settings từ `storage.js`; `resolveDirection(text, settings.direction)` quyết định
   `vi-to-en` hay `en-polish` (xem [prompting.md](./prompting.md)). Thiếu key → mock mode, badge `mock`.
3. `prompt.js` build `messages[]` = `[{role:'system', content: systemPrompt(direction, tone)}, {role:'user', content: wrapUserText(text)}]`.
4. `providers.js` → `fetch` tới provider (URL/header theo protocol), `stream: true`.
5. Mỗi chunk SSE → `onDelta()` → append vào `#output`, status hiện hướng đã dùng.
6. Xong → (P4) lưu `{input, output, tone, direction, ts}` vào `chrome.storage.session` để mở lại popup không mất kết quả.
7. **Sao chép** → `navigator.clipboard.writeText` (fallback `execCommand`), hiện toast "Đã sao chép".

**Explain changes** = request thứ 2 (không stream), output 2–4 bullet; không trộn vào request chính để tránh model phá format.

## 4. Quyền & bảo mật

- Permissions: `storage` (P2 dùng cho settings). Copy hiện **không** cần `clipboardWrite` (đã verify chạy bằng
  `navigator.clipboard`, có fallback) — chỉ thêm nếu thực tế bị chặn.
- **Không** `activeTab`, **không** `tabs`, **không** content script, **không** service worker ở MVP.
- `host_permissions` (tĩnh, chỉ origin API của preset đã biết): `api.openai.com`, `openrouter.ai`, `api.groq.com`,
  `api.deepseek.com`, `generativelanguage.googleapis.com`, `api.anthropic.com`, `localhost`, `127.0.0.1`.
- `optional_host_permissions: ["https://*/*","http://*/*"]` → base URL lạ (gateway tự dựng) được xin quyền **lúc user bấm Lưu/Kiểm tra**
  bằng `chrome.permissions.request({origins:[origin/*]})`. Bị từ chối → không lưu, hiện lỗi rõ ràng.
- API key: `chrome.storage.local` (không `sync`), chỉ hiện dạng mask, **redacted khỏi error message** (`redactSecrets`),
  không gửi đi đâu ngoài provider. Chi tiết: ADR-0002.
- Không `eval`, không script từ CDN → thoả điều kiện publish Web Store.

## 5. Settings schema (v1)

`chrome.storage.local['settings']`:

```js
{ v: 1, provider: 'openai', protocol: 'openai',
  baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini',
  apiKey: 'sk-…', tone: 'natural', direction: 'auto' }
```

`direction ∈ {auto, vi-to-en, en-polish}` · `tone ∈ TONES` · `protocol ∈ {openai, gemini, anthropic}`.
`normalize()` trong `lib/storage.js` tự điền default + bump `v` khi shape đổi, và **luôn** suy ra `protocol` từ preset.

State tạm của popup (P4) nằm ở `chrome.storage.session['sessionState']`:

```js
{ input: '…', output: '…', explain: '…', ts: 1762… }   // TTL 6h, KHÔNG chứa apiKey
```

## 6. Điểm chưa chốt

- Manifest có cần `service_worker` không (chỉ để giữ stream khi popup đóng). ADR-0003: **không** ở MVP.
- Model id mặc định của `gemini` / `anthropic` vẫn **chưa xác nhận** — verify ở P3 bằng key thật.
