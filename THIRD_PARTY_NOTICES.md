# Third-Party Notices (Thông báo bên thứ ba)

File này ghi lại mọi dependency bên thứ ba trực tiếp (không transitive)
trong repository này, cộng với các nền tảng runtime/hosting mà ứng
dụng phụ thuộc. Thông tin license cho các package npm đã được kiểm
chứng từ chính metadata `package.json` của từng package đã cài, không
phải giả định.

## Backend (`backend/`)

| Package | Phiên bản đã cài | Mục đích | URL dự án | License |
|---|---|---|---|---|
| express | 4.22.2 | Framework HTTP tối giản dùng cho routing và bề mặt REST API. | https://expressjs.com/ | MIT |
| postgres | 3.4.9 | Client PostgreSQL ("Postgres.js") được tầng Repository dùng để chạy SQL tham số hoá trên PostgreSQL host bởi Supabase. Đây là một *client* database, không phải một ORM/query-builder — xem `docs/DATABASE_ACCESS.md`. | https://github.com/porsager/postgres | Unlicense |
| @types/express | (dev) | Định nghĩa kiểu TypeScript cho Express. | https://www.npmjs.com/package/@types/express | MIT |
| @types/node | (dev) | Định nghĩa kiểu TypeScript cho runtime Node.js. | https://www.npmjs.com/package/@types/node | MIT |
| tsx | 4.23.13 (dev) | Chạy TypeScript trực tiếp với auto-reload trong `npm run dev`, và thực thi file `.test.ts` cho `npm test` — tránh một bước build thủ công. | https://github.com/privatenumber/tsx | MIT |
| typescript | 5.9.3 (dev) | Kiểu tĩnh và biên dịch cho mã nguồn backend. | https://www.typescriptlang.org/ | Apache-2.0 |

## Frontend (`frontend/`)

| Package | Phiên bản đã cài | Mục đích | URL dự án | License |
|---|---|---|---|---|
| bootstrap | 5.3.8 | Thư viện component CSS dùng cho layout và UI cơ bản (badge, container, spacing). Import như một package, không vendor vào mã nguồn. | https://getbootstrap.com/ | MIT |
| vite | 6.4.3 (dev) | Dev server và bundler production cho client TypeScript frontend. | https://vite.dev/ | MIT |
| typescript | 5.9.3 (dev) | Kiểu tĩnh và biên dịch cho mã nguồn frontend. | https://www.typescriptlang.org/ | Apache-2.0 |

## Runtime / nền tảng / dịch vụ hosted (KHÔNG phải dependency npm)

Đây **không** phải các package cài vào repository này — đây là runtime
mà code thực thi trên đó, và một dịch vụ bên thứ ba hosted mà backend
kết nối tới qua mạng. Không cái nào trong số này được bundle vào, hay
phân phối cùng, mã nguồn của repository này.

| Tên | Vai trò trong dự án này | URL dự án/Vendor | License / Điều khoản |
|---|---|---|---|
| Node.js | Runtime JavaScript/TypeScript mà backend (và công cụ build của nó) thực thi trên đó. | https://nodejs.org/ | MIT |
| PostgreSQL | Engine database quan hệ lưu toàn bộ dữ liệu ứng dụng (xem `database/migrations/`). | https://www.postgresql.org/ | PostgreSQL License (được OSI công nhận, permissive) |
| Supabase | Nhà cung cấp hosting cho database PostgreSQL của dự án này (chỉ hạ tầng quản lý — dự án này không dùng Supabase Auth, Storage, hay client `@supabase/supabase-js`). | https://supabase.com/ | Điều khoản dịch vụ (Terms of Service) riêng của Supabase (dịch vụ hosted, không phải một cấp phép mã nguồn mở cho mã của repository này) |

## Ghi chú

- Chỉ dependency npm trực tiếp được liệt kê trong hai bảng package ở
  trên. Dependency transitive được ghi lại bởi các file
  `package-lock.json` tương ứng và không lặp lại ở đây.
- Không có dependency nào được vendor (sao chép) vào cây mã nguồn của
  repository này; tất cả được cài qua `npm install` và bị loại khỏi
  version control qua `.gitignore` (`node_modules/`).
- Không dùng ORM hay query-builder nào (Drizzle, Prisma, TypeORM,
  Sequelize, Knex, Kysely) — `postgres` là một thư viện client; SQL
  được tầng Repository viết trực tiếp (xem `docs/DATABASE_ACCESS.md`).
- Một cảnh báo mức độ trung bình tồn tại trong `qs` (một dependency
  transitive của `express` 4.x) tại thời điểm viết tài liệu này
  (GHSA-x5fp-wj9c-mxmx, GHSA-4mjr-xmp4-gh2g). Hiện chưa có bản sửa nào
  khả dụng mà không cần nâng phiên bản chính của Express; dependency
  này chưa được nâng cấp trong phiên bản hiện tại và cần đánh giá trong
  đợt bảo trì dependency tiếp theo.
