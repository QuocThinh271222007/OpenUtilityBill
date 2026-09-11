-- SPDX-License-Identifier: MIT

-- ============================================================
-- Domain/database runtime validation
-- ============================================================
--
-- Responsibility:
-- Chứng minh, bằng PostgreSQL THẬT (không chỉ đọc source code), rằng:
--   1. migration chạy được trên schema rỗng;
--   2. seed chạy được và tạo đúng dữ liệu mặc định của kỳ thi;
--   3. các CHECK/UNIQUE/FK constraint trong migration hoạt động đúng
--      như thiết kế — chấp nhận dữ liệu hợp lệ, từ chối dữ liệu không
--      hợp lệ;
--   4. transaction rollback thực sự hoàn tác toàn bộ (Atomicity).
--
-- Does NOT:
-- - implement Calculation Core, CRUD, Repository, hay bất kỳ business
--   logic nào. File này CHỈ đọc/viết trực tiếp bằng SQL để kiểm chứng
--   schema — không phải code sản phẩm.
-- - dùng PL/pgSQL, stored procedure, hay một "test framework" tự chế.
--   Mỗi phép kiểm tra là một câu SQL đơn giản; chủ repository tự đọc
--   kết quả/lỗi trả về và so sánh với "Kỳ vọng" ghi trong comment.
-- - để lại dữ liệu thử nghiệm trong database. Toàn bộ phần C-G nằm
--   trong MỘT transaction kết thúc bằng ROLLBACK; mọi hàng được tạo ra
--   ở đó (property/room/reading/tariff/tier "VALIDATION ...") biến mất
--   sau khi script chạy xong. Chỉ có dữ liệu seed hợp lệ của kỳ thi
--   (Competition Default ...) là được giữ lại — vì nó được tạo bởi
--   database/seeds/001_competition_defaults.sql, chạy TRƯỚC và NGOÀI
--   transaction ROLLBACK của file này.
--
-- CÁCH CHẠY FILE NÀY (quan trọng):
-- Dán và chạy TOÀN BỘ file này trong MỘT lần "Run" duy nhất của
-- Supabase SQL Editor (hoặc một lần gọi `psql -f`). Không chạy từng
-- đoạn A/B/C/... bằng các lần "Run" riêng biệt, vì BEGIN/SAVEPOINT chỉ
-- có ý nghĩa trong PHẠM VI MỘT session/connection. Nếu SQL Editor mở
-- một connection mới cho mỗi lần "Run", tách các đoạn ra nhiều lần Run
-- sẽ làm mất hiệu lực của SAVEPOINT/transaction đang mở.
--
-- ĐIỀU KIỆN TRƯỚC KHI CHẠY FILE NÀY:
-- 1) database/migrations/001_initial_domain_schema.sql đã chạy thành
--    công trên database (xem Phần A để tự kiểm chứng lại điều này).
-- 2) database/seeds/001_competition_defaults.sql đã chạy ÍT NHẤT một
--    lần (xem Phần B).
--
-- Về SAVEPOINT (giải thích một lần, áp dụng cho toàn bộ Phần D/E/F):
-- Trong PostgreSQL, khi một câu lệnh trong transaction vi phạm
-- constraint, PostgreSQL không chỉ từ chối câu lệnh đó — nó đánh dấu
-- TOÀN BỘ transaction hiện tại là "aborted": mọi câu lệnh sau đó (dù
-- hợp lệ) đều bị từ chối với lỗi "current transaction is aborted" cho
-- tới khi có ROLLBACK. Vì file này cố ý gây ra nhiều lỗi để CHỨNG MINH
-- constraint hoạt động, ta không thể chỉ dùng một BEGIN/COMMIT đơn.
-- SAVEPOINT tạo một "điểm phục hồi" bên trong transaction: sau khi một
-- câu lệnh cố ý gây lỗi, ROLLBACK TO SAVEPOINT quay lại đúng điểm đó —
-- transaction trở lại trạng thái khoẻ mạnh, KHÔNG mất dữ liệu setup đã
-- tạo trước đó — và các phép kiểm tra tiếp theo có thể chạy tiếp.
-- SAVEPOINT chỉ dùng ở đây (validation SQL), KHÔNG dùng trong code ứng
-- dụng ở giai đoạn hiện tại.

