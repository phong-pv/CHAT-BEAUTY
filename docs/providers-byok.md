# BYOK — Kết nối API của người dùng

"BYOK" = user tự cung cấp API key. Extension **không** có key riêng, **không** proxy qua server của mình,
**không** tính phí. Nguyên tắc: ít provider nhất có thể nhưng phủ nhiều nhà cung cấp nhất.

## 1. Hai protocol là đủ

| Protocol | Dùng cho | Endpoint |
|---|---|---|
| `openai` (OpenAI-compatible) | OpenAI, OpenRouter, Groq, DeepSeek, Together, Fireworks, Ollama/LM Studio local, hầu hết gateway tự dựng | `POST {baseUrl}/chat/completions` |
| `gemini` (native) | Google AI Studio | `POST {baseUrl}/models/{model}:streamGenerateContent?alt=sse&key={key}` |
| `anthropic` (native) | Anthropic | `POST {baseUrl}/v1/messages` |

Chọn protocol tự động theo preset; user không phải hiểu khái niệm này.

## 2. Preset (điền sẵn trong Options)

| Key | Protocol | Base URL mặc định | Model mặc định | Ghi chú |
|---|---|---|---|---|
| `openai` | openai | `https://api.openai.com/v1` | `gpt-4o-mini` | |
| `openrouter` | openai | `https://openrouter.ai/api/v1` | `openai/gpt-4o-mini` | thêm header `HTTP-Referer` + `X-Title` (khuyến nghị, không bắt buộc) |
| `groq` | openai | `https://api.groq.com/openai/v1` | `llama-3.3-70b-versatile` | nhanh, có free tier |
| `deepseek` | openai | `https://api.deepseek.com/v1` | `deepseek-chat` | rẻ |
| `gemini` | gemini | `https://generativelanguage.googleapis.com/v1beta` | `gemini-2.0-flash` | **chưa xác nhận** — verify model id ở P2 |
| `anthropic` | anthropic | `https://api.anthropic.com` | `claude-3-5-haiku-latest` | cần header `anthropic-version: 2023-06-01`; model id **chưa xác nhận** |
| `ollama` | openai | `http://localhost:11434/v1` | `llama3.1` | key có thể rỗng; cần `optional_host_permissions` |
| `custom` | openai (mặc định) | user nhập | user nhập | dùng cho gateway tự dựng |

Preset còn mang metadata cho UI/permission: `keyUrl` (link "Lấy API key"), `keyOptional` (ollama/custom —
không bắt buộc key), `custom` (không tự điền baseUrl/model), `extraHeaders` (OpenRouter gửi `HTTP-Referer`/`X-Title`).

## 3. Hợp đồng module `lib/providers.js`

Đã có ở P2 (test: `scripts/test-providers.mjs`):

```js
validateConfig(config) // '' nếu hợp lệ, ngược lại là message tiếng Việt
providerPresets        // PROVIDER_PRESETS: id → {label, protocol, baseUrl, model, keyUrl?, keyOptional?, custom?, extraHeaders?}
buildRequest({ config, messages, stream, maxTokens, temperature }) // → { url, init }  (P3 stream dùng lại)
parseText(protocol, json)      // → string, hiểu 3 schema
request({ config, messages, signal, maxTokens, temperature }) // → { text, usage, ms }  (không stream)
testConnection(config)         // → { ms, sample }  (Options dùng)
originPattern(baseUrl)         // → 'https://host/*'  cho chrome.permissions.request
```

P3 đã implement (chỉ phần streaming, không đổi các hàm trên):

```js
export async function generate({ config, messages, onDelta, signal, maxTokens, temperature })
// → { text, ms }, đẩy từng phần qua onDelta(delta)
```

Toàn bộ phần khác biệt giữa provider nằm trong file này. **Không** rải `fetch` ra nơi khác,
**không** rải `if (provider === 'x')` vào popup.

Chi tiết header theo protocol (đã kiểm bằng test):
- `openai`: `authorization: Bearer <key>`, body `{model, messages, temperature, max_tokens, stream?}`.
- `gemini`: key ở header **`x-goog-api-key`** (không đặt trong URL để không lộ qua log), `system` → `systemInstruction`,
  `system`-role không nằm trong `contents`.
