# MealAI - Hệ Thống Gợi Ý Thực Đơn Và Nấu Ăn Gia Đình Tích Hợp AI

MealAI là hệ thống hỗ trợ quản lý công thức nấu ăn, lập thực đơn dinh dưỡng cá nhân hóa theo tuần và quản lý nguyên liệu trong tủ lạnh thông minh tích hợp Trí tuệ nhân tạo (AI). Dự án được xây dựng phục vụ cho đồ án tốt nghiệp khóa 2022 - 2026.

---

## 🌟 Các Tính Năng Nổi Bật

1. **Lập thực đơn tự động (Meal Planner):** 
   - Lập thực đơn tự động theo ngày và tuần phù hợp với mục tiêu calo (BMR/TDEE) của người dùng.
   - Hỗ trợ khóa món ăn yêu thích và tự động điền các bữa trống qua Recommendation Engine.
2. **Thuật toán gợi ý Hybrid Scoring System:** 
   - Giai đoạn 1: Lọc sơ bộ (Rule-based) để loại bỏ dị ứng, món trùng lặp, món vượt quá giới hạn bệnh lý (tiểu đường, cao huyết áp) hoặc không đúng chế độ ăn (chay, keto, low-carb).
   - Giai đoạn 2: Chấm điểm (Scoring-based) dựa trên 5 tiêu chí: Dinh dưỡng (30%), Độ khớp tủ lạnh (25%), Chống lãng phí thực phẩm (20%), Sở thích (15%) và Thời gian nấu (10%).
   - Giai đoạn 3: Điều chỉnh đa dạng thực đơn để cân bằng bữa ăn Việt (mặn, canh, rau).
3. **Quản lý tủ lạnh thông minh (Inventory):**
   - Lưu trữ nguyên liệu trong tủ lạnh, tự động tính toán hạn sử dụng (FEFO) và đưa ra cảnh báo thực phẩm sắp hết hạn để ưu tiên sử dụng.
4. **Tự động tạo danh sách đi chợ (Shopping List):**
   - Quét thực đơn tuần đã lập, tính toán lượng nguyên liệu cần dùng theo số người ăn, cộng dồn nguyên liệu trùng nhau và tự động khấu trừ lượng sẵn có trong tủ lạnh để đưa ra danh sách cần mua thêm.
5. **Trợ lý Chatbot AI & Điều khiển giọng nói:**
   - Tích hợp **Google Gemini API** (`gemini-2.5-flash`) kết hợp cơ chế **Function Calling** giúp người dùng tương tác tự nhiên (văn bản/giọng nói) để thêm nhanh nguyên liệu vào tủ lạnh, thay đổi món ăn trong thực đơn hoặc gợi ý món.
6. **Phân tích dinh dưỡng & AI Insights:**
   - Tổng hợp calories, protein, carbs, fat theo ngày/tuần dưới dạng biểu đồ trực quan (Chart.js) và cung cấp các lời khuyên cải thiện thực đơn từ AI.
7. **Xuất báo cáo PDF:**
   - Hỗ trợ xuất thực đơn tuần và danh sách mua sắm ra file PDF để in ấn hoặc mang theo đi chợ.

---

## 🛠️ Công Nghệ Sử Dụng

### Frontend
- **React 19 & Next.js 16 (App Router)**
- **TypeScript** & **Tailwind CSS 4**
- **Chart.js** & **react-chartjs-2** (Biểu đồ dinh dưỡng)
- **Framer Motion** (Hiệu ứng vi tương tác)
- **Web Speech API** (Nhận diện giọng nói phía client)

### Backend
- **NestJS 11** (Framework Node.js vững chắc)
- **TypeORM 0.3.28** (ORM thao tác database)
- **PostgreSQL 8.20** (Cơ sở dữ liệu quan hệ)
- **Passport.js** & **JWT** (Xác thực bảo mật tài khoản)
- **Google Gemini API** & **Nodemailer** (Gửi mail khôi phục mật khẩu)

---

## 🚀 Hướng Dẫn Cài Đặt Và Khởi Chạy

### 1. Chuẩn bị cơ sở dữ liệu
Cài đặt **PostgreSQL** và tạo một cơ sở dữ liệu mới tên là `recipe_ai`.

### 2. Cài đặt và cấu hình Backend
- Di chuyển vào thư mục backend:
  ```bash
  cd backend
  ```
- Cài đặt dependencies:
  ```bash
  npm install
  ```
- Tạo file `.env` tại thư mục gốc backend (tham khảo cấu hình trong [.env](file:///d:/khoa_luan_tn/SRC/recipe_AI/backend/.env)):
  ```env
  PORT=3001
  DB_HOST=localhost
  DB_PORT=5432
  DB_USERNAME=your_postgres_username
  DB_PASSWORD=your_postgres_password
  DB_NAME=recipe_ai

  JWT_SECRET=your_jwt_secret_key
  JWT_EXPIRES_IN=1d
  JWT_REFRESH_SECRET=your_refresh_secret_key
  JWT_REFRESH_EXPIRES_IN=7d

  GEMINI_API_KEY=your_google_gemini_api_key

  # Cấu hình SMTP gửi mail khôi phục mật khẩu (Gmail)
  SMTP_HOST=smtp.gmail.com
  SMTP_PORT=587
  SMTP_SECURE=false
  SMTP_USER=your_email@gmail.com
  SMTP_PASS=your_gmail_app_password

  FRONTEND_URL=http://localhost:3000
  ```
- Chạy Seed dữ liệu mẫu (nếu cần thiết lập database ban đầu):
  ```bash
  npm run db:seed
  ```
- Khởi chạy backend ở chế độ phát triển:
  ```bash
  npm run start:dev
  ```
  Backend sẽ chạy tại: `http://localhost:3001`

### 3. Cài đặt và cấu hình Frontend
- Di chuyển vào thư mục frontend:
  ```bash
  cd ../frontend
  ```
- Cài đặt dependencies:
  ```bash
  npm install
  ```
- Tạo file `.env.local` tại thư mục gốc frontend để kết nối tới backend:
  ```env
  NEXT_PUBLIC_API_URL=http://localhost:3001/api/v1
  ```
- Khởi chạy ứng dụng Next.js:
  ```bash
  npm run dev
  ```
  Ứng dụng web sẽ chạy tại: `http://localhost:3000`