-- ============================================================
-- A. Environment/schema verification (read-only, không cần transaction)
-- ============================================================
-- Xác nhận migration đã tạo ĐÚNG 8 bảng domain — không suy luận từ mã
-- nguồn, mà truy vấn trực tiếp catalog của PostgreSQL.

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
-- B. Seed verification (read-only)
-- ============================================================
-- Xác nhận database/seeds/001_competition_defaults.sql đã tạo đúng dữ
-- liệu mặc định của kỳ thi. Chạy lại các truy vấn này SAU KHI chạy seed
-- lần thứ hai để đồng thời chứng minh tính idempotent (không có dòng
-- trùng lặp được tạo thêm).

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
-- Kỳ vọng: 1 (dù seed đã chạy 1 lần hay nhiều lần — chứng minh
-- idempotency, xem ON CONFLICT trong seed file).

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
-- C-G. Validation transaction (setup + constraint proofs + rollback)
-- ============================================================
-- Toàn bộ phần này nằm trong một transaction sẽ bị ROLLBACK ở cuối —
-- không có gì trong Phần C-G tồn tại lại sau khi script chạy xong.

BEGIN;

-- ------------------------------------------------------------
-- C. Valid data setup
-- ------------------------------------------------------------
-- Tạo 2 property và, dưới MỖI property, một Room tên "101" — chứng
-- minh UNIQUE(property_id, name) chỉ giới hạn trong PHẠM VI property,
-- không phải toàn hệ thống (mục 9 của yêu cầu).

INSERT INTO rental_properties (name)
VALUES ('VALIDATION Property A');
-- Kỳ vọng: PASS.

INSERT INTO rental_properties (name)
VALUES ('VALIDATION Property B');
-- Kỳ vọng: PASS.

INSERT INTO rooms (property_id, name, tenant_count)
SELECT id, '101', 4 FROM rental_properties WHERE name = 'VALIDATION Property A';
-- Kỳ vọng: PASS. (Room 101 dưới Property A)

INSERT INTO rooms (property_id, name, tenant_count)
SELECT id, '101', 2 FROM rental_properties WHERE name = 'VALIDATION Property B';
-- Kỳ vọng: PASS. (Room 101 dưới Property B — tên trùng nhưng property
-- khác nhau, nên KHÔNG vi phạm UNIQUE(property_id, name).)

-- ------------------------------------------------------------
-- D. Expected constraint failures (SAVEPOINT pattern)
-- ------------------------------------------------------------

-- D.1 — Room trùng tên TRONG CÙNG property (mục 10).
SAVEPOINT test_duplicate_room;
INSERT INTO rooms (property_id, name, tenant_count)
SELECT id, '101', 5 FROM rental_properties WHERE name = 'VALIDATION Property A';
-- Kỳ vọng: FAIL — vi phạm UNIQUE(property_id, name).
ROLLBACK TO SAVEPOINT test_duplicate_room;

-- D.2 — tenant_count âm (mục 11).
SAVEPOINT test_negative_tenant_count;
INSERT INTO rooms (property_id, name, tenant_count)
SELECT id, '102', -1 FROM rental_properties WHERE name = 'VALIDATION Property A';
-- Kỳ vọng: FAIL — vi phạm CHECK (tenant_count >= 0).
ROLLBACK TO SAVEPOINT test_negative_tenant_count;

-- D.3 — billing_period không phải ngày đầu tháng (mục 12).
SAVEPOINT test_invalid_billing_period;
INSERT INTO meter_readings (room_id, billing_period, utility_type, previous_reading, current_reading)
SELECT r.id, '2026-09-15', 'ELECTRICITY', 0, 10
FROM rooms r
JOIN rental_properties p ON p.id = r.property_id
WHERE p.name = 'VALIDATION Property A' AND r.name = '101';
-- Kỳ vọng: FAIL — vi phạm CHECK (EXTRACT(DAY FROM billing_period) = 1).
ROLLBACK TO SAVEPOINT test_invalid_billing_period;

