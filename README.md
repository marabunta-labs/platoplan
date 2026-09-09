# 🍽️ PlatoPlan

**PlatoPlan** is a meal‑planning app: organise your weekly menu, keep track of
what's in your pantry, and automatically generate a smart shopping list grouped
by supermarket aisle. It runs on the web (mobile‑first) and is built with Expo /
React Native, so the same codebase can target native iOS/Android too.

Built by [Marabunta Labs](https://github.com/marabunta-labs).

---

## ✨ Features

- **Recipes** — create, edit and search recipes; set meal type (lunch / dinner /
  both), prep time (quick / elaborate), servings, description and ingredients
  with quantities.
- **Ingredients & categories** — reusable ingredient catalogue with a purchase
  format (e.g. "1 L bottle"), units (g / ml / units) and multiple categories.
  Categories are deduplicated (order‑insensitive) and shown with emoji.
- **Pantry** — track what you have at home; get "what can I cook?" suggestions
  based on current stock.
- **Meal plans** — a step‑by‑step wizard (dates, diners, days off, elaborate
  days, recipe selection) followed by an editable calendar.
- **Smart distribution** — a physics‑inspired placement algorithm spreads
  recipes across the plan: it respects the days you marked for elaborate dishes
  and avoids repeating the same recipe, ingredients or category on
  back‑to‑back meals.
- **Calendar editing** — drag & drop meals, tap a slot to change/add a recipe,
  add per‑day and per‑meal notes, an "unassigned" drawer and a trash zone, plus
  a vertical / horizontal calendar view.
- **Shopping list** — generated from a plan (or from a custom recipe selection).
  Shows, per ingredient, how much you need, how many packages to buy, and a live
  "to buy" figure that updates as you adjust your pantry stock. Export as **PDF**
  (vertical list or horizontal weekly grid) or as **text**.
- **PDF export** — print‑ready plan and shopping list.
- **Dark mode** — full light/dark theming that follows the OS by default and
  remembers your choice.
- **i18n** — Spanish and English.
- **Auth & sync** — email/password and Google sign‑in via Supabase, plus a
  **guest mode** that keeps data locally. Offline‑first: reads hit local SQLite,
  writes sync to Supabase when online.

---

## 🧱 Tech stack

- **Expo SDK 57** + **React Native 0.86** + **react-native-web** (Metro bundler)
- **React Navigation** (bottom tabs on mobile, drawer/sidebar on desktop)
- **expo-sqlite** for local persistence (offline‑first) with a versioned
  migration system
- **Supabase** for auth and cloud sync (Row Level Security per user)
- **TypeScript**
- **Vitest** for unit/integration tests
- **Playwright** for the demo video recording

---

## 🚀 Getting started

### Prerequisites

- Node.js 18+
- A Supabase project (see [`DEPLOYMENT.md`](./DEPLOYMENT.md))

### Install

```sh
npm install
```

### Environment variables

Copy the example file and fill in your Supabase credentials:

```sh
cp .env.example .env
```

```
EXPO_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

The `EXPO_PUBLIC_` prefix is required so Expo embeds them in the web bundle. The
anon key is public by design — security is enforced by Supabase Row Level
Security.

### Run (web, mobile‑first)

```sh
npm run web
```

Open http://localhost:8081. You can use **guest mode** ("Continue without
account") to try it without signing in.

> In development, a set of realistic sample data (ingredients, recipes, a plan
> and a shopping list) is seeded automatically on first run. This never happens
> in production builds.

### Run on native

```sh
npm run ios      # or: npm run android
```

---

## 🗄️ Database & Supabase

The Supabase schema lives in [`supabase/migrations/`](./supabase/migrations) with
Row Level Security enabled on every table and per‑user policies
(`auth.uid() = user_id`). See [`DEPLOYMENT.md`](./DEPLOYMENT.md) for how to apply
the migrations and configure auth (including Google OAuth redirect URLs).

Locally, the app uses `expo-sqlite` with its own migration runner
(`src/database/migrations.ts`) so the on‑device schema stays in sync.

---

## 🧪 Testing

```sh
npm test            # run the vitest suite once
npm run test:watch  # watch mode
```

Type‑check the project:

```sh
npx tsc --noEmit -p tsconfig.json
```

---

## 🎬 Demo video

A scripted walkthrough (guest mode, mobile viewport) can be recorded with
Playwright. With the web server running (`npm run web`) in another terminal:

```sh
npm run demo:video
```

The recording is written to `e2e-artifacts/` as a `.webm`. Both the recording
output and the copied `demo/` folder are git‑ignored (they're regenerable).

> Note: the output is `.webm`. To share on platforms that require MP4 (e.g. X /
> Twitter), convert it with ffmpeg:
> `ffmpeg -i video.webm -c:v libx264 -pix_fmt yuv420p out.mp4`

---

## 🌐 Deploying the web app (Vercel)

The web app exports to a static SPA. See [`DEPLOYMENT.md`](./DEPLOYMENT.md) for
the full guide. In short:

```sh
npm run build:web   # expo export -p web  →  dist/
```

`vercel.json` is already configured (build command, output directory and SPA
rewrites). Set the `EXPO_PUBLIC_SUPABASE_*` variables in the Vercel dashboard.

---

## 📁 Project structure

```
src/
  components/     Reusable UI (cards, modals, calendar grid, ...)
  screens/        Recipes, Pantry, Planning, Shopping, Auth
  navigation/     Tab / sidebar / stack navigators
  services/       Business logic (recipes, planning, shopping, smart distribution)
  repositories/   Data access (local SQLite + Supabase, offline‑first)
  database/       SQLite init, migrations and dev seed data
  context/        Auth, Database, Theme, Sync providers
  hooks/          Data hooks (useRecipes, usePantry, usePlanning, ...)
  i18n/           Spanish / English translations
  constants/      Theme palettes, ingredient categories, typography
  models/         Domain types
supabase/         Production SQL migrations (schema + RLS)
public/           Web static assets (favicon, robots.txt, sitemap.xml, index.html)
e2e/              Playwright demo walkthrough
```

---

## 📄 License

See [`LICENSE`](./LICENSE).
