-- SPDX-License-Identifier: MIT

-- ============================================================
-- OpenUtilityBill — Initial domain schema
-- ============================================================
--
-- Responsibility:
-- Tạo toàn bộ bảng nền tảng (domain foundation) cho OpenUtilityBill:
-- rental_properties, rooms, meter_readings, electricity_tariffs,
-- electricity_tariff_tiers, water_tariffs, invoices, invoice_items.
--
-- Does NOT:
-- - chứa business logic tính toán. Không có trigger hay stored
--   procedure nào tính hoá đơn ở đây — xem docs/DATABASE_DESIGN.md mục
--   "Why no triggers/stored procedures yet".
-- - tạo dữ liệu cấu hình mặc định — xem
--   database/seeds/001_competition_defaults.sql (chạy SAU file này).
-- - enforce mọi ràng buộc nghiệp vụ chéo bảng (ví dụ: water_reading_id
--   phải khớp với water_billing_method). Những ràng buộc như vậy đòi
--   hỏi trigger, và trigger bị tránh ở giai đoạn này — trách nhiệm này
--   thuộc về Service layer khi CreateInvoice workflow được cài đặt (xem
--   docs/TRANSACTIONS.md).
--
-- ID strategy:
-- Mọi khóa chính dùng `BIGINT GENERATED ALWAYS AS IDENTITY`. Đây là cơ
-- chế sinh id tự động chuẩn của PostgreSQL (thay thế SERIAL), dễ giải
-- thích hơn UUID (không cần thêm extension như pgcrypto/uuid-ossp chỉ
-- để sinh id ngẫu nhiên). Xem docs/DATABASE_DESIGN.md mục "Identity key
-- strategy".
--
-- Transaction boundary:
-- Toàn bộ file được bọc trong BEGIN...COMMIT. Nếu bất kỳ CREATE TABLE
-- nào thất bại (ví dụ lỗi cú pháp ở bảng sau), PostgreSQL sẽ ROLLBACK
-- toàn bộ — tránh để lại một schema chỉ tạo được một nửa số bảng (xem
-- docs/TRANSACTIONS.md).

BEGIN;

