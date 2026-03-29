/**
 * Location tracking service for continuous GPS updates to help requests
 * Updates help_requests record every 30–60 seconds while request is open
 */

import * as Location from "expo-location";
import {
  ensureAuthenticatedWithRefresh,
  isTokenExpiredError,
} from "./session-management";
import { supabase } from "./supabase";

type LocationTrackingState = {
  requestId: string;
  requestClientId: string;
  taskId?: string;
  lastUpdateTime: number;
};

const activeTracking = new Map<string, LocationTrackingState>();

/**
 * Start continuous location tracking for a help request
 * Updates coordinates every ~45 seconds
 */
export async function startLocationTracking(
  requestId: string,
  clientId: string,
): Promise<void> {
  if (!supabase) {
    throw new Error("Supabase not initialized");
  }

  // Stop existing tracking for this request if any
  await stopLocationTracking(requestId);

  // Request foreground location permission
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== "granted") {
    console.warn(
      "[LocationTracking] Foreground permission denied, location updates will not track",
    );
    return;
  }

  const trackingState: LocationTrackingState = {
    requestId,
    requestClientId: clientId,
    lastUpdateTime: Date.now(),
  };

  activeTracking.set(requestId, trackingState);

  // Start periodic location updates in foreground
  const updateInterval = setInterval(async () => {
    try {
      const trackingData = activeTracking.get(requestId);
      if (!trackingData) {
        clearInterval(updateInterval);
        return;
      }

      // Refresh session token before update (handles field deployment idle time)
      const authCheck = await ensureAuthenticatedWithRefresh();
      if (!authCheck.success) {
        console.warn(
          `[LocationTracking] Auth check failed for ${requestId}:`,
          authCheck.error,
        );
        // Stop tracking if user is no longer authenticated
        if (authCheck.tokenExpired) {
          await stopLocationTracking(requestId);
        }
        return;
      }

      // Fetch latest location
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
        timeInterval: 1000,
      });

      const { latitude: lat, longitude: lng } = location.coords;

      if (!supabase) {
        console.warn("[LocationTracking] Supabase not initialized");
        return;
      }

      // Update help_requests with new coordinates
      const { error: updateErr } = await supabase
        .from("help_requests")
        .update({
          lat,
          lng,
          updated_at: new Date().toISOString(),
        })
        .eq("id", requestId)
        .eq("client_id", clientId);

      if (updateErr) {
        // Check if error is token-related
        if (isTokenExpiredError(updateErr)) {
          console.warn(
            `[LocationTracking] Token expired during location update for ${requestId}, stopping tracking`,
          );
          await stopLocationTracking(requestId);
          return;
        }

        console.warn(
          `[LocationTracking] Failed to update location for ${requestId}:`,
          updateErr.message,
        );
      } else {
        trackingData.lastUpdateTime = Date.now();
        console.log(
          `[LocationTracking] Updated ${requestId} with lat=${lat}, lng=${lng}`,
        );
      }
    } catch (err) {
      console.warn(`[LocationTracking] Error during update:`, err);
      // Continue tracking despite errors
    }
  }, 45000); // Update every 45 seconds

  trackingState.taskId = updateInterval.toString();

  console.log(`[LocationTracking] Started tracking for request ${requestId}`);
}

/**
 * Stop location tracking for a specific help request
 */
export async function stopLocationTracking(requestId: string): Promise<void> {
  const trackingData = activeTracking.get(requestId);
  if (!trackingData) {
    return;
  }

  if (trackingData.taskId) {
    clearInterval(parseInt(trackingData.taskId, 10));
  }

  activeTracking.delete(requestId);
  console.log(`[LocationTracking] Stopped tracking for request ${requestId}`);
}

/**
 * Stop all active location tracking (e.g., on sign out)
 */
export async function stopAllLocationTracking(): Promise<void> {
  for (const [requestId] of activeTracking) {
    await stopLocationTracking(requestId);
  }
  console.log("[LocationTracking] Stopped all active tracking");
}

/**
 * Check if tracking is active for a request
 */
export function isTrackingActive(requestId: string): boolean {
  return activeTracking.has(requestId);
}

/**
 * Get list of all active tracking requests
 */
export function getActiveTrackingRequests(): string[] {
  return Array.from(activeTracking.keys());
}
