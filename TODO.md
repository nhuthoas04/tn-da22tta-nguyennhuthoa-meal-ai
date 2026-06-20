# TODO - Shopping List Share (MealAI Share Sheet)

## Current status
- [x] Đã có helper `formatShoppingListShareText(shoppingList)` trong `frontend/src/lib/shareHelper.ts`.
- [x] Đã cố gắng chỉnh `frontend/src/app/shopping-list/page.tsx` nhưng chưa đạt spec share mới.

## Next implementation steps (cần thực hiện)
1. [ ] Refactor `frontend/src/app/shopping-list/page.tsx`:
   - Xóa hoàn toàn luồng `handleNativeShare` đang gọi `navigator.share` trên desktop.
   - Thêm state modal: `isShareModalOpen`.
   - Nút “Chia sẻ” trên desktop chỉ mở modal MealAI.
2. [ ] Thêm helper functions trong `page.tsx`:
   - `copyShareText()` (copy shareText vào clipboard + toast đúng yêu cầu).
   - `openShareTarget(target)` (copy trước, rồi `window.open` link tương ứng hoặc mailto).
   - `handleSystemShare()` (nếu `navigator.share` tồn tại thì shareText, nếu không thì copy).
   - `detectDesktop` theo `userAgent` (đúng lựa chọn trước đó).
3. [ ] Logic mobile:
   - Nếu detect mobile: bấm “Chia sẻ” gọi native share ưu tiên `navigator.share`.
   - Nếu không hỗ trợ thì copy.
4. [ ] UI modal/bottom sheet:
   - Tiêu đề: “Chia sẻ danh sách mua sắm”.
   - Dạng grid icon, có nút đóng.
   - Lựa chọn: Zalo, Messenger, Facebook, Instagram, Gmail, Copy nội dung, Chia sẻ bằng hệ thống.
5. [ ] Sửa UI header:
   - Ngoài nút “Chia sẻ”, không hiển thị các nút PDF/In/Copy riêng.
6. [ ] Chạy kiểm tra build/lint (nếu có thể).

