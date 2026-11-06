# Glossary

| Thuật ngữ | Nghĩa trong project | Tránh gọi là |
|---|---|---|
| **BYOK** | Bring Your Own Key — user tự dán API key của provider; extension không giữ key riêng, không proxy qua server mình | "login", "tài khoản" |
| **Provider** | Nhà cung cấp model (OpenAI, OpenRouter, Groq, DeepSeek, Gemini, Anthropic, Ollama) | "server", "API" |
| **Preset** | Cấu hình điền sẵn cho 1 provider: `protocol` + `baseUrl` + `model` mặc định | "template", "profile" |
| **Protocol / adapter** | Cách nói chuyện với provider: `openai`-compatible, `gemini`, `anthropic`. Implement trong `lib/providers.js` | "loại API" |
| **Tone** | Phong cách viết lại: `natural` \| `professional` \| `casual` \| `concise` \| `friendly` | "style", "mode" |
| **Improve** | Hành động chính: viết lại text giữ nguyên ý, sửa ngữ pháp + từ ngữ. **Nhãn UI: "Viết lại"** | "fix", "correct" |
| **Direction** | Hướng xử lý: `auto` \| `vi-to-en` \| `en-polish`. Nhãn UI: Tự động / Việt → Anh / Anh → Anh | "mode", "translate toggle" |
| **Auto-detect** | `resolveDirection()` đoán tiếng Việt bằng dấu tiếng Việt hoặc ≥2 từ tiếng Việt không dấu — chạy local, không tốn request | "language detection AI" |
| **vi-to-en** | Dịch tiếng Việt sang tiếng Anh tự nhiên rồi polish | "translate mode" |
| **en-polish** | Chỉ sửa ngữ pháp/câu từ của câu tiếng Anh, không đổi ngôn ngữ | "fix grammar" |
| **Redaction** | Xoá API key khỏi text trước khi hiện ra (`redactSecrets`) vì provider có thể echo key trong lỗi | "encrypt" |
| **Test connection** | Gọi 1 request ngắn (`maxTokens: 16`) để kiểm tra key/baseUrl/model trong Options | "ping", "health check" |

| **Explain changes** | Request phụ (không stream, `temperature: 0`) trả 2–4 bullet tiếng Việt vì sao text được sửa. Nhãn UI: "Giải thích" | "diff", "analysis" |
| **Bullet** | Một dòng giải thích; `toBullets()` bỏ tiền tố `-`/`*`/`•`/`1.`, tối đa 6 dòng | "item", "line" |
| **Diff** | Chế độ "Hiện thay đổi": so sánh input vs output theo từ (`lib/diff.js`), chỉ dùng cho `en-polish`. Nhãn UI: "Hiện thay đổi" / "Ẩn thay đổi" | "compare", "history diff" |
| **History** | 30 lần viết lại gần nhất lưu local (`lib/history.js`), có nạp lại / xoá từng mục / xoá hết | "cache", "log" |
| **Custom instructions** | Ghi chú riêng của user (≤300 ký tự) chèn cuối system prompt trong `<prefs>` | "system prompt của user", "prompt riêng" |
| **Export/Import settings** | JSON cấu hình (không có apiKey) để chuyển giữa extension và bản web | "backup key" (không đúng — không có key) |
| **Mock mode** | Chế độ không gọi API: trả kết quả giả để test UI khi chưa nhập key | "demo", "fake" |
| **Streaming** | Nhận và hiển thị kết quả dần theo chunk (SSE) thay vì chờ toàn bộ | "realtime" |
| **Settings** | Object `{v:1, provider, baseUrl, model, apiKey, tone}` trong `chrome.storage.local`, key là `settings` | "config" (docs dùng "settings") |
| **Session state** | `{input, output, explain, ts}` lưu ở `chrome.storage.session` (key `sessionState`, TTL 6h, tự xoá khi đóng browser) để mở lại popup không mất kết quả | "cache" |
| **Key mask** | Dạng hiển thị che key: giữ 4 ký tự cuối (`sk-…3f9a`) | "encrypt" (không phải mã hoá) |
