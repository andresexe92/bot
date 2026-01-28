# Changelogs

## [Unreleased] - 2026-01-28

### Fixed
- **Worker Crash**: Fixed `TypeError: res.json is not a function` in `bot.ts` by replacing it with `res.writeHead/res.end`. The worker now handles HTTP requests correctly.
- **Bot Name**: Renamed test client from "Bot De Prueba" to "bot_test" to avoid potential whitespace issues with file paths.

### Known Issues
- **QR Code Generation**: The bot starts and authenticates (waiting for scan), but the `qr.png` file is not generated in the storage directory. The `require_action` event from Baileys provider is not triggering as expected in this environment. 
    - *Status*: Investigating.
    - *Workaround*: None yet.
    - *Time*: 2026-01-28 17:22:00

---
*Author: Antigravity*
*Time: 17:22:00*
