# Dùng ChatBeauty trên iPhone / iPad

## 0. Kết luận nhanh

- **Chrome trên iOS không hỗ trợ extension** → không cài được file extension này vào Chrome iPhone.
- **Safari iOS có hỗ trợ web extension** (từ iOS 15), nhưng Apple yêu cầu extension phải nằm trong 1 app iOS →
  phải đóng gói lại bằng **Xcode + Apple Developer Program**. Nặng cho nhu cầu cá nhân.
- Vì vậy repo có sẵn **bản web** (`web/`) dùng chung `lib/prompt.js` + `lib/providers.js` với extension: mở bằng
  Safari trên iPhone là có đủ tính năng (stream, tone, hướng Việt→Anh, giải thích, copy).

| Đường | Cần gì | Streaming | Mở từ app khác | Chi phí |
|---|---|---|---|---|
| **A. Bản web** (`web/index.html`) | 1 URL (LAN hoặc host tĩnh) | ✅ | ❌ (phải chuyển sang Safari) | 0đ |
| **B. Shortcut** (Apple Shortcuts) | iPhone + API key | ❌ (chờ 1 lần) | ✅ Share Sheet từ mọi app | 0đ |
| **C. Safari web extension** (port) | Mac + Xcode + Apple Developer | ✅ | ✅ (icon trên Safari) | 99 USD/năm (hoặc side-load 7 ngày) |

Khuyến nghị: **B để dùng nhanh trong lúc chat** + **A khi cần UI đầy đủ (stream/giải thích)**.

---

## A. Bản web (UI đầy đủ)

### A1. Chạy trong LAN (không cần host, 5 phút)

Trên máy tính (cùng Wi-Fi với iPhone):

```bash
cd /Users/phongpham/Projects/Ideas/ChatBeauty
python3 -m http.server 8000
ipconfig getifaddr en0        # lấy IP máy tính
```

Trên iPhone mở Safari: `http://<IP-máy-tính>:8000/web/`
→ **Chia sẻ** → **Thêm vào MH chính** để có icon như app.
→ Mở **Cài đặt** trong trang, chọn provider, dán key, **Lưu** → **Kiểm tra kết nối**.

> Chỉ chạy khi máy tính bật và cùng mạng. Ra ngoài thì dùng A2 hoặc B.

### A2. Host tĩnh (dùng mọi nơi)

Bản web là file tĩnh, không backend → **GitHub Pages** / Netlify / Cloudflare Pages đều được.
Đưa lên host: `web/`, `lib/`, `css/`, `assets/` (giữ nguyên cấu trúc thư mục).

GitHub Pages → URL dạng `https://<user>.github.io/chatbeauty/web/` → mở bằng Safari iPhone → **Thêm vào MH chính**.

### A3. Khác biệt so với extension

| | Extension | Bản web |
|---|---|---|
| Lưu settings | `chrome.storage.local` | `localStorage` (`web/store.js`, **cùng schema**) |
| State tạm | `chrome.storage.session` (6h) | `sessionStorage` của tab |
| Hiển thị | popup cạnh icon | trang/tab (thêm vào MH chính) |
| Quyền host | `host_permissions` + `optional_host_permissions` | không cần quyền, nhưng provider phải cho phép **CORS** từ origin của bạn |
| Mock mode | có | không (phải có key mới bấm được Viết lại) |

Nếu bản web báo "Không kết nối được tới …" thì đó thường là CORS của provider với origin đang dùng
(`http://192.168.x.x:8000` vs `https://…`). Khi đó dùng Shortcut (B).

---

## B. Shortcut (dùng ngay trong lúc chat)

Chạy từ **Share Sheet** của bất kỳ app nào (Zalo, Messenger, Gmail, Notes…): bôi đen text → Chia sẻ →
ChatBeauty → kết quả được copy + hiện ra.

### B1. Tạo Shortcut

App **Shortcuts** → **+** → đặt tên `ChatBeauty` → thêm action theo thứ tự:

