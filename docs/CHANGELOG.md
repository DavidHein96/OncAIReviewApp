# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0] - 2026-06-05

### Added

- The viewer now shows the running version as a `vX.Y.Z` badge in the header
  (also printed in the server's startup banner). `pyproject.toml` is the single
  source of truth — `server.py` reads it at runtime via the standard-library
  `tomllib`, working both from source and inside the frozen executable.
- Build assets are now named with the semantic version, e.g.
  `oncai-review-0.3.0-windows-x64.exe`, so downloaded binaries are traceable to
  a release. `pyproject.toml` is bundled into the executable so the frozen
  binary can report its own version.
- macOS now ships a double-clickable `.app` bundle (built with `--windowed`,
  zipped with `ditto`) instead of a bare binary, so non-technical reviewers can
  launch it from Finder. Includes `docs/RUNNING-ON-MAC.md` (the one-time
  Gatekeeper "Open Anyway" steps, since the app is unsigned) and a
  `make build-app` target to build it locally.

## [0.2.0] - 2026-06-05

### Added

- `Makefile` wrapping the common tasks (`install`, `start`, `demo`, `build`,
  `lint`, `format`, `test`, `test-js`, `check`); run `make help` to list them.
- ESLint (flat config) + Prettier for the front end via a dev-only
  `package.json`; `make lint` now runs `ruff` + `ty` + `eslint` + `prettier`,
  and CI runs the JS lint alongside the front-end tests.
- Front-end test suite (`web/app.test.js`) using Node's built-in test runner —
  no npm install required to run it.
- Build workflow now also runs when a GitHub Release is created, attaching the
  per-platform binaries to the release as downloadable assets.

### Changed

- **ApproxDate `date` must now be a full, real `YYYY-MM-DD` calendar date**
  (a separate `precision` field conveys year/month/day granularity, and an
  optional `anchor` must be a known hint). Partial dates like `2026` or
  `2026-02` are now rejected — previously accepted.
- `make start` / `make demo` no longer pin a port; the server auto-falls back to
  an open one. Override with `make start PORT=9000`.
- Moved `CHANGELOG.md` into `docs/` to de-clutter the repository root.

### Fixed

- CI type-check step now runs inside the project environment so `ty` can resolve
  dev dependencies (e.g. `pytest`).

## [0.1.0] - 2026-06-05

### Added

- Initial public release.
- Local, dependency-free physician review server (`server.py`, Python standard
  library only) that serves a `localhost` web UI for adjudicating extracted
  events — approve, reject, or edit fields — and writes verdicts to an
  append-only `*.reviews.jsonl` sidecar.
- Evidence-first review UI: source note shown beside the extracted fields, with
  the model's verbatim evidence spans highlighted inline (whitespace-flexible,
  case-insensitive matching).
- Open a `*.review_pkg.json` from the in-app file picker or via `--package`;
  click-to-copy MRN / note-id / date chips for pasting into the EMR.
- Server-side validation of edited `ApproxDate` fields so malformed dates can't
  be persisted even if the browser is bypassed.
- Path-traversal guard on static file serving.
- Single-file executable packaging with PyInstaller (web assets bundled via
  `_MEIPASS`), plus a manual GitHub Actions matrix that builds Windows (x64),
  Linux (x64), and macOS (arm64) binaries.
- Test suite (`pytest`) covering the pure helpers, the append-only verdict log,
  and full HTTP round-trips against a live server.
- CI: `ruff` lint + `ty` type checking + tests across Linux/Windows/macOS on
  Python 3.11 and 3.13.
- Bundled synthetic demo package (`examples/demo.review_pkg.json`) and
  architecture notes (`DESIGN.md`).
