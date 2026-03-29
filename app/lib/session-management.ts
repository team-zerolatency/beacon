/**
 * Session management and token refresh utility for long-term field deployments
 * Handles expired tokens gracefully with retry logic and user-facing error handling
 */

import { supabase } from "./supabase";

type AuthRefreshResult = {
  success: boolean;
  error?: string;
  tokenExpired?: boolean;
};

/**
 * Refresh the current session's access token
 * Silently handles expiry; returns error if truly unauthenticated
 */
export async function refreshSessionToken(): Promise<AuthRefreshResult> {
  if (!supabase) {
    return {
      success: false,
      error: "Supabase not initialized",
    };
  }

  try {
    // Attempt to refresh using refresh token
    const { data, error: refreshErr } = await supabase.auth.refreshSession();

    if (refreshErr || !data.session) {
      console.warn("[Auth] Token refresh failed:", refreshErr?.message);
      return {
        success: false,
        error: refreshErr?.message || "Failed to refresh session",
        tokenExpired: true,
      };
    }

    console.log("[Auth] Session token refreshed successfully");
    return { success: true };
  } catch (err) {
    console.error("[Auth] Unexpected error during refresh:", err);
    return {
      success: false,
      error: String(err),
      tokenExpired: true,
    };
  }
}

/**
 * Check if user is authenticated and refresh if needed
 * Use before critical operations (sync, location update)
 */
export async function ensureAuthenticatedWithRefresh(): Promise<AuthRefreshResult> {
  if (!supabase) {
    return {
      success: false,
      error: "Supabase not initialized",
    };
  }

  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    // If no session, user is logged out
    if (!session) {
      return {
        success: false,
        error: "No active session. Please sign in again.",
        tokenExpired: true,
      };
    }

    // Check if token will expire in next 5 minutes
    const expiresAt = session.expires_at ?? 0;
    const expiresIn = expiresAt * 1000 - Date.now();
    const willExpireSoon = expiresIn < 5 * 60 * 1000; // less than 5 minutes

    if (willExpireSoon) {
      console.log("[Auth] Token expiring soon, refreshing...");
      return await refreshSessionToken();
    }

    return { success: true };
  } catch (err) {
    console.error("[Auth] Error during auth check:", err);
    return {
      success: false,
      error: String(err),
    };
  }
}

/**
 * Detect if error is token-related and needs re-auth
 */
export function isTokenExpiredError(error: any): boolean {
  const message = (error?.message ?? "").toLowerCase();
  const status = error?.status ?? 0;

  return (
    message.includes("invalid") ||
    message.includes("expired") ||
    message.includes("unauthorized") ||
    message.includes("jwt") ||
    status === 401
  );
}

/**
 * Retry operation with token refresh on auth failure
 */
export async function operationWithAuthRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 2,
): Promise<{ data?: T; error?: string }> {
  let lastError: any = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Refresh token before operation on retry
      if (attempt > 1) {
        const refreshResult = await refreshSessionToken();
        if (!refreshResult.success) {
          return {
            error: refreshResult.error || "Failed to refresh session",
          };
        }
      }

      const data = await operation();
      return { data };
    } catch (err) {
      lastError = err;

      // Check if error is token-related
      if (!isTokenExpiredError(err)) {
        // Not a token error, don't retry
        return {
          error: String(err),
        };
      }

      // Token error on last attempt
      if (attempt === maxRetries) {
        break;
      }

      console.warn(
        `[Auth] Operation failed (attempt ${attempt}/${maxRetries}), retrying after token refresh...`,
        err,
      );
    }
  }

  return {
    error:
      "Operation failed after token refresh attempts. Please sign in again.",
  };
}

/**
 * Get current user with session validation
 */
export async function getCurrentUserWithValidation() {
  const authCheck = await ensureAuthenticatedWithRefresh();
  if (!authCheck.success) {
    return {
      user: null,
      error: authCheck.error,
      tokenExpired: authCheck.tokenExpired,
    };
  }

  if (!supabase) {
    return {
      user: null,
      error: "Supabase not initialized",
    };
  }

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  return { user, error: userErr?.message };
}
