// SPDX-License-Identifier: MIT

import { formatDateAsWireDate } from "../../shared/http/date-wire-format";
import { MeterReading } from "./meter-reading.model";

/** `billingPeriod` -> "YYYY-MM-DD", `createdAt` -> ISO-8601 đầy đủ — cùng quy ước với `invoice.http.ts`. */
export function serializeMeterReading(reading: MeterReading) {
  return {
    id: reading.id,
    roomId: reading.roomId,
    billingPeriod: formatDateAsWireDate(reading.billingPeriod),
    utilityType: reading.utilityType,
    previousReading: reading.previousReading,
    currentReading: reading.currentReading,
    meterMaximumValue: reading.meterMaximumValue,
    createdAt: reading.createdAt.toISOString(),
  };
}
