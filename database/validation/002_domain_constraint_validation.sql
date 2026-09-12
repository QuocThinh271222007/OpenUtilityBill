-- SPDX-License-Identifier: MIT

-- ============================================================
-- Domain/database constraint validation
-- ============================================================
--
-- !!! CHẠY TỪNG KHỐI TEST ĐÁNH SỐ MỘT TRONG SUPABASE SQL EDITOR !!!
-- KHÔNG paste và chạy toàn bộ file này trong một lần thực thi.
--
-- Trách nhiệm:
-- Chứng minh, bằng PostgreSQL THẬT, rằng mỗi CHECK/UNIQUE/FK constraint
-- trong migration THỰC SỰ từ chối dữ liệu không hợp lệ — mỗi khối D1-D18
-- dưới đây cố ý gây ra MỘT lỗi PostgreSQL cụ thể và ghi rõ lỗi đó là
-- lỗi gì.
--
-- Không chịu trách nhiệm:
-- - implement Calculation Core, CRUD, Repository, hay business logic.
-- - dùng PL/pgSQL, stored procedure, hay một "test framework" tự chế.
-- - sửa đổi dữ liệu seed chính thức (Biểu giá ... mặc định) — mọi
--   dòng test dùng tiền tố tên "VALIDATION_CONSTRAINT_D<n>_..." để
--   không thể nhầm với dữ liệu thật.
--
-- ============================================================
-- TẠI SAO KHÔNG CHẠY CẢ FILE MỘT LẦN (đọc kỹ trước khi chạy)
-- ============================================================
-- Phiên bản trước của validation (database/validation/001_domain_runtime_validation.sql,
-- đã bị xoá) gộp nhiều lỗi cố ý vào MỘT transaction, dùng SAVEPOINT để
-- "phục hồi" sau mỗi lỗi rồi tiếp tục câu lệnh kế tiếp. Cách đó có một
-- lỗ hổng thực thi:
--
-- SAVEPOINT là một tính năng THẬT và ĐÚNG của PostgreSQL — nó cho phép
-- hoàn tác MỘT PHẦN bên trong một transaction, quay lại đúng điểm đã
-- đánh dấu mà không mất các thay đổi trước đó. SAVEPOINT không hề "vô
-- dụng". NHƯNG SAVEPOINT chỉ có ý nghĩa NẾU sql client (Supabase SQL
-- Editor, psql, ...) tiếp tục GỬI các câu lệnh tiếp theo (ví dụ
-- `ROLLBACK TO SAVEPOINT ...`) sau khi một câu lệnh trước đó báo lỗi.
-- Nhiều SQL client — và Supabase SQL Editor có thể là một trong số đó,
-- tuỳ phiên bản/giao diện — DỪNG thực thi phần còn lại của batch ngay
-- khi gặp lỗi đầu tiên. Nếu vậy, `ROLLBACK TO SAVEPOINT ...` sau lỗi đó
-- KHÔNG BAO GIỜ được gửi đi, và mọi khối kiểm tra PHÍA SAU trong cùng
-- lần "Run" đó sẽ không chạy được nữa (transaction bị "aborted").
--
-- Vấn đề nằm ở HÀNH VI CỦA SQL CLIENT (dừng khi gặp lỗi), KHÔNG nằm ở
-- ngữ nghĩa của SAVEPOINT trong PostgreSQL. Giải pháp đúng không phải
-- là "sửa SAVEPOINT" — mà là không dựa vào việc client tiếp tục gửi
-- lệnh sau lỗi. Mỗi khối D1-D18 dưới đây vì vậy được thiết kế ĐỘC LẬP
-- HOÀN TOÀN: tự BEGIN, tự dọn dẹp bằng ROLLBACK (không SAVEPOINT), và
-- được chạy trong MỘT lần "Run" riêng cho MỖI khối — dễ thực thi, dễ
-- quan sát, dễ giải thích, dễ debug hơn một batch khổng lồ.
--
-- AN TOÀN DÙ QUÊN CHẠY ROLLBACK CUỐI KHỐI:
-- Không khối nào trong file này chứa COMMIT. Nếu Supabase SQL Editor
-- dừng lại NGAY SAU câu lệnh cố ý gây lỗi và dòng `ROLLBACK;` cuối khối
-- không được gửi, transaction đó vẫn ở trạng thái "aborted" và CHƯA
-- COMMIT — không có gì được lưu thật vào database. Dòng `ROLLBACK;` ở
-- đầu mỗi khối (trước cả BEGIN) là một lớp an toàn bổ sung: nó dọn sạch
-- một transaction có thể còn "treo" từ lần chạy khối trước, và AN TOÀN
-- dù không có transaction nào đang mở (PostgreSQL chỉ in cảnh báo
-- "there is no transaction in progress", không phải lỗi).
--
-- Ghi chú về psql (thứ yếu — không phải luồng chính của dự án):
-- Nếu chạy bằng `psql -f`, `psql` mặc định KHÔNG bật `ON_ERROR_STOP`,
-- nên nó thường tiếp tục gửi các câu lệnh còn lại trong file ngay cả
-- sau một lỗi — nhưng thiết kế của file này KHÔNG phụ thuộc vào việc
-- đó. Luồng chính thức của dự án là Supabase SQL Editor, chạy từng khối
-- riêng lẻ như hướng dẫn ở trên.
--
-- ============================================================
-- BẢNG KIỂM CHỨNG (điền tay sau khi chạy từng khối)
-- ============================================================
-- D1  ROOM_DUPLICATE_REJECTED            = PASS / FAIL
-- D2  NEGATIVE_TENANT_COUNT_REJECTED     = PASS / FAIL
-- D3  INVALID_BILLING_PERIOD_REJECTED    = PASS / FAIL
-- D4  INVALID_UTILITY_TYPE_REJECTED      = PASS / FAIL
-- D5  READING_ABOVE_MAX_REJECTED         = PASS / FAIL
-- D6  READING_ABOVE_MAX_REJECTED (previous) = PASS / FAIL
-- D7  DUPLICATE_READING_REJECTED         = PASS / FAIL
-- D8  ELECTRICITY_VAT_ABOVE_ONE_REJECTED = PASS / FAIL
-- D9  ELECTRICITY_VAT_NEGATIVE_REJECTED  = PASS / FAIL
-- D10 WATER_VAT_ABOVE_ONE_REJECTED       = PASS / FAIL
-- D11 ENVIRONMENTAL_FEE_NEGATIVE_REJECTED = PASS / FAIL
-- D12 INVALID_TIER_NUMBER_REJECTED       = PASS / FAIL
-- D13 INVALID_TIER_THRESHOLD_REJECTED    = PASS / FAIL
-- D14 NEGATIVE_UNIT_PRICE_REJECTED       = PASS / FAIL
-- D15 DUPLICATE_TIER_REJECTED            = PASS / FAIL
-- D16 INVALID_EFFECTIVE_DATE_RANGE_REJECTED = PASS / FAIL
-- D17 INVALID_FOREIGN_KEY_REJECTED       = PASS / FAIL
-- D18 PARENT_DELETE_RESTRICTED           = PASS / FAIL
--
-- "PASS" ở đây nghĩa là: PostgreSQL trả về ĐÚNG lỗi được ghi trong
-- "Kỳ vọng" của khối đó (một lỗi cố ý xảy ra LÀ kết quả test đúng, không
-- phải một thất bại). Không tự động điền PASS — người thực hiện tự
-- chạy và tự xác nhận từng dòng.


