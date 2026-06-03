# Defect Registry — CopyCanto

**Generated:** 2026-05-13 07:53 UTC  
**Auditor:** multi_app_audit.py — Adversarial Triad (6-model Ollama Cloud)  
**Audit duration:** 1 hour per app  

---

## Summary

| Category | Count |
|---|---|
| CRITICAL | 3 |
| HIGH | 7 |
| MEDIUM | 6 |
| LOW | 1 |
| Auto-fixed | 12 |
| Verified OK | 9 |

## Perspective C1: API Security & Input Validation

**Severity:** CRITICAL=2, HIGH=4, MEDIUM=3, LOW=0  
**Fixes applied:** 8/9  
**Fixes verified:** 5/8

I'll analyze each finding from both auditors against the actual code, verify their validity, and synthesize a final verified defect list.

## VERIFIED FINDING 1: API Key Exposure in Client-Side Code
- **ID:** APP-C-PC1-001
- **Severity:** CRITICAL
- **File:** server.ts:141
- **Root cause:** The GITHUB_TOKEN is loaded from environment variables but could be exposed through error messages or debug output. While the code doesn't directly expose it, the risk exists if error handling isn't careful.
- **Fix:** Implement proper error handling to prevent token leakage and ensure it's never included in client responses.
- **Source:** Auditor-A-only

## VERIFIED FINDING 2: Path Traversal in safeStoragePath
- **ID:** APP-C-PC1-002
- **Severity:** HIGH
- **File:** server.ts:101-107
- **Root cause:** The current implementation normalizes the path before checking for '..', which could allow directory traversal attacks. The check for '..' should happen before normalization.
- **Fix:** 
```typescript
function safeStoragePath(assetUrl: string): string {
  if (assetUrl.includes('..')) {
    throw new Error(`Unsafe asset path (contains '..'): ${assetUrl}`);
  }
  const rel = assetUrl.replace('/assets/', '');
  if (path.isAbsolute(rel)) {
    throw new Error(`Unsafe asset path (absolute): ${assetUrl}`);
  }
  return path.join(process.cwd(), 'storage', rel);
}
```
- **Source:** Both-agreed

## VERIFIED FINDING 3: Insecure Direct Object Reference (IDOR) Risk
- **ID:** APP-C-PC1-003
- **Severity:** HIGH
- **File:** server.ts:263, 281-283
- **Root cause:** While there are some protections, the PATCH endpoint could potentially allow modification of userId if not properly validated. The current check only verifies existing userId but doesn't prevent modification of the field.
- **Fix:** Add explicit check in PATCH handler to prevent userId modification:
```typescript
if (req.body.hasOwnProperty('userId') && req.body.userId !== existing.userId) {
  return res.status(403).json({ error: "Cannot modify userId" });
}
```
- **Source:** Auditor-A-only

## VERIFIED FINDING 4: Remote Code Execution via Python Process Arguments
- **ID:** APP-C-PC1-004
- **Severity:** CRITICAL
- **File:** server.ts:354-373
- **Root cause:** User-controlled inputs (youtubeUrl, audioUrl) are passed directly to a Python process without proper validation, allowing potential command injection.
- **Fix:** Add strict URL validation before passing to Python:
```typescript
const urlRegex = /^(https?:\/\/)?([\w\-]+\.)+[\w\-]+(\/[\w\-._~:/?#[\]@!$&'()*+,;=]*)?$/i;
if (youtubeUrl && !urlRegex.test(youtubeUrl)) {
  throw new Error("Invalid YouTube URL");
}
if (audioUrl && !PATH_SAFE_RE.test(audioUrl)) {
  throw new Error("Invalid audio URL");
}
```
- **Source:** Auditor-B-only

