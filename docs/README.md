# ChatBeauty — Docs Index

Chrome extension (Manifest V3): dán đoạn chat tiếng Anh → AI viết lại cho đúng ngữ pháp và tự nhiên hơn.
Kết nối AI theo dạng **BYOK** (Bring Your Own Key), không backend, không telemetry.

## Đọc gì khi nào

| Bạn cần | Đọc |
|---|---|
| Biết repo đang ở đâu, sắp làm gì | [plan-mvp.md](./plan-mvp.md) (đã xong) + [plan-next.md](./plan-next.md) (roadmap sau MVP) |
| Dùng trên **iPhone/iPad** | [ios.md](./ios.md) |
| Hiểu hệ thống gồm những gì, dữ liệu đi qua đâu | [architecture.md](./architecture.md) |
| Làm phần kết nối API / BYOK | [providers-byok.md](./providers-byok.md) |
| Sửa prompt, thêm hướng/tone | [prompting.md](./prompting.md) |
| Biết vì sao chọn công nghệ A thay vì B | [decisions.md](./decisions.md) + [adr/](./adr/) |
| Thuật ngữ (tone, direction, adapter, mock mode…) | [glossary.md](./glossary.md) |
| Lịch sử session làm việc | [sessions/2026-11.md](./sessions/2026-11.md) |

## Trạng thái hiện tại

**MVP hoàn tất — P0 → P5 DONE, version 1.0.0 (2026-11-05).**

- Đóng gói: `npm run pack` → `dist/chatbeauty-1.0.0.zip`. Hướng dẫn cài/sử dụng cho người dùng cuối: [`../README.md`](../README.md).
- **Bản web cho iPhone/iPad**: `web/index.html` dùng chung `lib/prompt.js` + `lib/providers.js`, chỉ thay lớp lưu trữ
  bằng `localStorage` (`web/store.js`). Cách dùng + Shortcut + port Safari extension: [ios.md](./ios.md).
- Test: `npm test` → **58 test** (`test-providers.mjs` 29 + `test-prompt.mjs` 15 + `test-storage.mjs` 11 + `test-web-store.mjs` 4).
- **Chưa verify với provider thật** (không có API key trong môi trường phát triển): model id Gemini/Anthropic,
  CORS thực tế từng provider, và chất lượng prompt/giải thích trên model thật. Xem ghi chú cuối P3 trong
  [plan-mvp.md](./plan-mvp.md).
- Việc tiếp theo (ngoài MVP): lịch sử nhiều phiên, dịch Anh → Việt, content script/side panel, service worker giữ stream
  khi popup đóng (cần ADR mới).


## Thêm doc mới

- Nội dung về một domain cụ thể → `<domain>-<topic>.md` ngay trong `docs/` (ví dụ `providers-byok.md`).
- Quyết định kiến trúc → ADR mới trong `docs/adr/`, đánh số tăng dần, **không sửa** ADR cũ
  (chỉ thêm dòng `Superseded by ADR-NNNN`).
- Xong một buổi làm việc → thêm entry mới **lên đầu** `docs/sessions/<YYYY-MM>.md`.
- Một fact chỉ nằm ở một nơi; nơi khác link tới.
