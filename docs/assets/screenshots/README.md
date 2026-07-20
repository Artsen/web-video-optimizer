# Screenshot Assets

These curated WebP screenshots are copied from deterministic `npm run review:ui-screens` output and compressed for repository documentation.

Only mocked review data may be used for committed screenshots. Do not capture real user media, personal filenames, local filesystem paths, storage roots, secrets, raw API logs, browser chrome, or anything from `data/`.

## Refresh Workflow

1. Run `npm run review:ui-screens`.
2. Inspect the generated PNG files under `.tmp/ui-review/`.
3. Convert only the curated captures listed below to WebP.
4. Keep the committed set to roughly five to seven screenshots.
5. Leave `.tmp/ui-review/` and any contact sheets uncommitted.

Review captures are full-page unless the Playwright screenshot suite names them as narrow or dialog-specific viewport captures.

| Asset                      | Source capture                                 |
| -------------------------- | ---------------------------------------------- |
| `prepare-dark.webp`        | `.tmp/ui-review/source-dark-desktop.png`       |
| `results-dark.webp`        | `.tmp/ui-review/results-dark-desktop.png`      |
| `results-light.webp`       | `.tmp/ui-review/results-light-desktop.png`     |
| `compare-wipe-dark.webp`   | `.tmp/ui-review/compare-wipe-dark-desktop.png` |
| `custom-export-dark.webp`  | `.tmp/ui-review/custom-dark-desktop.png`       |
| `mobile-results-dark.webp` | `.tmp/ui-review/results-narrow.png`            |

The current curated set balances dark workflow coverage, one light-theme result, Compare theatre, Custom Export density, and mobile bottom chrome. Add an empty-state screenshot only when it materially improves the README.

Current curated set: 6 WebP files, 260,638 bytes total.