## VERIFIED FINDING 5: SSRF via GitHub API Proxy
- **ID:** APP-C-PC1-005
- **Severity:** HIGH
- **File:** server.ts:168-195
- **Root cause:** The GitHub proxy endpoint doesn't validate owner/repo parameters, allowing potential SSRF attacks to internal services.
- **Fix:** Add validation for owner/repo format and restrict to GitHub domains:
```typescript
const ownerRepoRegex = /^[a-zA-Z0-9\-_.]+$/;
if (!ownerRepoRegex.test(owner) || !ownerRepoRegex.test(repo)) {
  return res.status(400).json({ error: "Invalid owner/repo format" });
}
```
- **Source:** Auditor-B-only

## VERIFIED FINDING 6: Weak Rate Limiting Configuration
- **ID:** APP-C-PC1-006
- **Severity:** MEDIUM
- **File:** server.ts:84-98
- **Root cause:** Rate limiting uses IP addresses that could be spoofed via X-Forwarded-For headers.
- **Fix:** Configure trust proxy and use proper IP extraction:
```typescript
app.set('trust proxy', true);
const coverCreateLimiter = rateLimit({
  // ... existing config
  keyGenerator: (req) => req.ips[0] || req.ip,
});
```
- **Source:** Both-agreed

## VERIFIED FINDING 7: Missing Content Security Policy Headers
- **ID:** APP-C-PC1-007
- **Severity:** MEDIUM
- **File:** server.ts:72
- **Root cause:** Helmet is used but without explicit CSP configuration, leaving XSS protection incomplete.
- **Fix:** Add explicit CSP configuration to Helmet middleware.
- **Source:** Both-agreed

## VERIFIED FINDING 8: Sensitive Data Exposure via Error Messages
- **ID:** APP-C-PC1-008
- **Severity:** MEDIUM
- **File:** server.ts:233,243,252,270,290
- **Root cause:** Raw error messages are sent to clients, potentially exposing sensitive information.
- **Fix:** Replace with generic error messages and log details server-side.
- **Source:** Auditor-B-only

## VERIFIED FINDING 9: Arbitrary File Write via upload.single('audio')
- **ID:** APP-C-PC1-009
- **Severity:** HIGH
- **File:** server.ts:509-552
- **Root cause:** User-controlled originalname could contain path traversal sequences.
- **Fix:** Sanitize filename before using:
```typescript
const safeName = fileData.originalname.replace(/[^a-zA-Z0-9.]/g, '_');
const uniqueName = `${uuidv4()}_${safeName}`;
```
- **Source:** Auditor-B-only

## FALSE POSITIVES DISCARDED
1. Auditor A's "Unvalidated User Input Sent to External Services" - The URL is properly encoded in the prompt.
2. Auditor B's "Firebase Auth Bypass via Type Assertion" - The type assertion is safe in this context.
3. Auditor B's "CSRF via Missing SameSite Cookies" - The app uses token-based auth, not cookies.

## SYSTEMIC THEMES
1. Insufficient input validation across multiple endpoints
2. Insecure handling of file paths and user-controlled data
3. Lack of proper error handling leading to information leakage
4. Inadequate security headers configuration
5. Insufficient protection against SSRF attacks

## FINAL TALLY
CRITICAL=2, HIGH=4, MEDIUM=3, LOW=0 | Health: D

The codebase has multiple critical security vulnerabilities that require immediate attention, particularly the RCE and SSRF issues. The overall security posture is poor and needs significant improvement.

### Fix Sprint Results

| ID | Sev | File | Fixed | Verified | Note |
|---|---|---|---|---|---|
| APP-C-PC1-001 | CRITICAL | `server.ts` | ✅ | ✅ | 3 patch(es) applied; startup env-name log removed 2026-05-13 |
| APP-C-PC1-002 | HIGH | `server.ts` | ✅ | ✅ | 1 patch(es) applied |
| APP-C-PC1-003 | HIGH | `server.ts` | ✅ | ✅ | 1 patch(es) applied |
| APP-C-PC1-004 | CRITICAL | `server.ts` | ✅ | ✅ | 1 patch(es) applied |
| APP-C-PC1-005 | HIGH | `server.ts` | ✅ FIXED (2026-05-13 manual) | ✅ | owner/repo regex guard added to both /contents* and /raw* routes |
| APP-C-PC1-006 | MEDIUM | `server.ts` | ✅ | ✅ | 3 patch(es) applied |
| APP-C-PC1-007 | MEDIUM | `server.ts` | ✅ | ⚠️ | 1 patch(es) applied |
| APP-C-PC1-008 | MEDIUM | `server.ts` | ✅ | ⚠️ | 5 patch(es) applied |
| APP-C-PC1-009 | HIGH | `server.ts` | ✅ | ⚠️ | 1 patch(es) applied |

