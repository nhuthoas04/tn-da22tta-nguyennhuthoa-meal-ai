# Deploy MealAI Len Render

Tai lieu nay dung cho cau truc monorepo hien tai:

- `backend`: NestJS API
- `frontend`: Next.js
- `mealai-postgres`: PostgreSQL tren Render

## 1. Chuan bi truoc khi deploy

1. Push source len GitHub.
2. Vao Render Dashboard.
3. Chon **New +** -> **Blueprint**.
4. Chon repository MealAI.
5. Render se doc file `render.yaml` va tao:
   - `mealai-postgres`
   - `mealai-backend`
   - `mealai-frontend`

## 2. Bien moi truong quan trong

### Backend

Render se tu lay bien database tu `mealai-postgres`:

- `DATABASE_URL`

Code backend van ho tro cac bien local cu:

- `DB_HOST`
- `DB_PORT`
- `DB_USERNAME`
- `DB_PASSWORD`
- `DB_NAME`

Can tu dien them neu muon dung day du tinh nang:

- `GEMINI_API_KEY`: dung cho AI chatbot, moderation, recommendation insight.
- `MAIL_HOST`, `MAIL_USER`, `MAIL_PASS`, `MAIL_FROM`: dung cho email/quen mat khau/thong bao.
- `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION`: tuy chon cho Text-to-Speech.
- `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`: tuy chon cho Text-to-Speech.

Backend da cau hinh trong `render.yaml`:

- `FRONTEND_URL=https://meal-ai-six.vercel.app`
- `DATABASE_URL` lay tu Render Postgres `connectionString`
- `DB_SSL=true`
- `DB_SYNC=true`

Ghi chu: `DB_SYNC=true` giup TypeORM tao bang tu dong luc deploy demo. Sau khi da on dinh, nen doi thanh `false` de tranh thay doi schema ngoai y muon.

### Frontend

Frontend dung:

- `NEXT_PUBLIC_API_URL=https://mealai-backend-nhuthoa.onrender.com/api/v1`

Neu doi ten service backend tren Render, phai cap nhat lai bien nay roi redeploy frontend.

## 3. Lenh build/start

### Backend

- Build command: `npm ci && npm run build`
- Start command: `npm run start:prod`

### Frontend

- Build command: `npm ci && npm run build`
- Start command: `npm run start`

## 4. Kiem tra sau deploy

Mo cac URL:

- Backend API: `https://mealai-backend-nhuthoa.onrender.com/api/v1/recipes`
- Frontend: `https://meal-ai-six.vercel.app`

Kiem tra trong app:

- Dang ky/dang nhap.
- Danh sach cong thuc.
- Upload anh mon an.
- Meal Planner.
- Dinh duong & AI Insights.
- Chatbot/Voice Assistant neu da cau hinh API key.

## 5. Luu y ve upload anh

Render free web service co filesystem tam thoi. Anh upload vao `backend/uploads` co the mat khi redeploy/restart.

De dung on dinh nen chon mot trong cac cach:

- Gan persistent disk cho backend tren Render.
- Hoac chuyen upload anh sang Cloudinary/S3/Supabase Storage.

## 6. Loi thuong gap

### Frontend goi API bi CORS

Kiem tra backend env:

```text
FRONTEND_URL=https://meal-ai-six.vercel.app
```

### Frontend van goi localhost

Kiem tra frontend env:

```text
NEXT_PUBLIC_API_URL=https://mealai-backend-nhuthoa.onrender.com/api/v1
```

Sau khi sua env, can redeploy frontend.

### Database khong tao bang

Kiem tra backend env:

```text
DB_SYNC=true
```

Sau khi deploy demo thanh cong co the doi lai:

```text
DB_SYNC=false
```
