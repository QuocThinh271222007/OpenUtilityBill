-- SPDX-License-Identifier: MIT

-- ============================================================
-- Invoice item precision validation
-- ============================================================
--
-- Responsibility:
-- Chứng minh, bằng PostgreSQL THẬT, rằng sau
-- database/migrations/002_preserve_invoice_item_precision.sql,
-- invoice_items.quantity và invoice_items.amount lưu giữ CHÍNH XÁC
-- nhiều hơn 2 chữ số thập phân — không bị database âm thầm làm tròn.
--
-- Does NOT:
-- - giả lập một phép tính hoá đơn THẬT. quantity/amount dùng ở đây là
--   giá trị MINH HOẠ được chọn trực tiếp để có nhiều chữ số thập phân
--   (không phải kết quả một công thức tariff thật) — mục đích DUY NHẤT
--   là kiểm chứng khả năng LƯU TRỮ của database, không phải kiểm chứng
--   công thức tính tiền (công thức đã được kiểm chứng bằng 64 test
--   trong backend/src/calculation/__tests__/).
-- - để lại dữ liệu thử nghiệm. Toàn bộ nằm trong một transaction
--   ROLLBACK — không có COMMIT nào trong file này.
--
-- ĐIỀU KIỆN TRƯỚC KHI CHẠY FILE NÀY:
-- 1) database/migrations/001_initial_domain_schema.sql đã chạy.
-- 2) database/migrations/002_preserve_invoice_item_precision.sql đã chạy.
--
-- CÁCH CHẠY: dán và chạy TOÀN BỘ file này trong MỘT lần "Run" của
-- Supabase SQL Editor — không có câu lệnh nào cố ý gây lỗi, an toàn để
-- chạy trọn vẹn một lần (cùng nguyên tắc với
-- database/validation/001_domain_success_validation.sql).

SELECT COUNT(*) AS invoice_items_count_before FROM invoice_items;
-- Ghi lại số dòng TRƯỚC transaction, dùng để so sánh sau ROLLBACK.

BEGIN;

-- ------------------------------------------------------------
-- Dựng đồ thị phụ thuộc TỐI THIỂU để có thể tạo một invoice hợp lệ:
-- property -> room -> electricity_tariff (+1 tier) -> water_tariff ->
-- meter_reading (điện) -> invoice -> invoice_item.
-- water_billing_method = PER_PERSON để KHÔNG cần thêm một meter_reading
-- nước (water_reading_id được phép NULL — xem migration 001).
-- ------------------------------------------------------------

INSERT INTO rental_properties (name) VALUES ('VALIDATION_PRECISION_Property');

INSERT INTO rooms (property_id, name, tenant_count)
SELECT id, '101', 4 FROM rental_properties WHERE name = 'VALIDATION_PRECISION_Property';

INSERT INTO electricity_tariffs (
    name, effective_from, effective_to,
    electricity_vat_rate, people_per_quota_unit, fallback_tier_number
) VALUES (
    'VALIDATION_PRECISION_Electricity_Tariff', '2020-01-01', NULL, 0.08, 4, 1
);

INSERT INTO electricity_tariff_tiers (tariff_id, tier_number, threshold_kwh, unit_price)
SELECT id, 1, 50, 1000
FROM electricity_tariffs WHERE name = 'VALIDATION_PRECISION_Electricity_Tariff';

INSERT INTO water_tariffs (
    name, effective_from, effective_to,
    price_per_cubic_meter, price_per_person, vat_rate, environmental_fee_rate
) VALUES (
    'VALIDATION_PRECISION_Water_Tariff', '2020-01-01', NULL, 8500, 80000, 0.05, 0.10
);

INSERT INTO meter_readings (room_id, billing_period, utility_type, previous_reading, current_reading, meter_maximum_value)
SELECT r.id, '2026-09-01', 'ELECTRICITY', 0, 120, 99999
FROM rooms r
JOIN rental_properties p ON p.id = r.property_id
WHERE p.name = 'VALIDATION_PRECISION_Property';

