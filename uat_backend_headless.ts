/**
 * CopyCanto — Comprehensive Headless Backend UAT
 * Exercises all 6 user journeys via API calls only.
 * Requires server running with MOCK_ENGINE=true on port 7842.
 *
 * Usage:
 *   MOCK_ENGINE=true npx tsx uat_backend_headless.ts
 *
 * User Journeys Tested:
 *  J1. Upload MP3 (Song Library)
 *  J2. Import Song from YouTube URL
 *  J3. Upload Voice Sample (Voice Library)
 *  J4. Clone a Voice (via Cover job with engine=knn, isAcapella=true)
 *  J5a. One-Shot Cover (Acapella mode — skip stem sep)
 *  J5b. Full Pipeline Cover (with Stem Separation)
 *  + CRUD: Delete song, voice, clone, cover records
 */

import fs from 'fs';
import path from 'path';

const BASE = 'http://localhost:7842';
const USER_ID = 'uat-test-user-001';

// Colours for readability
const GREEN = '\x1b[32m';
const RED   = '\x1b[31m';
const CYAN  = '\x1b[36m';
const YELLOW= '\x1b[33m';
const RESET = '\x1b[0m';
const BOLD  = '\x1b[1m';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function log(msg: string)  { console.log(`${CYAN}  ${msg}${RESET}`); }
function ok(msg: string)   { console.log(`${GREEN}  ✅ ${msg}${RESET}`); passed++; }
function fail(msg: string) { console.log(`${RED}  ❌ ${msg}${RESET}`); failed++; failures.push(msg); }
function section(title: string) { console.log(`\n${BOLD}${YELLOW}══ ${title} ══${RESET}`); }

async function get(endpoint: string): Promise<any> {
  const r = await fetch(`${BASE}${endpoint}`);
  if (!r.ok) throw new Error(`GET ${endpoint} → ${r.status}`);
  return r.json();
}

