# ChatBeauty

Chrome extension (Manifest V3) để **viết lại tin nhắn tiếng Anh cho đúng ngữ pháp và tự nhiên hơn**, hoặc
**dịch tiếng Việt → tiếng Anh** rồi viết lại luôn. Kết nối AI dạng **BYOK** (Bring Your Own Key): bạn dùng
API key của chính mình, dữ liệu đi thẳng từ browser tới provider — không có server trung gian, không telemetry.

```
Dán tin nhắn  →  chọn giọng điệu / hướng  →  Viết lại  →  copy
```

## Tính năng

- **Viết lại / dịch**: dán tiếng Anh (sửa ngữ pháp, câu từ) hoặc tiếng Việt (dịch + viết lại tự nhiên).
- **Tự đoán hướng**: có tiếng Việt → dịch sang tiếng Anh, còn lại → sửa tiếng Anh. Đổi tay được bằng select **Hướng**.
- **5 giọng điệu**: Natural · Professional · Casual · Concise · Friendly.
- **Streaming**: kết quả hiện dần, bấm **Dừng** (hoặc `Esc`) là ngắt, giữ phần đã nhận.
- **Giải thích**: 2–4 bullet tiếng Việt vì sao câu được sửa.
- **Không mất chữ**: đóng popup rồi mở lại vẫn còn input + kết quả (session 6 giờ).
- **8 provider**: OpenAI, OpenRouter, Groq, DeepSeek, Google Gemini, Anthropic, Ollama (local), Custom (OpenAI-compatible).

## Cài đặt

Cần Chrome (Manifest V3). Node ≥ 18 chỉ cần khi chạy test/đóng gói — **không cần build**.

### Cách 1 — Load unpacked (dùng hàng ngày)

1. `chrome://extensions` → bật **Developer mode**.
2. **Load unpacked** → chọn thư mục project này (thư mục có `manifest.json`).
3. Ghim icon ChatBeauty lên toolbar.

### Cách 2 — Từ file zip

```bash
npm run pack                                    # → dist/chatbeauty-<version>.zip
unzip dist/chatbeauty-1.0.0.zip -d chatbeauty
```

Rồi **Load unpacked** → chọn thư mục `chatbeauty` vừa giải nén.

> Chrome không cài trực tiếp file `.zip`; zip dùng để chia sẻ/lưu trữ, giải nén ra mới load được.

## Cấu hình API key (BYOK)

Mở popup → **Settings**, hoặc `chrome://extensions` → ChatBeauty → **Extension options**.

| Provider | Base URL | Model mặc định | Lấy key |
|---|---|---|---|
| **OpenAI** | `https://api.openai.com/v1` | `gpt-4o-mini` | https://platform.openai.com/api-keys |
| **OpenRouter** | `https://openrouter.ai/api/v1` | `openai/gpt-4o-mini` | https://openrouter.ai/keys |
| **Groq** (nhanh, có free tier) | `https://api.groq.com/openai/v1` | `llama-3.3-70b-versatile` | https://console.groq.com/keys |
| **DeepSeek** (rẻ) | `https://api.deepseek.com/v1` | `deepseek-chat` | https://platform.deepseek.com/api_keys |
| **Google Gemini** | `https://generativelanguage.googleapis.com/v1beta` | `gemini-2.0-flash` | https://aistudio.google.com/apikey |
| **Anthropic** | `https://api.anthropic.com` | `claude-3-5-haiku-latest` | https://console.anthropic.com/settings/keys |
| **Ollama** (local, không cần key) | `http://localhost:11434/v1` | `llama3.1` | — |
| **Custom** | bạn nhập (kết thúc bằng `/v1`) | bạn nhập | — |

Các bước:

1. Chọn **Nhà cung cấp** → Base URL và Model tự điền, sửa được (model là free-text).
2. Dán key vào ô **Key mới** → **Lưu** (key được che dạng `sk-p…3f9a`).
3. Bấm **Kiểm tra kết nối** → phải ra `Kết nối OK · <model> · <ms>ms`.
   - Nếu Chrome hỏi quyền truy cập host với base URL lạ → bấm **Allow**.
4. Mở popup: badge phải hiện tên provider (không còn `mock`).

Chưa có key vẫn dùng thử được UI ở chế độ **mock** (kết quả giả lập, không gọi mạng).

## Dùng

- Dán tin nhắn → chọn **Giọng điệu** và **Hướng** → **Viết lại** (hoặc `Ctrl/⌘ + Enter`).
- **Sao chép** để lấy kết quả; **Giải thích** để xem vì sao sửa; **Dừng**/`Esc` để ngắt giữa stream.
- Tối đa 8000 ký tự mỗi lần.