-- Sau đó, billing_period hợp lệ (ngày 01) PHẢI được chấp nhận — đây
-- cũng chính là "Meter reading valid proof" (mục 14): previous=100,
-- current=120, meter_maximum_value=99999. Dòng này KHÔNG bị rollback —
-- nó được giữ lại để mục E/duplicate-reading dùng lại.
INSERT INTO meter_readings (
    room_id, billing_period, utility_type,
    previous_reading, current_reading, meter_maximum_value
)
SELECT r.id, '2026-09-01', 'ELECTRICITY', 100, 120, 99999
FROM rooms r
JOIN rental_properties p ON p.id = r.property_id
WHERE p.name = 'VALIDATION Property A' AND r.name = '101';
-- Kỳ vọng: PASS.

-- D.4 — utility_type không hợp lệ (mục 13).
SAVEPOINT test_invalid_utility_type;
INSERT INTO meter_readings (room_id, billing_period, utility_type, previous_reading, current_reading)
SELECT r.id, '2026-10-01', 'GAS', 0, 5
FROM rooms r
JOIN rental_properties p ON p.id = r.property_id
WHERE p.name = 'VALIDATION Property A' AND r.name = '101';
-- Kỳ vọng: FAIL — vi phạm CHECK (utility_type IN ('ELECTRICITY','WATER')).
ROLLBACK TO SAVEPOINT test_invalid_utility_type;

-- ------------------------------------------------------------
-- E. Meter maximum rejection + rollover-shaped acceptance
-- ------------------------------------------------------------

-- E.1 — current_reading vượt quá meter_maximum_value (mục 15, case 1).
SAVEPOINT test_current_above_max;
INSERT INTO meter_readings (
    room_id, billing_period, utility_type,
    previous_reading, current_reading, meter_maximum_value
)
SELECT r.id, '2026-11-01', 'ELECTRICITY', 100, 100000, 99999
FROM rooms r
JOIN rental_properties p ON p.id = r.property_id
WHERE p.name = 'VALIDATION Property A' AND r.name = '101';
-- Kỳ vọng: FAIL — vi phạm CHECK (current_reading <= meter_maximum_value).
ROLLBACK TO SAVEPOINT test_current_above_max;

-- E.2 — previous_reading vượt quá meter_maximum_value (mục 15, case 2).
SAVEPOINT test_previous_above_max;
INSERT INTO meter_readings (
    room_id, billing_period, utility_type,
    previous_reading, current_reading, meter_maximum_value
)
SELECT r.id, '2026-11-01', 'ELECTRICITY', 100000, 10, 99999
FROM rooms r
JOIN rental_properties p ON p.id = r.property_id
WHERE p.name = 'VALIDATION Property A' AND r.name = '101';
-- Kỳ vọng: FAIL — vi phạm CHECK (previous_reading <= meter_maximum_value).
ROLLBACK TO SAVEPOINT test_previous_above_max;

-- E.3 — Rollover-shaped reading (mục 16): current_reading < previous_reading
-- là HỢP LỆ vì công tơ có thể quay vòng. Đây KHÔNG chứng minh công thức
-- rollover (Calculation Core chưa tồn tại) — nó CHỈ chứng minh schema
-- không sai lầm áp đặt "current_reading >= previous_reading".
-- Dùng billing_period khác (2026-08-01) để không đụng UNIQUE với dòng
-- đã tạo ở D.3.
INSERT INTO meter_readings (
    room_id, billing_period, utility_type,
    previous_reading, current_reading, meter_maximum_value
)
SELECT r.id, '2026-08-01', 'ELECTRICITY', 99850, 120, 99999
FROM rooms r
JOIN rental_properties p ON p.id = r.property_id
WHERE p.name = 'VALIDATION Property A' AND r.name = '101';
-- Kỳ vọng: PASS.

