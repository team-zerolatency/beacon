# NGO App Routes

This folder contains routes and screens for the **NGO** role in the Beacon mobile app.

## Purpose
- Entry point for NGO-facing operations.
- Handles request oversight, routing visibility, and fulfillment monitoring.

## Current Files
- `index.tsx`: Main NGO landing/dashboard screen.

## Suggested Expansion
- `requests-overview.tsx`: Global request management view.
- `helper-monitor.tsx`: Active helper and assignment tracking.
- `reports.tsx`: Operational metrics and outcomes.

## Data/Logic Integration
NGO screens in this folder are expected to use shared logic from:
- `lib/package-routing.ts` for assignment and route calculations.
- `lib/sync-engine.ts` for sync reconciliation.
- `lib/session-management.ts` for role/session controls.

## Notes
Keep NGO dashboard and admin routes here. Reuse shared widgets from `components/dashboard/` where possible.