-- calculated_total = 0 là giá trị GIỮ CHỖ (placeholder) — mục đích của
-- invoice này chỉ là làm "cha" hợp lệ cho invoice_item bên dưới, không
-- phải một hoá đơn thật (calculated_total thật đòi hỏi Calculation Core
-- chạy thật, ngoài phạm vi validation SQL thuần tuý này).
INSERT INTO invoices (
    room_id, billing_period, tenant_count_used,
    electricity_tariff_id, water_tariff_id,
    electricity_billing_method, water_billing_method,
    electricity_reading_id, water_reading_id,
    calculated_total, actual_charged_amount
)
SELECT
    r.id, '2026-09-01', 4,
    et.id, wt.id,
    'QUOTA_TIERED', 'PER_PERSON',
    mr.id, NULL,
    0, NULL
FROM rooms r
JOIN rental_properties p ON p.id = r.property_id
JOIN electricity_tariffs et ON et.name = 'VALIDATION_PRECISION_Electricity_Tariff'
JOIN water_tariffs wt ON wt.name = 'VALIDATION_PRECISION_Water_Tariff'
JOIN meter_readings mr ON mr.room_id = r.id AND mr.utility_type = 'ELECTRICITY'
WHERE p.name = 'VALIDATION_PRECISION_Property';

-- ------------------------------------------------------------
-- Phép kiểm chứng chính: quantity/amount với nhiều hơn 2 chữ số thập
-- phân phải được lưu và đọc lại CHÍNH XÁC.
-- ------------------------------------------------------------
INSERT INTO invoice_items (
    invoice_id, category, tier_number, quantity, unit_name, unit_price, amount, description, display_order
)
SELECT
    i.id, 'ELECTRICITY_TIER', 1,
    62.5125,           -- quantity: 4 chữ số thập phân (ví dụ minh hoạ
                        -- trong task brief: threshold 50.01 * quota 1.25)
    'kWh',
    1000,               -- unit_price: vẫn 2 chữ số thập phân như thiết kế
    124025.123456,      -- amount: 6 chữ số thập phân — giá trị MINH HOẠ,
                        -- không phải quantity * unit_price thật, chỉ để
                        -- kiểm chứng khả năng lưu trữ của cột đã nới rộng
    'VALIDATION — không phải hoá đơn thật',
    1
FROM invoices i
JOIN rooms r ON r.id = i.room_id
JOIN rental_properties p ON p.id = r.property_id
WHERE p.name = 'VALIDATION_PRECISION_Property';

SELECT quantity::text AS quantity_text, amount::text AS amount_text
FROM invoice_items ii
JOIN invoices i ON i.id = ii.invoice_id
JOIN rooms r ON r.id = i.room_id
JOIN rental_properties p ON p.id = r.property_id
WHERE p.name = 'VALIDATION_PRECISION_Property';
-- Kỳ vọng: quantity_text = '62.5125', amount_text = '124025.123456' —
-- CHÍNH XÁC từng chữ số, không bị cắt/làm tròn về 2 chữ số thập phân.

ROLLBACK;

-- ------------------------------------------------------------
-- Xác nhận không còn dữ liệu thử nghiệm (chạy SAU câu ROLLBACK ở trên)
-- ------------------------------------------------------------

SELECT COUNT(*) AS invoice_items_count_after_rollback FROM invoice_items;
-- Kỳ vọng: bằng invoice_items_count_before ở đầu file.

SELECT COUNT(*) AS leftover_validation_properties
FROM rental_properties WHERE name LIKE 'VALIDATION_PRECISION_%';
-- Kỳ vọng: 0.

SELECT COUNT(*) AS leftover_validation_tariffs
FROM electricity_tariffs WHERE name LIKE 'VALIDATION_PRECISION_%';
-- Kỳ vọng: 0.

SELECT COUNT(*) AS leftover_validation_water_tariffs
FROM water_tariffs WHERE name LIKE 'VALIDATION_PRECISION_%';
-- Kỳ vọng: 0.