-- ============================================================
-- D1 — Room trùng tên TRONG CÙNG một property
-- ============================================================
-- Purpose: UNIQUE(property_id, name) phải từ chối hai room cùng tên
-- trong cùng một property.
-- Expected: PostgreSQL ERROR — unique_violation trên
-- rooms (UNIQUE (property_id, name)).

ROLLBACK;
BEGIN;

INSERT INTO rental_properties (name) VALUES ('VALIDATION_CONSTRAINT_D1_Property');
-- Setup — Kỳ vọng: PASS.

INSERT INTO rooms (property_id, name, tenant_count)
SELECT id, '101', 4 FROM rental_properties WHERE name = 'VALIDATION_CONSTRAINT_D1_Property';
-- Setup — Kỳ vọng: PASS.

INSERT INTO rooms (property_id, name, tenant_count)
SELECT id, '101', 5 FROM rental_properties WHERE name = 'VALIDATION_CONSTRAINT_D1_Property';
-- TEST — Kỳ vọng: FAIL — unique_violation, UNIQUE(property_id, name).

ROLLBACK;


-- ============================================================
-- D2 — tenant_count âm
-- ============================================================
-- Purpose: CHECK (tenant_count >= 0) phải từ chối tenant_count = -1.
-- Expected: PostgreSQL ERROR — check_violation.