-- E.4 — Reading trùng (room, billing_period, utility_type) với dòng đã
-- tạo ở D.3 (mục 17).
SAVEPOINT test_duplicate_reading;
INSERT INTO meter_readings (room_id, billing_period, utility_type, previous_reading, current_reading)
SELECT r.id, '2026-09-01', 'ELECTRICITY', 0, 1
FROM rooms r
JOIN rental_properties p ON p.id = r.property_id
WHERE p.name = 'VALIDATION Property A' AND r.name = '101';
-- Kỳ vọng: FAIL — vi phạm UNIQUE(room_id, billing_period, utility_type).
ROLLBACK TO SAVEPOINT test_duplicate_reading;

-- ------------------------------------------------------------
-- F. Rate range constraints (mục 18)
-- ------------------------------------------------------------
-- Dùng tariff TẠM (tên "VALIDATION ...") — không đụng tới dòng seed
-- chính thức. Mỗi test cố ý sai chỉ MỘT giá trị, các giá trị khác giữ
-- hợp lệ, để lỗi trả về quy được rõ về đúng constraint đang kiểm tra.

SAVEPOINT test_electricity_vat_above_one;
INSERT INTO electricity_tariffs (
    name, effective_from, effective_to,
    electricity_vat_rate, people_per_quota_unit, fallback_tier_number
) VALUES (
    'VALIDATION Electricity VAT Above One', '2020-01-01', NULL, 1.01, 4, 3
);
-- Kỳ vọng: FAIL — vi phạm CHECK (electricity_vat_rate <= 1).
ROLLBACK TO SAVEPOINT test_electricity_vat_above_one;

SAVEPOINT test_electricity_vat_negative;
INSERT INTO electricity_tariffs (
    name, effective_from, effective_to,
    electricity_vat_rate, people_per_quota_unit, fallback_tier_number
) VALUES (
    'VALIDATION Electricity VAT Negative', '2020-01-01', NULL, -0.01, 4, 3
);
-- Kỳ vọng: FAIL — vi phạm CHECK (electricity_vat_rate >= 0).
ROLLBACK TO SAVEPOINT test_electricity_vat_negative;

SAVEPOINT test_water_vat_above_one;
INSERT INTO water_tariffs (
    name, effective_from, effective_to,
    price_per_cubic_meter, price_per_person, vat_rate, environmental_fee_rate
) VALUES (
    'VALIDATION Water VAT Above One', '2020-01-01', NULL, 8500, 80000, 1.01, 0.10
);
-- Kỳ vọng: FAIL — vi phạm CHECK (vat_rate <= 1).
ROLLBACK TO SAVEPOINT test_water_vat_above_one;

SAVEPOINT test_environmental_fee_negative;
INSERT INTO water_tariffs (
    name, effective_from, effective_to,
    price_per_cubic_meter, price_per_person, vat_rate, environmental_fee_rate
) VALUES (
    'VALIDATION Environmental Fee Negative', '2020-01-01', NULL, 8500, 80000, 0.05, -0.01
);
-- Kỳ vọng: FAIL — vi phạm CHECK (environmental_fee_rate >= 0).
ROLLBACK TO SAVEPOINT test_environmental_fee_negative;

-- ------------------------------------------------------------
-- F (tiếp). Tier constraints (mục 19)
-- ------------------------------------------------------------
-- Tạo một tariff TẠM hợp lệ để gắn tier vào — dòng này được GIỮ LẠI
-- (không rollback) vì các test tier bên dưới cần một tariff_id tồn tại.
INSERT INTO electricity_tariffs (
    name, effective_from, effective_to,
    electricity_vat_rate, people_per_quota_unit, fallback_tier_number
) VALUES (
    'VALIDATION Tier Test Tariff', '2020-01-01', NULL, 0.08, 4, 1
);
-- Kỳ vọng: PASS.

SAVEPOINT test_tier_number_zero;
INSERT INTO electricity_tariff_tiers (tariff_id, tier_number, threshold_kwh, unit_price)
SELECT id, 0, 50, 1000 FROM electricity_tariffs WHERE name = 'VALIDATION Tier Test Tariff';
-- Kỳ vọng: FAIL — vi phạm CHECK (tier_number > 0).
ROLLBACK TO SAVEPOINT test_tier_number_zero;

