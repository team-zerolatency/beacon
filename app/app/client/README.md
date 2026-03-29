# Client App Routes

This folder contains routes and screens for the **Client** role in the Beacon mobile app.

## Purpose
- Entry point for client-facing flows.
- Handles actions like creating requests, tracking status, and viewing assigned helpers.

## Current Files
- `index.tsx`: Main client landing/dashboard screen.

## Suggested Expansion
- `requests.tsx`: List of client requests.
- `new-request.tsx`: Create a new pickup/delivery request.
- `request-details.tsx`: View live status and timeline.

## Data/Logic Integration
Client screens in this folder are expected to use shared logic from:
- `lib/auth.ts` for role/session checks.
- `lib/package-routing.ts` for request assignment logic.
- `lib/offline-queue.ts` and `lib/sync-engine.ts` for offline support.

## Notes
Keep this folder focused on UI routes only. Move reusable business logic to `lib/` and shared components to `components/`.