ROLLBACK;
BEGIN;

INSERT INTO rental_properties (name) VALUES ('VALIDATION_CONSTRAINT_D2_Property');
-- Setup — Kỳ vọng: PASS.

INSERT INTO rooms (property_id, name, tenant_count)
SELECT id, '101', -1 FROM rental_properties WHERE name = 'VALIDATION_CONSTRAINT_D2_Property';
-- TEST — Kỳ vọng: FAIL — check_violation, CHECK (tenant_count >= 0).

ROLLBACK;


-- ============================================================
-- D3 — billing_period không phải ngày đầu tháng
-- ============================================================
-- Purpose: CHECK (EXTRACT(DAY FROM billing_period) = 1) phải từ chối
-- một ngày không phải ngày 01.
-- Expected: PostgreSQL ERROR — check_violation.

ROLLBACK;
BEGIN;

INSERT INTO rental_properties (name) VALUES ('VALIDATION_CONSTRAINT_D3_Property');
-- Setup — Kỳ vọng: PASS.

INSERT INTO rooms (property_id, name, tenant_count)
SELECT id, '101', 4 FROM rental_properties WHERE name = 'VALIDATION_CONSTRAINT_D3_Property';
-- Setup — Kỳ vọng: PASS.

INSERT INTO meter_readings (room_id, billing_period, utility_type, previous_reading, current_reading)
SELECT r.id, '2026-09-15', 'ELECTRICITY', 0, 10
FROM rooms r
JOIN rental_properties p ON p.id = r.property_id
WHERE p.name = 'VALIDATION_CONSTRAINT_D3_Property';
-- TEST — Kỳ vọng: FAIL — check_violation, billing_period phải là ngày 01.

ROLLBACK;


-- ============================================================
-- D4 — utility_type không hợp lệ ("GAS")
-- ============================================================
-- Purpose: CHECK (utility_type IN ('ELECTRICITY','WATER')) phải từ
-- chối giá trị khác.
-- Expected: PostgreSQL ERROR — check_violation.

ROLLBACK;
BEGIN;

INSERT INTO rental_properties (name) VALUES ('VALIDATION_CONSTRAINT_D4_Property');
-- Setup — Kỳ vọng: PASS.

INSERT INTO rooms (property_id, name, tenant_count)
SELECT id, '101', 4 FROM rental_properties WHERE name = 'VALIDATION_CONSTRAINT_D4_Property';
-- Setup — Kỳ vọng: PASS.

INSERT INTO meter_readings (room_id, billing_period, utility_type, previous_reading, current_reading)
SELECT r.id, '2026-10-01', 'GAS', 0, 5
FROM rooms r
JOIN rental_properties p ON p.id = r.property_id
WHERE p.name = 'VALIDATION_CONSTRAINT_D4_Property';
-- TEST — Kỳ vọng: FAIL — check_violation, utility_type chỉ nhận
-- ELECTRICITY hoặc WATER.

ROLLBACK;


