---
name: 2-device session limit architecture
description: How the max-2-session-per-user feature works across the stack
---

## Overview

Feature 4: a user can be logged in on at most 2 devices simultaneously. A 3rd login evicts the oldest session.

## Backend (artifacts/api-server/src/routes/auth.ts)

- `sessionStore: Map<userId, string[]>` — in-memory ring buffer, max 2 entries
- `createSession(userId)` — issues a UUID, pushes to ring, trims to MAX_SESSIONS=2
- `validateSession(userId, token)` — checks token is in ring
- `revokeSession(userId, token)` — removes token from ring
- Both `/auth/login` and `/auth/verify-otp` call `createSession` and include `sessionToken` in response
- `/auth/logout` calls `revokeSession`

## Middleware (artifacts/api-server/src/routes/index.ts)

`requireValidSession` middleware sits after `authRouter`, before `driverRouter`/`ordersRouter`:
- Reads `x-user-id` and `x-session-token` headers
- If both present and invalid → 401 with `{ code: "SESSION_EVICTED" }`
- If either absent → passes through (backward compatible)

## Frontend (lib/api-client-react/src/custom-fetch.ts)

Two module-level getters registered in `use-auth.ts` on store creation:
- `setSessionTokenGetter(() => localStorage.getItem("sessionToken"))` → sends `X-Session-Token`
- `setUserIdGetter(() => localStorage.getItem("userId"))` → sends `X-User-Id`

## Frontend error handling (artifacts/talabati/src/App.tsx)

`SessionEvictionGuard` component listens for `"api-error"` custom events:
- QueryClient `mutations.onError` dispatches `api-error` when `code === SESSION_EVICTED`
- Guard calls `logout()` + redirects to `/`

**Why in-memory:** No persistent DB table needed; sessions reset on server restart (acceptable for this use case). If persistence is needed later, add a `device_sessions` table.
