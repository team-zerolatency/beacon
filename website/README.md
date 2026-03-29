# Beacon Website

Web app for the Beacon product story and dashboard experience.

## Overview

- Landing page narrative: problem, solution, features, stack, and impact
- Supabase authentication flow (login + fallback registration)
- Dashboard views for role-based operations demos

## Stack

- Next.js (App Router)
- TypeScript
- Tailwind CSS v4
- Supabase
- Framer Motion
- Lucide React

## Environment Variables

Create `.env.local` in this folder:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY=your_supabase_publishable_key
```

Alternative key name accepted by the codebase:

```env
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

## Install

```bash
npm install
```

## Run

```bash
npm run dev
```

Default URL: http://localhost:3000

## Scripts

- `npm run dev` start local dev server
- `npm run build` build production assets
- `npm run start` run production server
- `npm run lint` run lint checks

## Auth Flow

1. User enters email and password on login.
2. If sign-in succeeds, user is sent to dashboard.
3. If account does not exist, user is redirected to registration.
4. Registration receives prefilled credentials and completes profile setup.

## Supabase Setup

1. Create a Supabase project.
2. Add env values to `.env.local`.
3. Configure auth redirect URLs for local/dev/prod domains.
4. Run required SQL/bootstrap scripts used by this workspace.

## Deployment

- Recommended platform: Vercel
- Add the same environment variables in deployment settings
- Keep Supabase redirect URLs aligned with deployed domain
