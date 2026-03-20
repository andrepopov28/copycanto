import fs from 'fs';
import path from 'path';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, doc, setDoc, getDoc } from 'firebase/firestore';
import { v4 as uuidv4 } from 'uuid';

// Initialize Firebase Client (Standard Web SDK)
const firebaseConfig = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'firebase-applet-config.json'), 'utf8'));
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

const API_BASE = 'http://localhost:3000';
const TEST_USER_ID = 'test_backend_user_123';

async function runBackendUAT() {
  console.log("🚀 Starting Backend UAT...");

  // 1. Upload Voice
  console.log("🎤 Step 1: Uploading voice 'asdis1.mp3'...");
  const voicePath = path.join(process.cwd(), 'storage/voices/asdis1.mp3');
  if (!fs.existsSync(voicePath)) {
    throw new Error(`Voice file not found at ${voicePath}`);
  }
  
  const voiceFile = fs.readFileSync(voicePath);
  const voiceFormData = new FormData();
  voiceFormData.append('audio', new Blob([voiceFile], { type: 'audio/mpeg' }), 'asdis1.mp3');
  voiceFormData.append('userId', TEST_USER_ID);
  voiceFormData.append('voiceName', 'Asdis UAT Test');

  const uploadRes = await fetch(`${API_BASE}/api/upload/voice`, {
    method: 'POST',
    body: voiceFormData
  });
  
  if (!uploadRes.ok) throw new Error(`Voice upload failed: ${await uploadRes.text()}`);
  const uploadData = await uploadRes.json();
  console.log("✅ Voice uploaded to local storage:", uploadData);

  // Insert to Firestore
  const voiceId = uploadData.voiceId || uuidv4();
  const voiceRef = doc(db, 'voices', voiceId);
  await setDoc(voiceRef, {
    name: 'Asdis UAT Test',
    avatar: uploadData.avatarUrl || '',
    audioUrl: uploadData.audioUrl || '',
    creatorId: TEST_USER_ID,
    isPublic: false,
    createdAt: new Date().toISOString()
  });
  console.log("✅ Voice saved to Firestore");

  // 2. Extract YouTube Metadata
  console.log("🎵 Step 2: Extracting YouTube metadata...");
  const ytUrl = 'https://youtu.be/mIhI23gBBPQ';
  const ytRes = await fetch(`${API_BASE}/api/extract/youtube`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: ytUrl })
  });

  if (!ytRes.ok) throw new Error(`YT extraction failed: ${await ytRes.text()}`);
  const ytData = await ytRes.json();
  console.log("✅ YouTube metadata extracted:", ytData);

  // 3. Create Cover
  console.log("⚙️ Step 3: Triggering Cover Creation...");
  const createRes = await fetch(`${API_BASE}/api/covers/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId: TEST_USER_ID,
      voiceId: uploadData.voiceId,
      youtubeUrl: ytUrl,
      title: ytData.song_title || 'UAT Song',
      artist: ytData.artist || 'UAT Artist',
      engine: 'rvc',
      pitch: 0,
      isAcapella: false
    })
  });

  if (!createRes.ok) throw new Error(`Cover creation failed: ${await createRes.text()}`);
  const createData = await createRes.json();
  console.log("✅ Cover job created. Job ID:", createData.jobId);

  // 4. Poll Job Status
  console.log("⏳ Step 4: Polling Job Progress...");
  const jobId = createData.jobId;
  let jobCompleted = false;

  for (let i = 0; i < 60; i++) { // Max wait 60 times (roughly 60 * 5s = 5mins)
    const jobSnap = await getDoc(doc(db, 'jobs', jobId));
    if (!jobSnap.exists()) {
      console.log("Job document missing! Waiting...");
    } else {
      const job = jobSnap.data();
      console.log(`[Status: ${job?.status}] Progress: ${job?.progress}% | ETA: ${job?.estimatedTimeLeft}s | Message: ${job?.message}`);
      if (job?.status === 'completed') {
        jobCompleted = true;
        break;
      }
      if (job?.status === 'failed' || job?.error) {
        throw new Error(`Job failed: ${job?.message} ${job?.error}`);
      }
    }
    await new Promise(r => setTimeout(r, 5000));
  }

  if (!jobCompleted) {
    throw new Error("Job timed out after 5 minutes.");
  }

  console.log("🎉 Backend UAT Completed Successfully!");
  process.exit(0);
}

runBackendUAT().catch(err => {
  console.error("❌ UAT Failed:", err);
  process.exit(1);
});
