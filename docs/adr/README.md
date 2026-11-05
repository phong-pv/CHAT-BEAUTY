# ADR — Architecture Decision Records

Một file = một quyết định. Đánh số 4 chữ số tăng dần: `NNNN-kebab-title.md`.

Trạng thái hợp lệ: `Proposed` · `Accepted` · `Rejected` · `Superseded by ADR-NNNN`.

Quy tắc:
- Đã `Accepted` thì **không sửa nội dung**; muốn đổi → ADR mới, ADR cũ thêm dòng `Superseded by ADR-NNNN`.
- Mỗi ADR nêu bối cảnh, quyết định, các lựa chọn đã cân nhắc, hệ quả (kể cả hệ quả xấu).
- Ghi lại vào bảng ở [../decisions.md](../decisions.md).

| ADR | Tiêu đề | Trạng thái |
|---|---|---|
| [0001](./0001-manifest-v3-vanilla-js-no-bundler.md) | Manifest V3 + vanilla JS ESM, không bundler | Accepted |
| [0002](./0002-byok-key-in-storage-local.md) | BYOK: key trong `chrome.storage.local`, gọi thẳng provider | Accepted |
| [0003](./0003-popup-only-ui.md) | UI chỉ là popup ở MVP | Accepted |
| [0004](./0004-direction-auto-detect.md) | Hướng xử lý: auto-detect tiếng Việt + override tay | Accepted |
