// SPDX-License-Identifier: MIT

import { Router } from "express";
import { createDeleteInvoiceController, createGetInvoiceController, createPostInvoiceController } from "./invoice.controller";
import { getCreateInvoiceService, getDeleteInvoiceService, getGetInvoiceService } from "../../composition/invoice.composition";

/**
 * Trách nhiệm:
 * Khai báo route HTTP cho module invoice (`POST /invoices`,
 * `GET /invoices`, mounted dưới `/api/v1` bởi `app.ts`) và gắn Controller
 * tương ứng, lắp Service THẬT (Postgres) qua
 * `../../composition/invoice.composition.ts`.
 *
 * Important invariant — truyền HÀM factory, KHÔNG gọi nó ở đây:
 * `getCreateInvoiceService`/`getGetInvoiceService` được truyền NGUYÊN
 * VẸN (không gọi `()`) cho `createPostInvoiceController`/
 * `createGetInvoiceController` — Controller tự quyết định KHI NÀO gọi
 * chúng (chỉ sau khi validate request xong, xem
 * `invoice.controller.ts`). Nếu file này tự gọi
 * `getCreateInvoiceService()` ở đây (dù là bên trong route handler),
 * mọi request — kể cả một request sai hình dạng lẽ ra phải trả 400 —
 * sẽ phụ thuộc `DATABASE_URL` sẵn sàng trước khi validate chạy.
 *
 * Không chịu trách nhiệm:
 * - xử lý logic của request (đó là việc của Controller/Service).
 */
const invoiceRoutes = Router();

invoiceRoutes.post("/invoices", createPostInvoiceController(getCreateInvoiceService));
invoiceRoutes.get("/invoices", createGetInvoiceController(getGetInvoiceService));
invoiceRoutes.delete("/invoices/:invoiceId", createDeleteInvoiceController(getDeleteInvoiceService));

export default invoiceRoutes;
