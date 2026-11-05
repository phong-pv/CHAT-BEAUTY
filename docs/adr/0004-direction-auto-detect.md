# ADR-0004: Hướng xử lý — auto-detect tiếng Việt, có override tay

- Ngày: 2026-11-05
- Trạng thái: Accepted
- Liên quan: [../prompting.md](../prompting.md), [../architecture.md](../architecture.md)

## Bối cảnh

Người dùng chính là người Việt viết chat tiếng Anh. Hai nhu cầu thực tế:
(a) đã có câu tiếng Anh, chỉ cần sửa ngữ pháp/câu từ; (b) nghĩ bằng tiếng Việt, cần **dịch sang tiếng Anh tự nhiên**
rồi mới gửi. Bắt user chọn hướng mỗi lần là ma sát; nhưng đoán sai mà không có cách sửa thì tệ hơn.

## Quyết định

1. Thêm setting `direction` với 3 giá trị: `auto` (mặc định) · `vi-to-en` · `en-polish`.
2. `auto` được resolve **local** trước khi gọi API bằng `resolveDirection()` trong `lib/prompt.js`
   (không tốn request, không phụ thuộc model): có dấu tiếng Việt, hoặc ≥2 từ tiếng Việt không dấu → `vi-to-en`.
3. Luôn có select **Hướng** trên popup để user override ngay; lựa chọn được lưu vào settings.
4. Hướng được truyền cho model **qua system prompt**, không qua tham số API riêng → chạy được với mọi provider.

## Lựa chọn đã cân nhắc

| Lựa chọn | Ưu | Nhược | Kết luận |
|---|---|---|---|
| Chỉ polish tiếng Anh (P1) | prompt đơn giản nhất | không phục vụ nhu cầu chính của user Việt | Loại |
| 2 nút riêng "Polish" / "Dịch" | rõ ràng | thêm 1 bước chọn mỗi lần, popup chật | Loại |
| Auto-detect + override select | 0 click cho trường hợp thường gặp, vẫn sửa được | heuristic có thể sai với câu tiếng Việt không dấu ngắn | **Chọn** |
| Nhờ model tự phát hiện ngôn ngữ | chính xác hơn heuristic | tốn token, chậm, kết quả không ổn định giữa model nhỏ | Loại (dùng làm fallback tự nhiên trong prompt) |
| Dịch 2 chiều (Anh → Việt) | đối xứng | ngoài scope MVP | Loại |

## Hệ quả

- Tích cực: user Việt dán tiếng Việt là dùng được ngay; vẫn kiểm soát được khi đoán sai.
- Tiêu cực: heuristic là **best-effort**, câu ngắn không dấu ("ok em") có thể bị phân loại sai → phải override tay.
- Kéo theo: prompt có 2 nhánh system rõ ràng ([../prompting.md](../prompting.md) §2);
  test heuristic cần nằm trong `scripts/test-providers.mjs` hoặc file test riêng.
- Kéo theo: hướng phải xuất hiện trong status line popup để user biết vừa chạy ở chế độ nào.
