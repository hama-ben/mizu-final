/**
 * Server-side Supabase singleton.
 *
 * Provides:
 *  - getSupabaseServer()       — lazy admin client (service-role key)
 *  - initRealtimeBroadcast()   — connects a persistent Realtime channel at startup
 *  - broadcastNewOrder()       — fire-and-forget broadcast to that channel
 *
 * The channel is subscribed ONCE and reused for every order broadcast, so there
 * is no per-request WebSocket setup cost.
 */

import { createClient, type SupabaseClient, type RealtimeChannel } from "@supabase/supabase-js";
import ws from "ws";
import { logger } from "./logger";

export const ORDERS_CHANNEL       = "orders:new";
export const EVENT_NEW_ORDER      = "new_order";
export const EVENT_ORDER_CLAIMED  = "order_claimed";
export const EVENT_STATUS_CHANGED = "order_status_changed";

// ── Singleton client ──────────────────────────────────────────────────────────

let _client: SupabaseClient | null = null;

export function getSupabaseServer(): SupabaseClient | null {
  if (_client) return _client;

  const rawUrl = process.env.SUPABASE_URL?.trim();
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ??
    process.env.SUPABASE_ANON_KEY?.trim();

  if (!rawUrl || !key) {
    logger.warn("supabase-server: SUPABASE_URL or key not set — Realtime disabled");
    return null;
  }

  const url = rawUrl
    .replace(/\/(rest|auth|storage|realtime|functions)(\/.*)?$/, "")
    .replace(/\/$/, "");

  _client = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    realtime: { transport: ws },
  });

  return _client;
}

// ── Persistent broadcast channel ──────────────────────────────────────────────

let _channel: RealtimeChannel | null = null;
let _channelReady = false;

/**
 * Connect the server-side broadcast channel.
 * Call once after the HTTP server starts listening.
 * Non-fatal: if Supabase is unavailable the server continues normally.
 */
export function initRealtimeBroadcast(): void {
  const client = getSupabaseServer();
  if (!client) return;

  _channel = client.channel(ORDERS_CHANNEL, {
    config: { broadcast: { self: false, ack: false } },
  });

  _channel.subscribe((status, err) => {
    if (status === "SUBSCRIBED") {
      _channelReady = true;
      logger.info({ channel: ORDERS_CHANNEL }, "✅ Realtime broadcast channel ready");
    } else if (status === "CHANNEL_ERROR") {
      _channelReady = false;
      logger.warn({ channel: ORDERS_CHANNEL, err }, "⚠️  Realtime channel error — broadcasts paused");
    } else if (status === "CLOSED") {
      _channelReady = false;
      logger.warn({ channel: ORDERS_CHANNEL }, "Realtime channel closed");
    }
  });
}

/**
 * Broadcast an order-claimed event so all other drivers immediately know
 * that orderId is no longer available without waiting for their next poll.
 * Fire-and-forget — failure is logged, never thrown.
 */
export async function broadcastOrderClaimed(orderId: string): Promise<void> {
  if (!_channel || !_channelReady) {
    logger.debug("broadcastOrderClaimed: channel not ready — skipping");
    return;
  }
  try {
    await _channel.send({
      type: "broadcast",
      event: EVENT_ORDER_CLAIMED,
      payload: { orderId },
    });
    logger.debug({ orderId }, "Order claimed broadcast sent");
  } catch (err) {
    logger.warn({ err }, "broadcastOrderClaimed: send failed");
  }
}

/**
 * Broadcast an order-status-changed event so consumers get immediate
 * updates regardless of which network they're on (cross-network safe
 * because messages route through Supabase infrastructure, not direct IPs).
 * Fire-and-forget — failure is logged, never thrown.
 */
export async function broadcastOrderStatusChange(payload: {
  orderId: string;
  status: string;
  driverId?: string | null;
}): Promise<void> {
  if (!_channel || !_channelReady) {
    logger.debug("broadcastOrderStatusChange: channel not ready — skipping");
    return;
  }
  try {
    await _channel.send({
      type: "broadcast",
      event: EVENT_STATUS_CHANGED,
      payload,
    });
    logger.debug({ orderId: payload.orderId, status: payload.status }, "Order status change broadcast sent");
  } catch (err) {
    logger.warn({ err }, "broadcastOrderStatusChange: send failed");
  }
}

/**
 * Broadcast a new-order event.
 * Fire-and-forget from route handlers — any failure is logged, never thrown.
 */
export async function broadcastNewOrder(payload: {
  orderId: string;
  commune: string;
  wilaya: string;
  waterVolume: string;
  barrelCount: number;
}): Promise<void> {
  if (!_channel || !_channelReady) {
    logger.debug("broadcastNewOrder: channel not ready — skipping broadcast");
    return;
  }

  try {
    await _channel.send({
      type: "broadcast",
      event: "new_order",
      payload,
    });
    logger.debug({ orderId: payload.orderId, commune: payload.commune }, "New order broadcasted");
  } catch (err) {
    logger.warn({ err }, "broadcastNewOrder: send failed");
  }
}