-- ============================================================
-- D5 — current_reading vượt quá meter_maximum_value
-- ============================================================
-- Purpose: CHECK (current_reading <= meter_maximum_value) phải từ chối
-- chỉ số hiện tại vượt quá giá trị tối đa đã khai báo của công tơ.
-- Expected: PostgreSQL ERROR — check_violation.

ROLLBACK;
BEGIN;

INSERT INTO rental_properties (name) VALUES ('VALIDATION_CONSTRAINT_D5_Property');
-- Setup — Kỳ vọng: PASS.

INSERT INTO rooms (property_id, name, tenant_count)
SELECT id, '101', 4 FROM rental_properties WHERE name = 'VALIDATION_CONSTRAINT_D5_Property';
-- Setup — Kỳ vọng: PASS.

INSERT INTO meter_readings (
    room_id, billing_period, utility_type,
    previous_reading, current_reading, meter_maximum_value
)
SELECT r.id, '2026-09-01', 'ELECTRICITY', 100, 100000, 99999
FROM rooms r
JOIN rental_properties p ON p.id = r.property_id
WHERE p.name = 'VALIDATION_CONSTRAINT_D5_Property';
-- TEST — Kỳ vọng: FAIL — check_violation,
-- current_reading (100000) > meter_maximum_value (99999).

ROLLBACK;


-- ============================================================
-- D6 — previous_reading vượt quá meter_maximum_value
-- ============================================================
-- Purpose: CHECK (previous_reading <= meter_maximum_value) phải từ
-- chối chỉ số trước đó vượt quá giá trị tối đa đã khai báo.
-- Expected: PostgreSQL ERROR — check_violation.

ROLLBACK;
BEGIN;

INSERT INTO rental_properties (name) VALUES ('VALIDATION_CONSTRAINT_D6_Property');
-- Setup — Kỳ vọng: PASS.

INSERT INTO rooms (property_id, name, tenant_count)
SELECT id, '101', 4 FROM rental_properties WHERE name = 'VALIDATION_CONSTRAINT_D6_Property';
-- Setup — Kỳ vọng: PASS.

INSERT INTO meter_readings (
    room_id, billing_period, utility_type,
    previous_reading, current_reading, meter_maximum_value
)
SELECT r.id, '2026-09-01', 'ELECTRICITY', 100000, 10, 99999
FROM rooms r
JOIN rental_properties p ON p.id = r.property_id
WHERE p.name = 'VALIDATION_CONSTRAINT_D6_Property';
-- TEST — Kỳ vọng: FAIL — check_violation,
-- previous_reading (100000) > meter_maximum_value (99999).

ROLLBACK;


-- ============================================================
-- D7 — Reading trùng (room, billing_period, utility_type)
-- ============================================================
-- Purpose: UNIQUE(room_id, billing_period, utility_type) phải từ chối
-- một reading thứ hai cho đúng cùng phòng/kỳ/loại tiện ích.
-- Expected: PostgreSQL ERROR — unique_violation.

ROLLBACK;
BEGIN;

INSERT INTO rental_properties (name) VALUES ('VALIDATION_CONSTRAINT_D7_Property');
-- Setup — Kỳ vọng: PASS.

INSERT INTO rooms (property_id, name, tenant_count)
SELECT id, '101', 4 FROM rental_properties WHERE name = 'VALIDATION_CONSTRAINT_D7_Property';
-- Setup — Kỳ vọng: PASS.

INSERT INTO meter_readings (room_id, billing_period, utility_type, previous_reading, current_reading)
SELECT r.id, '2026-09-01', 'ELECTRICITY', 100, 120
FROM rooms r
JOIN rental_properties p ON p.id = r.property_id
WHERE p.name = 'VALIDATION_CONSTRAINT_D7_Property';
-- Setup — Kỳ vọng: PASS. (reading đầu tiên, hợp lệ)

