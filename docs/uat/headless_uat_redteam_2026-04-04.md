# CopyCanto — Headless UAT + Red Team Audit
**Date**: 2026-04-04
**Method**: Headless API testing (server started with MOCK_ENGINE=true)
**Scope**: All API endpoints, user journeys, and security attack surface

---

## PART 1 — HEADLESS UAT RESULTS

**Overall**: 26/26 tests passed ✅

### Section 1: Database CRUD — All Collections (12/12 ✅)

| Test | Endpoint | Result |
|------|----------|--------|
| DB-001 | GET /api/db/voices | ✅ 200 |
| DB-002 | POST /api/db/voices (create) | ✅ 200 |
| DB-003 | GET /api/db/voices/{id} | ✅ 200 |
| DB-004 | PATCH /api/db/voices/{id} | ✅ 200 |
| DB-005 | GET /api/db/voices/{nonexistent} | ✅ 404 |
| DB-006 | POST /api/db/songs (create) | ✅ 200 |
| DB-007 | GET /api/db/songs | ✅ 200 |
| DB-008 | PATCH /api/db/songs/{id} | ✅ 200 |
| DB-009 | POST /api/db/covers (create) | ✅ 200 |
| DB-010 | GET /api/db/covers | ✅ 200 |
| DB-011 | POST /api/db/clones (create) | ✅ 200 |
| DB-012 | GET /api/db/clones | ✅ 200 |

### Section 2: Job Management (1/1 ✅)

| Test | Endpoint | Result |
|------|----------|--------|
| JOB-001 | GET /api/jobs/{nonexistent} | ✅ 404 |

### Section 3: Cover Creation Pipeline — MOCK_ENGINE (2/2 ✅)

| Test | Scenario | Result |
|------|----------|--------|
| COV-001 | POST /api/covers/create with local audioUrl | ✅ 200, jobId returned |
| COV-002 | GET /api/jobs/{id} — job picks up within 2s | ✅ 200, status=processing, progress=10 |

### Section 4: Cover Creation Variations — All Engines (6/6 ✅)

| Test | Scenario | Result |
|------|----------|--------|
| COV-003 | YouTube URL as input | ✅ 200 |
| COV-004 | Acapella mode (isAcapella=true) | ✅ 200 |
| ENG-rvc | Engine=rvc | ✅ 200 |
| ENG-knn | Engine=knn | ✅ 200 |
| ENG-neucosvc | Engine=neucosvc | ✅ 200 |
| ENG-amphion | Engine=amphion | ✅ 200 |

### Section 5: YouTube Metadata Extraction (2/2 ✅)

| Test | Scenario | Result |
|------|----------|--------|
| YT-001 | POST /api/extract/youtube with valid URL | ✅ 200, fallback metadata returned (Ollama not running — graceful fallback) |
| YT-002 | POST /api/extract/youtube missing url field | ✅ 400 |

### Section 6: GitHub API (1/1 ✅)

| Test | Scenario | Result |
|------|----------|--------|
| GH-001 | GET /api/repos with no token | ✅ 500 (correct — token not configured) |

### Section 7: Static Asset Serving (1/1 ✅)

| Test | Scenario | Result |
|------|----------|--------|
| STA-001 | GET /assets/{filename} | ✅ 200 |

### Section 8: Delete Operations (4/4 ✅)

| Test | Endpoint | Result |
|------|----------|--------|
| DEL-001 | DELETE /api/db/voices/{id} | ✅ 200 |
| DEL-002 | DELETE /api/db/songs/{id} | ✅ 200 |
| DEL-003 | DELETE /api/db/covers/{id} | ✅ 200 |
| DEL-004 | DELETE /api/db/clones/{id} | ✅ 200 |

---

## PART 2 — RED TEAM SECURITY AUDIT

### Severity Legend
- 🔴 **CRITICAL/HIGH** — Must fix before any network exposure
- 🟡 **MEDIUM** — Should fix; acceptable risk for strictly local use
- ℹ️  **INFO** — Observation, no action required

---

### RT-A: Authentication & Authorization

#### 🔴 RT-A2 — Arbitrary userId Accepted (IDOR Setup)
**Finding**: `POST /api/db/voices` accepts any `userId` value. An attacker can create records attributed to any userId without restriction.
**Evidence**: Record created with `userId: "victim-user-id"` — accepted 200.
**Impact**: In a multi-user deployment, attacker can plant data attributed to another user.
**Fix**: Backend must enforce `userId === req.user.uid` before write. Since auth is hardcoded to `local-user`, add:
```typescript
// server.ts — POST /api/db/:collection
const HARDCODED_USER = 'local-user';
if (data.userId && data.userId !== HARDCODED_USER) {
  return res.status(403).json({ error: "userId mismatch" });
}
data.userId = HARDCODED_USER; // Always overwrite
```

