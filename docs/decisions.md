# Decision Log

Một dòng = một quyết định đã chốt. Quyết định lớn/khoá kiến trúc có ADR riêng trong [adr/](./adr/).
Không sửa nội dung ADR cũ — thay đổi thì tạo ADR mới và ghi `Superseded by`.

| # | Ngày | Quyết định | ADR | Trạng thái |
|---|---|---|---|---|
| 1 | 2026-11-05 | Manifest V3, vanilla JS ESM, **không** bundler, **không** runtime dependency | [0001](./adr/0001-manifest-v3-vanilla-js-no-bundler.md) | Accepted |
| 2 | 2026-11-05 | BYOK: key của user trong `chrome.storage.local`, browser gọi thẳng provider, không backend | [0002](./adr/0002-byok-key-in-storage-local.md) | Accepted |
| 3 | 2026-11-05 | UI chỉ là popup (không side panel / content script / context menu) ở MVP | [0003](./adr/0003-popup-only-ui.md) | Accepted |
| 4 | 2026-11-05 | Hai protocol adapter là đủ: `openai`-compatible + native `gemini`/`anthropic` | [0002](./adr/0002-byok-key-in-storage-local.md) | Accepted |
| 5 | 2026-11-05 | Không thêm test framework; test bằng mock mode + script Node với `fetch` stub | — | Accepted |
| 6 | 2026-11-05 | Docs tiếng Việt, thuật ngữ kỹ thuật giữ tiếng Anh | — | Accepted |
| 7 | 2026-11-05 | UI/popup dùng **tiếng Việt** (label, nút, status), tên tone giữ tiếng Anh (Natural/Professional/…) | — | Accepted |
| 8 | 2026-11-05 | Thêm `package.json` (`type: module`) chỉ để Node hiểu ESM khi `node --check`/chạy `scripts/*.mjs`; **không** dependency, không build | [0001](./adr/0001-manifest-v3-vanilla-js-no-bundler.md) | Accepted |
| 9 | 2026-11-05 | P1 chưa khai báo `host_permissions` — sẽ thêm ở P2 cùng bảng preset, tránh cảnh báo cài đặt khi chưa gọi mạng | [0002](./adr/0002-byok-key-in-storage-local.md) | Accepted |
| 10 | 2026-11-05 | Thêm hướng **Việt → Anh** với auto-detect tiếng Việt + override tay trên popup | [0004](./adr/0004-direction-auto-detect.md) | Accepted |
| 11 | 2026-11-05 | Key của provider bị **redact** khỏi mọi error message (`redactSecrets`) vì có provider echo lại key | [0002](./adr/0002-byok-key-in-storage-local.md) | Accepted |
| 12 | 2026-11-05 | Tách `css/theme.css` (token + style dùng chung) để popup/options không lặp CSS | [0001](./adr/0001-manifest-v3-vanilla-js-no-bundler.md) | Accepted |
| 13 | 2026-11-05 | Gemini gửi key qua header `x-goog-api-key` (không dùng `?key=` trong URL) | [0002](./adr/0002-byok-key-in-storage-local.md) | Accepted |
| 14 | 2026-11-05 | Host permission: static cho 6 origin preset; `optional_host_permissions` cho base URL lạ, xin quyền trong click handler | [0002](./adr/0002-byok-key-in-storage-local.md) | Accepted |
| 15 | 2026-11-05 | `generate()` fallback: provider không trả `response.body` → đọc JSON một lần rồi phát cả text qua `onDelta` | — | Accepted |
| 16 | 2026-11-05 | Guard stream: không có payload hợp lệ / text rỗng đều là lỗi có message riêng, không trả output rỗng cho user | — | Accepted |
| 17 | 2026-11-05 | Popup vẫn giữ mock mode khi chưa có API key (UX thử UI không cần key); có key thì gọi `generate()` thật | [0002](./adr/0002-byok-key-in-storage-local.md) | Accepted |
| 18 | 2026-11-05 | Session state trong `chrome.storage.session` (key `sessionState`, TTL 6h) giữ `input`/`output`/`explain`; **không** chứa key | [0003](./adr/0003-popup-only-ui.md) | Accepted |
| 19 | 2026-11-05 | Explain = request thứ 2 **không stream**, `temperature: 0`, `maxTokens: 400`; tách bullet ở client (`toBullets`) | — | Accepted |
| 20 | 2026-11-05 | Lưu input debounce 400ms để không mất chữ khi popup bị đóng khi click ra ngoài | [0003](./adr/0003-popup-only-ui.md) | Accepted |
| 21 | 2026-11-05 | `protocol` **luôn** suy ra từ preset provider (bug: bản ghi cũ giữ protocol cũ → sai schema request) | [0002](./adr/0002-byok-key-in-storage-local.md) | Accepted |
| 22 | 2026-11-05 | `scripts/pack.mjs` tự viết ZIP writer bằng `node:zlib`, whitelist 6 nhóm file runtime, DOS date cố định → build reproducible, **không** dependency | [0001](./adr/0001-manifest-v3-vanilla-js-no-bundler.md) | Accepted |
| 23 | 2026-11-05 | **Prompt v2**: thêm luật "minimal edits", dịch theo ý (không word-by-word) + xử lý kính ngữ Việt, cả 5 tone đều có chỉ dẫn riêng (trước đó `natural` rỗng) | [0004](./adr/0004-direction-auto-detect.md) | Accepted |
| 24 | 2026-11-05 | Version **1.0.0** cho MVP; zip phát hành chỉ chứa runtime, loại `docs/` + `scripts/` + test | [0001](./adr/0001-manifest-v3-vanilla-js-no-bundler.md) | Accepted |
| 25 | 2026-11-05 | Bản web `web/` **dùng chung** `lib/prompt.js` + `lib/providers.js`, chỉ thay lớp lưu trữ (`localStorage`, cùng schema) — không fork logic | [0001](./adr/0001-manifest-v3-vanilla-js-no-bundler.md) | Accepted |
| 26 | 2026-11-05 | **Không** port Safari web extension ở MVP (cần macOS + Xcode + 99 USD/năm); thay bằng bản web + Shortcut recipe: [ios.md](./ios.md) | — | Accepted |
| 27 | 2026-11-05 | **Phát hiện output bị cắt**: đọc `finish_reason` cả 3 protocol, trả `truncated`; UI tự retry 1 lần với budget ×2, vẫn cụt thì cảnh báo `warn`; cảnh báo thêm khi output < 40% input (en-polish) | — | Accepted |
| 28 | 2026-11-05 | `maxTokensFor` = **min 1024 / cap 4000** (trước: min…1600, sát → cụt). `max_tokens` là trần, không phải chi phí | [../docs/prompting.md](../docs/prompting.md) | Accepted |
| 29 | 2026-11-05 | Retry **1 lần** cho 429/5xx/lỗi mạng, chỉ khi **chưa nhận chunk** + không phải AbortError; idle timeout stream **30s** | — | Accepted |
| 30 | 2026-11-05 | `PROMPT_VERSION` export từ `lib/prompt.js`, hiện trong tooltip badge / Options / bản web | — | Accepted |
| 31 | 2026-11-05 | CI GitHub Actions chỉ chạy `npm test` + `npm run pack` + `unzip -t`, **không** secret, không build | [0001](./adr/0001-manifest-v3-vanilla-js-no-bundler.md) | Accepted |
| 32 | 2026-11-06 | Diff highlight: LCS theo **từ**, cap 1200 token/chiều (tránh O(n·m) nổ), render bằng `textContent` (chống HTML injection); chỉ bật cho `en-polish` | — | Accepted |
| 33 | 2026-11-06 | Lịch sử: FIFO **30 mục** trong `chrome.storage.local['history']` (web: `localStorage`), chuẩn hoá + cắt 8000 ký tự/mục, có xoá từng mục & xoá hết | — | Accepted |
| 34 | 2026-11-06 | `customInstructions` ≤300 ký tự, chèn cuối system prompt trong `<prefs>` (dữ liệu, không phải chỉ dẫn hệ thống) | — | Accepted |
| 35 | 2026-11-06 | Export/import settings **không bao giờ** chứa `apiKey`; import validate provider/tone/direction | [0002](./adr/0002-byok-key-in-storage-local.md) | Accepted |
| 36 | 2026-11-06 | **Thay đổi so với #19**: explain chuyển sang **stream** (`generate()`), bullet render dần; vẫn `temperature: 0`, `maxTokens: 400` | — | Accepted |
| 37 | 2026-11-06 | `.label-row` cho phép wrap + `.label` nowrap (3 nút + badge không còn làm nhãn "KẾT QUẢ" xuống dòng xấu) | — | Accepted |
| 38 | 2026-11-06 | **X3**: 5 hướng (`auto`/`vi-to-en`/`en-polish`/`en-to-vi`/`other-to-en`); base prompt bỏ hardcode "English", mỗi hướng khai báo `Target language:`; `looksNonLatin()` cần ≥2 ký tự & ≥50% ký tự Latin; `PROMPT_VERSION = 'v3'` | [0004](./adr/0004-direction-auto-detect.md) | Accepted |


## Câu hỏi mở

- [ ] Có cần `clipboardWrite` không, hay `navigator.clipboard` trong popup đã đủ? → verify P1.
- [ ] Có phát hành Chrome Web Store hay chỉ dùng cá nhân? → ảnh hưởng yêu cầu privacy policy & icon/description.
- [ ] Có cần giữ stream khi popup đóng (service worker)? → quyết định lại ở P4/P5, cần ADR mới nếu làm.
- [ ] Model id mặc định của `gemini` và `anthropic` — **chưa xác nhận**, verify ở P2.
