# Testing And Quality Checks

This repository uses npm workspaces for the shared contracts package, API, and web app.

## Requirements

- Node.js 20 or newer
- npm
- FFmpeg and FFprobe for running the application locally

Install dependencies from a clean checkout with:

```bash
npm ci
```

## Commands

Run ESLint:

```bash
npm run lint
```

Format files with Prettier:

```bash
npm run format
```

Check formatting without changing files:

```bash
npm run format:check
```

Run TypeScript checks:

```bash
npm run typecheck
```

Run unit tests once:

```bash
npm run test:run
```

Run only the shared contracts tests:

```bash
npm run test:run --workspace packages/contracts
```

Run only the pure video-core tests:

```bash
npm run test:run --workspace packages/video-core
```

Run unit tests in watch mode:

```bash
npm run test
```

Run coverage:

```bash
npm run test:coverage
```

Run the full repository check:

```bash
npm run check
```

## Current Test Scope

The initial unit tests cover pure behavior extracted from the current API and web entry files:

- Shared runtime contract schemas for public API/browser data
- Pure video-core settings normalization, FFmpeg argument-array construction, FFprobe normalization, compatibility
  analysis, filename sanitization, caption utilities, and output-size estimation
- Filename sanitization
- FFprobe frame-rate and number parsing
- Web compatibility warning generation
- Default optimization-setting normalization
- FFmpeg argument construction
- Caption timestamp parsing and formatting
- WebVTT to SRT conversion
- Subtitle timing shifting
- Output-size estimation
- Web export recommendation logic
- Frontend codec/container compatibility normalization

The tests intentionally avoid spawning FFmpeg, FFprobe, whisper.cpp, or yt-dlp. FFmpeg argument tests assert exact
argument arrays only; they do not execute FFmpeg. Those tools are still required for the running application and for
future real-media integration tests.

## Not Covered Yet

- Express route integration
- File upload and cleanup behavior
- FFmpeg process execution and progress parsing
- Browser rendering behavior
- End-to-end package ZIP validation with real media
- Subtitle generation through whisper.cpp
- YouTube importing through yt-dlp
