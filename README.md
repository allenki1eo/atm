# TrustTrack Attendance System

TrustTrack is a Next.js attendance, payroll, leave, announcements, complaints,
and SMS notification system for teams that need role-based HR operations.

The app supports four roles:

- `admin`: full system access, company setup, users, attendance, payroll, and configuration
- `hr`: HR operations, employees, leave, payroll, announcements, and complaints
- `supervisor`: team attendance, attendance corrections, leave visibility, and announcements
- `employee`: personal attendance, leave, advances, complaints, announcements, and payslips

## Tech Stack

- Next.js 16 App Router
- React 19
- NextAuth v5
- Turso/libSQL, with `file:local.db` as the local fallback
- Tailwind CSS 4
- Radix UI primitives
- Serwist PWA support
- Africa's Talking SMS integration

## Getting Started

Install dependencies:

```bash
npm install
```

Create your local environment file:

```bash
cp .env.example .env.local
```

For local development, you can leave `TURSO_DATABASE_URL` unset and the app will
use `file:local.db`. Set `AUTH_SECRET` to a secure random string before running
the app.

Start the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Database Setup

The schema is created from `lib/db.ts`. After the app starts, visit:

```text
http://localhost:3000/api/setup
```

This creates the database tables and seeds demo data if the users table is
empty. The endpoint is idempotent for local setup.

Demo credentials seeded by the setup endpoint:

- `admin@trusttrack.com` / `admin123`
- `supervisor@trusttrack.com` / `supervisor123`
- `hr@trusttrack.com` / `hr123`

## Environment Variables

See `.env.example` for the full list.

Required for authentication:

- `AUTH_SECRET`
- `NEXTAUTH_URL` for local development

Optional or deployment-specific:

- `TURSO_DATABASE_URL`
- `TURSO_AUTH_TOKEN`
- `AT_API_KEY`
- `AT_USERNAME`
- `AT_SENDER_ID`
- `NEXT_PUBLIC_APP_URL`
- `ENABLE_PWA`

## Useful Scripts

```bash
npm run dev
npm run build
npm run start
npm run lint
```

## Project Structure

- `app/`: routes, dashboards, print views, and API endpoints
- `components/`: shared UI, layout, attendance, dashboard, and payroll components
- `hooks/`: client-side hooks for attendance, offline state, sync, and toasts
- `lib/`: auth, database, utilities, and SMS integration helpers
- `types/`: TypeScript declaration extensions

## Deployment Notes

- Set a persistent Turso database in production with `TURSO_DATABASE_URL` and
  `TURSO_AUTH_TOKEN`.
- Set `AUTH_SECRET` in the deployment environment.
- Enable PWA generation with `ENABLE_PWA=true` when you want service worker
  output outside the default production behavior.
- Configure Africa's Talking credentials before enabling live SMS workflows.
