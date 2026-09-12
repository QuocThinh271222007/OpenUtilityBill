// SPDX-License-Identifier: MIT

import type {
  ElectricityBillingMethod,
  WaterBillingMethod,
} from "../tariff/tariff.model";

/**
 * Trách nhiệm:
 * Domain types mô tả Invoice (hoá đơn) và InvoiceItem (dòng chi tiết
 * hoá đơn) — kết quả LỊCH SỬ (historical result) của việc tính hoá đơn
 * cho một Room trong một billingPeriod.
 *
 * Biểu diễn:
 * Dữ liệu tương ứng với bảng `invoices` và `invoice_items`.
 *
 * Invariants (enforce ở tầng database, xem migration):
 * - Duy nhất một invoice cho mỗi (roomId, billingPeriod) — xem
 *   "Vì sao mỗi phòng/tháng chỉ có một hoá đơn" bên dưới.
 * - `calculatedTotal >= 0`.
 * - `actualChargedAmount >= 0` khi có giá trị.
 *
 * Biểu diễn ID:
 * `id` và mọi field kết thúc bằng `...Id` là `string` (BIGINT ở
 * database) — xem ../property/property.model.ts mục "Biểu diễn ID"
 * và docs/DATABASE_ACCESS.md.
 *
 * Biểu diễn số:
 * `calculatedTotal`, `actualChargedAmount`, `quantity`, `unitPrice`,
 * `amount` đều là `string` — cùng quy ước với
 * ../meter-reading/meter-reading.model.ts và ../tariff/tariff.model.ts
 * (cột database NUMERIC, không phải FLOAT/REAL; xem
 * docs/DATABASE_DESIGN.md).
 *
 * Vì sao không có field `differenceAmount`:
 * Chênh lệch (difference = actualChargedAmount - calculatedTotal) là
 * giá trị HOÀN TOÀN SUY RA ĐƯỢC từ hai field đã có
 * (`calculatedTotal`, `actualChargedAmount`). Lưu thêm một field thứ ba
 * cho giá trị suy ra được sẽ tạo rủi ro mất đồng bộ — nếu
 * `actualChargedAmount` được sửa sau (ví dụ điều chỉnh số tiền thực
 * thu), một `differenceAmount` đã lưu trước đó sẽ trở thành SAI mà
 * không ai biết trừ khi có thêm logic đồng bộ lại nó. Nguồn sự thật
 * duy nhất (single source of truth) là `calculatedTotal` và
 * `actualChargedAmount`; `CreateInvoiceService`/`GetInvoiceService`
 * tính chênh lệch on-demand mỗi khi cần hiển thị, không lưu lại (xem
 * docs/DATABASE_DESIGN.md mục "Giá trị suy ra không được lưu trữ").
 *
 * Không chịu trách nhiệm:
 * - tính toán bất kỳ giá trị nào. File này chỉ mô tả hình dạng dữ liệu;
 *   công thức tính thuộc về Calculation Core (`backend/src/calculation/`).
 * - hỗ trợ nhiều phiên bản (revision/versioning) cho cùng một
 *   room/billingPeriod ở giai đoạn hiện tại — xem "Sửa lại hoá đơn
 *   (tương lai)" bên dưới.
 *
 * Vì sao Invoice lưu snapshot cấu hình thay vì tham chiếu dữ liệu "hiện tại":
 * `Room.tenantCount`, `ElectricityTariff`, `WaterTariff` đều có thể thay
 * đổi SAU KHI invoice đã được tạo (chủ trọ sửa số người ở, cập nhật
 * biểu giá mới, ...). Nếu Invoice chỉ lưu `roomId`/`tariffId` và tra cứu
 * giá trị "hiện tại" mỗi lần hiển thị, một hoá đơn cũ sẽ ÂM THẦM đổi số
 * tiền khi cấu hình thay đổi — một lỗi nghiêm trọng cho một ứng dụng
 * minh bạch hoá đơn. Vì vậy Invoice lưu `tenantCountUsed` (snapshot số
 * người ở tại thời điểm tính) BÊN CẠNH việc tham chiếu
 * `electricityTariffId`/`waterTariffId` (tham chiếu đúng PHIÊN BẢN
 * tariff đã dùng, không phải "tariff mới nhất"). Đây là trùng lặp dữ
 * liệu CÓ CHỦ ĐÍCH, không phải lỗi chuẩn hoá (xem
 * docs/DATABASE_DESIGN.md mục "Snapshot lịch sử có chủ đích").
 *
 * Vì sao mỗi phòng/tháng chỉ có một hoá đơn:
 * Ở phạm vi hiện tại, mỗi phòng chỉ cần một hoá đơn cho mỗi tháng.
 * Ràng buộc UNIQUE(room_id, billing_period) ngăn tạo nhầm hai hoá đơn
 * cho cùng kỳ.
 *
 * Sửa lại hoá đơn (tương lai):
 * Nếu sau này cần sửa/tạo lại hoá đơn cho cùng kỳ (ví dụ phát hiện sai
 * sót sau khi đã tạo), ràng buộc UNIQUE hiện tại sẽ CẦN một migration
 * mới (ví dụ thêm `revision_number` vào khoá UNIQUE, hoặc đánh dấu hoá
 * đơn cũ là "superseded"). Việc này CHƯA được thiết kế ở đây để tránh
 * overengineering một tính năng chưa có yêu cầu cụ thể.
 *
 * Lý do tồn tại riêng biệt với InvoiceItem:
 * Invoice là "kết quả tổng hợp" (`calculatedTotal`) của một kỳ hoá đơn;
 * InvoiceItem là TỪNG DÒNG giải thích invoice đó được tính như thế nào
 * (bậc 1 bao nhiêu tiền, VAT bao nhiêu, phí môi trường bao nhiêu, ...).
 * Tách hai model để ứng dụng có thể hiển thị breakdown chi tiết mà
 * không cần parse một trường tổng hợp hay một JSON blob.
 */
