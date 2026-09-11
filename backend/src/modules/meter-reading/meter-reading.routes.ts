// SPDX-License-Identifier: MIT

import { Router } from "express";
import {
  createCreateMeterReadingController,
  createListMeterReadingsController,
  createUpdateMeterReadingController,
} from "./meter-reading.controller";
import { getMeterReadingManagementService } from "../../composition/meter-reading.composition";

const meterReadingRoutes = Router();

meterReadingRoutes.get("/meter-readings", createListMeterReadingsController(getMeterReadingManagementService));
meterReadingRoutes.post("/meter-readings", createCreateMeterReadingController(getMeterReadingManagementService));
meterReadingRoutes.put("/meter-readings/:readingId", createUpdateMeterReadingController(getMeterReadingManagementService));

export default meterReadingRoutes;
