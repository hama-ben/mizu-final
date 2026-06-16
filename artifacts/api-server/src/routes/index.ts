import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import driverRouter from "./driver";
import ordersRouter from "./orders";
import ratingsRouter from "./ratings";
import announcementsRouter from "./announcements";
import locationsRouter from "./locations";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(driverRouter);
router.use(ordersRouter);
router.use(ratingsRouter);
router.use(announcementsRouter);
router.use(locationsRouter);

export default router;
