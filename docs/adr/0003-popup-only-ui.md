# ADR-0003: UI chỉ là popup ở MVP

- Ngày: 2026-11-05
- Trạng thái: Accepted
- Liên quan: [0001](./0001-manifest-v3-vanilla-js-no-bundler.md), [../plan-mvp.md](../plan-mvp.md)

## Bối cảnh

Người dùng cần dán một đoạn chat (thường copy từ chat khác) vào một ô text, nhận bản viết lại, rồi copy ra.
Không cần extension "sống" trên trang web của người khác. Mục tiêu MVP: ít permission, ít bề mặt lỗi, làm nhanh.

## Quyết định

- Toàn bộ UI chính là **action popup** (`popup/popup.html`), mở bằng cách bấm icon.
- **Không** content script, **không** side panel, **không** context menu, **không** quyền `activeTab`/`tabs` ở MVP.
- Settings là trang riêng `options/options.html`, mở từ popup.
- Trạng thái popup (`input`, `output`, `tone`) lưu `chrome.storage.session` để mở lại không mất kết quả.
- Stream chạy trong popup; popup đóng giữa stream → stream bị abort, giữ phần đã nhận. **Chấp nhận** ở MVP,
  không thêm service worker chỉ để giữ stream.

## Lựa chọn đã cân nhắc

| Lựa chọn | Ưu | Nhược | Kết luận |
|---|---|---|---|
| Popup only | ít permission, code nhỏ, publish dễ | đóng khi click ra ngoài → ngắt stream; không gian hẹp | **Chọn** |
| `chrome.sidePanel` | luôn mở, không gian rộng, không bị ngắt khi click ra ngoài | Chrome ≥114, chiếm màn hình, UX khác thói quen popup | Xem lại nếu user phàn nàn UX |
| Content script floating panel | dùng ngay trên trang chat, thao tác nhanh | cần host permission rộng, va chạm CSS/JS với trang chủ, rủi ro bảo mật cao hơn | Loại MVP |
| Context menu "improve selection" | nhanh cho đoạn ngắn | phụ thuộc `contextMenus` + content script, khó streaming UI | Loại MVP |
| Service worker giữ stream | không mất kết quả khi popup đóng | thêm 1 process, message passing, khó debug | Hoãn; làm thì cần ADR mới |

## Hệ quả

- Tích cực: manifest tối giản → cảnh báo cài đặt nhẹ, dễ được duyệt Web Store.
- Tiêu cực: popup bị đóng khi bấm ra ngoài (kể cả khi đang chờ model) → phải có nút **Stop** rõ ràng và
  cứu phần đã stream vào `storage.session`.
- Tiêu cực: kích thước popup bị giới hạn (~800×600 tối đa, thực tế 360–500 rộng) → output phải scroll được.
- Kéo theo: `Ctrl/Cmd+Enter` = Improve, `Esc` = Stop để giảm thao tác chuột.
- Điều kiện mở lại quyết định: popup bị ngắt stream gây khó chịu, hoặc cần dùng khi đang ở trang chat khác.
