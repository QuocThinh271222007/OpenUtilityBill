// SPDX-License-Identifier: MIT

/**
 * Trách nhiệm:
 * Kiểm tra hình dạng (shape) của một BIGINT ID biểu diễn dưới dạng
 * chuỗi — dùng CHUNG bởi mọi module (invoice, property, room,
 * meter-reading, tariff) nhận `roomId`/`propertyId`/`tariffId`/
 * `readingId` từ request.
 *
 * Lý do tồn tại:
 * Mọi cột id trong schema là BIGINT — JS `number` không biểu diễn an
 * toàn toàn bộ khoảng giá trị BIGINT (giới hạn an toàn 2^53-1), nên ID
 * luôn được validate DƯỚI DẠNG CHUỖI bằng regex, KHÔNG BAO GIỜ
 * `Number(id)`/`parseInt(id)` (xem docs/DATABASE_ACCESS.md mục
 * "Ranh giới `BIGINT` / ID").
 *
 * Không chịu trách nhiệm:
 * - kiểm tra ID đó có THỰC SỰ tồn tại trong database hay không — đó là
 *   việc của Repository (`findById` trả `..._NOT_FOUND`).
 */
export function isPositiveIntegerId(value: string): boolean {
  return /^[1-9][0-9]*$/.test(value);
}