---

## Perspective C2: React State & Error Handling

**Severity:** CRITICAL=1, HIGH=3, MEDIUM=3, LOW=1  
**Fixes applied:** 4/8  
**Fixes verified:** 4/4

I'll analyze both audits against the actual codebase, verifying each finding and creating a consolidated list of verified defects.

## VERIFIED FINDING 1: Race Condition in Authentication State Update
- **ID:** APP-C-PC2-001
- **Severity:** HIGH
- **File:** src/App.tsx:43-50
- **Root cause:** The authentication state handler doesn't properly handle component unmount scenarios, potentially causing state updates on unmounted components.
- **Fix:** 
```typescript
useEffect(() => {
  let isMounted = true;
  const unsubscribe = onAuthStateChanged(auth, (u) => {
    if (!isMounted) return;
    if (u) {
      setUser(u);
    }
    setLoading(false);
  });
  return () => {
    isMounted = false;
    unsubscribe();
  };
}, []);
```
- **Source:** Both-agreed

## VERIFIED FINDING 2: Memory Leak in Firestore Listener
- **ID:** APP-C-PC2-002
- **Severity:** HIGH
- **File:** src/components/GlobalProgressBar.tsx:27-44
- **Root cause:** The Firestore listener doesn't check if the component is mounted before updating state, potentially causing memory leaks.
- **Fix:**
```typescript
useEffect(() => {
  if (!user) return;
  let isMounted = true;

  const jobsQuery = query(
    collection(db, "jobs"),
    where("userId", "==", user.uid),
    where("status", "in", ["pending", "processing"])
  );

  const unsubscribe = onSnapshot(jobsQuery, (snapshot) => {
    if (!isMounted) return;
    const jobsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Job));
    setActiveJobs(jobsData);
  }, (err) => {
    if (!isMounted) return;
    handleFirestoreError(err, OperationType.LIST, "jobs");
  });

  return () => {
    isMounted = false;
    unsubscribe();
  };
}, [user?.uid]);
```
- **Source:** Both-agreed

## VERIFIED FINDING 3: XSS Vulnerability in User Profile Image
- **ID:** APP-C-PC2-003
- **Severity:** CRITICAL
- **File:** src/components/Layout.tsx:91
- **Root cause:** User-provided photoURL is used without sanitization, potentially allowing XSS attacks.
- **Fix:**
```typescript
src={user?.photoURL ? encodeURI(user.photoURL) : `https://picsum.photos/seed/${encodeURIComponent(user?.uid || 'default')}/100/100`}
```
- **Source:** Auditor-B-only

## VERIFIED FINDING 4: Unsafe Type Assertion in User Object
- **ID:** APP-C-PC2-004
- **Severity:** MEDIUM
- **File:** src/App.tsx:45
- **Root cause:** Using `as any` bypasses TypeScript's type checking for the user object.
- **Fix:**
```typescript
// Change state definition to:
const [user, setUser] = useState<User | null>(null);

// And in the effect:
if (u) {
  setUser(u);
}
```
- **Source:** Both-agreed

## VERIFIED FINDING 5: Division by Zero Risk in Progress Calculation
- **ID:** APP-C-PC2-005
- **Severity:** MEDIUM
- **File:** src/components/GlobalProgressBar.tsx:56
- **Root cause:** Potential division by zero when activeJobs array is empty.
- **Fix:**
```typescript
const totalProgress = activeJobs.length > 0 
  ? activeJobs.reduce((acc, job) => acc + job.progress, 0) / activeJobs.length
  : 0;
