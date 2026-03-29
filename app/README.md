# Beacon Mobile App

Mobile client for disaster-help coordination, built with Expo and React Native.

## Core Flows

- Client: create help requests, capture location, track status
- NGO: view and manage incoming requests, monitor map coverage
- Shared: Supabase-backed auth/session/data and realtime sync

## Stack

- Expo SDK 54
- React Native + Expo Router + TypeScript
- Supabase (Auth, Postgres, Realtime)
- react-native-maps + react-native-map-clustering
- expo-location + expo-notifications

## Prerequisites

- Node.js 18+
- npm 9+

## Environment

Create `.env` in this folder:

```env
EXPO_PUBLIC_SUPABASE_URL=your_supabase_project_url
EXPO_PUBLIC_SUPABASE_KEY=your_supabase_anon_key
```

## Install

```bash
npm install
```

## Run

```bash
npm run start
```

Targets:

```bash
npm run android
npm run ios
npm run web
```

## Scripts

- `npm run start` start Expo dev server
- `npm run android` launch Android
- `npm run ios` launch iOS
- `npm run web` launch web target
- `npm run lint` run lint checks
- `npm run build:apk` create preview Android build with EAS

## Push Notification Setup (NGO New Open Request)

1. Run SQL from `scripts/sql/push-open-request-notify.sql` in Supabase SQL Editor.
2. Deploy edge function:

```bash
supabase functions deploy notify-new-open-request
```

3. Set secret:

```bash
supabase secrets set PUSH_WEBHOOK_SECRET=<strong-random-secret>
```

4. Insert runtime config:

```sql
insert into public.push_runtime_config (key, value)
values
  ('new_open_request_push_url', 'https://<project-ref>.functions.supabase.co/notify-new-open-request'),
  ('new_open_request_push_secret', '<strong-random-secret>')
on conflict (key) do update set value = excluded.value;
```

5. Ensure NGO users open the app after sign-in so device tokens are registered.

## Troubleshooting

1. Metro issues or stale cache:

```powershell
if (Test-Path .expo) { Remove-Item -Recurse -Force .expo }
if (Test-Path node_modules/.cache) { Remove-Item -Recurse -Force node_modules/.cache }
if (Test-Path "$env:LOCALAPPDATA\Temp\metro-cache") { Remove-Item -Recurse -Force "$env:LOCALAPPDATA\Temp\metro-cache" }
npx expo start -c
```

2. Command fails from wrong directory:

- Run commands inside this `app/` folder.

3. Realtime feels delayed:

- Confirm Realtime is enabled for `help_requests` and session is valid.
