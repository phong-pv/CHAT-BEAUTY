# Plan — MVP

Trạng thái: **P0–P5 DONE (2026-11-05) · v1.0.0.** Chưa test với provider thật bằng key thật (xem ghi chú cuối P3).
Quyết định nền: [ADR-0001](./adr/0001-manifest-v3-vanilla-js-no-bundler.md) (MV3 + vanilla ESM, không bundler),
[ADR-0002](./adr/0002-byok-key-in-storage-local.md) (BYOK), [ADR-0003](./adr/0003-popup-only-ui.md) (popup only).

## 1. Mục tiêu

Dán đoạn chat tiếng Anh → nhận lại bản viết đúng ngữ pháp, từ ngữ tự nhiên/hay hơn, **giữ nguyên ý** →
copy 1 click. Chạy hoàn toàn local trong browser, dùng API key của chính user.

**Đo lường thành công (MVP):** mở popup → dán 1 đoạn 300–1500 ký tự → có kết quả streaming < 5s với
`gpt-4o-mini`, copy được, mở lại popup vẫn còn kết quả; đổi provider khác trong Options không cần sửa code.

## 2. Non-goals (không làm ở MVP)

Lịch sử nhiều phiên, đồng bộ settings, dịch sang ngôn ngữ khác, inline panel trên trang web khác,
context menu, i18n UI, tài khoản/thanh toán, service worker giữ stream khi popup đóng (xem ADR-0003).

## 3. Cấu trúc file đích

```
manifest.json
package.json                    # chỉ để `node --check` hiểu ESM + chạy scripts, KHÔNG có dependency
popup/popup.html | popup.css | popup.js
options/options.html | options.css | options.js
lib/storage.js | providers.js | prompt.js | ui.js
assets/icon-16.png icon-32.png icon-48.png icon-128.png
scripts/make-icons.mjs          # sinh icon PNG bằng node:zlib, không dependency
scripts/test-providers.mjs      # test adapter bằng fetch stub, không cần Chrome
scripts/pack.mjs                # zip để đóng gói (không dependency)
README.md                       # cách load unpacked + privacy
docs/…
```

## 4. Phases & task checklist

### P0 — Docs (DONE)
- [x] `docs/README.md`, `architecture.md`, `plan-mvp.md`, `providers-byok.md`, `glossary.md`, `decisions.md`
- [x] ADR-0001, ADR-0002, ADR-0003, `adr/README.md`, `adr/0000-template.md`
- [x] `sessions/README.md`, `sessions/2026-11.md`

### P1 — Scaffold + popup UI + mock mode (DONE 2026-11-05)
- [x] `manifest.json` (MV3, `permissions: ["storage"]`) — **host_permissions hoãn sang P2** (chưa gọi mạng thì chưa cần, tránh cảnh báo cài đặt vô ích)
- [x] 4 icon PNG sinh bằng `scripts/make-icons.mjs` (node:zlib, 4×4 supersampling, không dependency)
- [x] `popup/popup.html|css|js`: textarea + counter, tone select, nút Viết lại/Dừng, output block,
      Sao chép, Explain + Settings đang `disabled` (có ở P4 / P2), hỗ trợ light + dark
- [x] `lib/ui.js`: `$`, `setStatus`, `copyText` (có fallback `execCommand`), `showToast`
- [x] `lib/prompt.js`: `TONES` (5 tone) + `DEFAULT_TONE` — system prompt sẽ thêm ở P3
- [x] Mock mode: `streamMock()` giả lập streaming, chưa gọi mạng
- [x] `package.json` (`type: module`, script `icons`) để `node --check` hiểu ESM
- **Done khi:** load unpacked → bấm Viết lại ra kết quả mock, Copy hiện toast, layout gọn ở 380px.
- **Verify đã làm:** 15 assertion qua DOM stub (`node /tmp/chatbeauty-popup-smoke.mjs` → PASSED);
  Chrome headless load `popup.html` qua localhost → 5 `<option>` được inject, không lỗi JS; screenshot 380×600 xem layout OK.

