import { Router } from "express";

import { asyncHandler } from "../../middleware/async-handler.js";
import * as healthController from "./health.controller.js";

export const healthRouter = Router();

healthRouter.get("/", asyncHandler(healthController.getHealth));
healthRouter.get("/ready", asyncHandler(healthController.getReady));
