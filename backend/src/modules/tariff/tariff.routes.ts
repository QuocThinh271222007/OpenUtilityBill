// SPDX-License-Identifier: MIT

import { Router } from "express";
import {
  createCreateElectricityTariffController,
  createCreateWaterTariffController,
  createListElectricityTariffsController,
  createListWaterTariffsController,
  createUpdateElectricityTariffController,
  createUpdateWaterTariffController,
} from "./tariff.controller";
import { getElectricityTariffManagementService, getWaterTariffManagementService } from "../../composition/tariff.composition";

const tariffRoutes = Router();

tariffRoutes.get("/tariffs/electricity", createListElectricityTariffsController(getElectricityTariffManagementService));
tariffRoutes.post("/tariffs/electricity", createCreateElectricityTariffController(getElectricityTariffManagementService));
tariffRoutes.put("/tariffs/electricity/:tariffId", createUpdateElectricityTariffController(getElectricityTariffManagementService));

tariffRoutes.get("/tariffs/water", createListWaterTariffsController(getWaterTariffManagementService));
tariffRoutes.post("/tariffs/water", createCreateWaterTariffController(getWaterTariffManagementService));
tariffRoutes.put("/tariffs/water/:tariffId", createUpdateWaterTariffController(getWaterTariffManagementService));

export default tariffRoutes;
