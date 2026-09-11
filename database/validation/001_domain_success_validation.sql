-- SPDX-License-Identifier: MIT

-- ============================================================
-- Domain/database success validation
-- ============================================================
--
-- Responsibility:
-- Chứng minh, bằng PostgreSQL THẬT, rằng:
--   1. migration đã tạo đúng 8 bảng domain;
--   2. seed đã tạo đúng dữ liệu mặc định của kỳ thi;
--   3. dữ liệu HỢP LỆ (kể cả dữ liệu có "hình dạng" rollover) được
--      database chấp nhận đúng như thiết kế;
--   4. một transaction bị ROLLBACK sẽ không để lại dấu vết nào.
--
-- Does NOT:
-- - chứa BẤT KỲ câu lệnh nào được kỳ vọng gây lỗi. File này CHỈ gồm các
--   câu lệnh PASS — xem database/validation/002_domain_constraint_validation.sql
--   cho các phép kiểm tra constraint (nơi lỗi PostgreSQL LÀ kết quả
--   đúng, cố ý tách riêng khỏi file này).
-- - implement Calculation Core, CRUD, Repository, hay business logic.
-- - dùng PL/pgSQL, stored procedure, hay một "test framework" tự chế —
--   chỉ SQL thuần, chủ repository tự đọc kết quả và so sánh với "Kỳ
--   vọng" ghi trong comment.
--
-- CÁCH CHẠY FILE NÀY:
-- File này có thể dán và chạy TOÀN BỘ trong MỘT lần "Run" của Supabase
-- SQL Editor, vì không có câu lệnh nào cố ý gây lỗi — không cần
-- SAVEPOINT, không có rủi ro SQL Editor dừng giữa chừng.
--
-- ĐIỀU KIỆN TRƯỚC KHI CHẠY FILE NÀY:
-- 1) database/migrations/001_initial_domain_schema.sql đã chạy thành
--    công (Phần A tự kiểm chứng lại điều này).
-- 2) database/seeds/001_competition_defaults.sql đã chạy ít nhất một
--    lần (Phần B tự kiểm chứng lại điều này).

-- ============================================================
-- A. Schema/table verification
-- ============================================================
-- Xác nhận migration đã tạo ĐÚNG 8 bảng domain — truy vấn trực tiếp
-- catalog của PostgreSQL, không suy luận từ mã nguồn.

SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'rental_properties',
    'rooms',
    'meter_readings',
    'electricity_tariffs',
    'electricity_tariff_tiers',
    'water_tariffs',
    'invoices',
    'invoice_items'
  )
ORDER BY table_name;
-- Kỳ vọng: đúng 8 dòng, đủ tên 8 bảng trên.

SELECT COUNT(*) AS domain_table_count
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'rental_properties',
    'rooms',
    'meter_readings',
    'electricity_tariffs',
    'electricity_tariff_tiers',
    'water_tariffs',
    'invoices',
    'invoice_items'
  );
-- Kỳ vọng: domain_table_count = 8.

-- ============================================================
-- B. Competition seed verification
-- ============================================================
-- Nếu bạn vừa chạy seed LẦN THỨ HAI để kiểm chứng idempotency, chạy lại
-- các truy vấn COUNT(*) trong phần này — mọi count vẫn phải giữ nguyên
-- (1 tariff điện, 6 tier, 1 tariff nước), không tăng gấp đôi.

SELECT
    name,
    effective_from,
    effective_to,
    electricity_vat_rate,
    people_per_quota_unit,
    fallback_tier_number
FROM electricity_tariffs
WHERE name = 'Competition Default Electricity Tariff'
  AND effective_from = '2025-05-10';
-- Kỳ vọng: đúng 1 dòng —
--   effective_from = 2025-05-10, effective_to = 2026-12-31,
--   electricity_vat_rate = 0.0800, people_per_quota_unit = 4,
--   fallback_tier_number = 3.

SELECT COUNT(*) AS competition_electricity_tariff_count
FROM electricity_tariffs
WHERE name = 'Competition Default Electricity Tariff'
  AND effective_from = '2025-05-10';
