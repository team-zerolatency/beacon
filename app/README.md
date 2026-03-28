# Beacon Mobile App (Expo)

Beacon is a React Native mobile app for emergency help coordination.

It supports:
- Client flow: send help requests, capture location, track request status, view NGO/help map.
- NGO flow: view incoming requests, update status, map coverage view, unread indicator for new open requests.

## Tech Stack

- Expo SDK 54
- React Native + Expo Router
- TypeScript
- Supabase (Auth + Postgres + Realtime)
- react-native-maps
- expo-location

## Project Structure

- `app/` route files (Expo Router)
- `components/dashboard/` dashboard screens for client and NGO
- `lib/supabase/` Supabase client helpers
- `assets/` app branding, icon, and favicon assets

## Prerequisites

- Node.js 18+
- npm 9+
- Expo CLI via `npx expo ...`

## Environment Variables

Create `.env` in this folder with:

```env
EXPO_PUBLIC_SUPABASE_URL=your_supabase_project_url
EXPO_PUBLIC_SUPABASE_KEY=your_supabase_anon_key
```

You can copy from `.env.example` if present.

## Install

```bash
npm install
```

## Run

Start development server:

```bash
npx expo start
```

Common targets:

```bash
npx expo start --android
npx expo start --ios
npx expo start --web
```

## Clean Start (Cache Reset)

If Metro or HMR behaves unexpectedly:

```powershell
if (Test-Path .expo) { Remove-Item -Recurse -Force .expo }
if (Test-Path node_modules/.cache) { Remove-Item -Recurse -Force node_modules/.cache }
if (Test-Path "$env:LOCALAPPDATA\Temp\metro-cache") { Remove-Item -Recurse -Force "$env:LOCALAPPDATA\Temp\metro-cache" }
npx expo start -c
```

## Scripts

- `npm run start` start Expo
- `npm run android` run Android flow
- `npm run ios` run iOS flow
- `npm run web` run Web flow
- `npm run lint` run linting

## Key Product Behavior

### Client
- Name is auto-filled from profile and fixed.
- Help request includes selected NGO target details.
- Location can be captured and used for auto-fill and coordinates.
- Cancel removes the request entry (delete) when policy allows.

### NGO
- Realtime + polling fallback keeps request list up to date.
- New open requests increase unread indicator on Requests tab.
- In Expo Go, local OS notifications are limited; in-app alert fallback is used.

## Notification Note

Expo Go has platform limitations for push/advanced notification behavior on newer SDKs.

For full notification behavior, use a development build or production build.

## Troubleshooting

1. App does not start, or wrong package path error:
   - Ensure commands are run from this folder (the Expo app folder), not parent workspace folder.

2. Port 8081 in use:
   - Stop stale node/Metro processes and restart with `npx expo start -c`.

3. Realtime updates seem delayed:
   - Verify Supabase Realtime is enabled for `help_requests`.
   - Check network and auth session state.

4. Submit/cancel fails due to DB permissions:
   - Ensure Supabase RLS policies from project SQL migrations are applied.

## Related Workspace

This repository also includes `beacpm/` (web app). The mobile app in this folder is the Expo client.
