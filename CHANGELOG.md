# Changelog

## 1.0.2 — 2026-11-23

- Reconnect existing MCP sessions when the local worker exits or rotates its port and token; start a replacement worker when needed.
- Serve the panel resource independently of worker startup and show the last-good cache with an explicit reconnect status if the worker is unavailable.
- Return cold-start snapshots immediately while the first source fetch continues, and expose retry controls for connection failures.
- Add regression coverage for worker replacement, exit, cold startup, cached fallback and failed preference writes.

## 1.0.1 — 2026-11-20

- Validate color input before updating state, and assign its value through the DOM property instead of HTML interpolation.
- Make the timer/error test deterministic with an injected clock.
- First published binary Release. The earlier v1.0.0 source tag is retained without a published binary Release.

## 1.0.0 — 2026-11-20 (source candidate)

- Initial public release of the Codex conversation panel and sidebar entry.
- Independent 30-minute local refresh, validated last-good cache and manual retry.
- Per-model rankings for score, elapsed time and cost; ties share colors.
- Fresh, rainbow and neon themes, custom accents and saved model preferences.
- Windows installer, prebuilt package, bilingual documentation and source attribution.

The screenshot supplied by the owner shows native rendering. Automated tests
use synthetic data; live source data is fetched on the user's machine.
