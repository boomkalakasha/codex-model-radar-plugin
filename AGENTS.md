# Model Radar

This repository is the public plugin source. Read README.md and the relevant
source before editing. Preserve compact layout, per-model/per-metric ranking,
ties, missing settings, black default accent and theme-aware outer frames.

Run `npm ci`, `npm run build`, and `npm test`. Tests use authored synthetic HTML.
Never execute remote page scripts or replace a good cache with invalid data.
Keep source attribution in both READMEs and the source link in the panel.

Do not commit runtime tokens, Codex profiles, config backups, `internal/`,
installed plugin caches, personal paths or real source-page snapshots.
Builds must leave tracked MCP configuration portable. The installer binds
absolute executable and profile paths only in the installed private cache.

Use a focused branch/PR for later changes. Publish tags and release assets only
with owner authorization, a reviewed fixed commit and checks of all upload bytes.
Maintain both languages for changed user behavior. Do not imply source-site or
OpenAI endorsement. Windows is the tested installer platform.
