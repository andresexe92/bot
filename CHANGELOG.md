# Changelog

## [Unreleased] - 2026-01-28

### Fixed

#### Worker Crash (2026-01-28 ~17:00 UTC)
- Fixed `TypeError: res.json is not a function` by replacing with `res.writeHead/res.end`
- The worker now handles HTTP requests correctly with raw Node.js responses

#### Bot Naming (2026-01-28 ~17:15 UTC)
- Renamed test client from "Bot De Prueba" to "bot_test" to avoid whitespace issues

#### QR Code Generation - Iteration 1 (2026-01-28 ~18:00 UTC)
- **Problem**: BaileysProvider generates files relative to CWD, not configured paths
- **Solution**: Worker changes CWD to `BOT_STORAGE_PATH` before initializing provider
- **Result**: Partial fix - directories created correctly but QR still not emitting

#### QR Code Generation - Iteration 2 (2026-01-28 ~19:30 UTC)
- **Problem**: BaileysProvider wrapper doesn't always emit `require_action` event
- **Root Cause**: The QR event comes from Baileys socket (`vendor.ev`), not the wrapper
- **Solution**: Access `adapterProvider.vendor` directly and listen to `connection.update`
- **Result**: Events now captured, but connection fails with 405

---

### Critical Issue: Error 405 Connection Failure (2026-01-28 23:04 UTC)

#### Symptom
```
[Worker] BAILEYS connection.update: {
  "connection": "close",
  "lastDisconnect": {
    "error": {
      "output": {
        "statusCode": 405,
        "payload": {
          "statusCode": 405,
          "error": "Method Not Allowed",
          "message": "Connection Failure"
        }
      }
    }
  }
}
```

#### Root Cause Analysis
After extensive investigation and cross-referencing with GitHub issues:

1. **Primary Cause: Datacenter IP Blocking**
   - WhatsApp actively blocks WebSocket connections from known datacenter/VPS IP ranges
   - This includes: AWS, Google Cloud, Azure, DigitalOcean, Linode, Vultr, OVH, Hetzner, Railway, Render, etc.
   - WhatsApp fingerprints the IP and rejects it before QR generation

2. **Secondary Cause: Outdated Baileys Version**
   - Current version: `@whiskeysockets/baileys ~6.7.7` (bundled in @builderbot/provider-baileys 1.2.2)
   - Latest version: `@whiskeysockets/baileys 7.0.0-rc.9`
   - WhatsApp frequently updates their protocol, older versions may be rejected

#### Evidence from GitHub Issues
- [Issue #807](https://github.com/WhiskeySockets/Baileys/issues/807) - Connection Failure 405
- [Issue #999](https://github.com/WhiskeySockets/Baileys/issues/999) - Error 405 Connection Failure
- [Issue #1427](https://github.com/WhiskeySockets/Baileys/issues/1427) - 405 Method Not Allowed
- [Issue #1939](https://github.com/WhiskeySockets/Baileys/issues/1939) - 405 Method Not Allowed
- [Issue #2170](https://github.com/WhiskeySockets/Baileys/issues/2170) - 405 Error

All issues point to the same conclusion: **WhatsApp blocks datacenter IPs**.

---

### Solutions

#### Solution 1: Residential Proxy (RECOMMENDED for VPS/Production)

Use a residential proxy service to mask your VPS IP:

```typescript
import { HttpsProxyAgent } from 'https-proxy-agent';

const agent = new HttpsProxyAgent('http://user:pass@proxy.example.com:port');

// Pass to Baileys via makeWASocket options
// Note: Requires modifying how BaileysProvider initializes the socket
```

**Proxy Services (Residential IPs):**
| Service | Price | Notes |
|---------|-------|-------|
| Bright Data | ~$15/GB | Enterprise, most reliable |
| Smartproxy | ~$12/GB | Good balance |
| IPRoyal | ~$7/GB | Budget option |
| Oxylabs | ~$15/GB | Enterprise |

#### Solution 2: Run on Local Machine
- Run the bot on a home/office computer with residential IP
- Use SSH tunnel or VPN to connect from VPS to local machine

#### Solution 3: WhatsApp Business API (Official)
- Use Meta's official Cloud API
- No IP blocking issues
- Requires Facebook Business verification
- Free tier: 1000 conversations/month

#### Solution 4: Update Dependencies (May Not Fix 405)
```bash
npm update @builderbot/bot @builderbot/provider-baileys
# or use Baileys directly:
npm install @whiskeysockets/baileys@7.0.0-rc.9
```

---

### Technical Implementation: Proxy Support

To implement proxy support, the worker needs to be modified to pass an agent to Baileys:

```typescript
// src/worker/bot.ts - Modified initialization
import { HttpsProxyAgent } from 'https-proxy-agent';

const PROXY_URL = process.env.PROXY_URL; // http://user:pass@host:port

const agent = PROXY_URL ? new HttpsProxyAgent(PROXY_URL) : undefined;

// BaileysProvider needs to be configured to use this agent
// This may require using Baileys directly instead of the wrapper
```

**Required dependency:**
```bash
npm install https-proxy-agent
```

---

### Added Features

- `waitForVendor()` - Waits up to 30 seconds for Baileys socket
- `cleanSession()` - Utility to force new QR by deleting existing session
- `/status` endpoint now includes:
  - `cwd` - Current working directory
  - `qrExists` - Whether QR file exists
  - `sessionPath` - Path to session directory
  - `sessionExists` - Whether `creds.json` exists

---

### Version Information

| Package | Current | Latest | Notes |
|---------|---------|--------|-------|
| @builderbot/bot | 1.2.2 | 1.2.2 | Up to date |
| @builderbot/provider-baileys | 1.2.2 | 1.2.2 | Up to date |
| @whiskeysockets/baileys (bundled) | ~6.7.7 | 7.0.0-rc.9 | **Outdated** |
| Node.js | 18+ | 22 LTS | Recommended |

---

### Next Steps

1. **Immediate**: Implement residential proxy solution
2. **Short-term**: Test with updated Baileys version
3. **Long-term**: Consider WhatsApp Business API for production reliability

---

### References

- [WhiskeySockets/Baileys GitHub](https://github.com/WhiskeySockets/Baileys)
- [Baileys npm](https://www.npmjs.com/package/@whiskeysockets/baileys)
- [Baileys Documentation](https://baileys.wiki/)
- [WhatsApp Business API](https://developers.facebook.com/docs/whatsapp/cloud-api)

---
*Authors: Claude (Anthropic), Gemini (Google), Antigravity*
*Last Updated: 2026-01-28 23:04:58 UTC*