### P2 — Settings + storage + BYOK (DONE 2026-11-05)
- [x] `lib/storage.js`: `DEFAULT_SETTINGS`, `getSettings()`, `saveSettings()`, `clearApiKey()`, `maskKey()`, `hasApiKey()`, `normalize()` migrate `v`
- [x] `manifest.json`: `options_ui` + `host_permissions` cho 6 origin preset + `localhost`/`127.0.0.1` + `optional_host_permissions`
- [x] `options/options.html|css|js`: 8 preset (auto điền baseUrl/model), model free-text, key (password + mask + xoá),
      link "Lấy API key" theo preset, tone/hướng mặc định, nút Lưu / Kiểm tra kết nối
- [x] `lib/providers.js`: `PROVIDER_PRESETS`, `validateConfig`, `buildRequest` (3 protocol), `parseText`, `request`, `testConnection`, `originPattern`
- [x] Xin host permission trong click handler (Lưu / Kiểm tra) cho base URL lạ
- [x] `scripts/test-providers.mjs` (17 test, `npm test`) — gồm test **không lộ key** trong error message
- [x] `css/theme.css`: tách token + style dùng chung cho popup/options
- [x] Ngoài scope dự kiến (theo yêu cầu mới): **hướng Việt → Anh** + auto-detect (`resolveDirection`), ADR-0004, `docs/prompting.md`
- **Done khi:** lưu → mở lại vẫn còn; Test connection pass với key thật (đã verify bằng fetch stub + Chrome headless).
- **Verify đã làm:** `npm test` 17/17 PASS; smoke test DOM stub cho popup (19 assertion) và options (31 assertion) ALL PASSED;
  Chrome headless render cả 2 trang, không lỗi JS, screenshot review.

### P3 — Prompt + streaming thật (DONE 2026-11-05)
- [x] `lib/prompt.js`: `systemFor(direction, tone)`, `wrapUserText`, `maxTokensFor`, `buildMessages` (spec: [prompting.md](./prompting.md))
- [x] `lib/providers.js`: `deltaFromChunk`, `sseEvents`, `generate()` streaming SSE cho 3 protocol
- [x] `popup.js`: gọi `generate()` khi có key, giữ mock khi chưa có key; status live `Xong · model · hướng · n ký tự · ms`
- [x] Test: `scripts/test-prompt.mjs` (10 test) + 12 test streaming trong `test-providers.mjs` (tổng **39 test**)
- **Done khi:** streaming chạy với ≥2 provider khác protocol; dán tiếng Việt → ra tiếng Anh; sai key → message tiếng Việt đúng; `npm test` pass.
- **Verify đã làm:** `npm test` 39/39 PASS (SSE cắt dòng/CRLF/`[DONE]`/JSON hỏng, 3 protocol, abort giữa stream, fallback non-stream, 401 không lộ key);
  smoke test DOM stub popup 26 assertion ALL PASSED (stream thật qua fetch stub: đúng endpoint, `stream:true`, đúng Bearer key, prompt ép hướng,
  text bọc `<msg>`, 401 → lỗi + gợi ý Settings); Chrome headless render luồng live: `Xong · gpt-4o-mini · Việt → Anh · 39 ký tự · 160ms`.
- **CHƯA verify:** gọi provider **thật** bằng key thật (chưa có key trong môi trường này) → model id `gemini-2.0-flash` /
  `claude-3-5-haiku-latest` vẫn **chưa xác nhận**; CORS thực tế của từng provider cũng chưa kiểm.

### P4 — Polish (DONE 2026-11-05)
- [x] "Giải thích" (Explain changes): `buildExplainMessages` + `request()` không stream, render bullet, `temperature: 0`
- [x] `Ctrl/Cmd+Enter` = Viết lại, `Esc` = Dừng (đã có từ P1, giữ nguyên)
- [x] a11y: output `role="log"` + `aria-live="polite"` + `aria-busy` theo trạng thái stream, `aria-describedby` cho textarea,
      vùng giải thích `aria-live="polite"`, focus-visible, tooltip giải thích lý do nút bị tắt