-- ------------------------------------------------------------
-- rental_properties
-- ------------------------------------------------------------
-- Một RentalProperty là một cơ sở cho thuê (ví dụ một dãy trọ). Đây là
-- gốc (root) của quan hệ 1-N với rooms.
CREATE TABLE rental_properties (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name TEXT NOT NULL,
    address TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- rooms
-- ------------------------------------------------------------
-- Một Room thuộc về đúng một RentalProperty.
--
-- tenant_count là trạng thái HIỆN TẠI của phòng. Các invoice trong quá
-- khứ KHÔNG tra cứu giá trị này — chúng lưu tenant_count_used riêng
-- (xem bảng invoices) để sửa tenant_count sau này không làm thay đổi
-- hoá đơn cũ.
--
-- ON DELETE RESTRICT: xoá một RentalProperty đang còn Room sẽ bị chặn.
-- Room là dữ liệu có giá trị nghiệp vụ (và có thể có meter_readings/
-- invoices phụ thuộc) — không nên biến mất chỉ vì property cha bị xoá
-- nhầm. Muốn xoá property, phải xoá/di chuyển room trước — một hành
-- động rõ ràng, có chủ đích, thay vì một hiệu ứng phụ ẩn của CASCADE.
CREATE TABLE rooms (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    property_id BIGINT NOT NULL
        REFERENCES rental_properties (id) ON DELETE RESTRICT,
    name TEXT NOT NULL,
    tenant_count INTEGER NOT NULL CHECK (tenant_count >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- meter_readings
-- ------------------------------------------------------------
-- Chỉ số công tơ điện/nước của một Room trong một billing_period.
--
-- utility_type dùng TEXT + CHECK thay vì PostgreSQL ENUM: thêm giá trị
-- ENUM mới đòi hỏi ALTER TYPE (phức tạp hơn để thay đổi so với sửa một
-- CHECK constraint); TEXT + CHECK dễ đọc, dễ sửa, đủ dùng cho một tập
-- giá trị nhỏ, ổn định (xem docs/DATABASE_DESIGN.md).
--
-- billing_period là DATE, PHẢI là ngày đầu tháng. Ràng buộc bằng CHECK
-- kiểm tra "ngày trong tháng = 1" — cách diễn đạt đơn giản, dễ đọc hơn
-- so với so sánh date_trunc(). Quy ước này giữ một cách hiểu duy nhất
-- cho "tháng nào" xuyên suốt hệ thống (meter_readings và invoices dùng
-- cùng quy ước), dễ so sánh/JOIN.
--
-- ON DELETE RESTRICT (room -> meter_readings): chỉ số công tơ là dữ
-- liệu lịch sử cần thiết để giải trình hoá đơn; xoá room không được
-- âm thầm xoá luôn lịch sử chỉ số của nó.
--
-- Ràng buộc previous_reading <= current_reading KHÔNG được thêm ở đây:
-- với công tơ có rollover (quay vòng khi đạt meter_maximum_value),
-- current_reading hợp lệ có thể NHỎ HƠN previous_reading (ví dụ công
-- tơ quay lại 0). Việc phân biệt "giảm hợp lệ do rollover" và "giảm do
-- lỗi nhập liệu" cần logic nghiệp vụ (so sánh với meter_maximum_value),
-- không phải một CHECK constraint đơn giản — xem Calculation Core
-- (task sau).
CREATE TABLE meter_readings (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    room_id BIGINT NOT NULL
        REFERENCES rooms (id) ON DELETE RESTRICT,
    billing_period DATE NOT NULL
        CHECK (EXTRACT(DAY FROM billing_period) = 1),
    utility_type TEXT NOT NULL
        CHECK (utility_type IN ('ELECTRICITY', 'WATER')),
    previous_reading NUMERIC(12, 2) NOT NULL CHECK (previous_reading >= 0),
    current_reading NUMERIC(12, 2) NOT NULL CHECK (current_reading >= 0),
    meter_maximum_value NUMERIC(12, 2) CHECK (meter_maximum_value > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Đúng một reading cho mỗi phòng + kỳ hoá đơn + loại tiện ích.
    UNIQUE (room_id, billing_period, utility_type)
);

-- ------------------------------------------------------------
-- electricity_tariffs / electricity_tariff_tiers
-- ------------------------------------------------------------
-- ElectricityTariff là CẤU HÌNH (configuration), không phải công thức.
--
-- people_per_quota_unit và fallback_tier_number là tham số của kỳ thi
-- HIỆN TẠI ("số người / 4 = định mức", "fallback dùng giá bậc 3") —
-- lưu như dữ liệu để Calculation Core (task sau) đọc, thay vì hard-code
-- hằng số 4 hay 3 trong TypeScript.
--
-- UNIQUE (name, effective_from) hỗ trợ seed idempotent bằng
-- ON CONFLICT (xem database/seeds/001_competition_defaults.sql) và
-- ngăn hai bản ghi cấu hình trùng tên + trùng ngày hiệu lực.
CREATE TABLE electricity_tariffs (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name TEXT NOT NULL,
    effective_from DATE NOT NULL,
    effective_to DATE,
    electricity_vat_rate NUMERIC(5, 4) NOT NULL CHECK (electricity_vat_rate >= 0),
    people_per_quota_unit INTEGER NOT NULL CHECK (people_per_quota_unit > 0),
    fallback_tier_number INTEGER NOT NULL CHECK (fallback_tier_number > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE (name, effective_from),
    CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

-- Số lượng bậc là DATA-DRIVEN: một tariff có thể có bất kỳ số tier nào
-- (một hàng = một bậc), KHÔNG dùng các cột tier1_price...tierN_price cố
-- định trong schema. Xem backend/src/modules/tariff/tariff.model.ts.
--
-- ON DELETE CASCADE (tariff -> tier): một tier không có ý nghĩa độc lập
-- nếu không còn tariff cha — nó chỉ là MỘT PHẦN cấu hình của tariff đó.
-- Khác với Invoice (invoices không tham chiếu trực tiếp tới một tier cụ
-- thể, chỉ tham chiếu electricity_tariff_id), nên xoá tier con theo
-- tariff cha là an toàn và không ảnh hưởng dữ liệu lịch sử hoá đơn.
CREATE TABLE electricity_tariff_tiers (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tariff_id BIGINT NOT NULL
        REFERENCES electricity_tariffs (id) ON DELETE CASCADE,
    tier_number INTEGER NOT NULL CHECK (tier_number > 0),
    -- NULL nghĩa là "phần sản lượng còn lại, không giới hạn" — quy ước
    -- áp dụng cho bậc cuối cùng của một tariff.
    threshold_kwh NUMERIC(12, 2) CHECK (threshold_kwh IS NULL OR threshold_kwh > 0),
    unit_price NUMERIC(14, 2) NOT NULL CHECK (unit_price >= 0),

    -- Một số bậc (tier_number) chỉ xuất hiện đúng một lần trong mỗi tariff.
    UNIQUE (tariff_id, tier_number)
);

-- ------------------------------------------------------------
-- water_tariffs
-- ------------------------------------------------------------
-- Gộp cả hai phương pháp tính giá nước (PER_CUBIC_METER, PER_PERSON)
-- trong một bảng vì chúng thuộc cùng một PHIÊN BẢN cấu hình (cùng ngày
-- hiệu lực, cùng VAT, cùng phí môi trường) — không phải hai hệ thống
-- độc lập. Xem backend/src/modules/tariff/tariff.model.ts.
CREATE TABLE water_tariffs (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name TEXT NOT NULL,
    effective_from DATE NOT NULL,
    effective_to DATE,
    price_per_cubic_meter NUMERIC(14, 2) NOT NULL CHECK (price_per_cubic_meter >= 0),
    price_per_person NUMERIC(14, 2) NOT NULL CHECK (price_per_person >= 0),
    vat_rate NUMERIC(5, 4) NOT NULL CHECK (vat_rate >= 0),
    environmental_fee_rate NUMERIC(5, 4) NOT NULL CHECK (environmental_fee_rate >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE (name, effective_from),
    CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

-- ------------------------------------------------------------
-- invoices
-- ------------------------------------------------------------
-- Invoice là kết quả LỊCH SỬ cho một (room, billing_period). Nó SNAPSHOT
-- các giá trị đã dùng để tính (tenant_count_used, tariff/reading đã
-- dùng) thay vì chỉ tham chiếu "trạng thái hiện tại" — xem
-- docs/DATABASE_DESIGN.md mục "Historical snapshot principle".
--
-- ON DELETE RESTRICT cho mọi khoá ngoại của invoices (room, tariff,
-- reading): một invoice là bằng chứng lịch sử tài chính. Xoá room/
-- tariff/reading đang được một invoice tham chiếu phải bị chặn tường
-- minh, không được âm thầm mất dữ liệu hay để lại invoice "mồ côi".
--
-- UNIQUE (room_id, billing_period): ở phạm vi bắt buộc ban đầu, mỗi
-- phòng chỉ có một invoice cho mỗi tháng. Nếu sau này cần sửa/tạo lại
-- hoá đơn cho cùng kỳ (revision/versioning), ràng buộc này sẽ cần một
-- migration mới (ví dụ thêm revision_number vào khoá UNIQUE) — việc đó
-- KHÔNG được thiết kế ở task này để tránh overengineering một tính
-- năng chưa có yêu cầu cụ thể.
CREATE TABLE invoices (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    room_id BIGINT NOT NULL
        REFERENCES rooms (id) ON DELETE RESTRICT,
    billing_period DATE NOT NULL
        CHECK (EXTRACT(DAY FROM billing_period) = 1),

    tenant_count_used INTEGER NOT NULL CHECK (tenant_count_used >= 0),

    electricity_tariff_id BIGINT NOT NULL
        REFERENCES electricity_tariffs (id) ON DELETE RESTRICT,
    water_tariff_id BIGINT NOT NULL
        REFERENCES water_tariffs (id) ON DELETE RESTRICT,

    electricity_billing_method TEXT NOT NULL
        CHECK (electricity_billing_method IN ('QUOTA_TIERED', 'FALLBACK_TIER_FLAT')),
    water_billing_method TEXT NOT NULL
        CHECK (water_billing_method IN ('PER_CUBIC_METER', 'PER_PERSON')),

    -- Bắt buộc: mọi hoá đơn đều cần chỉ số điện.
    electricity_reading_id BIGINT NOT NULL
        REFERENCES meter_readings (id) ON DELETE RESTRICT,
    -- Có thể NULL: phương pháp PER_PERSON tính theo số người, không cần
    -- chỉ số nước thực tế. Việc water_reading_id bắt buộc hay không tuỳ
    -- theo water_billing_method là một ràng buộc NGHIỆP VỤ chéo cột —
    -- cố ý KHÔNG enforce bằng CHECK ở đây (sẽ cần logic phức tạp hơn
    -- một constraint đơn giản); Service layer (CreateInvoice, task sau)
    -- chịu trách nhiệm xác thực fail-fast trước khi ghi dữ liệu.
    water_reading_id BIGINT
        REFERENCES meter_readings (id) ON DELETE RESTRICT,

    calculated_total NUMERIC(14, 2) NOT NULL CHECK (calculated_total >= 0),
    -- NULL cho tới khi số tiền thực thu được nhập sau (đối chiếu với số
    -- khách thực trả).
    actual_charged_amount NUMERIC(14, 2) CHECK (actual_charged_amount >= 0),
    -- Chỉ có ý nghĩa khi actual_charged_amount khác NULL.
    difference_amount NUMERIC(14, 2),

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE (room_id, billing_period),
    CHECK (difference_amount IS NULL OR actual_charged_amount IS NOT NULL)
);

-- ------------------------------------------------------------
-- invoice_items
-- ------------------------------------------------------------
-- Từng dòng giải thích invoice được tính như thế nào (bậc 1 bao nhiêu
-- tiền, VAT bao nhiêu, phí môi trường bao nhiêu, ...). Cấu trúc quan hệ
-- (không phải JSON blob) để có thể truy vấn/kiểm tra trực tiếp bằng
-- SQL — xem docs/DATABASE_DESIGN.md.
--
-- ON DELETE CASCADE (invoice -> invoice_items): một dòng breakdown
-- không có ý nghĩa gì nếu tách khỏi invoice của nó — khác với invoice
-- (là bằng chứng lịch sử độc lập), invoice_items chỉ là PHẦN GIẢI THÍCH
-- của một invoice cụ thể.
CREATE TABLE invoice_items (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    invoice_id BIGINT NOT NULL
        REFERENCES invoices (id) ON DELETE CASCADE,
    category TEXT NOT NULL
        CHECK (category IN (
            'ELECTRICITY_TIER',
            'ELECTRICITY_VAT',
            'WATER_BASE',
            'WATER_VAT',
            'WATER_ENVIRONMENTAL_FEE'
        )),
    -- Chỉ có ý nghĩa cho category = ELECTRICITY_TIER.
    tier_number INTEGER CHECK (tier_number IS NULL OR tier_number > 0),
    quantity NUMERIC(12, 2),
    unit_name TEXT,
    unit_price NUMERIC(14, 2) CHECK (unit_price IS NULL OR unit_price >= 0),
    -- Không ràng buộc amount >= 0 ở đây: mọi category hiện tại đều là
    -- khoản thu dương, nhưng chưa có yêu cầu cụ thể nào bắt buộc dấu
    -- của amount — để ngỏ cho một category điều chỉnh/giảm trừ trong
    -- tương lai thay vì khoá cứng một giả định chưa cần thiết.
    amount NUMERIC(14, 2) NOT NULL,
    description TEXT,
    display_order INTEGER NOT NULL,

    -- Thứ tự hiển thị duy nhất trong một invoice, tránh hai dòng cùng vị trí.
    UNIQUE (invoice_id, display_order)
);

COMMIT;
