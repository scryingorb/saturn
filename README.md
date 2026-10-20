# Saturn

React and TypeScript day planner with local task storage, weather lookup, mood check-ins, and focus and breathing timers.

## Overview

Plan your day. Find your calm. Saturn combines weather, daily planning, mood check-ins, focus, breathing, and a positive Magic 8 Ball. Built with React 19, TypeScript, Vite/Vinext, GitHub Pages, and Cloudflare Workers. No desktop packaging exists.

## Features

- Schedule, complete, remove, and undo removal of daily tasks.
- Persist tasks and mood check-ins in the current browser.
- Look up weather by city or explicitly requested device location.
- Run a 25-minute focus timer and guided breathing session.
- Use built-in encouragement with an optional server-side AI path.

## UI Preview

**Source-generated UI preview — not an actual application screenshot.** Reconstructed from the UI source, existing styles, and icons without launching the application. Shows the initial empty state before browser hydration, with placeholder date/time and no live weather or saved tasks.

![Saturn main interface — source-generated UI preview](docs/screenshots/main-interface.png)

## Technologies

TypeScript, React 19, Vinext, Vite, Tailwind CSS, Cloudflare Workers, browser local storage, and Open-Meteo.

## Getting Started

Use Node.js 22.13+ and pnpm 11.25.0. Run from this repository's root:

```powershell
pnpm.cmd install --frozen-lockfile
pnpm.cmd dev
```

Development: **http://localhost:5173**. On macOS/Linux replace `pnpm.cmd` with `pnpm`. Stop with Ctrl+C. If pnpm reports an unexpected store after moving the checkout, reinstall dependencies in the current folder; do not change global pnpm settings.

### Build or run from source

```powershell
pnpm.cmd build
pnpm.cmd start
```

Open **http://127.0.0.1:8787**. Output: `dist/client/` and `dist/server/`, including `dist/server/wrangler.json`. Keep both folders together. `start` runs the built Worker locally and does not deploy. Vinext's route-classification notice is informational. No installer is generated.

## Usage

- **Daily plan:** add a task with AM/PM scheduling. Tasks sort by time. Check to complete, remove with the trash button, and undo the last removal while the tab is open.
- **Saving:** tasks and mood are stored in this browser on this origin. Your plan stays until you remove its items; midnight does not erase it. No account, cloud sync, or daily archive is provided. Clearing site data or changing browser/port creates a different storage context. Save failures show a warning. Corrupt saved data is not silently overwritten. Keep the tab open if saving fails.
- **Weather:** search a city, choose its region/country, or explicitly use device location. Refresh retries the selected location. Temperatures use Fahrenheit, wind uses mph, and missing precipitation is labeled unavailable. Failed refreshes retain the last successful reading with a timestamp. No fabricated weather is shown.
- **Mood:** select one of five moods; it remains until changed.
- **Focus:** start, pause, resume, or reset a 25-minute session. Elapsed time catches up after background-tab throttling.
- **Breathing:** four-second inhale, hold, exhale, and rest cues guide a 60-second reset. Pause/continue or begin again after completion.
- **Magic 8 Ball:** ask a question for encouragement. Answers are playful prompts, not predictions. Built-in and AI answers are labeled. Failed requests provide offline encouragement.

Timers reset when the page reloads and do not send notifications. Navigation stays at the top. Keyboard focus, labeled controls, reduced motion, and solid mobile/reduced-transparency fallbacks are included.

## Services and credentials

No variables are required for the default app. GitHub Pages uses built-in encouragement unless the public `SATURN_AFFIRMATION_URL` is configured; the optional AI endpoint runs only on Cloudflare. See [deployment instructions](docs/deployment.md). City searches and coordinates go directly to Open-Meteo. Location permission is requested only after pressing **Use location**. Tasks and mood stay in browser storage.

The keyless Open-Meteo integration is for **non-commercial** use and includes attribution. See its [documentation](https://open-meteo.com/en/docs) and [terms](https://open-meteo.com/en/terms). Commercial distribution needs an appropriate subscription and a server-side integration for paid credentials. Never put a secret weather key in browser code.

The optional AI path uses server-only Worker bindings and an IP rate limiter. Production keys belong in Cloudflare secrets (`pnpm exec wrangler secret put OPENAI_API_KEY --name saturn`), never GitHub Pages variables or build artifacts. For local Worker testing, create a git-ignored `.dev.vars` file at the root:

```dotenv
OPENAI_API_KEY=your_server_side_key
OPENAI_MODEL=gpt-5
```

`OPENAI_MODEL` is optional; the existing default is `gpt-5`. For the built server, use `pnpm.cmd start --env-file .dev.vars` to explicitly supply the local file. When configured with the rate-limit binding and client-IP header, questions are sent through `/api/affirmation` to OpenAI. The key stays server-side. Missing credentials, timeouts, and provider failures use built-in encouragement. `.env*` and `.dev.vars*` are ignored by Git; never commit real credentials. AI-provider success remains unverified without a valid key.

## Deployment and validation

Published through GitHub Pages at **https://scryingorb.github.io/saturn/**. See [deployment instructions](docs/deployment.md) for Cloudflare setup, optional server-side AI, custom domains, and reproducible checks.

```powershell
pnpm.cmd test
pnpm.cmd typecheck
pnpm.cmd lint
pnpm.cmd build:pages
pnpm.cmd build
pnpm.cmd check:cloudflare
node --experimental-strip-types scripts/check-weather.mjs
```

Production verification covers both builds, static asset paths and secret scans, the Cloudflare deployment dry run, production HTTP responses, CORS and invalid API input, and live Open-Meteo geocoding/forecast requests. Fourteen automated tests cover storage persistence across separate Web Storage processes, corrupt/denied/full storage, scheduling, timer catch-up, missing weather values, and server-only AI behavior with a mock provider.

No computer-use or interactive browser automation was used for this deployment. Browser layout, device geolocation/permission UI, and a real AI-provider response remain outside this verification. The Cloudflare configuration is ready; live Worker deployment requires Cloudflare authentication.

## Source

- `app/page.tsx`: dashboard and feature flows
- `app/globals.css`: glass styling and responsive fallbacks
- `app/api/affirmation/route.ts`, `server/affirmation.ts`: server-only optional AI and built-in replies
- `vite.pages.config.ts`, `static/main.tsx`: static GitHub Pages build
- `wrangler.json`, `.github/workflows/`: deployment configuration
- `lib/saturn.ts`: validated task/time/weather helpers
- `tests/saturn.test.mjs`: focused behavior tests
- `public/favicon.svg`: Saturn icon
- `scripts/`, `build/`, `vite.config.ts`: existing runtime

The accidental nested project under `app/` was removed, leaving one application and dependency manifest.

## Project Status

Functional web prototype with GitHub Pages publishing and an optional Cloudflare Worker. No desktop package or GitHub release is provided.