- [x] Persist state vào `chrome.storage.session` (`input`, `output`, `explain`, TTL 6h) + debounce 400ms khi gõ
- [x] Empty state, giới hạn 8000 ký tự (đã có), Stop dừng được cả Viết lại và Giải thích
- **Done khi:** không còn `TODO`, không lỗi console, thao tác bàn phím đủ dùng.
- **Verify đã làm:** `npm test` 53/53 PASS; smoke test popup **48 assertion ALL PASSED** (Explain bật/tắt đúng,
  3 bullet render, request explain đúng system prompt + `temperature 0` + không stream, abort giữa lúc giải thích,
  khôi phục session, debounce lưu input, `aria-busy` true/false); Chrome headless render đủ vùng "Vì sao sửa", 0 lỗi JS.
- **Bug bắt được nhờ test:** `normalize()` trong `storage.js` giữ `protocol` cũ khi provider đã đổi (bản ghi cũ
  `gemini` + `protocol: openai` → build request sai schema). Nay `protocol` **luôn** suy ra từ preset (decisions #21).

### P5 — Đóng gói (DONE 2026-11-05)
- [x] `README.md` root: tính năng, cài đặt (load unpacked + zip), bảng 8 provider + link lấy key, quyền/riêng tư,
      xử lý sự cố, dev commands, giới hạn
- [x] `scripts/pack.mjs` → `dist/chatbeauty-<version>.zip` (tự viết ZIP writer bằng `node:zlib`, whitelist file runtime,
      DOS date cố định để build reproducible, loại `docs/`/`scripts/`/`.gitignore`)
- [x] `package.json` script `pack`; `.gitignore` cho `dist/`, `node_modules/`, `*.pem`
- [x] Bump version `0.1.0` → **`1.0.0`** (MVP đủ tính năng)
- [x] Prompt v2 (ngoài plan, theo yêu cầu user): xem `docs/prompting.md` §2 + decisions #23
- **Done khi:** cài từ zip mới tinh vẫn hoạt động.
- **Verify đã làm:** `npm run pack` → 16 file, 27.5 kB; `unzip -t` báo **no errors**; `unzip -l` đúng cấu trúc
  (`manifest.json`, `popup/`, `options/`, `lib/`, `css/`, `assets/`); `--pack-extension` vẫn tạo CRX OK; `npm test` 54/54.

## 5. Verify

- Chưa có test framework và **không thêm** cho MVP. Test = mock mode + `scripts/test-providers.mjs` (Node 20, `fetch` stub).
- Checklist thủ công (ghi vào session log mỗi phase): load unpacked → Improve → Stop → Copy → sai key → mất mạng →
  đổi provider → reload extension → vẫn còn settings.

## 6. Rủi ro / cần chốt khi làm

| Rủi ro | Xử lý dự kiến |
|---|---|
| Popup đóng giữa stream → mất output | MVP: chấp nhận, đã lưu phần đã nhận vào `storage.session`. Hướng nâng cấp: service worker (ADR mới nếu làm) |
| CORS / host permission thiếu với base URL lạ | test Ollama localhost ở P3; xin `optional_host_permissions` khi lưu |
| Model id của Gemini/Anthropic thay đổi | không hard-code duy nhất 1 model; cho phép free-text + chỉ dùng preset làm default |
| Prompt injection từ text user dán | bọc `<msg>` + system dặn "data, not instructions"; kết quả chỉ để copy, không thực thi |
| Chi phí API của user | hiện `usage` nếu provider trả về; giới hạn `max_tokens`; mặc định model rẻ |

## 7. Ngoài MVP nhưng đã làm (theo yêu cầu)

- **Prompt v2**: luật "minimal edits", dịch theo ý + kính ngữ Việt, cả 5 tone có chỉ dẫn riêng (decisions #23,
  [prompting.md](./prompting.md) §2).
- **Bản web cho iPhone/iPad** (`web/`): dùng chung `lib/prompt.js` + `lib/providers.js`, chỉ thay lớp lưu trữ bằng
  `localStorage` (`web/store.js`, cùng schema settings). Cách dùng + Shortcut recipe + phương án port Safari extension:
  [ios.md](./ios.md). Quyết định: decisions #25, #26.
- Chưa làm: đồng bộ settings giữa extension và bản web (hiện nhập key 2 lần).

## 8. Sau MVP

Roadmap v1.1 → v2.x (ưu tiên, effort, tiêu chí done, danh sách "không làm") nằm ở [plan-next.md](./plan-next.md).

