import { Router, type IRouter } from "express";
import { desc, sql } from "drizzle-orm";
import { db, announcementsTable } from "@workspace/db";

const router: IRouter = Router();

router.get("/announcements", async (req, res): Promise<void> => {
  const { target } = req.query as { target?: string };

  const rows = await db
    .select()
    .from(announcementsTable)
    .where(
      target && target !== "all"
        ? sql`${announcementsTable.isActive} = true AND (${announcementsTable.targetAudience} = ${target} OR ${announcementsTable.targetAudience} = 'all')`
        : sql`${announcementsTable.isActive} = true`
    )
    .orderBy(desc(announcementsTable.createdAt))
    .limit(10);

  res.json(
    rows.map((r) => ({
      id: r.id,
      title: r.title,
      content: r.content,
      targetAudience: r.targetAudience,
      badgeText: r.badgeText ?? null,
      createdAt: r.createdAt.toISOString(),
    }))
  );
});

router.post("/announcements", async (req, res): Promise<void> => {
  const {
    title,
    content,
    targetAudience = "all",
    badgeText,
  } = req.body as {
    title?: string;
    content?: string;
    targetAudience?: string;
    badgeText?: string;
  };

  if (!title || !content) {
    res.status(400).json({ error: "العنوان والمحتوى مطلوبان" });
    return;
  }

  const [row] = await db
    .insert(announcementsTable)
    .values({ title, content, targetAudience, badgeText: badgeText ?? null })
    .returning();

  req.log.info({ id: row.id, targetAudience }, "Announcement created");
  res.status(201).json({
    id: row.id,
    title: row.title,
    content: row.content,
    targetAudience: row.targetAudience,
    badgeText: row.badgeText ?? null,
    createdAt: row.createdAt.toISOString(),
  });
});

export default router;
