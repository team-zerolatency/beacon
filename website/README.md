# BEACON - Offline Disaster Communication Platform

BEACON is a modern disaster relief product showcase and dashboard built by Team ZeroLatency.

The experience demonstrates how communication can continue during infrastructure outages using offline mesh principles, clear incident visibility, and resilient operational tooling.

## Overview

- Product landing page with structured storytelling: problem, solution, features, stack, impact.
- Responsive dashboard concept for emergency operations monitoring.
- Supabase-powered authentication with a practical two-step flow:
  - Login with email/password.
  - If account does not exist, redirect to registration with prefilled email/password.

## Tech Stack

- Framework: Next.js (App Router)
- Language: TypeScript
- Styling: Tailwind CSS v4
- Icons: Lucide React
- Motion: Framer Motion
- Auth + Data: Supabase

## Project Structure

```text
app/
	components/              # Reusable landing and UI components
	dashboard/page.tsx       # Protected dashboard experience
	login/page.tsx           # Email/password login page
	registration/page.tsx    # Registration page with prefilled values
	page.tsx                 # Main BEACON landing page
lib/
	supabase/client.ts       # Supabase browser client
supabase/
	schema.sql               # SQL bootstrap for profiles + RLS + triggers
```

## Features

### Landing Experience

- Hero with mission-first messaging
- Problem framing for disaster-time communication breakdowns
- Offline mesh solution explanation
- Feature and engineering stack cards
- Impact section with network-growth visualization
- Fully responsive navigation and sections

### Authentication Flow

1. User enters email + password on login.
2. If credentials are valid, user is signed in and redirected to dashboard.
3. If user is not found, app redirects to registration.
4. Registration page preloads email/password from login attempt.
5. User adds full name and completes account creation.

### Dashboard

- Session-aware entry (redirect to login if not authenticated)
- Operational KPI cards
- Incident feed mock
- Quick action controls
- Sign out support

## Environment Variables

Create `.env.local` in the project root.

Required:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY=your_supabase_publishable_key
```

Note:

- The app also accepts `NEXT_PUBLIC_SUPABASE_ANON_KEY` as an alternative key name.

## Supabase Setup

1. Create a Supabase project.
2. Copy project URL and publishable key into `.env.local`.
3. Open Supabase SQL Editor.
4. Run the SQL in `supabase/schema.sql`.

What the SQL sets up:

- `public.profiles` table linked to `auth.users`
- automatic profile creation trigger on new auth users
- update timestamp trigger
- Row Level Security policies for per-user access

## Local Development

Install dependencies:

```bash
npm install
```

Run development server:

```bash
npm run dev
```

Open:

- http://localhost:3000

Lint:

```bash
npm run lint
```

Build for production:

```bash
npm run build
npm run start
```

## Deployment Notes

- Recommended host: Vercel.
- Add the same environment variables in your deployment environment.
- Ensure Supabase Auth redirect settings allow your deployed domain.

## Presentation Positioning

This project is intentionally optimized for demos and presentations:

- high-contrast emergency visual language
- clear narrative flow from crisis to solution
- dashboard-first operational framing

## Team

Built by Team ZeroLatency.

"Because communication should not die first."
