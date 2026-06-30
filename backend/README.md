# MealAI Backend - NestJS Service

Đây là phần xử lý Backend cho dự án **MealAI** (Hệ thống gợi ý thực đơn và nấu ăn gia đình tích hợp AI). Backend được xây dựng bằng framework **NestJS**, viết bằng **TypeScript** và kết nối cơ sở dữ liệu **PostgreSQL** thông qua **TypeORM**.

---

## 🛠️ Tính Năng Backend

1. **Authentication & Authorization (JWT):** Đăng ký, đăng nhập bảo mật với mật khẩu băm (bcryptjs), quản lý phiên đăng nhập qua Access Token và Refresh Token, phân quyền người dùng (`user`, `admin`).
2. **Password Reset Flow (Resend HTTP API):** Sinh token khôi phục mật khẩu bảo mật (băm SHA-256 lưu DB) và gửi liên kết đặt lại mật khẩu qua Resend.
3. **Recommendation Engine (Hybrid Scoring):**
   - Bộ lọc Rule-Based loại bỏ món không phù hợp (dị ứng, chế độ ăn chay/keto, bệnh lý).
   - Bộ chấm điểm Scoring-Based tính toán Calo, nguyên liệu tủ lạnh, nguyên liệu sắp hết hạn, sở thích người dùng và thời gian nấu.
   - Cơ chế điều chỉnh thói quen và đa dạng món ăn.
4. **Chatbot AI & Function Calling (Gemini API):** Tích hợp chatbot thông minh hỗ trợ nhận diện và thực hiện hành động trực tiếp trên database (thêm/sửa tủ lạnh, đổi thực đơn, tìm công thức).
5. **AI Review System:** Tự động dùng AI chấm điểm chất lượng công thức nấu ăn mới gửi từ người dùng trước khi Admin phê duyệt.
6. **PDF Generation (pdfkit):** Xuất báo cáo thực đơn tuần và phiếu đi chợ tự động ra PDF.

---

## 📁 Cấu Trúc Mã Nguồn (NestJS Modules)

Mã nguồn được tổ chức theo module khép kín:
*   `auth`: Quản lý xác thực người dùng, đăng ký, đăng nhập và khôi phục mật khẩu.
*   `recipes`: Quản lý danh sách công thức nấu ăn, chi tiết món và bình luận/đánh giá.
*   `inventory`: Quản lý nguyên liệu hiện có trong tủ lạnh gia đình.
*   `meal-plan`: Quản lý thực đơn theo ngày và theo tuần.
*   `shopping-list`: Quản lý danh sách mua sắm tự động khấu trừ từ tủ lạnh.
*   `notification`: Hệ thống thông báo và dịch vụ email Resend HTTP API (EmailService).
*   `recommendations`: Recommendation Engine xử lý nghiệp vụ chấm điểm gợi ý món ăn.
*   `chatbot`: Tiếp nhận và phân tích ngữ nghĩa tin nhắn người dùng thông qua Gemini API.

---

## 🚀 Khởi Chạy Dự Án

### Cài đặt
```bash
npm install
```

### Cấu hình
Tạo file `.env` tại thư mục này với các thông số:
```env
PORT=3001
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=your_password
DB_NAME=recipe_ai

JWT_SECRET=your_jwt_secret
JWT_REFRESH_SECRET=your_refresh_secret

GEMINI_API_KEY=your_gemini_api_key

RESEND_API_KEY=re_xxxxxxxxx
EMAIL_FROM=MealAI <onboarding@resend.dev>

FRONTEND_URL=http://localhost:3000
```

### Chạy server phát triển
```bash
npm run start:dev
```

### Chạy Seed dữ liệu mẫu
```bash
npm run db:seed
```
Dữ liệu mẫu chứa các danh mục nguyên liệu chuẩn và công thức món ăn ban đầu sẽ được nạp vào PostgreSQL.