#### 🔴 RT-A3 — IDOR: Read Any Record By ID
**Finding**: `GET /api/db/:collection/:id` returns any record regardless of its `userId` field.
**Evidence**: Record created with `userId: "victim-user-id"` is readable by any caller.
**Impact**: In multi-user mode, full data exposure across user boundaries.
**Fix**: After fetching record, validate ownership: `if (record.userId && record.userId !== HARDCODED_USER) return 403`.

---

### RT-B: Input Validation & Injection

#### 🟡 RT-B1 — XSS Payload Stored Raw
**Finding**: `name`, `title`, and other string fields accept `<script>alert(1)</script>` without sanitization.
**Evidence**: `{"name":"<script>alert(1)</script>"}` stored and retrieved as-is.
**Impact**: React escapes JSX by default, mitigating this significantly. However, any `dangerouslySetInnerHTML` usage or raw DOM injection in future would trigger XSS.
**Fix**: Sanitize string inputs server-side with a library like `DOMPurify` or strip HTML tags.

#### 🔴 RT-B3 — Path Traversal in Collection Name (HTTP 200)
**Finding**: `GET /api/db/../../../etc/passwd` returns HTTP 200.
**Clarification**: The Parquet layer resolves the path and attempts to read `../../etc/passwd.parquet` — which doesn't exist, so returns empty array `[]`. This is **not** reading `/etc/passwd` itself. The HTTP 200 is misleading.
**Residual Risk**: If a collection name with `../` resolves to a real Parquet file elsewhere on the filesystem, it could be read.
**Fix**: Validate collection names against an allowlist before passing to db.py:
```typescript
const ALLOWED_COLLECTIONS = ['voices', 'songs', 'covers', 'clones', 'jobs'];
if (!ALLOWED_COLLECTIONS.includes(req.params.collection)) {
  return res.status(400).json({ error: "Invalid collection" });
}
```

#### 🔴 RT-B4 — Path Traversal in ID Field (HTTP 200)
**Finding**: Same as RT-B3 but via the `:id` parameter. Returns 200 (empty result).
**Fix**: Validate that IDs are UUID-shaped (or alphanumeric/dash only) before passing to Python:
```typescript
const UUID_RE = /^[a-zA-Z0-9_-]{1,64}$/;
if (!UUID_RE.test(req.params.id)) return res.status(400).json({ error: "Invalid id" });
```

#### 🟡 RT-B5 — No String Length Limits
**Finding**: 10,000-character string accepted in `name` field.
**Impact**: DB bloat, slow Parquet queries. Not a direct exploit.
**Fix**: Add max-length validation in db.py (Pydantic) or server.ts. E.g., `name.length <= 200`.

---

### RT-C: API Abuse & DoS

#### ✅ RT-C1/C2/C3 — Basic Input Guards Working
Missing `id`, empty body, and malformed JSON all correctly return 400.

#### 🟡 RT-C5 — Cover Create Accepts Missing voiceId
**Finding**: `POST /api/covers/create` with no `voiceId` returns 200 and creates a job.
**Impact**: Python engine will fail to resolve the voice and the job will fail (graceful), but wastes a queue slot and creates stale job records.
**Fix**: Validate required fields (`voiceId`, and at least one of `youtubeUrl`/`audioUrl`) before queuing:
```typescript
if (!voiceId) return res.status(400).json({ error: "voiceId required" });
if (!youtubeUrl && !audioUrl) return res.status(400).json({ error: "youtubeUrl or audioUrl required" });
```

#### 🟡 RT-C6 — No express.json() Size Limit
**Finding**: 100KB JSON payload accepted without restriction.
**Impact**: Memory exhaustion via crafted large payloads.
**Fix**: Add size limit: `app.use(express.json({ limit: '1mb' }))`.

#### ℹ️ RT-C4 — Unknown Collection Returns Empty Array
**Finding**: `GET /api/db/users_secret` returns `[]` instead of 404.
**Impact**: Low. Caller cannot distinguish "no records" from "invalid collection."
**Fix**: Covered by RT-B3 allowlist fix — invalid collections return 400.

