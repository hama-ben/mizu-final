/**
 * useRealtimeOrders
 *
 * Subscribes to the Supabase Realtime broadcast channel "orders:new".
 * When the server fires a `new_order` event:
 *   1. Invalidates the active-orders React Query cache for this driver
 *      (the server re-fetches and filters by commune server-side).
 *   2. Once the query resolves with a higher count than before, sets
 *      `notification = true` so the UI can show an alert.
 *
 * Zero false positives: the notification only fires when the refetch
 * actually returns more orders for THIS driver's commune.
 *
 * IMPORTANT: Realtime transport errors are fully isolated here — they
 * are caught silently via a status callback and a try-catch so that
 * a WebSocket failure NEVER propagates into the Auth/OTP flow or any
 * other part of the application.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { getGetActiveOrdersQueryKey } from "@workspace/api-client-react";

export function useRealtimeOrders(driverId: string, currentOrderCount: number) {
  const queryClient = useQueryClient();
  const [notification, setNotification] = useState(false);

  const prevCountRef = useRef(-1);
  const pendingBroadcastRef = useRef(false);

  // Detect a commune-matched new order: count must increase AND a broadcast must
  // have arrived since the last refetch. This prevents false positives.
  useEffect(() => {
    if (prevCountRef.current === -1) {
      // First render — initialise baseline count without showing a notification.
      prevCountRef.current = currentOrderCount;
      return;
    }

    if (pendingBroadcastRef.current && currentOrderCount > prevCountRef.current) {
      setNotification(true);
      pendingBroadcastRef.current = false;
    }

    prevCountRef.current = currentOrderCount;
  }, [currentOrderCount]);

  // Subscribe to the Realtime broadcast channel.
  // Realtime errors are fully isolated: a WebSocket transport failure must
  // NEVER propagate outside this effect or interfere with Auth/OTP state.
  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;

    try {
      channel = supabase
        .channel("orders:new")
        .on("broadcast", { event: "new_order" }, () => {
          // Mark that a broadcast arrived so the count-watcher above knows
          // a subsequent count increase is due to a real new order.
          pendingBroadcastRef.current = true;

          // Trigger an immediate background refetch (commune-filtered server-side).
          queryClient.invalidateQueries({
            queryKey: getGetActiveOrdersQueryKey({ driverId }),
          });
        })
        .subscribe((status, err) => {
          // Handle all non-ok statuses silently — a transport failure here
          // must not surface as an error in the Auth flow or any other UI.
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            console.warn("[Realtime] Channel subscription failed (non-fatal):", err ?? status);
          }
        });
    } catch (err) {
      // Catch any synchronous error thrown during channel setup.
      console.warn("[Realtime] Channel initialization failed (non-fatal):", err);
    }

    return () => {
      if (channel) {
        try {
          supabase.removeChannel(channel);
        } catch (err) {
          console.warn("[Realtime] Channel cleanup failed (non-fatal):", err);
        }
      }
    };
  }, [driverId, queryClient]);

  const dismiss = useCallback(() => setNotification(false), []);

  return { notification, dismiss };
}
