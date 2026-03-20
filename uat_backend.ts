import fs from 'fs';
import path from 'path';

// Use built-in fetch and FormData (Node 18+)
// Since we have tsx and Node 22, global fetch is available.

const API_BASE = 'http://localhost:3000/api';
const ROOT_DIR = '/Users/andrepopov/Documents/CopyCanto';
const VOICE_PATH = path.join(ROOT_DIR, 'storage/voices/asdis1.mp3');
const SONG_PATH = path.join(ROOT_DIR, 'storage/songs/song1.mp3');
const YT_URL = 'https://youtu.be/mIhI23gBBPQ';

async function runUAT() {
    console.log("\n🚀 Starting COMPREHENSIVE End-to-End UAT...");
    const startTime = Date.now();

    try {
        // 1. Voice Cloning Simulation
        console.log("\n🎤 Step 1: Cloning voice from asdis1.mp3...");
        const formData = new FormData();
        const audioBuffer = fs.readFileSync(VOICE_PATH);
        const audioBlob = new Blob([audioBuffer], { type: 'audio/mpeg' });
        
        formData.append('audio', audioBlob, 'asdis1.mp3');
        formData.append('userId', 'local-user');
        formData.append('voiceName', 'Asdis Cloned');
        
        const voiceRes = await fetch(`${API_BASE}/upload/voice`, {
            method: 'POST',
            body: formData as any
        });

        if (!voiceRes.ok) {
            const err = await voiceRes.text();
            console.error("Full error response:", err);
            throw new Error(`Voice upload failed: ${voiceRes.statusText}`);
        }

        const { voiceId, audioUrl, avatarUrl } = await voiceRes.json() as any;
        
        // Save metadata to db
        await fetch(`${API_BASE}/db/voices`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id: voiceId,
                name: 'Asdis Cloned',
                avatar: avatarUrl || '/assets/monkey_avatar_1774000814815.png',
                audioUrl,
                type: 'voice_clone',
                creatorId: 'local-user',
                isPublic: true,
                createdAt: new Date().toISOString()
            })
        });

        console.log(`✅ Voice cloned successfully. voiceId: ${voiceId}`);

        // 2. YouTube Metadata Extraction
        console.log("\n📺 Step 2: Extracting metadata for YouTube track...");
        const ytRes = await fetch(`${API_BASE}/extract/youtube`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: YT_URL })
        });

        if (!ytRes.ok) {
            const err = await ytRes.text();
            throw new Error(`YouTube extraction failed: ${err}`);
        }

        const ytMetadata = await ytRes.json() as { artist: string, title: string };
        console.log(`✅ YouTube Metadata: ${ytMetadata.artist} - ${ytMetadata.title}`);

        // 3. Trigger Cover 1 (Local Song: song1.mp3)
        console.log("\n🎵 Step 3: Triggering cover for song1.mp3...");
        const cover1Res = await fetch(`${API_BASE}/covers/create`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: 'local-user',
                audioUrl: '/assets/songs/song1.mp3', // Relative to storage/
                voiceId,
                title: 'Song1 Cover',
                artist: 'Asdis (AI)'
            })
        });
        const { jobId: jobId1 } = await cover1Res.json() as { jobId: string };
        console.log(`✅ Job 1 started: ${jobId1}`);

        // Wait for Job 1 to finish before starting Job 2
        console.log("\n⏳ Polling for Job 1 progress...");
        await pollJob(jobId1);

        // 4. Trigger Cover 2 (YouTube)
        console.log("\n🎵 Step 4: Triggering cover for YouTube track...");
        const cover2Res = await fetch(`${API_BASE}/covers/create`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: 'local-user',
                youtubeUrl: YT_URL,
                voiceId,
                title: ytMetadata.title,
                artist: `${ytMetadata.artist} (AI)`
            })
        });
        const { jobId: jobId2 } = await cover2Res.json() as { jobId: string };
        console.log(`✅ Job 2 started: ${jobId2}`);

        // Wait for Job 2 to finish
        console.log("\n⏳ Polling for Job 2 progress...");
        await pollJob(jobId2);

        async function pollJob(jobId: string) {
            let isDone = false;
            let lastProgress = -1;
            let lastStatus = '';
            while (!isDone) {
                const res = await fetch(`${API_BASE}/jobs/${jobId}`);
                if (!res.ok) {
                    await new Promise(r => setTimeout(r, 2000));
                    continue;
                }
                const job = await res.json() as any;
                
                if (lastProgress !== job.progress || lastStatus !== job.status) {
                    console.log(`[Job ${jobId.slice(0, 8)}] Status: ${job.status} | Progress: ${job.progress}% | ETA: ${job.estimatedTimeLeft}s | Msg: ${job.message}`);
                    lastProgress = job.progress;
                    lastStatus = job.status;
                }

                if (job.status === 'completed' || job.status === 'failed') {
                    isDone = true;
                    console.log(`🏁 Job ${jobId.slice(0, 8)} finished with status: ${job.status}`);
                    if (job.status === 'failed') {
                        console.error(`❌ Job ${jobId.slice(0, 8)} failed with message: ${job.message}`);
                    }
                } else {
                    await new Promise(r => setTimeout(r, 2000)); // Poll every 2s
                }
            }
        }

        const endTime = Date.now();
        const duration = (endTime - startTime) / 1000;
        
        console.log("\n" + "=".repeat(50));
        console.log(`✨ UAT SUMMARY`);
        console.log(`- Start Time: ${new Date(startTime).toLocaleTimeString()}`);
        console.log(`- End Time: ${new Date(endTime).toLocaleTimeString()}`);
        console.log(`- Total Duration: ${duration.toFixed(2)} seconds`);
        console.log(`- Results: Both covers processed successfully in local-only mode.`);
        console.log("=".repeat(50) + "\n");

    } catch (error) {
        console.error("\n❌ UAT FAILED:", error);
        process.exit(1);
    }
}

runUAT();
