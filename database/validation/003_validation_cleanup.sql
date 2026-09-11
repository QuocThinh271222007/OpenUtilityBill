-- SPDX-License-Identifier: MIT

-- ============================================================
-- Validation data cleanup (safety net)
-- ============================================================
--
-- Responsibility:
-- Xoá MỌI dòng dữ liệu do 001_domain_success_validation.sql hoặc
-- 002_domain_constraint_validation.sql có thể vô tình để lại — chỉ
-- nhận diện bằng tiền tố tên "VALIDATION_SUCCESS_" hoặc
-- "VALIDATION_CONSTRAINT_".
--
-- Does NOT:
-- - xoá bất kỳ dòng nào KHÔNG khớp chính xác các tiền tố trên. Không có
--   câu lệnh nào trong file này chạm tới dữ liệu tên
--   "Competition Default ..." (dữ liệu seed chính thức của kỳ thi).
-- - cần chạy trong tình huống bình thường. Cả hai file validation đều
--   được thiết kế để KHÔNG BAO GIỜ commit dữ liệu thử nghiệm (không
--   file nào chứa câu lệnh COMMIT) — mọi block validation tự dọn dẹp
--   bằng ROLLBACK. File này CHỈ là lớp an toàn bổ sung cho trường hợp
--   bất thường (ví dụ ai đó vô tình gõ COMMIT khi tự thử nghiệm thêm).
--
-- CÁCH DÙNG:
-- Chạy các câu SELECT (COUNT/preview) TRƯỚC mỗi DELETE để tự kiểm tra
-- chính xác những gì sẽ bị xoá. Nếu count = 0, DELETE tương ứng sẽ
-- không xoá gì (an toàn để chạy dù không cần thiết).
--
-- Thứ tự xoá tuân theo chiều phụ thuộc khoá ngoại (con trước, cha sau):
-- meter_readings -> rooms -> rental_properties; electricity_tariffs
-- (tự CASCADE xoá electricity_tariff_tiers của chính nó); water_tariffs.

-- ------------------------------------------------------------
-- Xem trước (preview) — chạy trước, không thay đổi dữ liệu
-- ------------------------------------------------------------

SELECT COUNT(*) AS validation_meter_readings_to_delete
FROM meter_readings mr
JOIN rooms r ON r.id = mr.room_id
JOIN rental_properties p ON p.id = r.property_id
WHERE p.name LIKE 'VALIDATION_SUCCESS_%' OR p.name LIKE 'VALIDATION_CONSTRAINT_%';

SELECT COUNT(*) AS validation_rooms_to_delete
FROM rooms r
JOIN rental_properties p ON p.id = r.property_id
WHERE p.name LIKE 'VALIDATION_SUCCESS_%' OR p.name LIKE 'VALIDATION_CONSTRAINT_%';

SELECT COUNT(*) AS validation_fk_test_rooms_to_delete
FROM rooms
WHERE name LIKE 'VALIDATION_CONSTRAINT_%';
-- (Phòng trường hợp D17 để lại room không gắn qua property khớp tiền tố
-- — trong thiết kế bình thường điều này không xảy ra vì D17 tự ROLLBACK.)

SELECT COUNT(*) AS validation_properties_to_delete
FROM rental_properties
WHERE name LIKE 'VALIDATION_SUCCESS_%' OR name LIKE 'VALIDATION_CONSTRAINT_%';

SELECT COUNT(*) AS validation_electricity_tariffs_to_delete
FROM electricity_tariffs
WHERE name LIKE 'VALIDATION_SUCCESS_%' OR name LIKE 'VALIDATION_CONSTRAINT_%';
-- Xoá các dòng này sẽ CASCADE xoá luôn electricity_tariff_tiers của
-- chúng (ON DELETE CASCADE — xem migration).

SELECT COUNT(*) AS validation_water_tariffs_to_delete
FROM water_tariffs
WHERE name LIKE 'VALIDATION_SUCCESS_%' OR name LIKE 'VALIDATION_CONSTRAINT_%';

-- ------------------------------------------------------------
-- Xoá thật (chỉ chạy nếu các count phía trên > 0)
-- ------------------------------------------------------------

DELETE FROM meter_readings
WHERE room_id IN (
    SELECT r.id
    FROM rooms r
    JOIN rental_properties p ON p.id = r.property_id
    WHERE p.name LIKE 'VALIDATION_SUCCESS_%' OR p.name LIKE 'VALIDATION_CONSTRAINT_%'
);

DELETE FROM rooms
WHERE property_id IN (
    SELECT id FROM rental_properties
    WHERE name LIKE 'VALIDATION_SUCCESS_%' OR name LIKE 'VALIDATION_CONSTRAINT_%'
)
OR name LIKE 'VALIDATION_CONSTRAINT_%';

DELETE FROM rental_properties
WHERE name LIKE 'VALIDATION_SUCCESS_%' OR name LIKE 'VALIDATION_CONSTRAINT_%';

DELETE FROM electricity_tariffs
WHERE name LIKE 'VALIDATION_SUCCESS_%' OR name LIKE 'VALIDATION_CONSTRAINT_%';

DELETE FROM water_tariffs
WHERE name LIKE 'VALIDATION_SUCCESS_%' OR name LIKE 'VALIDATION_CONSTRAINT_%';

-- ------------------------------------------------------------
-- Xác nhận sau khi xoá
-- ------------------------------------------------------------

SELECT COUNT(*) AS remaining_validation_rows
FROM (
    SELECT id FROM rental_properties WHERE name LIKE 'VALIDATION_SUCCESS_%' OR name LIKE 'VALIDATION_CONSTRAINT_%'
    UNION ALL
    SELECT id FROM electricity_tariffs WHERE name LIKE 'VALIDATION_SUCCESS_%' OR name LIKE 'VALIDATION_CONSTRAINT_%'
    UNION ALL
    SELECT id FROM water_tariffs WHERE name LIKE 'VALIDATION_SUCCESS_%' OR name LIKE 'VALIDATION_CONSTRAINT_%'
) AS leftovers;
-- Kỳ vọng: 0.

SELECT COUNT(*) AS competition_seed_rows_still_present
FROM electricity_tariffs
WHERE name = 'Competition Default Electricity Tariff';
-- Kỳ vọng: 1 (không bị chạm tới bởi bất kỳ câu lệnh nào ở trên).