SAVEPOINT test_threshold_zero;
INSERT INTO electricity_tariff_tiers (tariff_id, tier_number, threshold_kwh, unit_price)
SELECT id, 1, 0, 1000 FROM electricity_tariffs WHERE name = 'VALIDATION Tier Test Tariff';
-- Kỳ vọng: FAIL — vi phạm CHECK (threshold_kwh IS NULL OR threshold_kwh > 0).
ROLLBACK TO SAVEPOINT test_threshold_zero;

SAVEPOINT test_negative_unit_price;
INSERT INTO electricity_tariff_tiers (tariff_id, tier_number, threshold_kwh, unit_price)
SELECT id, 1, 50, -1 FROM electricity_tariffs WHERE name = 'VALIDATION Tier Test Tariff';
-- Kỳ vọng: FAIL — vi phạm CHECK (unit_price >= 0).
ROLLBACK TO SAVEPOINT test_negative_unit_price;

-- Tier hợp lệ — giữ lại để test UNIQUE ngay sau đây.
INSERT INTO electricity_tariff_tiers (tariff_id, tier_number, threshold_kwh, unit_price)
SELECT id, 1, 50, 1000 FROM electricity_tariffs WHERE name = 'VALIDATION Tier Test Tariff';
-- Kỳ vọng: PASS.

SAVEPOINT test_duplicate_tier_number;
INSERT INTO electricity_tariff_tiers (tariff_id, tier_number, threshold_kwh, unit_price)
SELECT id, 1, 999, 9999 FROM electricity_tariffs WHERE name = 'VALIDATION Tier Test Tariff';
-- Kỳ vọng: FAIL — vi phạm UNIQUE(tariff_id, tier_number), dù threshold/
-- unit_price khác dòng tier_number=1 đã có.
ROLLBACK TO SAVEPOINT test_duplicate_tier_number;

-- ------------------------------------------------------------
-- F (tiếp). Effective date range (mục 20)
-- ------------------------------------------------------------
SAVEPOINT test_invalid_effective_range;
INSERT INTO electricity_tariffs (
    name, effective_from, effective_to,
    electricity_vat_rate, people_per_quota_unit, fallback_tier_number
) VALUES (
    'VALIDATION Invalid Effective Range', '2026-09-10', '2026-09-01', 0.08, 4, 3
);
-- Kỳ vọng: FAIL — vi phạm CHECK (effective_to >= effective_from).
ROLLBACK TO SAVEPOINT test_invalid_effective_range;

-- ------------------------------------------------------------
-- F (tiếp). Foreign key proof (mục 21)
-- ------------------------------------------------------------
-- Xây một property_id CHẮC CHẮN không tồn tại, không dựa vào một số cụ
-- thể (như 999999) có thể vô tình trùng với dữ liệu thật đã có.
SAVEPOINT test_invalid_foreign_key;
INSERT INTO rooms (property_id, name, tenant_count)
VALUES (
    (SELECT COALESCE(MAX(id), 0) + 1000000 FROM rental_properties),
    'VALIDATION FK Test Room',
    1
);
-- Kỳ vọng: FAIL — vi phạm FK rooms.property_id -> rental_properties.id.
ROLLBACK TO SAVEPOINT test_invalid_foreign_key;

-- ------------------------------------------------------------
-- F (tiếp). Delete policy proof (mục 22)
-- ------------------------------------------------------------
-- Property A vẫn còn Room "101" (tạo ở Phần C) — xoá Property A phải
-- bị chặn.
SAVEPOINT test_restrict_property_delete;
DELETE FROM rental_properties WHERE name = 'VALIDATION Property A';
-- Kỳ vọng: FAIL — vi phạm FK rooms.property_id (ON DELETE RESTRICT).
ROLLBACK TO SAVEPOINT test_restrict_property_delete;

