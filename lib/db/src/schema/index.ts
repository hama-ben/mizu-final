import { pgTable, text, integer, numeric, timestamp, boolean } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const usersTable = pgTable("users", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  phone: text("phone").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  userType: text("user_type").notNull(),
  wilaya: text("wilaya").notNull().default(""),
  commune: text("commune").notNull().default(""),
  accountStatus: text("account_status").notNull().default("pending"),
  subscriptionExpiresAt: timestamp("subscription_expires_at"),
  freeTrialClaimed: boolean("free_trial_claimed").notNull().default(false),
});

export const driverStatusTable = pgTable("driver_status", {
  driverId: text("driver_id").primaryKey(),
  currentStatus: text("current_status").notNull().default("مغلق"),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

export const driverDetailsTable = pgTable("driver_details", {
  driverId: text("driver_id").primaryKey(),
  wilaya: text("wilaya").notNull().default(""),
  commune: text("commune").notNull().default(""),
  truckFrontPhotoUrl: text("truck_front_photo_url"),
  driverLicenseUrl: text("driver_license_url"),
  truckVideoUrl: text("truck_video_url"),
  truckSidePhotoUrl: text("truck_side_photo_url"),
});

export const ordersTable = pgTable("orders", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("user_id").notNull(),
  driverId: text("driver_id"),
  waterVolume: text("water_volume").notNull(),
  barrelCount: integer("barrel_count").notNull().default(0),
  totalPrice: numeric("total_price").notNull(),
  latitude: text("latitude"),
  longitude: text("longitude"),
  status: text("status").notNull().default("معلق"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export const subscriptionPaymentsTable = pgTable("subscription_payments", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  driverId: text("driver_id").notNull(),
  receiptImage: text("receipt_image").notNull(),
  status: text("status").notNull().default("pending"),
  adminNotes: text("admin_notes"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  reviewedAt: timestamp("reviewed_at"),
});

export const ratingsTable = pgTable("ratings", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  orderId: text("order_id").notNull(),
  raterUserId: text("rater_user_id").notNull(),
  ratedUserId: text("rated_user_id").notNull(),
  raterType: text("rater_type").notNull(),
  stars: integer("stars").notNull(),
  disputeReason: text("dispute_reason"),
  isDisputed: boolean("is_disputed").notNull().default(false),
  disputeCount: integer("dispute_count").notNull().default(0),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export const announcementsTable = pgTable("announcements", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  content: text("content").notNull(),
  targetAudience: text("target_audience").notNull().default("all"),
  badgeText: text("badge_text"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});
