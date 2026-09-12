# Hướng dẫn phát triển

Các lệnh dưới đây khớp CHÍNH XÁC với repository hiện tại. `frontend/` và
`backend/` là hai dự án npm độc lập — không có `package.json` ở cấp
gốc.

## Yêu cầu trước

- Node.js (đã test với v24.x)
- npm (đã test với v11.x)

## Clone

```bash
git clone https://github.com/QuocThinh271222007/OpenUtilityBill.git
cd OpenUtilityBill
```

## Backend

```bash
cd backend
npm install
cp .env.example .env   # sửa giá trị nếu cần; PORT mặc định 3000
```

**Lưu ý:** chỉ sửa `.env` là chưa đủ để `DATABASE_URL` có tác dụng —
xem mục "Thiết lập môi trường" bên dưới.

| Lệnh | Mục đích |
|---|---|
| `npm run dev` | Chạy backend với auto-reload (`tsx watch`). |
| `npm run typecheck` | Chạy `tsc --noEmit` — kiểm tra kiểu mà không emit file. |
| `npm run build` | Biên dịch TypeScript sang `backend/dist/`. |
| `npm start` | Chạy server đã biên dịch (`node dist/server.js`). Cần chạy `npm run build` trước. |
| `npm test` | Chạy toàn bộ test backend (test runner có sẵn của Node `node:test`, chạy qua `tsx` — không dùng Jest/Vitest/Mocha). Bao phủ `backend/src/**/*.test.ts`: Calculation Core (bao gồm cả bộ test case tham chiếu chính thức), test unit cho config/adapter database, test unit cho việc ánh xạ dòng/ngữ nghĩa lỗi của Repository, mọi orchestration của Service quản lý/hoá đơn (dùng Repository giả, không có PostgreSQL), và tầng HTTP của mỗi module (hàm thuần `*.http.ts` + `*.controller.ts` với Service giả). Các test cần kết nối PostgreSQL thật (`*.integration.test.ts`) tự động **SKIP** (không FAIL) khi `DATABASE_URL` chưa đặt — bao gồm `invoice.api.integration.test.ts`, test này chạy thật app Express qua một round-trip HTTP thật (`app.listen(0)` + `fetch` có sẵn, không dùng `supertest`). **Lưu ý:** `backend/tsconfig.json` loại trừ `src/**/__tests__/**`, nên lệnh này KHÔNG tự type-check các file test — một lần chạy `tsc` strict riêng, bao phủ toàn bộ `__tests__/**`, đã xác nhận PASS (0 lỗi); xem `docs/MANAGEMENT_API.md` mục "Test-source typecheck: đã đóng (trước đây là nợ kỹ thuật)". |

Kiểm tra hoạt động:

```bash
curl http://localhost:3000/api/v1/health
# {"success":true,"data":{"status":"ok"}}
```

Với `DATABASE_URL` đã đặt (migration + seed đã chạy), thử REST API hoá
đơn — xem [`docs/API.md`](API.md) để có hợp đồng request/response đầy
đủ:

```bash
curl -X POST http://localhost:3000/api/v1/invoices \
  -H "Content-Type: application/json" \
  -d '{"roomId":"1","billingPeriod":"2026-09-01","electricityBillingMethod":"QUOTA_TIERED","waterBillingMethod":"PER_CUBIC_METER","actualChargedAmount":null}'

curl "http://localhost:3000/api/v1/invoices?roomId=1&billingPeriod=2026-09-01"
```

Management API — property, room, meter reading, và cấu hình biểu giá —
được mô tả trong [`docs/MANAGEMENT_API.md`](MANAGEMENT_API.md):

```bash
curl -X POST http://localhost:3000/api/v1/properties \
  -H "Content-Type: application/json" \
  -d '{"name":"Khu trọ A","address":null}'

curl http://localhost:3000/api/v1/rooms
```

## Frontend

```bash
cd frontend
npm install
```

| Lệnh | Mục đích |
|---|---|
| `npm run dev` | Chạy Vite dev server (proxy `/api` tới `http://localhost:3000`, xem `frontend/vite.config.ts`). |
| `npm run typecheck` | Chạy `tsc --noEmit`. |
| `npm run build` | Type-check, rồi build production vào `frontend/dist/`. |

