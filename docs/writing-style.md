# WVO Technical English

WVO Technical English is the project-specific house style for clear technical documentation in Web Video Optimizer. It is informed by ASD-STE100 Simplified Technical English principles, but WVO does not claim formal ASD-STE100 compliance.

This document does not reproduce or copy the ASD-STE100 controlled dictionary. It defines WVO-specific terminology and writing rules for this repository.

## Purpose

WVO Technical English keeps instructions clear, consistent, and safe for:

- User procedures.
- Setup instructions.
- Configuration documentation.
- Troubleshooting.
- Error explanations.
- API documentation.
- Generated package instructions.
- Future localization.

The standard reduces terminology drift, vague instructions, unnecessary synonyms, ambiguous pronouns, long sentences, and promotional language.

## Source Of Truth

The checked-in application and API contracts remain the source of truth for behavior. Documentation must not describe planned, inferred, or partially implemented functionality as available.

Technical names, commands, filenames, paths, API fields, codec names, and code must remain exact. Product-specific nouns and verbs are allowed when they are defined and used consistently.

## Application Levels

### Level 1: Controlled Procedural Documentation

Apply the strongest rules to:

- `docs/getting-started.md`
- `docs/user-guide.md`
- `docs/configuration.md`
- `docs/troubleshooting.md`
- `SUPPORT.md`
- Generated package instructions, when the source template is documentation
- Installation, recovery, cleanup, and destructive-action procedures

Level 1 documents should use direct procedures, clear results, and recovery actions.

### Level 2: Controlled Technical Reference

Apply terminology and clarity rules, but preserve formal syntax and necessary density in:

- `docs/api.md`
- `docs/testing.md`
- `docs/architecture.md`
- `CONTRIBUTING.md`
- `SECURITY.md`
- `PRIVACY.md`

Level 2 documents can use precise technical terms when the term is necessary.

### Level 3: Product And Brand Explanation

Use normal clear product language rather than strict controlled prose in:

- `README.md`
- `docs/brand-system.md`
- `CHANGELOG.md`
- Pull request descriptions
- Product positioning and design rationale

Level 3 content must still avoid vague, inflated, or misleading claims.

## Core Rules

1. Use one preferred term for one concept.
2. Do not change terminology only to avoid repetition.
3. Use active voice for procedures.
4. Start each procedural step with an action when possible.
5. Put one primary action in each numbered step.
6. Put conditions before the action.
7. Use short, direct sentences. Treat approximately 20 words as a review signal, not an absolute limit.
8. Avoid ambiguous pronouns when the referenced object is not immediately clear.
9. State the actor: the user selects, WVO creates, the API returns, FFmpeg encodes, or the browser downloads.
10. Distinguish requirements from recommendations.
11. Give a recovery action for each recoverable error.
12. Explain consequences before destructive actions.
13. Preserve exact technical strings.
14. Define abbreviations when the audience might not know them.
15. Use real product and codec names.
16. Avoid promotional language in technical documentation.
17. Do not hide technical limitations.
18. Keep notes, warnings, and results distinct.
19. Use parallel grammar in lists.
20. Use direct button and menu names.

## Requirements, Recommendations, And Capabilities

Use these words consistently:

- `must` for requirements.
- `should` for recommendations.
- `can` for capability.
- `may` for permission or possibility only when the meaning is clear.

Do not use `should` when an instruction is mandatory.

## Exact Technical Strings

Do not rewrite:

- Commands.
- Environment variable names.
- API routes.
- JSON fields.
- Filenames.
- Paths.
- Codec identifiers.
- Package names.
- Error codes.
- HTTP status codes.

Use real names such as FFmpeg, FFprobe, yt-dlp, whisper.cpp, H.264, AV1, VP9, AAC, Opus, libx264, libaom-av1, libvpx-vp9, and libopus.

Common labels such as API, URL, HTTP, JSON, ZIP, MP4, WebM, AV1, H.264, AAC, and Opus do not need repeated definitions after the first useful definition in a document.

## Preferred Terminology