export interface Invoice {
  id: string;
  roomId: string;
  billingPeriod: Date;

  /** Snapshot của Room.tenantCount tại thời điểm tính hoá đơn này. */
  tenantCountUsed: number;

  /** Tham chiếu đúng phiên bản tariff đã dùng, không phải "mới nhất". */
  electricityTariffId: string;
  waterTariffId: string;

  electricityBillingMethod: ElectricityBillingMethod;
  waterBillingMethod: WaterBillingMethod;

  /** Bắt buộc: mọi hoá đơn đều cần chỉ số điện. */
  electricityReadingId: string;

  /**
   * Có thể NULL: phương pháp PER_PERSON tính theo số người, không cần
   * chỉ số nước thực tế (xem ../tariff/tariff.model.ts WaterBillingMethod).
   */
  waterReadingId: string | null;

  calculatedTotal: string;

  /** NULL cho tới khi số tiền thực thu được nhập sau. */
  actualChargedAmount: string | null;

  createdAt: Date;
}

/**
 * InvoiceItemCategory liệt kê các loại dòng breakdown hiện được biết
 * trước. Đây KHÔNG phải danh sách đầy đủ vĩnh viễn — có thể mở rộng khi
 * Calculation Core thực sự cần thêm loại dòng mới, nhưng vẫn giữ dạng
 * TEXT + CHECK ở database (xem docs/DATABASE_DESIGN.md) thay vì một hệ
 * thống enum phức tạp.
 */
export type InvoiceItemCategory =
  | "ELECTRICITY_TIER"
  | "ELECTRICITY_VAT"
  | "WATER_BASE"
  | "WATER_VAT"
  | "WATER_ENVIRONMENTAL_FEE";

export interface InvoiceItem {
  id: string;
  invoiceId: string;
  category: InvoiceItemCategory;

  /** Chỉ có ý nghĩa cho category = ELECTRICITY_TIER. */
  tierNumber: number | null;

  quantity: string | null;
  unitName: string | null;
  unitPrice: string | null;
  amount: string;
  description: string | null;

  /** Thứ tự hiển thị dòng trong breakdown; duy nhất trong một invoice. */
  displayOrder: number;
}
