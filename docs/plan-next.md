# Plan tiếp theo (sau MVP v1.0.0)

MVP đã xong (P0–P5, xem [plan-mvp.md](./plan-mvp.md)). File này là roadmap **sau MVP**: chọn cái gì làm tiếp,
theo thứ tự nào, và mỗi cái tốn gì.

## 1. Nguyên tắc chọn

1. **Giá trị cho chính người dùng này trước** (1 người, tiếng Việt → tiếng Anh), không tối ưu cho "mọi người dùng".
2. **Không phá [ADR-0001](./adr/0001-manifest-v3-vanilla-js-no-bundler.md)**: không bundler, không runtime dependency.
   Cần dependency (kể cả dev) → phải có ADR mới.
3. **Không thêm permission nếu chưa thật cần** — mỗi permission là một cảnh báo cài đặt + rủi ro review Web Store.
4. Mỗi tính năng phải có **test** (`npm test`) và tiêu chí "done" kiểm được, không chỉ "đã code".
5. Ưu tiên việc **giảm khả năng hỏng** trước việc **thêm tính năng**, vì bản hiện tại chưa từng chạy với provider thật.

## 2. Nợ kỹ thuật hiện tại

| # | Nợ | Ảnh hưởng thực tế | Xử lý ở |
|---|---|---|---|
| T1 | **Chưa từng gọi provider thật** bằng key thật | model id Gemini/Anthropic hoặc CORS có thể sai mà không biết | R1 ✅ |
| T2 | Không retry, không timeout khi stream | 429/5xx hoặc mạng chập → user thấy "treo" rồi phải tự bấm lại | R2 ✅ |
| T3 | Không có CI | Regression chỉ phát hiện khi chạy tay | R3 ✅ |
| T4 | Prompt không có version | Kết quả tệ không biết do model hay do prompt | R4 ✅ |
| T5 | Settings extension ↔ bản web không đồng bộ | phải nhập key 2 lần | U7 |
| T6 | Explain không stream, chờ 1 cục | cảm giác chậm khi mạng yếu | U6 |
| T7 | Không có lịch sử | viết lại xong lỡ tay là mất bản cũ | U3 |
| T8 | Không test UI tự động (chỉ DOM stub + screenshot tay) | regression CSS/layout không ai bắt | X5 |
| T9 | Popup đóng là stream chết ([ADR-0003](./adr/0003-popup-only-ui.md)) | đang đọc kết quả, bấm ra ngoài là mất | X1 |

## 3. Roadmap

| Bản | Chủ đề | Nội dung | Effort | Trạng thái |
|---|---|---|---|---|
| **v1.1** | Tin cậy & đo được | R1 verify script · R2 retry/timeout · R3 CI · R4 prompt version | ~nửa ngày | ✅ **DONE 2026-11-05** |
| **v1.2** | Dùng thích hơn | U1 diff highlight · U2 custom instructions · U3 history · U5 keyboard · U6 explain stream · U7 export settings | 1–2 ngày | ✅ **DONE 2026-11-06** |
| **v2.0** | Sâu hơn | X1 side panel · X2 context menu · X3 Anh→Việt + auto đa ngôn ngữ · X5 E2E | 3–5 ngày | chưa làm |
| **v2.x** | Phát hành | X4 Chrome Web Store (privacy policy, screenshot, listing) | ~nửa ngày + 5 USD | chưa làm |

Effort: **S** ≤ 2 giờ · **M** nửa ngày · **L** 1–2 ngày.

## 4. v1.1 — Tin cậy & đo được ✅ DONE (2026-11-05)

Đã làm: **R1** `npm run verify:provider` · **R2** retry 1 lần + idle timeout 30s · **R3** CI
(`.github/workflows/test.yml`) · **R4** `PROMPT_VERSION = 'v2'` (hiện trong tooltip badge, Options, bản web).

