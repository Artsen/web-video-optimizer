# Contributing

Thanks for helping improve Web Video Optimizer. The project is still in developer beta, so focused changes with clear tests are much easier to review than broad rewrites.

## Setup

```powershell
git clone https://github.com/Artsen/web-video-optimizer.git
cd web-video-optimizer
npm ci
npm run dev
```

You need Node.js 20 or newer and FFmpeg/FFprobe for full local testing.

## Branches

Start from an up-to-date `main` branch:

```powershell
git fetch origin --prune
git switch main
git pull --ff-only origin main
git switch -c your-branch-name
```

## Before Opening A Pull Request

Run:

```powershell
npm run format:check
npm run lint
npm run typecheck
npm run test:run
npm run build
```

For larger or riskier changes, also run:

```powershell
npm run test:coverage
npm audit --omit=dev
npm run test:e2e
npm run test:integration:media
git diff --check
```

If you changed UI presentation, run `npm run review:ui-screens` and review the images in `.tmp/ui-review/`.

## Architecture Expectations

- Put shared request/response shapes in `packages/contracts`.
- Put pure reusable video behavior in `packages/video-core`.
- Keep API routes thin and route validation strict.
- Keep storage access inside the managed storage boundary.
- Add or update tests close to the behavior being changed.
- Avoid changing encoding defaults, API contracts, or routing behavior inside unrelated refactors.

## Do Not Commit

- `node_modules`
- `data`
- `.tmp`
- coverage output
- build output
- Playwright reports and test results
- local videos, posters, packages, or media artifacts
- `.env` files or secrets
- machine-specific editor files

## Pull Request Notes

Use the PR template. Explain what changed, what stayed intentionally out of scope, and which verification commands passed. For UI work, include the relevant screenshot review summary rather than committing `.tmp` output.