## Trên iPhone / iPad

Chrome trên iOS **không** hỗ trợ extension, nhưng có 2 cách dùng ngay (chi tiết: [`docs/ios.md`](docs/ios.md)):

**1. Bản web** (đủ tính năng: stream, tone, giải thích, copy) — chạy trong LAN, không cần host:

```bash
python3 -m http.server 8000        # trong thư mục project
ipconfig getifaddr en0             # lấy IP máy tính
```

iPhone (cùng Wi-Fi) mở Safari: `http://<IP>:8000/web/` → Chia sẻ → **Thêm vào MH chính** → mở **Cài đặt** để nhập key.
Muốn dùng ngoài nhà: host tĩnh (GitHub Pages/Netlify) với `web/`, `lib/`, `css/`, `assets/`.

**2. Apple Shortcut** (dùng được từ Share Sheet của Zalo/Messenger/Gmail…): xem recipe từng bước trong
[`docs/ios.md`](docs/ios.md) mục B. Không stream, nhưng nhanh nhất khi đang chat.

Port thành Safari web extension cũng được nhưng cần macOS + Xcode + Apple Developer Program (99 USD/năm) — xem mục C.

## Quyền & quyền riêng tư

| Quyền | Vì sao |
|---|---|
| `storage` | lưu settings + API key + state tạm của popup |
| `host_permissions` (6 origin provider + localhost) | gọi API provider bạn chọn |
| `optional_host_permissions` (`https://*/*`, `http://*/*`) | chỉ xin khi bạn dùng Base URL tự nhập |

- **Không** có `activeTab`, `tabs`, content script, analytics, hay server của tác giả.
- API key lưu **plaintext** trong profile Chrome (`chrome.storage.local`, không sync). Ai dùng được profile
  máy này thì đọc được key → đừng dùng key dùng chung.
- Nội dung bạn dán chỉ được gửi tới provider bạn chọn, không đi đâu khác.
- Key được **redact** khỏi mọi thông báo lỗi (một số provider echo lại key trong lỗi 401).

## Xử lý sự cố

| Hiện tượng | Nguyên nhân thường gặp | Cách sửa |
|---|---|---|
| `API key không hợp lệ hoặc đã bị thu hồi` | key sai/hết hạn | Settings → dán key mới → Kiểm tra kết nối |
| `Bị rate limit…` | gọi quá nhanh, hết quota | đợi vài giây, đổi model/provider |
| `Tài khoản provider hết credit` | hết tiền | nạp credit hoặc đổi provider |
| `Không tìm thấy model hoặc endpoint` | sai tên model | Settings → sửa ô Model (đúng id của provider) |
| `Không kết nối được tới <host>` | mạng chặn, base URL sai, thiếu quyền host | kiểm tra Base URL, cấp lại quyền host |
| Badge vẫn là `mock` | chưa lưu key | Settings → **Lưu** |
| Kết quả trống | model trả nội dung rỗng | thử lại / đổi model |

## Phát triển

```bash
npm test          # 58 test cho lib/ + web/store.js (Node, không cần Chrome, không cần key)
npm run icons     # sinh lại assets/icon-*.png
npm run pack      # đóng gói dist/chatbeauty-<version>.zip
```

Cấu trúc: `popup/` (UI chính) · `options/` (BYOK) · `lib/providers.js` (HTTP + streaming 3 protocol) ·
`lib/prompt.js` (prompt + auto-detect) · `lib/storage.js` (settings/session) · `lib/ui.js` · `css/theme.css` ·
`docs/` (kiến trúc, ADR, plan, prompt spec).

Không bundler, không runtime dependency — sửa file rồi **Reload** extension ở `chrome://extensions` là chạy.

## Giới hạn đã biết

- Popup đóng khi click ra ngoài → stream đang chạy bị ngắt (phần đã nhận vẫn được giữ).
- Chưa có lịch sử nhiều phiên; state chỉ sống 6 giờ / đến khi đóng browser.
- Chưa hỗ trợ dịch Anh → Việt.
- Model id mặc định của Gemini/Anthropic có thể thay đổi theo thời điểm — sửa trong Settings nếu báo không tìm thấy model.
- Đã test với provider thật trong môi trường phát triển (xem `docs/plan-mvp.md` – ghi chú P3).

## Tài liệu

Bắt đầu từ [`docs/README.md`](docs/README.md): plan (`plan-mvp.md`), kiến trúc, quyết định + ADR,
spec BYOK (`providers-byok.md`), spec prompt (`prompting.md`), log từng phiên làm việc.
