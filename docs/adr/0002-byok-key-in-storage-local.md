# ADR-0002: BYOK — key của user trong `chrome.storage.local`, gọi thẳng provider

- Ngày: 2026-11-05
- Trạng thái: Accepted
- Liên quan: [../providers-byok.md](../providers-byok.md), [../architecture.md](../architecture.md)

## Bối cảnh

Không muốn trả tiền API hộ user, không muốn vận hành backend/proxy (chi phí + rủi ro bảo mật + độ phức tạp
phát hành). Người dùng extension là dân kỹ thuật, sẵn sàng tự lấy key. Cần hỗ trợ nhiều provider mà không
viết lại UI cho từng nhà.

## Quyết định

1. User nhập API key của chính họ trong trang Options; browser gọi **trực tiếp** tới provider, không qua server nào.
2. Key lưu ở `chrome.storage.local` (không `sync` → không rời máy), plaintext, chỉ hiển thị dạng mask.
3. Chuẩn hoá mọi provider về **3 protocol**: `openai`-compatible, `gemini`, `anthropic`; toàn bộ khác biệt nằm trong `lib/providers.js`.
4. Provider mới không cần code: preset mới = `{protocol, baseUrl, model}`, hoặc dùng preset `custom`.
5. Host permission khai báo theo origin của preset đã biết; base URL lạ dùng `optional_host_permissions` xin quyền lúc lưu.

## Lựa chọn đã cân nhắc

| Lựa chọn | Ưu | Nhược | Kết luận |
|---|---|---|---|
| BYOK, browser → provider | không backend, không phí, không giữ key người khác, latency thấp | user phải tự tạo key; key nằm ở client | **Chọn** |
| Server proxy giữ key của mình | user không cần key, kiểm soát model/chi phí | phải trả tiền API, phải vận hành, phải chịu trách nhiệm dữ liệu người dùng | Loại |
| `chrome.storage.sync` | đồng bộ nhiều máy | key rời máy, bị gửi qua hạ tầng Google, phạm vi lộ rộng hơn | Loại |
| Mã hoá key bằng passphrase | an toàn hơn khi máy bị truy cập | UX nặng, vẫn phải giải mã để dùng, passphrase hỏng = mất key | Không làm MVP, ghi nhận như hướng nâng cấp |
| Một adapter riêng cho từng provider | chính xác từng nhà | 7 provider = 7 lần bảo trì, phần lớn trùng nhau | Loại |

## Hệ quả

- Tích cực: không có hạ tầng nào để vận hành; thêm provider là thêm 1 dòng preset.
- Tiêu cực: key ở dạng plaintext trong profile Chrome → **phải** cảnh báo trong Options và trong README;
  không dùng được trên máy không cho tạo key (ví dụ mạng công ty chặn).
- Tiêu cực: mỗi provider phải khai báo `host_permissions` (cảnh báo cài đặt dài hơn) hoặc xin quyền runtime.
- Kéo theo: cần bảng map lỗi 401/402/404/429/network → message tiếng Việt ([providers-byok.md](../providers-byok.md) §5);
  cần `Test connection` ở Options để user biết key đúng trước khi dùng.
- Kéo theo: không log key, không đưa key vào error message, export settings **không** gồm key.