async function post(endpoint: string, body: any): Promise<any> {
  const r = await fetch(`${BASE}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const json = await r.json();
  if (!r.ok) throw new Error(`POST ${endpoint} → ${r.status}: ${JSON.stringify(json)}`);
  return json;
}

async function del(endpoint: string): Promise<any> {
  const r = await fetch(`${BASE}${endpoint}`, { method: 'DELETE' });
  if (!r.ok) throw new Error(`DELETE ${endpoint} → ${r.status}`);
  return r.json();
}

async function postFormData(endpoint: string, formData: any): Promise<any> {
  const r = await fetch(`${BASE}${endpoint}`, {
    method: 'POST',
    body: formData
  });
  const json = await r.json();
  if (!r.ok) throw new Error(`POST ${endpoint} (multipart) → ${r.status}: ${JSON.stringify(json)}`);
  return json;
}

/** Poll job until completed or failed (with timeout) */
async function pollJob(jobId: string, label: string, timeoutMs = 60_000): Promise<boolean> {
  const start = Date.now();
  log(`Polling job ${jobId} for: ${label}`);
  while (Date.now() - start < timeoutMs) {
    await new Promise(r => setTimeout(r, 2000));
    try {
      const job = await get(`/api/jobs/${jobId}`);
      process.stdout.write(`\r    Progress: ${job.progress}% — ${job.message}                   `);
      if (job.status === 'completed') { console.log(); return true; }
      if (job.status === 'failed')    { console.log(); fail(`Job failed: ${job.message}`); return false; }
    } catch(e) { /* retry */ }
  }
  console.log();
  fail(`Job timed out after ${timeoutMs/1000}s: ${label}`);
  return false;
}

/** Create a small in-memory fake MP3 buffer for upload tests */
function fakeMp3Buffer(): Buffer {
  // Minimal valid MP3 frame header (ID3v2 tag + dummy data)
  const buf = Buffer.alloc(1024);
  buf.write('ID3', 0, 'ascii');   // ID3 magic
  return buf;
}

// ─────────────────────────────────────────────────────────────────
//  MAIN UAT
// ─────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n${BOLD}========================================${RESET}`);
  console.log(`${BOLD}  CopyCanto — Headless Backend UAT${RESET}`);
  console.log(`${BOLD}  Target: ${BASE}${RESET}`);
  console.log(`${BOLD}  User:   ${USER_ID}${RESET}`);
  console.log(`${BOLD}========================================${RESET}\n`);

  // ── PREREQ: Server health ──
  section('0. Server Health Check');
  try {
    await get('/api/db/songs');
    ok('Server is reachable on port 7842');
  } catch(e) {
    fail(`Server not reachable: ${e}`);
    console.log(`${RED}\nFATAL: Cannot reach server. Start it with:\n  MOCK_ENGINE=true npx tsx server.ts${RESET}`);
    process.exit(1);
  }

  // ── J1: Upload MP3 Song ──
  section('J1. Upload MP3 (Song Library)');
  let uploadedSongUrl = '';
  let uploadedSongId = '';
  try {
    // Use a real mp3 if available, else use fake buffer
    const mp3Path = path.join(process.cwd(), 'storage', 'audio', 'asdis1.mp3');
    let audioBuffer: Buffer;
    let fileName: string;
    if (fs.existsSync(mp3Path)) {
      audioBuffer = fs.readFileSync(mp3Path);
      fileName = 'asdis1.mp3';
      log(`Using real file: storage/audio/asdis1.mp3 (${(audioBuffer.length/1024/1024).toFixed(1)} MB)`);
    } else {
      audioBuffer = fakeMp3Buffer();
      fileName = 'test_song.mp3';
      log('Using synthetic 1KB fake MP3 buffer');
    }

    const fd = new FormData();
    fd.set('userId', USER_ID);
    fd.set('audio', new Blob([new Uint8Array(audioBuffer)], { type: 'audio/mpeg' }), fileName);

    const uploadResult = await postFormData('/api/upload', fd);
    uploadedSongUrl = uploadResult.url;
    ok(`MP3 uploaded → ${uploadResult.url}`);

    // Register in DB
    uploadedSongId = `uat-song-${Date.now()}`;
    await post('/api/db/songs', {
      id: uploadedSongId,
      title: 'UAT Test Song',
      artist: 'UAT Artist',
      thumbnail: '',
      audioUrl: uploadedSongUrl,
      userId: USER_ID,
      createdAt: new Date().toISOString()
    });
    ok(`Song record created in DB: ${uploadedSongId}`);

    // Verify listing
    const songs = await get('/api/db/songs');
    const found = songs.find((s: any) => s.id === uploadedSongId);
    found ? ok(`Song visible in GET /api/db/songs (${songs.length} total)`) : fail('Song not found in listing after insert');
  } catch(e) {
    fail(`J1 Upload MP3: ${e}`);
  }

  // ── J2: YouTube URL Import ──
  section('J2. Import Song from YouTube URL');
  try {
    const ytResult = await post('/api/extract/youtube', {
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
    });
    ok(`YouTube extraction returned: artist="${ytResult.artist}", title="${ytResult.song_title}"`);
    if (ytResult.artist === 'YouTube Download' && ytResult.song_title === 'Extracted Audio') {
      log('⚠️  Fallback metadata detected (Ollama not running) — HIGH-2 fallback path working correctly');
    }
  } catch(e) {
    fail(`J2 YouTube extraction: ${e}`);
  }

  // ── J3: Upload Voice Sample ──
  section('J3. Upload Voice Sample (Voice Library)');
  let uploadedVoiceId = '';
  let uploadedVoiceUrl = '';
  try {
    const voicePath = path.join(process.cwd(), 'storage', 'audio', 'asdis1.mp3');
    let voiceBuffer: Buffer;
    if (fs.existsSync(voicePath)) {
      voiceBuffer = fs.readFileSync(voicePath);
      log(`Using real audio: asdis1.mp3 as voice sample`);
    } else {
      voiceBuffer = fakeMp3Buffer();
      log('Using synthetic fake buffer for voice upload');
    }

    const fd = new FormData();
    fd.set('userId', USER_ID);
    fd.set('voiceName', 'UAT Test Voice');
    fd.set('audio', new Blob([new Uint8Array(voiceBuffer)], { type: 'audio/mpeg' }), 'voice_sample.mp3');

    const voiceUploadResult = await postFormData('/api/upload/voice', fd);
    uploadedVoiceId = voiceUploadResult.voiceId;
    uploadedVoiceUrl = voiceUploadResult.audioUrl;
    ok(`Voice uploaded → voiceId=${uploadedVoiceId}, url=${uploadedVoiceUrl}`);

    // Register in voices collection
    await post('/api/db/voices', {
      id: uploadedVoiceId,
      name: 'UAT Test Voice',
      avatar: voiceUploadResult.avatarUrl || '',
      audioUrl: uploadedVoiceUrl,
      type: 'uploaded',
      creatorId: USER_ID,
      userId: USER_ID,
      createdAt: new Date().toISOString()
    });
    ok(`Voice record created in DB: ${uploadedVoiceId}`);

    // Verify listing
    const voices = await get('/api/db/voices');
    const found = voices.find((v: any) => v.id === uploadedVoiceId);
    found ? ok(`Voice visible in GET /api/db/voices (${voices.length} total)`) : fail('Voice not found in listing after insert');
  } catch(e) {
    fail(`J3 Voice upload: ${e}`);
  }

  // ── J4: Clone a Voice (kNN + acapella mode, no stem sep) ──
  section('J4. Clone a Voice (kNN, Acapella mode)');
  let cloneJobId = '';
  try {
    const jobResult = await post('/api/covers/create', {
      userId: USER_ID,
      voiceId: uploadedVoiceId || 'uat-voice-fallback',
      audioUrl: uploadedSongUrl || '/assets/audio/test/test.mp3',
      title: 'UAT Voice Clone',
      artist: 'UAT',
      engine: 'knn',
      isAcapella: true,
      pitch: 0
    });
    cloneJobId = jobResult.jobId;
    ok(`Clone job queued → jobId=${cloneJobId}`);

    const success = await pollJob(cloneJobId, 'Clone a Voice (kNN, acapella)');
    if (success) ok('Clone job completed successfully');

    // Verify clone record exists in DB
    const clones = await get('/api/db/clones');
    const cloneRecord = clones.find((c: any) => c.engine === 'knn' && c.userId === USER_ID);
    cloneRecord
      ? ok(`Clone record found in DB: ${cloneRecord.id} / title="${cloneRecord.title}"`)
      : fail('Clone record not found in /api/db/clones after job completion');

  } catch(e) {
    fail(`J4 Voice clone: ${e}`);
  }

  // ── J5a: One-Shot Cover (Acapella, no stem sep, RVC) ──
  section('J5a. One-Shot Cover (Acapella mode — skip stem sep, RVC engine)');
  let coverJobId_acapella = '';
  try {
    const jobResult = await post('/api/covers/create', {
      userId: USER_ID,
      voiceId: uploadedVoiceId || 'uat-voice-fallback',
      audioUrl: uploadedSongUrl || '/assets/audio/test/test.mp3',
      title: 'UAT Acapella Cover',
      artist: 'UAT',
      engine: 'rvc',
      isAcapella: true,
      pitch: 0
    });
    coverJobId_acapella = jobResult.jobId;
    ok(`Acapella cover job queued → jobId=${coverJobId_acapella}`);

    const success = await pollJob(coverJobId_acapella, 'One-Shot Cover (acapella, rvc)');
    if (success) ok('Acapella cover job completed successfully');

    // Verify cover record
    const covers = await get('/api/db/covers');
    const coverRecord = covers.find((c: any) => c.title === 'UAT Acapella Cover (Cover)');
    coverRecord
      ? ok(`Cover record found: "${coverRecord.title}", voice="${coverRecord.voiceName}"`)
      : fail('Cover record not found in /api/db/covers after acapella job');

  } catch(e) {
    fail(`J5a Acapella cover: ${e}`);
  }

  // ── J5b: Full Pipeline Cover (Stem Separation + RVC) ──
  section('J5b. Full Pipeline Cover (Stem Separation + RVC engine)');
  let coverJobId_full = '';
  try {
    const jobResult = await post('/api/covers/create', {
      userId: USER_ID,
      voiceId: uploadedVoiceId || 'uat-voice-fallback',
      audioUrl: uploadedSongUrl || '/assets/audio/test/test.mp3',
      title: 'UAT Full Pipeline Cover',
      artist: 'UAT',
      engine: 'rvc',
      isAcapella: false,
      pitch: 0
    });
    coverJobId_full = jobResult.jobId;
    ok(`Full pipeline cover job queued → jobId=${coverJobId_full}`);

    const success = await pollJob(coverJobId_full, 'Full Pipeline Cover (stem sep + rvc)');
    if (success) ok('Full pipeline cover job completed successfully');

    // Verify cover + song records
    const covers = await get('/api/db/covers');
    const songs = await get('/api/db/songs');
    const coverRecord = covers.find((c: any) => c.title === 'UAT Full Pipeline Cover (Cover)');
    const songRecord = songs.find((s: any) => s.id === coverJobId_full);
    coverRecord
      ? ok(`Cover record found: "${coverRecord.title}", audioUrl="${coverRecord.audioUrl}"`)
      : fail('Cover record not found after full pipeline job');
    songRecord
      ? ok(`Song canonical record found: audioUrl="${songRecord.audioUrl}"`)
      : fail('Song canonical record not found after full pipeline job (CRIT-3 regression)');

  } catch(e) {
    fail(`J5b Full pipeline cover: ${e}`);
  }

  // ── CRUD: Delete operations ──
  section('CRUD. Delete Operations (all library types)');
  // Delete song record
  if (uploadedSongId) {
    try {
      await del(`/api/db/songs/${uploadedSongId}`);
      const songs = await get('/api/db/songs');
      const stillThere = songs.find((s: any) => s.id === uploadedSongId);
      !stillThere ? ok(`Song deleted: ${uploadedSongId}`) : fail('Song still present after delete');
    } catch(e) { fail(`Delete song: ${e}`); }
  }

  // Delete voice record
  if (uploadedVoiceId) {
    try {
      await del(`/api/db/voices/${uploadedVoiceId}`);
      const voices = await get('/api/db/voices');
      const stillThere = voices.find((v: any) => v.id === uploadedVoiceId);
      !stillThere ? ok(`Voice deleted: ${uploadedVoiceId}`) : fail('Voice still present after delete');
    } catch(e) { fail(`Delete voice: ${e}`); }
  }

  // Delete all UAT covers
  try {
    const covers = await get('/api/db/covers');
    const uatCovers = covers.filter((c: any) => c.userId === USER_ID && c.title?.includes('UAT'));
    for (const c of uatCovers) {
      await del(`/api/db/covers/${c.id}`);
    }
    ok(`Deleted ${uatCovers.length} UAT cover record(s)`);
  } catch(e) { fail(`Delete covers: ${e}`); }

  // Delete all UAT clones
  try {
    const clones = await get('/api/db/clones');
    const uatClones = clones.filter((c: any) => c.userId === USER_ID);
    for (const c of uatClones) {
      await del(`/api/db/clones/${c.id}`);
    }
    ok(`Deleted ${uatClones.length} UAT clone record(s)`);
  } catch(e) { fail(`Delete clones: ${e}`); }

  // ── DB State Verification ──
  section('DB State. Final Library Verification');
  try {
    const [songs, voices, clones, covers, jobs] = await Promise.all([
      get('/api/db/songs'),
      get('/api/db/voices'),
      get('/api/db/clones'),
      get('/api/db/covers'),
      get('/api/db/jobs')
    ]);
    ok(`Songs library:  ${songs.length} record(s)`);
    ok(`Voices library: ${voices.length} record(s)`);
    ok(`Clones library: ${clones.length} record(s)`);
    ok(`Covers library: ${covers.length} record(s)`);
    ok(`Jobs in DB:     ${jobs.length} record(s)`);
  } catch(e) {
    fail(`DB state check: ${e}`);
  }

  // ── SUMMARY ──
  console.log(`\n${BOLD}========================================${RESET}`);
  console.log(`${BOLD}  UAT RESULTS${RESET}`);
  console.log(`${BOLD}========================================${RESET}`);
  console.log(`${GREEN}  ✅ Passed: ${passed}${RESET}`);
  console.log(`${RED}  ❌ Failed: ${failed}${RESET}`);
  if (failures.length > 0) {
    console.log(`\n${RED}${BOLD}  Failed assertions:${RESET}`);
    failures.forEach(f => console.log(`${RED}    - ${f}${RESET}`));
  }
  console.log();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => {
  console.error(`\n${RED}FATAL UAT ERROR: ${e}${RESET}`);
  process.exit(1);
});