1. **Receive `Text` input from Share Sheet** (Shortcut details → bật **Show in Share Sheet**, input: Text).
2. **If** `Shortcut Input` **has any value** → *Then* dùng Shortcut Input; *Otherwise* **Ask for Text**.
3. **Get Contents of URL**
   - URL: `https://api.openai.com/v1/chat/completions`
     (Groq: `https://api.groq.com/openai/v1/chat/completions` · DeepSeek: `https://api.deepseek.com/v1/chat/completions`
     · OpenRouter: `https://openrouter.ai/api/v1/chat/completions`)
   - Method: **POST**
   - Headers: `Authorization` = `Bearer <API_KEY_CUA_BAN>` · `Content-Type` = `application/json`
   - Request Body: **JSON**, thêm field:

     | Key | Type | Value |
     |---|---|---|
     | `model` | Text | `gpt-4o-mini` (Groq: `llama-3.3-70b-versatile`) |
     | `temperature` | Number | `0.4` |
     | `messages` | Array | 2 item bên dưới |

     `messages` item 1 — Dictionary: `role` = `system`, `content` =
     ```
     You are an editor that turns chat messages into clear, correct, natural English.
     Apply the minimum change needed: fix what is wrong, keep what already works.
     If the message is Vietnamese, translate it into natural conversational English first.
     Keep names, numbers, links, emoji and meaning; never answer the message;
     output only the rewritten English text, no quotes, no markdown, no explanation.
     ```
     `messages` item 2 — Dictionary: `role` = `user`, `content` = **Shortcut Input** (biến)

4. **Get Dictionary Value** (key `choices`) → **Get Item from List** (First Item) →
   **Get Dictionary Value** (key `message`) → **Get Dictionary Value** (key `content`)
5. **Copy to Clipboard** → **Show Result** (hoặc **Quick Look**)

### B2. Dùng

Bôi đen tin nhắn trong bất kỳ app → **Chia sẻ** → **ChatBeauty** → kết quả đã ở clipboard, dán lại là xong.

### B3. Cảnh báo bảo mật

- Shortcut **không mã hoá**: ai có file shortcut là đọc được key → **không chia sẻ/export shortcut này**.
- Muốn đỡ lộ: tạo shortcut `CB Key` chỉ trả về key, shortcut chính dùng **Run Shortcut** để lấy key.
- Bản web (A) an toàn hơn một chút: key nằm ở `localStorage` của trình duyệt, không nằm trong file chia sẻ.

### B4. Giới hạn

- **Không stream** (chờ 1 lần, thường 1–3 giây).
- Không chọn tone/hướng nhanh → muốn nhiều biến thể thì tạo thêm shortcut (`ChatBeauty Pro`, `ChatBeauty Casual`…)
  chỉ khác dòng `Tone: …` trong system prompt.
- Không có "Giải thích".

---

## C. Port thành Safari web extension (icon trên Safari)

Điều kiện: **macOS + Xcode**, và **Apple Developer Program** (99 USD/năm) nếu muốn cài lâu dài/chia sẻ.
Tài khoản Apple free chỉ side-load ~7 ngày (phải build lại).

```bash
xcrun safari-web-extension-converter /Users/phongpham/Projects/Ideas/ChatBeauty
```

Mở project Xcode được tạo → target iOS → build vào iPhone → bật trong
**Settings → Safari → Extensions → ChatBeauty**.

Điểm **chưa verify** ở repo này (phải thử trên máy thật):

- `chrome.*` namespace: Safari hỗ trợ nhưng không đầy đủ 100%.
- `chrome.storage.session`, `optional_host_permissions`, `chrome.permissions.request` có thể khác hành vi.
- Popup hiển thị được trên iOS Safari nhưng kích thước/gesture khác desktop.
- Sau khi port, mỗi lần đổi code phải build lại qua Xcode (không còn "Load unpacked").

Nguồn: [Apple — Safari web extensions](https://developer.apple.com/documentation/safariservices/safari-web-extensions) ·
[Packaging a web extension for Safari](https://developer.apple.com/documentation/safariservices/packaging-a-web-extension-for-safari)