#### ℹ️ RT-C7 — Delete Non-Existent Returns 200
**Finding**: Deleting a non-existent record returns `{"success":true}` instead of 404.
**Impact**: None for local use. Slight inconsistency.
**Fix**: db.py should return an error if no rows were deleted; server.ts returns 404.

---

### RT-D: CORS & HTTP Security Headers

#### 🟡 RT-D1 — Wildcard CORS
**Finding**: `Access-Control-Allow-Origin: *` on all responses.
**Impact**: Low for local-only app (no credentials/cookies). Would be high in production.
**Fix for production**:
```typescript
app.use(cors({ origin: ['http://localhost:7842'], credentials: false }));
```

#### 🔴 RT-D2 — All Security Headers Missing
**Finding**: None of the following headers are set: `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, `Strict-Transport-Security`.
**Impact**: Clickjacking, MIME sniffing, XSS amplification if any vulnerability exists.
**Fix**: Add `helmet` middleware:
```typescript
import helmet from 'helmet';
app.use(helmet());
```

---

### RT-E: File Upload Security

#### ✅ RT-E1 — Path Traversal in Filename Neutralized
UUID prefix on all stored filenames prevents `../` traversal. Verified safe.

#### 🟡 RT-E2 — No MIME/Extension Enforcement
**Finding**: `.sh` file accepted as upload with `Content-Type: audio/wav`.
**Impact**: Malicious script uploaded and served back via `/assets/`. If a user were tricked into downloading and running it, it would execute. Server does not execute uploaded files.
**Fix**: Validate file extension and magic bytes:
```typescript
const ALLOWED_AUDIO_EXTS = ['.mp3', '.wav', '.ogg', '.m4a', '.flac'];
const ext = path.extname(fileData.originalname).toLowerCase();
if (!ALLOWED_AUDIO_EXTS.includes(ext)) {
  return res.status(400).json({ error: "Invalid file type" });
}
```

#### ℹ️ RT-E3 — Empty File Accepted
**Finding**: Zero-byte file accepted and stored.
**Impact**: Python engine would fail gracefully when processing.
**Fix**: Add minimum file size check (`fileData.size > 0`).

---

### RT-F: Information Disclosure

#### ✅ No Stack Trace Leakage
Error responses return clean JSON `{"error":"message"}` without internal stack traces or file paths. Good.

---

### RT-G: Business Logic

#### 🟡 RT-G1 — Extreme Pitch Values Accepted
**Finding**: `pitch: -99` accepted (expected range: -12 to +12 per PRD).
**Fix**: `if (Math.abs(pitch) > 12) return res.status(400).json({ error: "Pitch must be -12 to +12" });`

#### 🟡 RT-G2 — Unknown Engine Name Accepted
**Finding**: `engine: "malicious_engine"` accepted and passed to Python subprocess as a CLI argument.
**Risk**: Since subprocess is called with list args (not shell=True), this cannot cause shell injection. However, Python will fail on an unknown engine, creating a failed job.
**Fix**: Validate engine against allowlist in server.ts:
```typescript
const VALID_ENGINES = ['rvc', 'knn', 'neucosvc', 'amphion', 'none'];
if (!VALID_ENGINES.includes(engine)) return res.status(400).json({ error: "Invalid engine" });
```

#### ℹ️ RT-G3 — Superman Engine Alias
**Finding**: `engine: "superman"` correctly maps to `rvc` in `processQueue`. Intentional.

#### ℹ️ RT-G4 — Upsert Semantics (Silent Overwrite)
**Finding**: POSTing with an existing ID silently overwrites the record.
**Recommendation**: Document this is intentional. Optionally add `?upsert=true` query param to make intent explicit.

---

### RT-H: Edge Cases

#### ✅ RT-H1 — PATCH Non-Existent Returns 404
Correct behavior confirmed.

#### ℹ️ RT-H3 — PUT Not Implemented → 404
Correct — no stray method handlers.

#### 🟡 RT-H4 — Integer Overflow in Pitch
**Finding**: `pitch: 99999999999` accepted (covered by RT-G1 fix).

#### ✅ RT-H5 — Unicode Handling
Multi-language/emoji names stored and retrieved correctly. Parquet + Polars handles UTF-8 well.

---

## SUMMARY TABLE

| ID | Severity | Finding | Status |
|----|----------|---------|--------|
| RT-A2 | 🔴 High | Arbitrary userId write (IDOR setup) | Open |
| RT-A3 | 🔴 High | IDOR read any record by ID | Open |
| RT-B3 | 🔴 High | Path traversal in collection name (HTTP 200) | Open |
| RT-B4 | 🔴 High | Path traversal in ID field (HTTP 200) | Open |
| RT-D2 | 🔴 High | All security headers missing | Open |
| RT-B1 | 🟡 Medium | XSS payload stored raw (React mitigates) | Open |
| RT-B5 | 🟡 Medium | No string length limits | Open |
| RT-C5 | 🟡 Medium | Cover create missing voiceId accepted | Open |
| RT-C6 | 🟡 Medium | No express.json() payload size limit | Open |
| RT-D1 | 🟡 Medium | Wildcard CORS | Open |
| RT-E2 | 🟡 Medium | No MIME/extension enforcement on uploads | Open |
| RT-G1 | 🟡 Medium | Extreme pitch values not validated | Open |
| RT-G2 | 🟡 Medium | Unknown engine string passed to Python | Open |
| RT-H4 | 🟡 Medium | Integer overflow in pitch | Open (same fix as RT-G1) |
| RT-C7 | ℹ️ Low | Delete non-existent returns 200 | Open |
| RT-C4 | ℹ️ Low | Unknown collection returns [] not 404 | Fixed by RT-B3 allowlist |
| RT-E3 | ℹ️ Low | Empty file accepted | Open |
| RT-G4 | ℹ️ Info | Upsert silently overwrites | By design |
| RT-G3 | ℹ️ Info | Superman engine alias | By design |

---

## RECOMMENDED FIXES (Priority Order)

### Fix 1 — Collection + ID Allowlist (closes RT-B3, RT-B4, RT-C4)
```typescript
// server.ts
const ALLOWED_COLLECTIONS = ['voices', 'songs', 'covers', 'clones', 'jobs'];
const ID_SAFE_RE = /^[a-zA-Z0-9_-]{1,64}$/;

