# Beacon

Beacon is a disaster-response platform with two products in one workspace:

- A mobile app for clients, helpers, and NGOs (Expo/React Native)
- A web experience for product storytelling and dashboard flows (Next.js)

## Workspace Structure

```text
beacon/
  app/       # Expo mobile app
  website/   # Next.js web app
```

## Prerequisites

- Node.js 18+
- npm 9+

## Quick Start

Install and run each project independently.

### 1. Mobile App (Expo)

```bash
cd app
npm install
npm run start
```

### 2. Website (Next.js)

```bash
cd website
npm install
npm run dev
```

## Environment Variables

Both projects use Supabase.

- Mobile app vars are documented in `app/README.md`.
- Website vars are documented in `website/README.md`.

## Project Goals

- Reliable help request creation and tracking
- NGO-side request visibility and coordination
- Offline-first thinking for disaster communication constraints
- Clear operational dashboard and product narrative for demos

## Notes

- Each project has its own dependencies and scripts.
- Run commands from the correct folder (`app/` or `website/`).