Phát sinh khi chạy provider thật (ưu tiên cao hơn plan ban đầu): **output bị cắt im lặng** — model trả 1 câu rồi
dừng, code cũ không đọc `finish_reason` nên không báo gì. Đã sửa: đọc `finish_reason` cả 3 protocol, tự retry
1 lần với budget ×2 khi bị cắt, cảnh báo khi output < 40% input, nâng `maxTokensFor` lên **min 1024 / cap 4000**
(trước đó 324 ký tự chỉ được 362 token). Chi tiết: [decisions.md](./decisions.md) #27.

### R1 · `npm run verify:provider` — script kiểm chứng với provider thật (S)

- Script Node: `scripts/verify-provider.mjs`, đọc `CHATBEAUTY_PROVIDER`, `CHATBEAUTY_KEY` (hoặc `--provider/--key`),
  gọi `testConnection()` + `generate()` 1 câu ngắn, in bảng: protocol, model, ms, kết quả, text mẫu.
- Mục đích: chốt 3 câu hỏi đang treo — model id `gemini-2.0-flash` / `claude-3-5-haiku-latest` còn đúng không,
  CORS từng provider, và chất lượng prompt v2 trên model thật.
- Không commit key; script tự đọc env. Không đụng runtime.
- **Done:** chạy được với ≥2 provider khác protocol, kết quả ghi vào `docs/providers-byok.md` (bảng "đã kiểm ngày …"),
  model id sai thì sửa preset.

### R2 · Retry + timeout cho `generate()`/`request()` (S)

- Retry **1 lần** khi 429/5xx **và chưa nhận chunk nào**, backoff ~800ms (dùng `AbortSignal` + timer).
- Timeout "không có chunk trong 30s" → abort với message riêng: "Provider không phản hồi sau 30s."
- Không retry lỗi 401/402/404 (vô nghĩa) — tận dụng `ProviderError.retryable` đã có.
- File: `lib/providers.js`, test trong `scripts/test-providers.mjs` (fetch stub đếm số lần gọi).
- **Done:** test pass; 429 lần đầu → tự thử lại → thành công; stream treo → báo lỗi timeout, không treo UI.

### R3 · CI chạy unit test (S)

- `.github/workflows/test.yml`: Node 20, `npm test`. Không build, không secret.
- Dev-only (không ảnh hưởng runtime) → ghi 1 dòng vào [decisions.md](./decisions.md).
- **Done:** push lên GitHub → CI xanh; PR có test fail thì CI đỏ.

### R4 · Prompt version (S)

- `export const PROMPT_VERSION = 'v2'` trong `lib/prompt.js`; popup ghi vào tooltip badge + log session khi đổi version.
- Mục đích: sau này so kết quả "tệ hơn" thì biết prompt nào đang chạy.
- **Done:** đổi version → hiện trong tooltip; test assert hằng số tồn tại.

## 5. v1.2 — Dùng thích hơn ✅ DONE (2026-11-06)

Đã làm (version **1.1.0**, test 93):

- **U1 diff highlight**: `lib/diff.js` (LCS theo từ, cap 1200 token) + `renderDiff()` trong `lib/ui.js`
  (dựng `<span class="diff-add|diff-del">` bằng `textContent` → không HTML injection). Nút **Hiện thay đổi**
  chỉ hiện khi `direction === 'en-polish'`.
- **U2 custom instructions**: setting `customInstructions` (≤300 ký tự) → chèn vào cuối system prompt trong `<prefs>`;
  UI ở Options + bản web.
- **U3 lịch sử**: `lib/history.js` (`makeHistory({read, write})`, FIFO 30, chuẩn hoá + cắt 8000 ký tự) với adapter
  `chrome.storage.local` (extension) và `localStorage` (web). UI: danh sách trong popup/web, nạp lại, xoá từng mục, xoá hết.
- **U5 phím tắt**: `manifest.commands._execute_action` = `Alt+Shift+C`.
- **U6 explain stream**: explain chuyển sang `generate()`; bullet hiện dần, Stop vẫn dừng được.
- **U7 export/import**: `exportSettings()` / `parseSettingsJson()` trong `lib/storage.js` — **không bao giờ chứa apiKey**,
  validate provider/tone/direction; UI ở Options + web.

