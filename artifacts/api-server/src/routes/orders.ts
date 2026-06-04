import { Router, type IRouter } from "express";
import { eq, desc, count, sql, and } from "drizzle-orm";
import { db, ordersTable, usersTable, driverDetailsTable } from "@workspace/db";
import {
  CreateOrderBody,
  GetUserOrdersParams,
  UpdateOrderStatusParams,
  UpdateOrderStatusBody,
  AcceptOrderBody,
  GetActiveOrdersResponse,
  GetOrdersSummaryResponse,
} from "@workspace/api-zod";
import { broadcastNewOrder } from "../lib/supabase-server";

const router: IRouter = Router();

function mapOrder(o: {
  id: string;
  userId: string;
  driverId: string | null;
  userName: string | null;
  userPhone: string | null;
  driverName?: string | null;
  driverPhone?: string | null;
  waterVolume: string;
  barrelCount: number;
  totalPrice: string;
  latitude: string | null;
  longitude: string | null;
  status: string;
  createdAt: Date;
}) {
  return {
    id: o.id,
    userId: o.userId,
    driverId: o.driverId ?? null,
    userName: o.userName ?? null,
    userPhone: o.userPhone ?? null,
    driverName: o.driverName ?? null,
    driverPhone: o.driverPhone ?? null,
    waterVolume: o.waterVolume,
    barrelCount: o.barrelCount,
    totalPrice: Number(o.totalPrice),
    latitude: o.latitude !== null ? Number(o.latitude) : null,
    longitude: o.longitude !== null ? Number(o.longitude) : null,
    status: o.status,
    createdAt: o.createdAt.toISOString(),
  };
}

router.post("/orders", async (req, res): Promise<void> => {
  const parsed = CreateOrderBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { userId, waterVolume, barrelCount, totalPrice, latitude, longitude } = parsed.data;

  try {
    const [order] = await db
      .insert(ordersTable)
      .values({
        userId,
        waterVolume,
        barrelCount,
        totalPrice: String(totalPrice),
        status: "معلق",
        latitude: latitude !== undefined && latitude !== null ? String(latitude) : null,
        longitude: longitude !== undefined && longitude !== null ? String(longitude) : null,
      })
      .returning();

    const [user] = await db
      .select({
        name: usersTable.name,
        phone: usersTable.phone,
        commune: usersTable.commune,
        wilaya: usersTable.wilaya,
      })
      .from(usersTable)
      .where(eq(usersTable.id, userId));

    req.log.info({ orderId: order.id }, "Order created");

    res.status(201).json(mapOrder({
      ...order,
      userName: user?.name ?? null,
      userPhone: user?.phone ?? null,
    }));

    // Broadcast to all connected drivers — fire-and-forget
    if (user?.commune && user?.wilaya) {
      broadcastNewOrder({
        orderId: order.id,
        commune: user.commune,
        wilaya: user.wilaya,
        waterVolume,
        barrelCount,
      }).catch(() => {});
    }

    // ─── Feature 7: 5-minute timeout — auto-re-open if no driver accepts ──────
    setTimeout(async () => {
      try {
        const [check] = await db
          .select({ status: ordersTable.status })
          .from(ordersTable)
          .where(eq(ordersTable.id, order.id));
        if (check?.status === "معلق") {
          // Still pending — broadcast again to alert remaining drivers
          if (user?.commune && user?.wilaya) {
            await broadcastNewOrder({
              orderId: order.id,
              commune: user.commune,
              wilaya: user.wilaya,
              waterVolume,
              barrelCount,
            });
          }
        }
      } catch { /* ignore */ }
    }, 5 * 60 * 1000);

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "خطأ في الخادم";
    res.status(400).json({ error: message });
  }
});

// IMPORTANT: /active and /summary must come BEFORE /:userId
router.get("/orders/active", async (req, res): Promise<void> => {
  const driverId = req.query.driverId as string | undefined;

  if (driverId) {
    const [driverDetails] = await db
      .select({ wilaya: driverDetailsTable.wilaya, commune: driverDetailsTable.commune })
      .from(driverDetailsTable)
      .where(eq(driverDetailsTable.driverId, driverId));

    if (driverDetails) {
      const consumerUsers = usersTable;
      const orders = await db
        .select({
          id: ordersTable.id,
          userId: ordersTable.userId,
          driverId: ordersTable.driverId,
          userName: consumerUsers.name,
          userPhone: consumerUsers.phone,
          waterVolume: ordersTable.waterVolume,
          barrelCount: ordersTable.barrelCount,
          totalPrice: ordersTable.totalPrice,
          latitude: ordersTable.latitude,
          longitude: ordersTable.longitude,
          status: ordersTable.status,
          createdAt: ordersTable.createdAt,
        })
        .from(ordersTable)
        .leftJoin(consumerUsers, eq(ordersTable.userId, consumerUsers.id))
        .where(
          and(
            eq(ordersTable.status, "معلق"),
            eq(consumerUsers.wilaya, driverDetails.wilaya),
            eq(consumerUsers.commune, driverDetails.commune)
          )
        )
        .orderBy(desc(ordersTable.createdAt));

      res.json(GetActiveOrdersResponse.parse(orders.map(mapOrder)));
      return;
    }
  }

  const orders = await db
    .select({
      id: ordersTable.id,
      userId: ordersTable.userId,
      driverId: ordersTable.driverId,
      userName: usersTable.name,
      userPhone: usersTable.phone,
      waterVolume: ordersTable.waterVolume,
      barrelCount: ordersTable.barrelCount,
      totalPrice: ordersTable.totalPrice,
      latitude: ordersTable.latitude,
      longitude: ordersTable.longitude,
      status: ordersTable.status,
      createdAt: ordersTable.createdAt,
    })
    .from(ordersTable)
    .leftJoin(usersTable, eq(ordersTable.userId, usersTable.id))
    .where(eq(ordersTable.status, "معلق"))
    .orderBy(desc(ordersTable.createdAt));

  res.json(GetActiveOrdersResponse.parse(orders.map(mapOrder)));
});

