# Helper App Routes

This folder contains routes and screens for the **Helper** role in the Beacon mobile app.

## Purpose
- Entry point for helper-facing workflows.
- Handles task discovery, acceptance, navigation, and delivery updates.

## Current Files
- `index.tsx`: Main helper landing/dashboard screen.

## Suggested Expansion
- `open-requests.tsx`: Browse available requests.
- `active-task.tsx`: Current assigned package/task.
- `task-history.tsx`: Completed and canceled tasks.

## Data/Logic Integration
Helper screens in this folder are expected to use shared logic from:
- `lib/location-tracking.ts` for route and location updates.
- `lib/connectivity.ts` for network-aware behaviors.
- `lib/push-notifications.ts` for assignment/status notifications.

## Notes
Keep helper UI concerns in this folder. Prefer shared, role-agnostic services in `lib/`.