| Preferred term          | Meaning                                                                                                        | Avoid as interchangeable synonyms                                         |
| ----------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| source video            | The video that the user uploads or imports.                                                                    | input asset, incoming clip, original media                                |
| source                  | An acceptable short form after source video is established in the same context.                                | media object, item, asset when referring specifically to the source video |
| original file           | The file before WVO admits, copies, or changes it.                                                             | source when the distinction matters                                       |
| output                  | A file created by a completed WVO job.                                                                         | result file, converted media, generated version                           |
| artifact                | A build, test, or implementation file created by a tool. Acceptable in architecture, tests, and build systems. | output in user procedures                                                 |
| job                     | A queued, running, completed, canceled, or failed unit of processing.                                          | task, process, operation, conversion run                                  |
| website package         | The ZIP handoff package that contains selected website assets and instructions.                                | bundle, archive, delivery package, handoff ZIP                            |
| local library           | The source and job history that WVO stores on the current computer.                                            | database, media archive, history store                                    |
| MP4 fallback            | The compatible H.264 and AAC output.                                                                           | legacy file, compatibility copy, old format                               |
| modern WebM output      | The modern WebM output, normally encoded with AV1 and Opus.                                                    | advanced version, next-generation file                                    |
| poster                  | The still image displayed before video playback.                                                               | thumbnail, cover, preview image when referring to the generated poster    |
| captions                | Timed text stored as VTT or SRT.                                                                               | subtitles when the distinction matters                                    |
| embedded subtitle track | A subtitle stream already present in the source video.                                                         | captions                                                                  |
| caption file            | A VTT or SRT sidecar file created or exported by WVO.                                                          | subtitle file when the distinction matters                                |
| transcript              | Non-timed readable text derived from captions.                                                                 | captions                                                                  |
| Optimize for website    | The primary recommended workflow that creates the standard website outputs. Preserve this label.               | default conversion, quick export                                          |
| Custom Export           | The workflow for manually selected output settings. Preserve this label.                                       | advanced export, manual mode                                              |
| Compare                 | The application view for visual comparison. Preserve implemented mode names exactly.                           | comparison screen when referring to the view label                        |
| managed storage         | Storage controlled and inventoried by WVO.                                                                     | app folder, media archive                                                 |
| storage root            | The configured root directory for WVO-managed files.                                                           | data folder when the exact setting matters                                |
| temporary file          | An intermediate file that WVO can remove through safe cleanup.                                                 | durable output                                                            |
| local                   | Processing or storage that occurs on the user's computer.                                                      | private, secure, offline, anonymous                                       |
| readiness               | API startup and dependency state.                                                                              | health when referring to detailed startup checks                          |
| health                  | Lightweight liveness state.                                                                                    | readiness when referring to `/ready`                                      |
| cleanup                 | Removal of eligible temporary files or orphaned managed data.                                                  | deletion of user-selected durable data                                    |
| delete                  | Removal of a user-selected durable source, output, or job.                                                     | cleanup                                                                   |
| download                | Transfer a file from the local API to the browser or selected destination.                                     | export                                                                    |
| export                  | Create a new encoded output through Custom Export or an optimization workflow.                                 | download                                                                  |

## Domain Distinctions

### Source Video Versus Original File

Use `source video` for the admitted video in WVO. Use `original file` for the file before WVO changes or copies it. Do not alternate between the terms without considering the distinction.

### Output Versus Artifact

Use `output` in user documentation. Use `artifact` in architecture, tests, build systems, and internal implementation documentation when the term describes tool-created files.

### Captions Versus Subtitles

Use `captions` for generated VTT or SRT timed text. Use `embedded subtitle track` for a subtitle stream that is already present in the source video. Do not remove a technically meaningful distinction only for vocabulary consistency.

### Download Versus Export

Use `download` when the browser receives a completed file from the local API. Use `export` when WVO creates a new encoded output. Do not use these terms interchangeably.

### Delete Versus Cleanup

Use `delete` when the user removes a selected durable source, output, or job. Use `cleanup` when WVO removes eligible temporary files or orphaned managed data. Never describe durable deletion as cleanup.

### Ready Versus Completed

Use `completed` for a job status. Use `ready` for application readiness or publish readiness only when the feature exists. Do not use `ready` as a replacement for `completed`.

## Procedure Format

Use this structure when a document gives a sequence of actions:

### Purpose

State what the procedure does.

### Before You Start

List requirements, dependencies, permissions, and possible data effects.

### Procedure

Use numbered actions. Put one primary action in each step.

### Result

State the expected observable result.

### Recovery

State what to check when the result does not occur.

Example:

```text
Purpose

Start WVO for local development.

Before you start

- Install Node.js 20 or later.
- Install FFmpeg and FFprobe.
- Put FFmpeg and FFprobe on PATH.

Procedure

1. Open a terminal in the repository root.
2. Run npm ci.
3. Run npm run dev.
4. Open http://localhost:5173.

Result

The browser opens the WVO application. The API listens on http://localhost:4000.

Recovery

If the application cannot reach the API, confirm that port 4000 is available and that the API process is running.
```

## Error Format

Use this structure for recoverable errors:

```text
Problem.

Cause, when known and useful.

Recovery action.
```

Examples:

- FFmpeg was not found. Install FFmpeg or configure its path.
- WVO cannot create the output because managed storage is full. Delete unused outputs or change the storage root.

Avoid generic messages such as:

- FFmpeg error.
- Something went wrong.
- Unexpected failure.

Do not expose:

- Stack traces.
- Absolute private paths.
- Environment values.
- User filenames when they are not needed.
- Imported URLs.
- Caption contents.
- Manifest contents.

## Labels For Notes And Warnings

Use labels consistently:

- **Note:** Helpful information that is not required.
- **Important:** Required information that prevents failure or data loss.
- **Warning:** A condition that can cause data loss, unsafe exposure, or significant disruption.
- **Result:** The expected state after a procedure.
- **Example:** A sample command, response, or configuration.

Do not use `Warning` for general advice.

## Promotional Language

Do not use promotional claims in technical documentation. Avoid:

- Revolutionary.
- Magical.
- Perfect.
- Effortless.
- Intelligent.
- Next-generation.
- Unleash.
- Transform your workflow.
- Best-in-class.
- AI-powered, unless a feature actually uses AI and the detail is relevant.

Prefer specific behavior and limits.

## Review Checklist

Before committing documentation, check that:

- The actor is clear.
- The action is clear.
- The result is clear.
- The recovery action is present when the result can fail.
- UI labels match the application.
- Commands, routes, filenames, fields, and codec names are exact.
- Preferred terminology is used consistently.
- Technical limitations are visible.
- No formal ASD-STE100 compliance is claimed.
- No ASD-STE100 dictionary content is copied.