INSERT INTO meter_readings (room_id, billing_period, utility_type, previous_reading, current_reading)
SELECT r.id, '2026-09-01', 'ELECTRICITY', 0, 1
FROM rooms r
JOIN rental_properties p ON p.id = r.property_id
WHERE p.name = 'VALIDATION_CONSTRAINT_D7_Property';
-- TEST — Kỳ vọng: FAIL — unique_violation,
-- UNIQUE(room_id, billing_period, utility_type).

ROLLBACK;


-- ============================================================
-- D8 — Electricity VAT > 1 (nhập "8" thay vì "0.08" là lỗi tương tự)
-- ============================================================
-- Purpose: CHECK (electricity_vat_rate <= 1) phải từ chối giá trị lớn
-- hơn 1, vì rate được lưu như phân số thập phân trong [0, 1].
-- Expected: PostgreSQL ERROR — check_violation.

ROLLBACK;
BEGIN;

INSERT INTO electricity_tariffs (
    name, effective_from, effective_to,
    electricity_vat_rate, people_per_quota_unit, fallback_tier_number
) VALUES (
    'VALIDATION_CONSTRAINT_D8_Electricity_Tariff', '2020-01-01', NULL, 1.01, 4, 3
);
-- TEST — Kỳ vọng: FAIL — check_violation, electricity_vat_rate <= 1.

ROLLBACK;


-- ============================================================
-- D9 — Electricity VAT < 0
-- ============================================================
-- Purpose: CHECK (electricity_vat_rate >= 0) phải từ chối giá trị âm.
-- Expected: PostgreSQL ERROR — check_violation.

ROLLBACK;
BEGIN;

INSERT INTO electricity_tariffs (
    name, effective_from, effective_to,
    electricity_vat_rate, people_per_quota_unit, fallback_tier_number
) VALUES (
    'VALIDATION_CONSTRAINT_D9_Electricity_Tariff', '2020-01-01', NULL, -0.01, 4, 3
);
-- TEST — Kỳ vọng: FAIL — check_violation, electricity_vat_rate >= 0.

ROLLBACK;


-- ============================================================
-- D10 — Water VAT > 1
-- ============================================================
-- Purpose: CHECK (vat_rate <= 1) trên water_tariffs phải từ chối giá
-- trị lớn hơn 1.
-- Expected: PostgreSQL ERROR — check_violation.

ROLLBACK;
BEGIN;

INSERT INTO water_tariffs (
    name, effective_from, effective_to,
    price_per_cubic_meter, price_per_person, vat_rate, environmental_fee_rate
) VALUES (
    'VALIDATION_CONSTRAINT_D10_Water_Tariff', '2020-01-01', NULL, 8500, 80000, 1.01, 0.10
);
-- TEST — Kỳ vọng: FAIL — check_violation, vat_rate <= 1.

ROLLBACK;


-- ============================================================
-- D11 — Environmental fee < 0
-- ============================================================
-- Purpose: CHECK (environmental_fee_rate >= 0) trên water_tariffs phải
-- từ chối giá trị âm.
-- Expected: PostgreSQL ERROR — check_violation.

ROLLBACK;
BEGIN;

INSERT INTO water_tariffs (
    name, effective_from, effective_to,
    price_per_cubic_meter, price_per_person, vat_rate, environmental_fee_rate
) VALUES (
    'VALIDATION_CONSTRAINT_D11_Water_Tariff', '2020-01-01', NULL, 8500, 80000, 0.05, -0.01
);
-- TEST — Kỳ vọng: FAIL — check_violation, environmental_fee_rate >= 0.

ROLLBACK;


-- ============================================================
-- D12 — tier_number = 0
-- ============================================================
-- Purpose: CHECK (tier_number > 0) phải từ chối tier_number = 0.
-- Expected: PostgreSQL ERROR — check_violation.

ROLLBACK;
BEGIN;

INSERT INTO electricity_tariffs (
    name, effective_from, effective_to,
    electricity_vat_rate, people_per_quota_unit, fallback_tier_number
) VALUES (
    'VALIDATION_CONSTRAINT_D12_Tariff', '2020-01-01', NULL, 0.08, 4, 1
);
-- Setup — Kỳ vọng: PASS.

