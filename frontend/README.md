# MealAI Frontend - Next.js Web App

Đây là phần giao diện người dùng (Frontend Web Application) của dự án **MealAI** (Hệ thống gợi ý thực đơn và nấu ăn gia đình tích hợp AI). Ứng dụng được thiết kế theo hướng trực quan, hiện đại, đáp ứng tốt trên cả máy tính và thiết bị di động (Responsive UI/UX).

---

## 🛠️ Các Tính Năng Giao Diện

1. **Dashboard (Trang Chủ):** 
   - Hiển thị cái nhìn tổng quan về thực đơn ngày hôm nay.
   - Thống kê lượng calo cần tiêu thụ của ngày hôm nay, tự động cập nhật trạng thái bữa ăn (chưa tới/đã qua) theo thời gian thực.
   - Quản lý nhanh nguyên liệu tủ lạnh và gợi ý nhanh món ăn chống lãng phí.
2. **Meal Planner (Lập Thực Đơn):**
   - Bảng thực đơn tuần trực quan (Thứ Hai đến Chủ Nhật) chia theo các bữa sáng, trưa, tối.
   - Tính năng tự động lập thực đơn bằng AI (Recommendation Engine), khóa món ăn cố định, đổi món nhanh hoặc xem chi tiết.
3. **Inventory (Quản Lý Tủ Lạnh):**
   - Thêm nguyên liệu từ danh mục chuẩn bằng thanh tìm kiếm thông minh, nhập số lượng, đơn vị và hạn sử dụng.
   - Cảnh báo trực quan hạn sử dụng của thực phẩm bằng màu sắc.
4. **Shopping List (Danh Sách Mua Sắm):**
   - Danh sách nguyên liệu cần mua tự động khấu trừ từ tủ lạnh và nhân theo khẩu phần người ăn.
   - Cho phép đánh dấu đã mua, lọc danh sách và xuất trực tiếp ra file PDF.
5. **Nutrition (Theo Dõi Dinh Dưỡng):**
   - Box hướng dẫn chi tiết về các nhóm dinh dưỡng.
   - Biểu đồ Calories, Protein, Carbs, Fat theo tuần so sánh trực quan với mục tiêu dinh dưỡng cá nhân.
   - Bảng tổng hợp chi tiết theo ngày kèm nhận xét tình trạng dinh dưỡng (thiếu, đủ, vượt mục tiêu).
   - Nhận xét chi tiết thông minh từ AI (AI Insights) về thói quen ăn uống và gợi ý cải thiện thực đơn tuần.
6. **Chatbot AI & Voice Assistant:**
   - Bong bóng chat nổi hiển thị trên mọi trang sau khi đăng nhập.
   - Tích hợp điều khiển giọng nói (Web Speech API) cho phép ra lệnh bằng giọng nói tiếng Việt tự nhiên để thêm nguyên liệu, lập thực đơn,...
7. **Admin Panel (Trang Quản Trị):**
   - Quản lý người dùng, quản trị công thức và kiểm duyệt công thức món ăn đóng góp từ người dùng với sự trợ giúp của AI Review Score.

---

## 📁 Cấu Trúc Mã Nguồn (Next.js App Router)

*   `src/app`: Định tuyến chính của ứng dụng
    *   `/login` & `/register`: Đăng nhập, đăng ký tài khoản.
    *   `/forgot-password` & `/reset-password`: Khôi phục mật khẩu.
    *   `/recipes`: Danh sách công thức nấu ăn, chi tiết món ăn và bình luận.
    *   `/inventory`: Quản lý nguyên liệu tủ lạnh.
    *   `/meal-planner`: Quản lý lập thực đơn tuần.
    *   `/shopping-list`: Phiếu đi chợ.
    *   `/nutrition`: Biểu đồ phân tích dinh dưỡng và AI Insights.
    *   `/admin`: Trang quản trị dành cho tài khoản Admin.
*   `src/components`: Các thành phần giao diện dùng chung (biểu đồ, card món ăn, chatbot widget,...).
*   `src/context`: Lưu trữ trạng thái toàn cục của ứng dụng (ví dụ: `AuthContext`).
*   `src/lib`: Cấu hình kết nối HTTP API Client (Axios).

---

## 🚀 Khởi Chạy Dự Án

### Cài đặt
```bash
npm install
```

### Cấu hình biến môi trường
Tạo file `.env.local` ở thư mục gốc của frontend:
```env
NEXT_PUBLIC_API_URL=http://localhost:3001/api/v1
```

### Chạy ở chế độ phát triển
```bash
npm run dev
```
Ứng dụng sẽ hoạt động tại địa chỉ: `http://localhost:3000`