### U1 · Diff highlight "đã đổi gì" (M)

- `lib/diff.js`: LCS theo **từ** (không cần dependency), giới hạn 2000 từ để không chậm.
- UI: nút **Hiện thay đổi** cạnh "Kết quả" → output chuyển sang chế độ highlight (`<mark>` phần thêm/sửa).
- Chỉ bật khi `direction === 'en-polish'` (dịch Việt→Anh thì diff vô nghĩa) — nói rõ trong tooltip.
- File: `lib/diff.js` (mới), `popup/*`, `web/*`, test `scripts/test-diff.mjs`.
- **Done:** sửa 1 câu → highlight đúng phần bị đổi; không highlight khi dịch.

### U2 · Custom instructions (S)

- Setting mới `customInstructions` (≤ 300 ký tự), ví dụ: "Không dùng em dash", "Gọi tôi là Phong", "Trả lời ngắn".
- Chèn vào system prompt dưới dạng dữ liệu người dùng dặn (không phải chỉ dẫn hệ thống), có test.
- UI: trang Options + bản web. **Done:** bật/tắt thấy khác biệt trong prompt builder test.

### U3 · Lịch sử 30 mục (M)

- `chrome.storage.local['history']` (bản web: `localStorage`), mỗi mục `{ts, input, output, tone, direction, model}`,
  FIFO 30 mục, có **Xoá từng mục** + **Xoá hết**.
- UI: list gập trong popup, bấm để nạp lại vào ô input/output, nút copy nhanh.
- Privacy: ghi rõ trong Options "lịch sử lưu trên máy này"; không chứa API key.
- **Done:** test storage (FIFO, xoá), UI nạp lại đúng.

### U5 · Phím tắt mở popup (S)

- `manifest.commands`: `_execute_action` với `Alt+Shift+C` (MV3 hỗ trợ sẵn, không cần code service worker).
- **Done:** bấm phím tắt mở popup; ghi vào README.

### U6 · Stream cho "Giải thích" (S)

- Đổi `request()` → `generate()` cho explain, render bullet dần (bullet tách theo dòng khi stream về).
- **Done:** bullet hiện dần, Stop vẫn dừng được, test DOM stub cập nhật.

### U7 · Export/Import settings (S)

- JSON `{v, provider, baseUrl, model, tone, direction, customInstructions}` — **không có apiKey**.
- Dùng để chuyển cấu hình giữa extension ↔ bản web (đồng bộ tay).
- **Done:** export ở extension → import ở web ra cùng cấu hình; test roundtrip.

## 6. v2.0 — Sâu hơn

### X1 · Không mất kết quả khi popup đóng (M → L)

Hai hướng, **nên thử hướng rẻ trước**:

1. **`chrome.sidePanel`** (M): panel không bị đóng khi click ra ngoài → giải quyết gốc vấn đề, code gần như giữ nguyên
   (dùng lại `popup/popup.html`). ADR-0003 đã ghi "xem lại nếu user phàn nàn UX" → đây chính là lúc đó.
   Cần ADR mới (005) vì đổi quyết định UI; Chrome ≥ 114.
2. **Chuyển `generate()` sang service worker** (L): popup chỉ là view, stream chạy nền, mở lại thấy phần đã nhận.
   Phức tạp hơn (message port, SW lifecycle 30s idle) và khó test — chỉ làm nếu side panel không đủ.

- **Done:** đang stream mà đóng panel/mở lại vẫn còn kết quả (hoặc stream tiếp tục).
- Rủi ro: side panel chiếm chỗ trên màn hình nhỏ; user có thể vẫn thích popup → cho chọn trong Options.

### X2 · Context menu "Viết lại đoạn đã chọn" (M)

- `permissions: ["contextMenus", "scripting"]` + `activeTab` → lấy selection → lưu `storage.session` → mở popup
  với input đã điền sẵn (không auto-run vì cần user gesture).
