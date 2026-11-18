# Cuộn OCR → Word

Extension Chrome/Edge nhận dạng chữ trong một vùng màn hình đã chọn, quét lại khi bạn cuộn hoặc chuyển trang, gộp phần chữ trùng và xuất `.docx`. Tiện ích ước lượng nét đậm từ ảnh để giữ chữ đậm và chữ thường trong Word. OCR chạy trên máy bằng Tesseract.js; tiện ích không gửi ảnh hay văn bản tới máy chủ.

## Cài đặt

1. Chạy `npm install` rồi `npm run build` trong thư mục này.
2. Mở `chrome://extensions` (hoặc `edge://extensions`), bật **Developer mode**.
3. Bấm **Load unpacked** và chọn thư mục `dist`.

## Sử dụng

1. Mở trang bạn có quyền trích xuất nội dung và bấm biểu tượng extension.
2. Bấm **Chọn vùng chữ**, kéo chuột khoanh cột nội dung. Vùng này cố định theo cửa sổ trình duyệt.
3. Đợi lần quét đầu hoàn tất rồi cuộn từng màn hình hoặc chuyển trang. Tiện ích quét sau khi trang đứng yên khoảng 0,85 giây; nếu bỏ sót, bấm **Quét ngay**.
4. Bấm **Tạm dừng** khi không muốn quét tiếp; bấm **Xuất file Word** để tải bản nháp `.docx`.

Nếu kích thước cửa sổ đổi, tiện ích sẽ yêu cầu chọn lại vùng và giữ nguyên bản nháp. Chọn lại vùng trên cùng đường dẫn cũng giữ bản nháp; sang đường dẫn khác sẽ bắt đầu bản nháp mới, nên hãy xuất bản cũ trước. OCR và nhận diện chữ đậm là ước lượng từ ảnh, vì vậy hãy rà soát lại dấu và định dạng trong Word.

## Phát triển

- `npm test` kiểm tra thuật toán gộp đoạn trùng.
- `npm run build` tạo bản extension tự chứa trong `dist`.
- `npm run test:browser` thử chọn vùng, quét khi cuộn, chọn lại vùng và tải Word trong Chromium.
- Runtime OCR: Tesseract.js 7 (Apache 2.0), dữ liệu `vie`/`eng` từ `@tesseract.js-data` (MIT); tạo Word bằng `docx` (MIT).
