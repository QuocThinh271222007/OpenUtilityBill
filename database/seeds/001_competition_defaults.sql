-- SPDX-License-Identifier: MIT

-- ============================================================
-- Competition default configuration seed
-- ============================================================
--
-- Responsibility:
-- Nạp cấu hình biểu giá điện/nước MẶC ĐỊNH do đề thi cung cấp, vào các
-- bảng electricity_tariffs, electricity_tariff_tiers, water_tariffs đã
-- tạo bởi database/migrations/001_initial_domain_schema.sql.
--
-- Đây là DỮ LIỆU cấu hình mặc định của kỳ thi — KHÔNG phải quy tắc bất
-- biến (immutable rule) của chương trình. Giá trị này có thể được thay
-- thế sau này qua giao diện quản trị (admin configuration, task sau),
-- không cần sửa Calculation Core hay schema.
--
-- Does NOT:
-- - chứa công thức tính toán (không có phép nhân/cộng ở đây, chỉ có
--   INSERT dữ liệu thô).
--
-- Idempotency (xem docs/DATABASE_DESIGN.md):
-- Mỗi INSERT vào electricity_tariffs/water_tariffs dùng
-- ON CONFLICT (name, effective_from) DO NOTHING. Việc thêm tier phụ
-- thuộc XÁC ĐỊNH tariff_id bằng SELECT theo (name, effective_from),
-- KHÔNG giả định id sinh ra là 1 — an toàn dù tariff đã tồn tại từ lần
-- chạy trước. Chạy lại file này nhiều lần sẽ không tạo thêm bản ghi
-- trùng.
--
-- Assumption cần chủ repository xác nhận:
-- effective_from = '2026-01-01' là NGÀY GIẢ ĐỊNH cho phiên bản cấu hình
-- này (đề thi không quy định ngày hiệu lực cụ thể). Thay đổi giá trị
-- này nếu kỳ thi có ngày áp dụng chính thức khác.

BEGIN;

-- ------------------------------------------------------------
-- Electricity: tariff + 6 tiers
-- ------------------------------------------------------------
INSERT INTO electricity_tariffs (
    name,
    effective_from,
    effective_to,
    electricity_vat_rate,
    people_per_quota_unit,
    fallback_tier_number
) VALUES (
    'Competition Default Electricity Tariff',
    '2026-01-01',
    NULL,
    0.08,   -- VAT điện 8%, theo đề thi.
    4,      -- "số người / 4 = số định mức".
    3       -- Phương pháp fallback dùng giá bậc 3.
)
ON CONFLICT (name, effective_from) DO NOTHING;

-- threshold_kwh = NULL ở bậc 6 nghĩa là "phần sản lượng còn lại, không
-- giới hạn" (xem backend/src/modules/tariff/tariff.model.ts).
INSERT INTO electricity_tariff_tiers (
    tariff_id, tier_number, threshold_kwh, unit_price
)
SELECT t.id, tier.tier_number, tier.threshold_kwh, tier.unit_price
FROM electricity_tariffs t
CROSS JOIN (VALUES
    (1, 50::numeric,   1984::numeric),
    (2, 50::numeric,   2050::numeric),
    (3, 100::numeric,  2380::numeric),
    (4, 100::numeric,  2998::numeric),
    (5, 100::numeric,  3350::numeric),
    (6, NULL::numeric, 3460::numeric)
) AS tier(tier_number, threshold_kwh, unit_price)
WHERE t.name = 'Competition Default Electricity Tariff'
  AND t.effective_from = '2026-01-01'
ON CONFLICT (tariff_id, tier_number) DO NOTHING;

-- ------------------------------------------------------------
-- Water tariff
-- ------------------------------------------------------------
INSERT INTO water_tariffs (
    name,
    effective_from,
    effective_to,
    price_per_cubic_meter,
    price_per_person,
    vat_rate,
    environmental_fee_rate
) VALUES (
    'Competition Default Water Tariff',
    '2026-01-01',
    NULL,
    8500,    -- VND / m3
    80000,   -- VND / người / tháng
    0.05,    -- VAT nước 5%
    0.10     -- Phí môi trường 10%
)
ON CONFLICT (name, effective_from) DO NOTHING;

COMMIT;