app.use('/api/db/:collection', (req, res, next) => {
  if (!ALLOWED_COLLECTIONS.includes(req.params.collection)) {
    return res.status(400).json({ error: "Invalid collection" });
  }
  next();
});

// In each /:id handler:
if (req.params.id && !ID_SAFE_RE.test(req.params.id)) {
  return res.status(400).json({ error: "Invalid id format" });
}
```

### Fix 2 — Helmet security headers (closes RT-D2)
```bash
npm install helmet
```
```typescript
import helmet from 'helmet';
app.use(helmet());
```

### Fix 3 — userId enforcement on writes (closes RT-A2, RT-A3)
```typescript
// In POST /api/db/:collection and PATCH /api/db/:collection/:id
const SYSTEM_USER = 'local-user';
if (data.userId && data.userId !== SYSTEM_USER) {
  return res.status(403).json({ error: "Forbidden" });
}
data.userId = SYSTEM_USER;
```

### Fix 4 — express.json size limit (closes RT-C6)
```typescript
app.use(express.json({ limit: '2mb' }));
```

### Fix 5 — Cover create validation (closes RT-C5)
```typescript
if (!voiceId) return res.status(400).json({ error: "voiceId required" });
if (!youtubeUrl && !audioUrl) return res.status(400).json({ error: "youtubeUrl or audioUrl required" });
```

### Fix 6 — Engine + pitch validation (closes RT-G1, RT-G2, RT-H4)
```typescript
const VALID_ENGINES = ['rvc', 'knn', 'neucosvc', 'amphion', 'superman', 'none'];
if (engine && !VALID_ENGINES.includes(engine)) return res.status(400).json({ error: "Invalid engine" });
if (pitch !== undefined && (isNaN(Number(pitch)) || Math.abs(Number(pitch)) > 12)) {
  return res.status(400).json({ error: "Pitch must be between -12 and +12" });
}
```

### Fix 7 — File upload extension enforcement (closes RT-E2)
```typescript
const ALLOWED_AUDIO_EXTS = ['.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac'];
const ext = path.extname(fileData.originalname).toLowerCase();
if (!ALLOWED_AUDIO_EXTS.includes(ext)) {
  return res.status(400).json({ error: `File type ${ext} not allowed` });
}
```

---

## UAT VERDICT: ✅ ALL JOURNEYS PASS
## SECURITY VERDICT: 🟡 ACCEPTABLE FOR LOCAL USE — MUST HARDEN BEFORE ANY NETWORK EXPOSURE

The app functions correctly across all user journeys. The security findings above are low risk for a strictly localhost, single-user app, but 5 findings (RT-A2, RT-A3, RT-B3, RT-B4, RT-D2) must be addressed before any deployment beyond localhost.
