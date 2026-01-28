# Changelogs

## [Unreleased] - 2026-01-28

### Fixed
- **Worker Build Error**: Fixed a critical syntax error in `src/flowQuestion.ts` where an `if` statement was missing, causing the worker build to fail.
- **API Server Type Errors**: Resolved TypeScript errors in `src/manager/ApiServer.ts` related to Express middleware return types. Standardized all handlers to return `void` instead of the response object, complying with stricter type definitions.

### Added
- **Build Verification**: Verified successful build of both `manager` and `worker` processes.
- **Startup Verification**: Confirmed Bot Manager starts correctly and serves the API at port 4000.

### Cleaned
- **Legacy Directories**: Deleted unused folders `bot-1`, `bot-2`, `BotsClientes`, and `pepita_sessions` to clean up the workspace.
- **TypeScript Config**: Updated `tsconfig.json` to remove exclusions for the deleted legacy directories.

---
*Author: Antigravity*
*Time: 16:50:34*