-- Kỳ vọng: 1 (dù seed đã chạy 1 lần hay nhiều lần).

SELECT tier.tier_number, tier.threshold_kwh, tier.unit_price
FROM electricity_tariff_tiers tier
JOIN electricity_tariffs t ON t.id = tier.tariff_id
WHERE t.name = 'Competition Default Electricity Tariff'
  AND t.effective_from = '2025-05-10'
ORDER BY tier.tier_number;
-- Kỳ vọng: đúng 6 dòng theo thứ tự —
--   1 |  50 | 1984
--   2 |  50 | 2050
--   3 | 100 | 2380
--   4 | 100 | 2998
--   5 | 100 | 3350
--   6 |NULL | 3460

SELECT COUNT(*) AS competition_electricity_tier_count
FROM electricity_tariff_tiers tier
JOIN electricity_tariffs t ON t.id = tier.tariff_id
WHERE t.name = 'Competition Default Electricity Tariff'
  AND t.effective_from = '2025-05-10';
-- Kỳ vọng: 6 (không tăng lên 12 sau lần seed thứ hai).

SELECT
    name,
    effective_from,
    effective_to,
    price_per_cubic_meter,
    price_per_person,
    vat_rate,
    environmental_fee_rate
FROM water_tariffs
WHERE name = 'Competition Default Water Tariff'
  AND effective_from = '2026-09-06';
-- Kỳ vọng: đúng 1 dòng —
--   effective_from = 2026-09-06, effective_to = NULL,
--   price_per_cubic_meter = 8500.00, price_per_person = 80000.00,
--   vat_rate = 0.0500, environmental_fee_rate = 0.1000.

SELECT COUNT(*) AS competition_water_tariff_count
FROM water_tariffs
WHERE name = 'Competition Default Water Tariff'
  AND effective_from = '2026-09-06';
-- Kỳ vọng: 1.

-- ============================================================
-- C. Valid-data proof (setup) + D. Rollover-shaped input
-- ============================================================
-- Toàn bộ Phần C/D nằm trong MỘT transaction bị ROLLBACK ở Phần E —
-- không có gì ở đây tồn tại lại sau khi script chạy xong. Tên các
-- property dùng tiền tố "VALIDATION_SUCCESS_" để Phần E dễ xác minh
-- không còn sót lại.

SELECT COUNT(*) AS rental_properties_count_before
FROM rental_properties;
-- Ghi lại số dòng TRƯỚC khi transaction bắt đầu, dùng để so sánh ở
-- Phần E sau khi ROLLBACK.

BEGIN;

-- C.1 — Hai property khác nhau, mỗi property có một Room tên "101".
-- Chứng minh UNIQUE(property_id, name) chỉ giới hạn TRONG PHẠM VI một
-- property, không phải toàn hệ thống.
INSERT INTO rental_properties (name) VALUES ('VALIDATION_SUCCESS_Property_A');
-- Kỳ vọng: PASS.

INSERT INTO rental_properties (name) VALUES ('VALIDATION_SUCCESS_Property_B');
-- Kỳ vọng: PASS.

INSERT INTO rooms (property_id, name, tenant_count)
SELECT id, '101', 4 FROM rental_properties WHERE name = 'VALIDATION_SUCCESS_Property_A';
-- Kỳ vọng: PASS. (tenant_count = 4 được chấp nhận)

INSERT INTO rooms (property_id, name, tenant_count)
SELECT id, '101', 2 FROM rental_properties WHERE name = 'VALIDATION_SUCCESS_Property_B';
-- Kỳ vọng: PASS. (Room "101" trùng tên với room ở Property A, nhưng
-- thuộc property KHÁC — không vi phạm UNIQUE(property_id, name).)

