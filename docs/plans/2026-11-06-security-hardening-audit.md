# Security Hardening & Audit Fixes (#424, #425, #426, #427, #429)

**Date**: 2026-11-06  
**Branch**: `fix/security-hardening-audit`  
**Issues**:
- #424 (High / Security): Unauthenticated SSE task log stream with `Access-Control-Allow-Origin: *` allows cross-origin log harvesting
- #425 (Medium / Security): Unauthenticated `/dsh-cron/history/archives` and `/history/archive/:month` routes leak historical task logs
- #426 (Medium / Bug): `createOrUpdateTask` receives `ctx: undefined` in `handleTaskCollection`, dropping DSH connection authentication
- #427 (Low / Security): Expand cloud metadata SSRF blacklist to include AWS IMDSv6, Alibaba, and link-local subnet
- #429 (Low / Hygiene): Remove untracked leftover archive `goodandready-dsh-cron-0.3.23.tgz` from repo root

---

## 1. Scope of Changes

### 1.1. SSE Stream Protection (#424)
- **`lib/routes/api-item.js`**: Move SSE stream route handler after `rejectCrossOrigin(req, res, { apiToken, ctx })`.
- **`lib/log-streamer.js`**: Remove wildcard `Access-Control-Allow-Origin: *` from `handleSseRequest`.

### 1.2. History Archives Protection (#425)
- **`lib/routes/routes.js`**: Call `rejectCrossOrigin(req, res, { apiToken, ctx })` at the top of `/dsh-cron/history/archives` and `/dsh-cron/history/archive/` handlers.

### 1.3. Task Collection Connection Context (#426)
- **`lib/routes/api-collection.js`**: Pass `ctx` instead of `ctx: undefined` to `createOrUpdateTask({ store, scheduler, req, res, apiToken, ctx })`.

### 1.4. Cloud Metadata SSRF Expansion (#427)
- **`lib/runtimes/runtimes.js`**:
  - Export `isCloudMetadataHost(hostname)`: checks `169.254.0.0/16`, `[fd00:ec2::254]`, `fd00:ec2::254`, `100.100.100.200`, `metadata.google.internal`, `metadata.azure.com`, `*.internal.cloudapp.net`.
  - Use `isCloudMetadataHost(hostname)` in `buildHttpRequest`.
- **`lib/scheduler/scheduler-preflight.js`**:
  - Use `isCloudMetadataHost(host)` in `runPreflightCheck` for `http` type.

### 1.5. Leftover Archive Cleanup (#429)
- Delete `goodandready-dsh-cron-0.3.23.tgz` from repo root.

---

## 2. Verification Steps
1. Unit tests in `test/security-audit-fixes.test.mjs` verifying:
   - SSE stream rejection for cross-origin and unauthenticated requests.
   - History archive routes rejection for cross-origin and unauthenticated requests.
   - Forwarding of `ctx` in `handleTaskCollection`.
   - SSRF detection for all cloud metadata targets.
2. Full test suite: `npm test`.
3. Preflight check: zero regressions in sizes, syntax, and packaging.