```
- **Source:** Auditor-A-only

## VERIFIED FINDING 6: Missing Error Boundary for Critical Components
- **ID:** APP-C-PC2-006
- **Severity:** HIGH
- **File:** src/App.tsx:60-82
- **Root cause:** No error boundaries implemented, risking full app crashes from unhandled errors.
- **Fix:** Implement and wrap with ErrorBoundary component as shown in Auditor A's finding.
- **Source:** Auditor-A-only

## VERIFIED FINDING 7: Missing Loading State in Firestore Query
- **ID:** APP-C-PC2-007
- **Severity:** LOW
- **File:** src/components/GlobalProgressBar.tsx:46
- **Root cause:** Component returns null during initial load without indicating loading state.
- **Fix:** Add loading state management as shown in Auditor B's finding 9.
- **Source:** Auditor-B-only

## VERIFIED FINDING 8: Unsafe `any` Type in Layout Props
- **ID:** APP-C-PC2-008
- **Severity:** MEDIUM
- **File:** src/components/Layout.tsx:27
- **Root cause:** User prop typed as `any` loses type safety.
- **Fix:**
```typescript
interface User {
  uid: string;
  displayName?: string | null;
  email?: string | null;
  photoURL?: string | null;
}

interface LayoutProps {
  children: React.ReactNode;
  user: User | null;
}
```
- **Source:** Auditor-B-only

## FALSE POSITIVES DISCARDED
1. **External Image Loading (Auditor A Finding 3):** Code already includes `referrerPolicy="no-referrer"` which is sufficient security.
2. **Race Condition in Firestore Snapshot (Auditor B Finding 5):** Over-engineering; Firestore guarantees ordered delivery of snapshots.
3. **OOM from Unbounded Job List (Auditor B Finding 8):** Not a significant risk given the query limits active jobs to pending/processing.
4. **Insecure referrerPolicy (Auditor B Finding 10):** Current `no-referrer` policy is actually more secure than suggested alternative.

## SYSTEMIC THEMES
1. **Inconsistent Error Handling:** Lack of standardized error boundaries and async error handling patterns.
2. **Type Safety Gaps:** Overuse of `any` type and missing proper type definitions.
3. **Resource Management:** Inconsistent cleanup of subscriptions and event listeners.
4. **State Management:** Missing loading states and proper initialization patterns.
5. **Security Practices:** Inconsistent input sanitization and security attribute usage.

## FINAL TALLY
CRITICAL=1, HIGH=3, MEDIUM=3, LOW=1 | Health: C

The codebase shows several concerning patterns but is not in critical condition. Priority should be given to the CRITICAL XSS vulnerability and HIGH severity issues related to memory leaks and error boundaries.

### Fix Sprint Results

| ID | Sev | File | Fixed | Verified | Note |
|---|---|---|---|---|---|
| APP-C-PC2-001 | HIGH | `src/App.tsx` | ✅ | ✅ | 1 patch(es) applied |
| APP-C-PC2-002 | HIGH | `src/components/GlobalProgressBar.tsx` | ✅ | ✅ | 1 patch(es) applied |
| APP-C-PC2-003 | CRITICAL | `src/components/Layout.tsx` | ✅ | ✅ | 1 patch(es) applied |
| APP-C-PC2-004 | MEDIUM | `src/App.tsx` | ❌ | — | skipped: Code already implements the requested changes corre |
| APP-C-PC2-005 | MEDIUM | `src/components/GlobalProgressBar.tsx` | ✅ FIXED (2026-05-13 manual) | ✅ | Guard `activeJobs.length > 0` before division |
| APP-C-PC2-006 | HIGH | `src/App.tsx` | ✅ FIXED (2026-05-13 manual) | ✅ | ErrorBoundary class component added; wraps ThemeProvider+Router |
| APP-C-PC2-007 | LOW | `src/components/GlobalProgressBar.tsx` | ❌ | — | LOW severity — skipped |
| APP-C-PC2-008 | MEDIUM | `src/components/Layout.tsx` | ✅ | ✅ | 1 patch(es) applied |

---

## Perspective RT-2026-06-03: Opus Red-Team Audit (functional + security)

**Generated:** 2026-06-03  
**Auditor:** Claude Opus 4.8 (1M) red-team — full-stack manual audit + two parallel read-only sub-audits, every lead verified against source before fixing.  
**Method:** Mapped Express `server.ts`, the mock-Firebase shim `src/db.ts`, all React pages, and the Python AI pipeline. Fixes verified via live API calls (mock engine), deterministic replication of `db.ts` query logic against live data, `tsc --noEmit`, `vite build`, and `py_compile`.

### Summary

| Category | Count |
|---|---|
| CRITICAL | 3 |
| HIGH | 3 |
| MEDIUM | 4 |
| LOW | 1 |
| Fixed + verified | 11 |

This pass focused on defects that survived the 2026-05-13 audit, including the **default user flow being completely broken** (a class the earlier security-only sweep missed). Every finding below is fixed in commit-ready state across 6 files: `server.ts`, `src/db.ts`, `src/pages/CreateCover.tsx`, `src/pages/Voices.tsx`, `engines/process.py`, `engines/process_sim.py`.

### RT-0603-01 — Default "Superman" engine rejected by backend (default flow dead)
- **Severity:** CRITICAL · **File:** `src/pages/CreateCover.tsx`
- **Root cause:** UI engine state defaulted to the brand codename `'superman'`, sent verbatim to `/api/covers/create`. Backend `VALID_ENGINES` only accepts `rvc/knn/neucosvc/amphion/none` → **HTTP 400**, and the frontend swallowed it (console-only), so the default "Create Cover" did nothing.
- **Fix:** Engine value is now the real id `'rvc'` (UI still labels it "Superman Engine").
- **Verified:** live API — `engine:'superman'` → 400, `engine:'rvc'` → 200 + job completed.

### RT-0603-02 — Voice Library always empty
- **Severity:** CRITICAL · **File:** `src/pages/Voices.tsx:163`
- **Root cause:** Library queried `where("isPublic","==",true)` but uploads write `isPublic:false`, so the user's own voices were never shown.
- **Fix:** Dropped the `isPublic` filter (single-user local app shows all voices).
- **Verified:** replicated `db.ts` filter on live data — 1 → 2 voices.

### RT-0603-03 — CreateCover voice picker always empty
- **Severity:** CRITICAL · **File:** `src/pages/CreateCover.tsx:89`
- **Root cause:** Picker filtered `where("archived","==",false)`, but no voice record ever has an `archived` field, so every voice was filtered out → no cover could be created.
- **Fix:** Dropped the `archived` filter (the archive feature does not exist).
- **Verified:** replicated filter on live data — 1 → 2 voices.

### RT-0603-04 — Pitch slider never applied
- **Severity:** HIGH · **Files:** `server.ts`, `engines/process.py:228`
- **Root cause:** `pitch` was validated and stored on the job but never forwarded to the engine; `process.py` hardcoded RVC `--f0_key 0`.
- **Fix:** `server.ts` forwards `--pitch`; `process.py` accepts `--pitch` and passes it as RVC `f0_key`. (`rvc_infer.py` already supported `--f0_key`.)
- **Verified:** `pitch` persisted on job record and forwarded only when non-zero.

### RT-0603-05 — Server bound to 0.0.0.0 (LAN exposure, no auth)
- **Severity:** HIGH · **File:** `server.ts`
- **Root cause:** `app.listen(PORT, "0.0.0.0")` exposed the unauthenticated API (uploads, deletes, file reads — all owned by hardcoded `SYSTEM_USER`) to the whole LAN, contradicting the local-first README.
- **Fix:** Bind to `127.0.0.1`.

### RT-0603-06 — Job stranded forever on malformed stored audioUrl
- **Severity:** HIGH · **File:** `server.ts` (`processQueue`)
- **Root cause:** `safeStoragePath()` correctly rejects non-`/assets/` paths by throwing, but `processQueue` caught the error without updating the job, leaving it `pending` with an infinite UI spinner. Triggered by legacy `/api/storage/...` audioUrls (see Data Note).
- **Fix:** Added `tryResolveVoiceAsset()` (non-fatal resolution that drops unsafe paths) and the queue `catch` now marks the job `failed` with the error message. The security guard is preserved — unsafe paths are still rejected, just no longer fatal.
- **Verified:** malformed-voice job now ends `failed` with a clear message; Asdís job proceeds via the engine's reference-directory fallback.

### RT-0603-07 — Rate-limit bypass via X-Forwarded-For
- **Severity:** MEDIUM · **File:** `server.ts`
- **Root cause:** `trust proxy: true` + custom keyGenerators read client `X-Forwarded-For`, so rotating the header defeated both limiters.
- **Fix:** `trust proxy: false`; use express-rate-limit's default `req.ip` key (correct IPv6 handling, unspoofable on loopback).

### RT-0603-08 — Local file disclosure via unvalidated audioUrl
- **Severity:** MEDIUM · **File:** `server.ts` (`/api/covers/create`)
- **Root cause:** `audioUrl` was passed to `process.py`, which `cp`s the referenced local path into served storage. An unvalidated value (`/etc/passwd`, `../../secret`) became a readable asset. The 2026-05-13 fix only validated `youtubeUrl`.
- **Fix:** Require `audioUrl` to start with `/assets/` and contain no `..`.
- **Verified:** `/etc/passwd` → 400, `/assets/../../etc/passwd` → 400, `/assets/...` → 200.

### RT-0603-09 — Hardened CSP broke `npm run dev` (blank page)
- **Severity:** MEDIUM · **File:** `server.ts`
- **Root cause:** Helmet CSP `script-src 'self'` blocked Vite's inline React-refresh preamble (`@vitejs/plugin-react can't detect preamble`), so the documented dev workflow rendered a blank page.
- **Fix:** Apply the strict CSP in production only; disable CSP in dev where Vite needs inline scripts + eval + HMR websockets. Other helmet headers still apply in both.

