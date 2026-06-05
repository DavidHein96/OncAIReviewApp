# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
