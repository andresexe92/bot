# Changelog

## [Unreleased] - 2026-01-28

### Fixed

#### Worker Crash
- Fixed `TypeError: res.json is not a function` by replacing with `res.writeHead/res.end`
- The worker now handles HTTP requests correctly with raw Node.js responses

#### Bot Naming
- Renamed test client from "Bot De Prueba" to "bot_test" to avoid whitespace issues

#### QR Code Generation (Multiple Iterations)

**Iteration 1 - CWD Change:**
- **Problem**: BaileysProvider generates files relative to CWD, not configured paths
- **Solution**: Worker changes CWD to `BOT_STORAGE_PATH` before initializing provider
- **Result**: Partial fix - directories created correctly but QR still not emitting

**Iteration 2 - Direct Baileys Socket Access:**
- **Problem**: BaileysProvider wrapper doesn't always emit `require_action` event
- **Root Cause**: The QR event comes from Baileys socket (`vendor.ev`), not the wrapper
- **Solution**: Access `adapterProvider.vendor` directly and listen to `connection.update`

```typescript
// Wait for vendor (Baileys socket) to be available
const vendor = adapterProvider.vendor;

// Listen directly to Baileys events
vendor.ev.on('connection.update', (update) => {
  if (update.qr) {
    // QR code received as string
  }
  if (update.connection === 'open') {
    // Successfully connected
  }
});
```

### Added

- `waitForVendor()` - Waits up to 30 seconds for Baileys socket
- `cleanSession()` - Utility to force new QR by deleting existing session
- `/status` endpoint now includes:
  - `cwd` - Current working directory
  - `qrExists` - Whether QR file exists
  - `sessionPath` - Path to session directory
  - `sessionExists` - Whether `creds.json` exists

### Technical Details

The Baileys `connection.update` event contains:
- `qr`: String representation of QR code (when scan needed)
- `connection`: `'open'` | `'close'` | `'connecting'`
- `lastDisconnect`: Information about last disconnection

### Known Issues / Troubleshooting

If QR still doesn't appear:
1. **Network**: Verify connectivity to `web.whatsapp.com`
2. **Existing Session**: Use `POST /api/clients/{nit}/clear-session` or uncomment `cleanSession()` in code
3. **Logs**: Look for `[Worker] BAILEYS connection.update:` messages

---
*Authors: Claude, Gemini, Antigravity*
*Updated: 2026-01-28*