### RT-0603-10 — MOCK engine path broken by `--highQuality`
- **Severity:** MEDIUM · **File:** `engines/process_sim.py`
- **Root cause:** Server passes `--highQuality` (the UI default) and now `--pitch`, but the simulator's argparse accepted neither → exit 2 → every MOCK/UAT job failed.
- **Fix:** Simulator accepts (and ignores) `--highQuality` and `--pitch`.
- **Verified:** mock job runs 10→100 with both flags.

### RT-0603-11 — Mock DB ignored orderBy/limit
- **Severity:** LOW · **File:** `src/db.ts`
- **Root cause:** `getDocs` only implemented `where`; `orderBy`/`limit` were no-ops, so Home's "3 recent covers" showed all covers unsorted.
- **Fix:** Implemented `orderBy` (null-safe) and `limit` in the client filter.
- **Verified:** Home covers 25 → 3, newest-first.

### False positives discarded (verified non-bugs)
- `knnvc_infer.py` "out_wav[None] is 3-D" — `knn_vc.match()` returns 1-D, so `[None]` yields correct 2-D. No change.
- `neucosvc_infer.py` / `amphion_infer.py` "silent subprocess failure" — both check `returncode` and exit non-zero. No change.
- `neucosvc_infer.py` "`.numpy()` crash" — tensor is CPU float32 without grad on the normal path. No change.

### Data Note (not code — needs migration, not fixed here)
~96 of 107 `clones` records and the `asdis` `voices` record store legacy `audioUrl`
values like `/api/storage/voices/<name>_sample.mp3` (corrupt prefix; files don't
exist — real Asdís samples are at `storage/voices/asdis/`). Code is now resilient
(jobs fail/fall-back gracefully instead of stranding), but previews 404 and RVC
conversions for these voices still need a one-off data migration rewriting
`/api/storage/` → `/assets/` and pointing each record at a real file. Do **not**
mass-rewrite by guessing paths.

---