INSERT INTO electricity_tariff_tiers (tariff_id, tier_number, threshold_kwh, unit_price)
SELECT id, 0, 50, 1000 FROM electricity_tariffs WHERE name = 'VALIDATION_CONSTRAINT_D12_Tariff';
-- TEST — Kỳ vọng: FAIL — check_violation, tier_number > 0.

ROLLBACK;


-- ============================================================
-- D13 — threshold_kwh = 0
-- ============================================================
-- Purpose: CHECK (threshold_kwh IS NULL OR threshold_kwh > 0) phải từ
-- chối threshold_kwh = 0 (0 không phải NULL và không phải > 0).
-- Expected: PostgreSQL ERROR — check_violation.

ROLLBACK;
BEGIN;

INSERT INTO electricity_tariffs (
    name, effective_from, effective_to,
    electricity_vat_rate, people_per_quota_unit, fallback_tier_number
) VALUES (
    'VALIDATION_CONSTRAINT_D13_Tariff', '2020-01-01', NULL, 0.08, 4, 1
);
-- Setup — Kỳ vọng: PASS.

INSERT INTO electricity_tariff_tiers (tariff_id, tier_number, threshold_kwh, unit_price)
SELECT id, 1, 0, 1000 FROM electricity_tariffs WHERE name = 'VALIDATION_CONSTRAINT_D13_Tariff';
-- TEST — Kỳ vọng: FAIL — check_violation,
-- threshold_kwh IS NULL OR threshold_kwh > 0.

ROLLBACK;


-- ============================================================
-- D14 — unit_price < 0
-- ============================================================
-- Purpose: CHECK (unit_price >= 0) phải từ chối giá trị âm.
-- Expected: PostgreSQL ERROR — check_violation.

ROLLBACK;
BEGIN;

INSERT INTO electricity_tariffs (
    name, effective_from, effective_to,
    electricity_vat_rate, people_per_quota_unit, fallback_tier_number
) VALUES (
    'VALIDATION_CONSTRAINT_D14_Tariff', '2020-01-01', NULL, 0.08, 4, 1
);
-- Setup — Kỳ vọng: PASS.

INSERT INTO electricity_tariff_tiers (tariff_id, tier_number, threshold_kwh, unit_price)
SELECT id, 1, 50, -1 FROM electricity_tariffs WHERE name = 'VALIDATION_CONSTRAINT_D14_Tariff';
-- TEST — Kỳ vọng: FAIL — check_violation, unit_price >= 0.

ROLLBACK;


-- ============================================================
-- D15 — Trùng tier_number trong cùng một tariff
-- ============================================================
-- Purpose: UNIQUE(tariff_id, tier_number) phải từ chối hai tier cùng
-- tier_number trong cùng một tariff, dù threshold/unit_price khác.
-- Expected: PostgreSQL ERROR — unique_violation.

ROLLBACK;
BEGIN;

INSERT INTO electricity_tariffs (
    name, effective_from, effective_to,
    electricity_vat_rate, people_per_quota_unit, fallback_tier_number
) VALUES (
    'VALIDATION_CONSTRAINT_D15_Tariff', '2020-01-01', NULL, 0.08, 4, 1
);
-- Setup — Kỳ vọng: PASS.

INSERT INTO electricity_tariff_tiers (tariff_id, tier_number, threshold_kwh, unit_price)
SELECT id, 1, 50, 1000 FROM electricity_tariffs WHERE name = 'VALIDATION_CONSTRAINT_D15_Tariff';
-- Setup — Kỳ vọng: PASS. (tier hợp lệ đầu tiên)

INSERT INTO electricity_tariff_tiers (tariff_id, tier_number, threshold_kwh, unit_price)
SELECT id, 1, 999, 9999 FROM electricity_tariffs WHERE name = 'VALIDATION_CONSTRAINT_D15_Tariff';
-- TEST — Kỳ vọng: FAIL — unique_violation, UNIQUE(tariff_id, tier_number),
-- dù threshold_kwh/unit_price khác dòng tier_number=1 đã có.