Frontend không có script `npm test` — không có framework test nào được
đưa vào theo chủ đích (xem `docs/FRONTEND.md` mục "Những gì thực sự
được test runtime"). `npm run typecheck`/`npm run build` là bước kiểm
tra đúng đắn tại compile-time của frontend.

Mở `http://localhost:5173` (hoặc cổng trống kế tiếp mà Vite báo) sau
khi chạy `npm run dev`. Để badge trạng thái backend trong sidebar hiển
thị "Backend hoạt động", backend cũng phải đang chạy (`npm run dev`
trong `backend/`, ở một terminal khác) — nhưng khung ứng dụng, điều
hướng, và mọi màn hình vẫn render kể cả khi không gọi được backend; chỉ
các lời gọi API của mỗi màn hình sẽ thất bại (hiển thị dưới dạng một
alert kèm message lỗi từ chính backend, hoặc một message chung an toàn
khi lỗi mạng — xem `docs/FRONTEND.md` mục "Ranh giới API client"). Xem
[`docs/FRONTEND.md`](FRONTEND.md) để có sơ đồ màn hình/kiến trúc đầy
đủ.

## Thiết lập môi trường

- Biến môi trường backend được ghi trong `backend/.env.example`. Copy
  nó thành `backend/.env` rồi sửa tại máy local — `.env` bị git-ignore
  và không bao giờ được commit. **Backend không dùng dotenv và không
  tự động đọc `backend/.env`** — `backend/src/config/database.config.ts`
  chỉ đọc đúng biến môi trường `process.env.DATABASE_URL` của chính
  tiến trình Node đang chạy, nên giá trị trong `.env` phải được tự nạp
  vào biến môi trường của shell trước khi chạy `npm start`/`npm run
  dev`. Trên Windows PowerShell:

  ```powershell
  $env:DATABASE_URL = '<SUPABASE_DATABASE_URL>'
  ```

  rồi chạy `npm start`/`npm run dev` từ **cùng** cửa sổ PowerShell đó
  (biến chỉ áp dụng cho tiến trình hiện tại và tiến trình con của nó).
  Trên Bash/Linux: `export DATABASE_URL='<SUPABASE_DATABASE_URL>'`. Xem
  `docs/FINAL_SMOKE_CHECKLIST.md` mục "Chuẩn bị" để có hướng dẫn đầy đủ
  kèm cách kiểm tra biến đã có mặt mà không in ra giá trị thật.
- `DATABASE_URL` là bắt buộc để chạy bất cứ thứ gì chạm tới database:
  tầng Repository, mọi REST endpoint dưới `/api/v1` trừ `/health`
  (`npm run dev`/`start`), và các test `*.integration.test.ts`. Health
  endpoint (`GET /api/v1/health`) vẫn KHÔNG chạm database và hoạt động
  kể cả khi chưa đặt `DATABASE_URL` — xem `docs/DATABASE_ACCESS.md`.
  Validate request ở mọi endpoint (body sai định dạng, hình dạng ngày
  sai, ...) cũng KHÔNG cần `DATABASE_URL` — chỉ request thực sự chạm
  tới Repository/Calculation Core mới cần (xem `docs/API.md`,
  `docs/MANAGEMENT_API.md`). Không bao giờ đặt một connection string
  Supabase thật vào một file đã commit.

## Cấu trúc repository

```
OpenUtilityBill/
  backend/     REST API Node.js + TypeScript + Express, domain model,
               Calculation Core (backend/src/calculation/), adapter
               database (backend/src/database/), tầng Repository
               (backend/src/repositories/)
  frontend/    Client Vite + TypeScript + Bootstrap — api/, types/,
               utils/, controllers/, views/ (xem docs/FRONTEND.md)
  database/    Schema PostgreSQL (migrations/), dữ liệu seed (seeds/),
               và SQL kiểm chứng runtime (validation/)
  docs/        Tài liệu kiến trúc, truy cập database, tính toán, API/
               API quản lý, frontend, và tài liệu học tập
```