router.get("/orders/summary", async (_req, res): Promise<void> => {
  const [totals] = await db
    .select({
      total: count(ordersTable.id),
      totalRevenue: sql<number>`COALESCE(SUM(${ordersTable.totalPrice}), 0)`,
    })
    .from(ordersTable);

  const [pending] = await db
    .select({ cnt: count(ordersTable.id) })
    .from(ordersTable)
    .where(eq(ordersTable.status, "معلق"));

  const [inDelivery] = await db
    .select({ cnt: count(ordersTable.id) })
    .from(ordersTable)
    .where(eq(ordersTable.status, "قيد التوصيل"));

  const [delivered] = await db
    .select({ cnt: count(ordersTable.id) })
    .from(ordersTable)
    .where(eq(ordersTable.status, "تم التوصيل"));

  res.json(
    GetOrdersSummaryResponse.parse({
      total: totals?.total ?? 0,
      pending: pending?.cnt ?? 0,
      inDelivery: inDelivery?.cnt ?? 0,
      delivered: delivered?.cnt ?? 0,
      totalRevenue: Number(totals?.totalRevenue ?? 0),
    })
  );
});

// ─── Cancel order (consumer only) ────────────────────────────────────────────
router.delete("/orders/:orderId", async (req, res): Promise<void> => {
  const orderId = Array.isArray(req.params.orderId)
    ? req.params.orderId[0]
    : req.params.orderId;

  const [order] = await db
    .update(ordersTable)
    .set({ status: "ملغى" })
    .where(
      and(
        eq(ordersTable.id, orderId),
        eq(ordersTable.status, "معلق")
      )
    )
    .returning();

  if (!order) {
    res.status(409).json({ error: "لا يمكن إلغاء هذا الطلب — قد يكون قيد التوصيل بالفعل" });
    return;
  }

  req.log.info({ orderId }, "Order cancelled by consumer");
  res.json({ success: true, orderId });
});

router.get("/orders/:userId", async (req, res): Promise<void> => {
  const params = GetUserOrdersParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  // Join with driver info to expose driver name/phone when accepted
  const driverUsers = db
    .select({ id: usersTable.id, name: usersTable.name, phone: usersTable.phone })
    .from(usersTable)
    .as("driver_users");

  const orders = await db
    .select({
      id: ordersTable.id,
      userId: ordersTable.userId,
      driverId: ordersTable.driverId,
      userName: usersTable.name,
      userPhone: usersTable.phone,
      driverName: driverUsers.name,
      driverPhone: driverUsers.phone,
      waterVolume: ordersTable.waterVolume,
      barrelCount: ordersTable.barrelCount,
      totalPrice: ordersTable.totalPrice,
      latitude: ordersTable.latitude,
      longitude: ordersTable.longitude,
      status: ordersTable.status,
      createdAt: ordersTable.createdAt,
    })
    .from(ordersTable)
    .leftJoin(usersTable, eq(ordersTable.userId, usersTable.id))
    .leftJoin(driverUsers, eq(ordersTable.driverId, driverUsers.id))
    .where(eq(ordersTable.userId, params.data.userId))
    .orderBy(desc(ordersTable.createdAt));

  res.json(orders.map(mapOrder));
});

router.patch("/orders/:orderId/status", async (req, res): Promise<void> => {
  const params = UpdateOrderStatusParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const body = UpdateOrderStatusBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.data });
    return;
  }

  const [order] = await db
    .update(ordersTable)
    .set({ status: body.data.status })
    .where(eq(ordersTable.id, params.data.orderId))
    .returning();

  if (!order) {
    res.status(404).json({ error: "الطلب غير موجود" });
    return;
  }

  const [user] = await db
    .select({ name: usersTable.name, phone: usersTable.phone })
    .from(usersTable)
    .where(eq(usersTable.id, order.userId));

  res.json(mapOrder({
    ...order,
    userName: user?.name ?? null,
    userPhone: user?.phone ?? null,
  }));
});

// Atomic accept — prevents two drivers picking the same order
router.post("/orders/:orderId/accept", async (req, res): Promise<void> => {
  const orderId = Array.isArray(req.params.orderId) ? req.params.orderId[0] : req.params.orderId;

  const body = AcceptOrderBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const { driverId } = body.data;

  const [order] = await db
    .update(ordersTable)
    .set({ status: "قيد التوصيل", driverId })
    .where(
      and(
        eq(ordersTable.id, orderId),
        eq(ordersTable.status, "معلق")
      )
    )
    .returning();

  if (!order) {
    res.status(409).json({ error: "الطلب تم قبوله من قِبل سائق آخر" });
    return;
  }

  const [user] = await db
    .select({ name: usersTable.name, phone: usersTable.phone })
    .from(usersTable)
    .where(eq(usersTable.id, order.userId));

  req.log.info({ orderId, driverId }, "Order accepted by driver");

  res.json(mapOrder({
    ...order,
    userName: user?.name ?? null,
    userPhone: user?.phone ?? null,
  }));
});

export default router;