ROLLBACK;


-- ============================================================
-- D16 — effective_to < effective_from
-- ============================================================
-- Purpose: CHECK (effective_to IS NULL OR effective_to >= effective_from)
-- phải từ chối một khoảng ngày hiệu lực lộn ngược.
-- Expected: PostgreSQL ERROR — check_violation.

ROLLBACK;
BEGIN;

INSERT INTO electricity_tariffs (
    name, effective_from, effective_to,
    electricity_vat_rate, people_per_quota_unit, fallback_tier_number
) VALUES (
    'VALIDATION_CONSTRAINT_D16_Tariff', '2026-09-10', '2026-09-01', 0.08, 4, 3
);
-- TEST — Kỳ vọng: FAIL — check_violation, effective_to >= effective_from.

ROLLBACK;


-- ============================================================
-- D17 — Khoá ngoại không hợp lệ (property_id không tồn tại)
-- ============================================================
-- Purpose: FK rooms.property_id -> rental_properties.id phải từ chối
-- một property_id không tồn tại.
-- Expected: PostgreSQL ERROR — foreign_key_violation.
--
-- property_id được XÂY DỰNG để CHẮC CHẮN không tồn tại (MAX hiện tại +
-- 1,000,000), không dựa vào một số cụ thể như 999999 có thể vô tình
-- trùng với dữ liệu thật.

ROLLBACK;
BEGIN;

INSERT INTO rooms (property_id, name, tenant_count)
VALUES (
    (SELECT COALESCE(MAX(id), 0) + 1000000 FROM rental_properties),
    'VALIDATION_CONSTRAINT_D17_FK_Test_Room',
    1
);
-- TEST — Kỳ vọng: FAIL — foreign_key_violation,
-- rooms.property_id -> rental_properties.id.

ROLLBACK;


-- ============================================================
-- D18 — Xoá property khi vẫn còn room tham chiếu tới nó
-- ============================================================
-- Purpose: ON DELETE RESTRICT trên rooms.property_id phải chặn việc
-- xoá một property đang còn room.
-- Expected: PostgreSQL ERROR — foreign_key_violation.

ROLLBACK;
BEGIN;

INSERT INTO rental_properties (name) VALUES ('VALIDATION_CONSTRAINT_D18_Property');
-- Setup — Kỳ vọng: PASS.

INSERT INTO rooms (property_id, name, tenant_count)
SELECT id, '101', 4 FROM rental_properties WHERE name = 'VALIDATION_CONSTRAINT_D18_Property';
-- Setup — Kỳ vọng: PASS.

DELETE FROM rental_properties WHERE name = 'VALIDATION_CONSTRAINT_D18_Property';
-- TEST — Kỳ vọng: FAIL — foreign_key_violation,
-- ON DELETE RESTRICT (rooms.property_id -> rental_properties.id).

ROLLBACK;

-- ============================================================
-- Ghi chú phạm vi test (không phải một block để chạy)
-- ============================================================
-- InvoiceItem CASCADE (invoice -> invoice_items) và các RESTRICT khác
-- của bảng invoices (room/tariff/reading -> invoices) KHÔNG được
-- runtime-test trong file này. Tạo một invoice thật đòi hỏi
-- calculated_total — một giá trị chỉ có ý nghĩa khi Calculation Core
-- tồn tại; tạo nó chỉ để chứng minh CASCADE sẽ là một con số giả không
-- có căn cứ. D18 (ngay trên) đã chứng minh cơ chế RESTRICT hoạt động
-- đúng ở tầng PostgreSQL cho MỘT quan hệ cụ thể (rooms -> rental_properties);
-- các quan hệ ON DELETE khác vẫn được kiểm chứng TĨNH — xem
-- docs/DATABASE_DESIGN.md mục "Deletion behavior".