- **Cần ADR mới (006)**: đây là lần đầu thêm permission đọc nội dung trang.
- **Done:** bôi đen text trên bất kỳ trang → chuột phải → "Viết lại bằng ChatBeauty" → popup mở, đã có text.
- Rủi ro: cảnh báo permission rộng hơn; nếu publish Web Store sẽ bị review kỹ hơn.

### X3 · Anh → Việt + tự nhận diện ngôn ngữ khác (S–M)

- Thêm direction `en-to-vi` (nhãn "Anh → Việt") cho người Việt cần đọc/viết tiếng Việt.
- Mở rộng auto: nếu text có ký tự CJK/Thai/Arabic… → `other-to-en` (dịch sang tiếng Anh), prompt thêm nhánh
  "detect the language and translate to English".
- File: `lib/prompt.js` (DIRECTIONS + prompt), test heuristic; UI tự có thêm option.
- **Done:** dán tiếng Nhật → ra tiếng Anh; chọn "Anh → Việt" → ra tiếng Việt.

### X5 · E2E test UI (M)

- Playwright (dev dependency → **cần ADR-0001 amendment hoặc ADR mới**) chạy popup + options + web trên Chromium
  headless: load extension, kiểm tra render, mock provider bằng route interception (chặn request, trả SSE giả).
- **Done:** `npm run e2e` chạy trong CI, bắt được regression layout/flow cơ bản.
- Ghi chú: hiện đã có DOM stub + screenshot tay; E2E chỉ đáng làm khi UI bắt đầu phình ra.

## 7. v2.x — Phát hành Web Store (X4)

- Privacy policy (nội dung đã có trong README §Quyền & riêng tư), ảnh 1280×800, mô tả ngắn/dài, 5 USD phí một lần.
- Cân nhắc trước khi nộp: `optional_host_permissions: ["https://*/*","http://*/*"]` sẽ bị soi — có thể bỏ và chỉ
  giữ host của preset, ai dùng custom URL thì tự thêm (hoặc giữ và giải trình trong phần privacy).
- **Done:** extension public, review pass, người khác cài được.

## 8. Không làm (và lý do)

| Ý tưởng | Vì sao không |
|---|---|
| Panel inline trên mọi trang web (content script toàn cục) | CSS/JS clash với trang chủ, permission rất rộng, bảo trì nặng — chỉ làm khi có nhu cầu thật (X2 đủ 90% giá trị) |
| Đồng bộ API key qua cloud | Trái [ADR-0002](./adr/0002-byok-key-in-storage-local.md); key phải ở lại máy |
| Backend proxy để giấu key | Phải trả tiền API hộ, phải chịu trách nhiệm dữ liệu người dùng — trái định hướng BYOK |
| i18n UI (en/vi) | 1 người dùng, UI tiếng Việt đã chốt (decisions #7) |
| Chế độ hội thoại nhiều lượt / viết lại cả thread | Scope lớn, prompt phức tạp hơn nhiều; nếu cần thì tách sản phẩm khác |
| TTS / luyện phát âm | Ngoài phạm vi "viết lại tin nhắn" |
| Tự host model local (llama.cpp) trong extension | Không khả thi về dung lượng; Ollama qua Custom URL đã đủ |

## 9. Câu hỏi cần chốt trước khi code

1. **Làm v1.1 trước hay nhảy thẳng vào tính năng (v1.2)?** (khuyến nghị v1.1 — chưa test provider thật là rủi ro lớn nhất)
2. Có cần **Anh → Việt** không (X3), hay chỉ Việt → Anh như hiện tại?
3. Có định **publish Chrome Web Store** (X4) không? Nếu có, sẽ hạn chế permission ngay từ bây giờ.
4. Đổi popup → **side panel** (X1) có chấp nhận được không? (không mất kết quả khi click ra ngoài, nhưng chiếm chỗ)
5. Có cần **custom instructions** (U2) kiểu "đừng dùng em dash / gọi tôi là …" không? (rất rẻ, cá nhân hoá mạnh)
