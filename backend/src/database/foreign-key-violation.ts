// SPDX-License-Identifier: MIT

/**
 * Trách nhiệm:
 * "Đây có phải lỗi vi phạm FOREIGN KEY constraint (SQLSTATE 23503)
 * không?" — cùng cấu trúc kiểm tra với `unique-violation.ts` (xem file
 * đó cho lý do đầy đủ về cách đọc `error.code`, vốn LÀ SQLSTATE do
 * PostgreSQL trả về). DÙNG CHUNG bởi mọi Repository cần dịch một thao
 * tác DELETE bị `ON DELETE RESTRICT` chặn sang một domain error code cụ
 * thể (`PROPERTY_HAS_DEPENDENCIES`, `ROOM_HAS_DEPENDENCIES`,
 * `METER_READING_IN_USE`, `TARIFF_IN_USE`) — KHÔNG xây dựng một khung
 * dịch SQLSTATE tổng quát cho mọi constraint có thể có.
 *
 * Vì sao cần hàm này NGOÀI việc pre-check bằng SELECT (ví dụ
 * `isReferencedByInvoice`): một pre-check "đọc rồi mới xoá" không loại
 * trừ race condition — một transaction khác có thể tạo ra phụ thuộc
 * (ví dụ một invoice mới tham chiếu reading này) NGAY GIỮA lúc pre-check
 * trả về "an toàn" và câu DELETE thực sự chạy. PostgreSQL FK constraint
 * là NGUỒN THẨM QUYỀN CUỐI CÙNG (final authority) cho việc này — hàm
 * này bắt lỗi 23503 do CHÍNH constraint đó ném ra tại thời điểm DELETE
 * thực sự chạy, không phải suy đoán trước.
 *
 * Không chịu trách nhiệm:
 * - phân biệt VI PHẠM CONSTRAINT/BẢNG NÀO — mỗi Repository gọi hàm này
 *   biết rõ (từ ngữ cảnh gọi DELETE bảng nào) đó là quan hệ nào, nên tự
 *   chọn domain error code phù hợp.
 */
export function isForeignKeyViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code: unknown }).code === "23503";
}
