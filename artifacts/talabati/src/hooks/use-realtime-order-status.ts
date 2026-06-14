/**
 * useRealtimeOrderStatus
 *
 * Consumer-side Supabase Realtime subscription.
 * Listens for `order_status_changed` broadcast events fired by the API server
 * whenever a driver accepts an order or updates its delivery status.
 *
 * Cross-network safe: messages route through Supabase infrastructure, NOT
 * directly between the consumer's device and the driver's device.
 *
 * On every event, the React Query cache for the user's orders is invalidated
 * so the UI reflects the new status immediately (no 5-second poll delay).
 *
 * All errors are isolated here — a WebSocket failure never propagates into
 * any other part of the application.
 */

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { getGetUserOrdersQueryKey } from "@workspace/api-client-react";

export function useRealtimeOrderStatus(userId: string) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!userId) return;

    let channel: ReturnType<typeof supabase.channel> | null = null;

    try {
      channel = supabase
        .channel("consumer:order-status")
        .on("broadcast", { event: "order_status_changed" }, () => {
          queryClient.invalidateQueries({
            queryKey: getGetUserOrdersQueryKey(userId),
          });
        })
        .subscribe((status, err) => {
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            console.warn("[Realtime] Consumer order-status channel error (non-fatal):", err ?? status);
          }
        });
    } catch (err) {
      console.warn("[Realtime] Consumer channel setup failed (non-fatal):", err);
    }

    return () => {
      if (channel) {
        try {
          supabase.removeChannel(channel);
        } catch {
          // ignore cleanup errors
        }
      }
    };
  }, [userId, queryClient]);
}