-- Ghi chú CÓ CHỦ ĐÍCH về phạm vi test: InvoiceItem CASCADE (invoice ->
-- invoice_items) và các RESTRICT khác của bảng invoices (room/tariff/
-- reading -> invoices) KHÔNG được runtime-test ở đây. Tạo một invoice
-- thật đòi hỏi calculated_total — một giá trị chỉ có ý nghĩa khi
-- Calculation Core tồn tại; tạo nó chỉ để chứng minh CASCADE sẽ là một
-- con số giả không có căn cứ, đi ngược lại nguyên tắc "không tạo dữ
-- liệu tài chính vô nghĩa" của task này. Test RESTRICT ở property/room
-- (ngay trên) đã chứng minh cơ chế RESTRICT hoạt động đúng ở tầng
-- PostgreSQL; các quan hệ ON DELETE khác của invoices/invoice_items vẫn
-- được kiểm chứng TĨNH (đọc migration) — xem docs/DATABASE_DESIGN.md
-- mục "Deletion behavior".

-- ------------------------------------------------------------
-- G. Transaction rollback proof (Atomicity) (mục 23)
-- ------------------------------------------------------------
-- Chứng minh: một SAVEPOINT bị rollback thực sự hoàn tác đúng những gì
-- nó bọc, không hơn không kém. Đây là chứng minh ở CẤP ĐỘ PostgreSQL
-- transaction — KHÔNG chứng minh transaction CreateInvoice trong tương
-- lai (workflow đó chưa tồn tại, xem docs/TRANSACTIONS.md).

SAVEPOINT test_rollback_proof;

SELECT COUNT(*) AS count_before_insert FROM rental_properties;
-- Ghi lại số dòng TRƯỚC khi insert.

INSERT INTO rental_properties (name) VALUES ('VALIDATION Rollback Proof Property');

SELECT COUNT(*) AS count_after_insert FROM rental_properties;
-- Kỳ vọng: count_after_insert = count_before_insert + 1.

ROLLBACK TO SAVEPOINT test_rollback_proof;

SELECT COUNT(*) AS count_after_rollback FROM rental_properties;
-- Kỳ vọng: count_after_rollback = count_before_insert (dòng vừa insert
-- đã biến mất — ROLLBACK TO SAVEPOINT hoàn tác đúng phạm vi của nó).

-- ------------------------------------------------------------
-- Kết thúc transaction: hoàn tác TOÀN BỘ Phần C-G.
-- ------------------------------------------------------------
-- Mọi property/room/reading/tariff/tier "VALIDATION ..." được tạo ở
-- trên (bao gồm cả những dòng KHÔNG bị rollback riêng bằng SAVEPOINT,
-- ví dụ Property A/B, các Room 101, 2 meter reading, tariff/tier tạm)
-- biến mất ngay bây giờ. Dữ liệu seed chính thức (Competition Default
-- ...) KHÔNG nằm trong transaction này nên KHÔNG bị ảnh hưởng.
ROLLBACK;

-- ============================================================
-- H. Postconditions (read-only — chạy SAU câu ROLLBACK ở trên)
-- ============================================================
-- Xác nhận: không còn dữ liệu "VALIDATION ..." nào sót lại, và dữ liệu
-- seed chính thức vẫn còn nguyên (mục 24).

SELECT COUNT(*) AS leftover_validation_properties
FROM rental_properties WHERE name LIKE 'VALIDATION %';
-- Kỳ vọng: 0.

SELECT COUNT(*) AS leftover_validation_rooms
FROM rooms WHERE name = 'VALIDATION FK Test Room';
-- Kỳ vọng: 0.

SELECT COUNT(*) AS leftover_validation_tariffs
FROM electricity_tariffs WHERE name LIKE 'VALIDATION %';
-- Kỳ vọng: 0.

SELECT COUNT(*) AS leftover_validation_water_tariffs
FROM water_tariffs WHERE name LIKE 'VALIDATION %';
-- Kỳ vọng: 0.

SELECT COUNT(*) AS competition_electricity_tariff_still_present
FROM electricity_tariffs
WHERE name = 'Competition Default Electricity Tariff' AND effective_from = '2025-05-10';
-- Kỳ vọng: 1 (dữ liệu seed chính thức KHÔNG bị xoá bởi validation).

SELECT COUNT(*) AS competition_water_tariff_still_present
FROM water_tariffs
WHERE name = 'Competition Default Water Tariff' AND effective_from = '2026-09-06';
-- Kỳ vọng: 1.
