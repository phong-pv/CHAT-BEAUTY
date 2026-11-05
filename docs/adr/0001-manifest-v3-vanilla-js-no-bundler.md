# ADR-0001: Manifest V3 + vanilla JS ESM, không bundler

- Ngày: 2026-11-05
- Trạng thái: Accepted
- Liên quan: [0003](./0003-popup-only-ui.md), [../architecture.md](../architecture.md)

## Bối cảnh

Extension nhỏ: 1 popup, 1 trang options, gọi HTTP tới provider bằng key của user. Chu kỳ phát triển ngắn,
người làm chính là 1 người, ưu tiên "load unpacked là chạy" và dễ audit vì có xử lý API key.

## Quyết định

- Manifest V3.
- JavaScript thuần, ES modules (`type="module"` trong HTML, `import` tương đối).
- **Không** bundler, **không** framework, **không** runtime dependency, **không** `npm install` để chạy.
- `npm` chỉ dùng cho script tiện ích (`scripts/pack.mjs`, `scripts/test-providers.mjs`) chạy bằng Node thuần.

## Lựa chọn đã cân nhắc

| Lựa chọn | Ưu | Nhược | Kết luận |
|---|---|---|---|
| Vanilla ESM, no build | 0 dependency, load unpacked ngay, code đọc trực tiếp được | không có JSX/type checking, refactor tay | **Chọn** |
| Vite + React + CRXJS | DX tốt, component hoá | cần build + watch, thêm ~hàng trăm package, khó audit, dễ lệch giữa `src` và bản chạy | Loại ở MVP |
| TypeScript + esbuild | type safety | vẫn cần bước build, MVP quá nhỏ để bù công | Loại, có thể xem lại nếu >~3000 dòng |
| WXT / Plasmo framework | lo nhiều boilerplate | framework lock-in cho extension nhỏ | Loại |

## Hệ quả

- Tích cực: sửa file → reload extension là thấy; review code an toàn về key dễ; không supply-chain risk.
- Tiêu cực: không có type check, không có auto-import; mỗi file phải tự `import` đường dẫn tương đối đúng.
- Kéo theo: giữ `lib/providers.js` là module thuần để chạy test trực tiếp bằng Node (`node scripts/test-providers.mjs`).
- Nếu sau này cần React/TS: chỉ `popup/` và `options/` phải viết lại, `lib/*` giữ nguyên.
