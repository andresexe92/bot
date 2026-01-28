# Changelogs

## [Unreleased] - 2026-01-28

### Fixed
- **Worker Crash**: Fixed `TypeError: res.json is not a function` in `bot.ts` by replacing it with `res.writeHead/res.end`. The worker now handles HTTP requests correctly.
- **Bot Name**: Renamed test client from "Bot De Prueba" to "bot_test" to avoid potential whitespace issues with file paths.
- **QR Code Generation**: Fixed QR not being generated in storage directory.
  - **Root Cause**: BaileysProvider generates QR files relative to the Current Working Directory (CWD), not to a configured path.
  - **Solution**: Worker now changes CWD to `BOT_STORAGE_PATH` BEFORE initializing BaileysProvider using `process.chdir()`.
  - **Additional Changes**:
    - Added debug logging for all emitted events
    - Added `cwd` and `qrExists` fields to `/status` endpoint
    - Improved QR watcher with filesystem watch in addition to polling

### Technical Details
The fix involves:
1. Using `resolve()` for all paths to ensure absolute paths
2. Calling `process.chdir(BOT_STORAGE_PATH)` before `createProvider()`
3. Baileys will now generate `{BOT_NOMBRE}.qr.png` inside `storage/{NIT}/`
4. QR watcher copies/renames to standardized `qr.png` path

---
*Author: Antigravity*
*Updated: 2026-01-28*