-- C.2 — Chỉ số điện hợp lệ cho Room 101 @ Property A: billing_period là
-- ngày đầu tháng (2026-09-01), utility_type = ELECTRICITY, chỉ số tăng
-- bình thường (100 -> 120), có khai báo meter_maximum_value = 99999.
INSERT INTO meter_readings (
    room_id, billing_period, utility_type,
    previous_reading, current_reading, meter_maximum_value
)
SELECT r.id, '2026-09-01', 'ELECTRICITY', 100, 120, 99999
FROM rooms r
JOIN rental_properties p ON p.id = r.property_id
WHERE p.name = 'VALIDATION_SUCCESS_Property_A' AND r.name = '101';
-- Kỳ vọng: PASS.

-- D — Rollover-shaped input: previous_reading (99850) LỚN HƠN
-- current_reading (120), vẫn trong giới hạn meter_maximum_value
-- (99999). Dùng billing_period khác (2026-08-01) để không vi phạm
-- UNIQUE(room_id, billing_period, utility_type) với dòng ở C.2.
--
-- QUAN TRỌNG: câu lệnh này CHỈ chứng minh schema CHO PHÉP dữ liệu có
-- "hình dạng" rollover (không sai lầm áp đặt current_reading >=
-- previous_reading). Nó KHÔNG chứng minh công thức tính rollover —
-- Calculation Core (việc tính usage thực tế khi công tơ quay vòng)
-- chưa tồn tại và không phải phạm vi của task này.
INSERT INTO meter_readings (
    room_id, billing_period, utility_type,
    previous_reading, current_reading, meter_maximum_value
)
SELECT r.id, '2026-08-01', 'ELECTRICITY', 99850, 120, 99999
FROM rooms r
JOIN rental_properties p ON p.id = r.property_id
WHERE p.name = 'VALIDATION_SUCCESS_Property_A' AND r.name = '101';
-- Kỳ vọng: PASS.

SELECT COUNT(*) AS rental_properties_count_during
FROM rental_properties;
-- Kỳ vọng: rental_properties_count_during = rental_properties_count_before + 2
-- (2 property vừa insert ở C.1, còn nhìn thấy được TRONG transaction
-- này vì chưa COMMIT/ROLLBACK).

-- ============================================================
-- E. Transaction rollback proof (Atomicity)
-- ============================================================
-- Hoàn tác TOÀN BỘ Phần C/D. Đây là chứng minh ở CẤP ĐỘ PostgreSQL
-- transaction (Atomicity) — KHÔNG chứng minh transaction CreateInvoice
-- trong tương lai (workflow đó chưa tồn tại, xem docs/TRANSACTIONS.md).
ROLLBACK;

-- Các truy vấn dưới đây chạy SAU câu ROLLBACK ở trên (không còn trong
-- transaction nào) để xác nhận không còn sót lại dữ liệu thử nghiệm.

SELECT COUNT(*) AS rental_properties_count_after_rollback
FROM rental_properties;
-- Kỳ vọng: rental_properties_count_after_rollback = rental_properties_count_before
-- (bằng số đo TRƯỚC transaction — 2 property vừa tạo đã biến mất).

SELECT COUNT(*) AS leftover_validation_success_properties
FROM rental_properties WHERE name LIKE 'VALIDATION_SUCCESS_%';
-- Kỳ vọng: 0.

SELECT COUNT(*) AS leftover_validation_success_readings
FROM meter_readings mr
JOIN rooms r ON r.id = mr.room_id
JOIN rental_properties p ON p.id = r.property_id
WHERE p.name LIKE 'VALIDATION_SUCCESS_%';
-- Kỳ vọng: 0.

SELECT COUNT(*) AS competition_electricity_tariff_still_present
FROM electricity_tariffs
WHERE name = 'Competition Default Electricity Tariff' AND effective_from = '2025-05-10';
-- Kỳ vọng: 1 (dữ liệu seed chính thức KHÔNG bị ảnh hưởng bởi validation).

SELECT COUNT(*) AS competition_water_tariff_still_present
FROM water_tariffs
WHERE name = 'Competition Default Water Tariff' AND effective_from = '2026-09-06';
-- Kỳ vọng: 1.