- `anthropic`: `x-api-key`, `anthropic-version: 2023-06-01`, **`anthropic-dangerous-direct-browser-access: true`**
  (bắt buộc để gọi từ browser); base URL đã có `/v1` thì không thêm lần nữa.


## 4. Streaming (đã implement: `sseEvents` + `deltaFromChunk` + `generate`)

- `openai`: body `{model, messages, stream:true, temperature}` → SSE dòng `data: {json}` → `choices[0].delta.content`; kết thúc bằng `data: [DONE]`.
- `gemini`: `streamGenerateContent?alt=sse` → `candidates[0].content.parts[].text` (nối các part trong cùng chunk).
- `anthropic`: `stream:true` → chỉ lấy event `type === 'content_block_delta'` → `delta.text`; bỏ qua `message_start`, `content_block_start`, `message_stop`.
- Parser chịu được: chunk cắt **giữa dòng**, dòng rỗng, comment `: ping`, CRLF, `data: [DONE]` (dừng ngay), JSON hỏng (bỏ qua chunk đó, stream vẫn tiếp).
- Provider/môi trường không trả `response.body` → fallback đọc JSON một lần rồi `onDelta(wholeText)`.
- Bảo vệ: stream không có payload hợp lệ → "Provider không trả về dữ liệu stream hợp lệ."; text rỗng → "Model trả về nội dung rỗng. Thử lại hoặc đổi model."
- `signal.aborted` được kiểm tra mỗi chunk → ném `AbortError`, phần đã nhận **vẫn giữ** trong UI.
- Sau khi xong, popup hiện `Xong · {model} · {hướng} · {n} ký tự · {ms}ms`.


## 5. Map lỗi → message cho user (tiếng Việt)

| HTTP / loại | Message | Hành động UI |
|---|---|---|
| 401 / 403 | "API key không hợp lệ hoặc đã bị thu hồi." | nút mở Options |
| 402 / 429 | "Hết credit hoặc bị rate limit. Thử lại sau hoặc đổi model." | cho retry |
| 404 | "Không tìm thấy model. Kiểm tra tên model trong Settings." | mở Options |
| 400 | "Request bị provider từ chối." + body rút gọn ≤200 ký tự | log console (không log key) |
| mạng / CORS / abort | "Không kết nối được tới {host}. Kiểm tra Base URL / mạng." | cho retry |
| key rỗng | mock mode | banner "Chưa có API key" |

Tuyệt đối không log `apiKey`, không đưa key vào `Error.message`, không gửi text người dùng đi đâu ngoài provider.
`redactSecrets()` xoá key khỏi message provider trả về (một số provider echo lại key trong lỗi 401) — có test riêng.

## 6. Test connection (Options) — đã chạy thật ở P2

Gọi `testConnection()` = `request()` với 1 message ngắn (`"Reply with the single word: ok"`), `maxTokens: 16`,
`temperature: 0`. Thành công → "Kết nối OK · {model} · {ms}ms · trả lời: \"ok\"". Fail → message theo bảng §5.
Trước khi gọi, Options xin host permission cho `originPattern(baseUrl)`; bị từ chối thì dừng và báo lỗi.

## 7. Quy tắc lưu key & quyền host

- `chrome.storage.local` key `settings` (schema `{v:1, …}`), **không** `storage.sync`.
- UI chỉ hiển thị dạng mask: `sk-proj-…3f9a` (giữ 4 ký tự đầu/cuối) + nút "Xoá key đã lưu".
- Cảnh báo trong Options: key lưu dạng plaintext trong profile Chrome; ai truy cập được profile máy này thì đọc được.
- Xuất/nhập settings **không** bao gồm key (chưa làm, ghi nhận khi thêm tính năng export).
- `host_permissions` tĩnh cho origin của preset; `optional_host_permissions` cho base URL lạ, xin quyền **trong click handler**
  (Lưu / Kiểm tra kết nối) — `chrome.permissions.request` bắt buộc có user gesture.

