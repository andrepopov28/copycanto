import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import cors from "cors";
import { v4 as uuidv4 } from "uuid";
import multer from "multer";
import { exec, spawn } from "child_process";
import fs from "fs";
import dotenv from "dotenv";

dotenv.config();

const GAL_YOSSEF_IMAGES = [
  "/assets/bugs_bunny_hero_1773997735825.png",
  "/assets/animal_muppet_hero_1773997756233.png",
  "/assets/tom_jerry_hero_1773997774915.png",
  "/assets/pink_panther_dj_hero_1774008791503.png",
  "/assets/superman_rvc_card_1774009128879.png",
  "/assets/batman_knn_card_1774009148120.png",
  "/assets/robin_demucs_card_1774009167352.png",
  "/assets/monkey_avatar_1774000814815.png"
];
function getRandomAvatar() {
  return GAL_YOSSEF_IMAGES[Math.floor(Math.random() * GAL_YOSSEF_IMAGES.length)];
}

// --- Local DB Helper (Parquet/Polars) ---

function dbInvoke(action: "upsert" | "list" | "get" | "delete", collection: string, id?: string, data?: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const args = ["engines/db.py", action, "--collection", collection];
    if (id) args.push("--id", id);
    if (data) args.push("--data", JSON.stringify(data));

    const pythonPath = path.join(process.cwd(), 'venv', 'bin', 'python');
    const py = spawn(pythonPath, args);
    let stdout = "";
    let stderr = "";

    py.stdout.on("data", (d) => stdout += d.toString());
    py.stderr.on("data", (d) => stderr += d.toString());

    py.on("close", (code) => {
      if (code !== 0) {
        console.error(`DB Error (${action} ${collection}):`, stderr);
        return reject(new Error(stderr));
      }
      try {
        if (action === "list" || action === "get") {
          resolve(JSON.parse(stdout));
        } else {
          resolve(stdout.trim());
        }
      } catch (e) {
        resolve(stdout.trim());
      }
    });
  });
}

const app = express();
// CopyCanto dedicated port — non-standard to avoid conflicts with other dev apps
// Access the app at: http://localhost:7842
const PORT = 7842;

app.use(cors());
app.use(express.json());

// --- Multer Setup ---

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

// --- GitHub API ---

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || process.env.API_KEY;

app.get('/api/repos', async (req, res) => {
  if (!GITHUB_TOKEN) {
    return res.status(500).json({ error: "GITHUB_TOKEN not found in environment" });
  }

  try {
    const response = await fetch('https://api.github.com/user/repos?per_page=100&sort=updated', {
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    if (!response.ok) {
      const errorData = await response.json();
      return res.status(response.status).json(errorData);
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch repositories" });
  }
});

app.get('/api/repos/:owner/:repo/contents*', async (req, res) => {
  const { owner, repo } = req.params;
  const pathParam = req.params[0] || '';
  
  if (!GITHUB_TOKEN) {
    return res.status(500).json({ error: "GITHUB_TOKEN not found in environment" });
  }

  try {
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents${pathParam}`, {
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    if (!response.ok) {
      const errorData = await response.json();
      return res.status(response.status).json(errorData);
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch contents" });
  }
});

app.get('/api/repos/:owner/:repo/raw*', async (req, res) => {
  const { owner, repo } = req.params;
  const pathParam = req.params[0] || '';

  if (!GITHUB_TOKEN) {
    return res.status(500).json({ error: "GITHUB_TOKEN not found in environment" });
  }

  try {
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents${pathParam}`, {
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3.raw'
      }
    });

    if (!response.ok) {
      const errorData = await response.text();
      return res.status(response.status).send(errorData);
    }

    const data = await response.text();
    res.send(data);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch raw content" });
  }
});

// --- Local Database API ---

app.get('/api/db/:collection', async (req, res) => {
  try {
    const data = await dbInvoke("list", req.params.collection);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.get('/api/db/:collection/:id', async (req, res) => {
  try {
    const data = await dbInvoke("get", req.params.collection, req.params.id);
    if (!data) return res.status(404).json({ error: "Not found" });
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.delete('/api/db/:collection/:id', async (req, res) => {
  try {
    await dbInvoke("delete", req.params.collection, req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.post('/api/db/:collection', async (req, res) => {
  try {
    const data = req.body;
    if (!data.id) return res.status(400).json({ error: "Missing id in payload" });
    await dbInvoke("upsert", req.params.collection, data.id, data);
    res.json({ success: true, id: data.id });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.patch('/api/db/:collection/:id', async (req, res) => {
  try {
    // Fetch existing
    const existing = await dbInvoke("get", req.params.collection, req.params.id);
    if (!existing) return res.status(404).json({ error: "Record not found" });
    
    // Merge
    const updated = { ...existing, ...req.body, id: req.params.id };
    await dbInvoke("upsert", req.params.collection, req.params.id, updated);
    res.json({ success: true, id: req.params.id });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// --- CopyCanto Real Backend ---

// Sequential Mutex for GPU/MPS tasks
let isProcessing = false;
const jobQueue: string[] = [];

async function processQueue() {
  if (isProcessing || jobQueue.length === 0) return;
  
  isProcessing = true;
  const jobId = jobQueue.shift()!;
  
  try {
    const jobData = await dbInvoke("get", "jobs", jobId);
    if (!jobData) {
      isProcessing = false;
      processQueue();
      return;
    }
    
    const { userId, voiceId, youtubeUrl, audioUrl, isAcapella, engine, highQuality } = jobData;

    // Resolve voiceId (Check if it refers to a Clone or a direct Voice upload)
    let resolvedVoiceId = voiceId;
    let resolvedVoicePath = ""; // To be passed to kNN-VC reference

    const cloneData = await dbInvoke("get", "clones", voiceId);
    if (cloneData) {
      resolvedVoiceId = cloneData.voiceId; // The underlying model ID used for RVC
      resolvedVoicePath = path.join(process.cwd(), 'storage', cloneData.audioUrl.replace('/assets/', ''));
    } else {
      const voiceData = await dbInvoke("get", "voices", voiceId);
      if (voiceData) {
        const singleAudioPath = path.join(process.cwd(), 'storage', voiceData.audioUrl.replace('/assets/', ''));
        resolvedVoicePath = singleAudioPath;
      }
    }

    // For zero-shot engines (KNN, NeuCoSVC, Amphion): prefer a directory of reference audio for higher quality pooled matching.
    // Check if there is a dedicated folder named after the voiceId under storage/voices/.
    const resolvedEngine = engine === 'superman' ? 'rvc' : (engine || 'rvc');
    if (['knn', 'neucosvc', 'amphion'].includes(resolvedEngine)) {
      const voiceDirPath = path.join(process.cwd(), 'storage', 'voices', resolvedVoiceId);
      const { existsSync } = await import('fs');
      if (existsSync(voiceDirPath)) {
        resolvedVoicePath = voiceDirPath;
      }
    }


    // 2. Trigger Python Engine (Asynchronous)
    await dbInvoke("upsert", "jobs", jobId, {
      ...jobData,
      progress: 0,
      message: 'Starting processing engine...',
      status: 'processing'
    });

    const engineScript = process.env.MOCK_ENGINE === 'true' 
      ? path.join(process.cwd(), 'engines', 'process_sim.py')
      : path.join(process.cwd(), 'engines', 'process.py');

    const pythonArgs = [
      engineScript,
      '--jobId', jobId,
      '--userId', userId,
      '--voiceId', resolvedVoiceId,
      '--inputUrl', youtubeUrl || audioUrl || '',
      '--engine', resolvedEngine
    ];
    
    if (resolvedVoicePath) {
      pythonArgs.push('--voicePath', resolvedVoicePath);
    }
    
    if (isAcapella) {
      pythonArgs.push('--isAcapella');
    }
    
    if (highQuality) {
      pythonArgs.push('--highQuality');
    }
    const pythonPath = path.join(process.cwd(), 'venv', 'bin', 'python');
    const pythonProcess = spawn(pythonPath, pythonArgs);

    const startTime = Date.now();
    
    pythonProcess.stdout.on('data', async (data) => {
      const lines = data.toString().split('\n').filter((l: string) => l.trim().length > 0);
      for (const line of lines) {
        try {
          const output = JSON.parse(line);
          console.log(`[Python Engine] ${line}`);
          if (output.jobId === jobId) {
            let estimatedTimeLeft = undefined;
            if (output.progress > 0 && output.progress < 100) {
              const elapsedTime = (Date.now() - startTime) / 1000;
              const timePerPercent = elapsedTime / output.progress;
              const remainingPercents = 100 - output.progress;
              estimatedTimeLeft = Math.round(timePerPercent * remainingPercents);
            }
            
            await dbInvoke("upsert", "jobs", jobId, {
              ...jobData,
              progress: output.progress,
              message: output.message,
              error: output.error || null,
              estimatedTimeLeft: estimatedTimeLeft || 0,
              status: output.progress === 100 ? 'completed' : (output.progress < 0 ? 'failed' : 'processing')
            });
            
            if (output.progress === 100) {
              const title = jobData.title || `New Track (${jobId.slice(0, 4)})`;
              const artist = jobData.artist || 'Unknown Artist';
              const thumbnail = jobData.thumbnail || getRandomAvatar();

              // 1. Create Song document
              const serverStems = isAcapella 
                ? [{ name: 'Vocals', url: `/assets/songs/${jobId}/original.mp3` }] 
                : [
                    { name: 'Vocals', url: `/assets/songs/${jobId}/vocals.wav` },
                    { name: 'Instrumental', url: `/assets/songs/${jobId}/instrumental.wav` }
                  ];

              const isNewUpload = jobData.audioUrl && jobData.audioUrl.startsWith('/assets/audio/');
              const isYoutube = !!jobData.youtubeUrl;

              if (isNewUpload || isYoutube) {
                // Always point audioUrl to the canonical job output path, not the temp upload path
                await dbInvoke("upsert", "songs", jobId, {
                  id: jobId,
                  title: title,
                  artist: artist,
                  thumbnail: thumbnail,
                  audioUrl: `/assets/songs/${jobId}/original.mp3`,
                  userId: userId,
                  createdAt: new Date().toISOString(),
                  stems: serverStems
                });
              }

              if (engine !== 'none') {
                // 2. Create Clone document
                const cloneId = uuidv4();
                await dbInvoke("upsert", "clones", cloneId, {
                  id: cloneId,
                  title: `${title} - ${engine.toUpperCase()} Vocals`,
                  artist: 'AI Avatar',
                  thumbnail: `/assets/monkey_avatar_1774000814815.png`,
                  audioUrl: `/assets/clones/${jobId}.wav`,
                  voiceId: voiceId, // Keep the source reference
                  engine: engine,
                  userId: userId,
                  createdAt: new Date().toISOString()
                });

                // 3. Create Cover document (the final mix)
                const coverId = uuidv4();
                // Resolve voice name for Covers.tsx display
                let voiceDisplayName = voiceId;
                try {
                  const vData = await dbInvoke("get", "voices", voiceId);
                  if (vData?.name) voiceDisplayName = vData.name;
                  const cData = await dbInvoke("get", "clones", voiceId);
                  if (cData?.title) voiceDisplayName = cData.title;
                } catch(e) { /* fallback to voiceId */ }

                await dbInvoke("upsert", "covers", coverId, {
                  id: coverId,
                  title: `${title} (Cover)`,
                  artist: 'AI Generated',
                  thumbnail: thumbnail,
                  audioUrl: `/assets/covers/${jobId}.mp3`,
                  voiceId: voiceId,
                  voiceName: voiceDisplayName,
                  engine: engine,
                  userId: userId,
                  createdAt: new Date().toISOString()
                });
              }
            }
          }
        } catch (e) {
          console.log(`Python stdout exception/raw: ${line}`);
        }
      }
    });

    pythonProcess.stderr.on('data', (data) => {
      console.error(`Python stderr: ${data}`);
    });

    pythonProcess.on('close', async (code) => {
      console.log(`Python process exited with code ${code}`);
      if (code !== 0) {
        const currentJob = await dbInvoke("get", "jobs", jobId);
        // Don't overwrite if python explicitly set an error message
        const finalMsg = (currentJob.progress < 0) ? currentJob.message : 'Engine process crashed abnormally';
        await dbInvoke("upsert", "jobs", jobId, { ...currentJob, status: 'failed', message: finalMsg });
      }
      isProcessing = false;
      processQueue();
    });

  } catch (error) {
    console.error("Queue processing error:", error);
    isProcessing = false;
    processQueue();
  }
}

// --- Local Asset Proxy Setup ---
const storagePath = path.join(process.cwd(), 'storage');
app.use('/assets', express.static(storagePath));

app.post('/api/upload', upload.single('audio'), async (req, res) => {
  const fileData = (req as any).file;
  if (!fileData) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  const { userId } = req.body;
  const uniqueName = `${uuidv4()}_${fileData.originalname}`;
  
  // Ensure user directory exists
  const userAudioDir = path.join(storagePath, 'audio', userId || 'anonymous');
  if (!fs.existsSync(userAudioDir)) {
    fs.mkdirSync(userAudioDir, { recursive: true });
  }

  const filePath = path.join(userAudioDir, uniqueName);

  try {
    fs.writeFileSync(filePath, fileData.buffer);
    
    // The relative URL for the frontend to access via proxy
    const url = `/assets/audio/${userId || 'anonymous'}/${uniqueName}`;

    res.json({ url, fileName: uniqueName });
  } catch (error) {
    console.error("Upload failed:", error);
    res.status(500).json({ error: "Failed to write file to local storage" });
  }
});

app.post('/api/upload/voice', upload.fields([{ name: 'audio', maxCount: 1 }, { name: 'avatar', maxCount: 1 }]), async (req, res) => {
  const files = (req as any).files;
  if (!files || !files['audio']) {
    return res.status(400).json({ error: "No audio file uploaded" });
  }

  const audioFile = files['audio'][0];
  const avatarFile = files['avatar'] ? files['avatar'][0] : null;
  const { userId, voiceName } = req.body;
  
  const voiceId = uuidv4();
  
  // Ensure voice directory exists
  const userVoiceDir = path.join(storagePath, 'voices', userId || 'anonymous');
  if (!fs.existsSync(userVoiceDir)) {
    fs.mkdirSync(userVoiceDir, { recursive: true });
  }

  const audioExt = path.extname(audioFile.originalname) || '.wav';
  const audioFilePath = path.join(userVoiceDir, `${voiceId}${audioExt}`);
  
  let avatarUrl = '';
  // If no avatar uploaded, use default monkey avatar
  if (avatarFile) {
    const avatarExt = path.extname(avatarFile.originalname) || '.png';
    const avatarFilePath = path.join(userVoiceDir, `${voiceId}_avatar${avatarExt}`);
    fs.writeFileSync(avatarFilePath, avatarFile.buffer);
    avatarUrl = `/assets/voices/${userId || 'anonymous'}/${voiceId}_avatar${avatarExt}`;
  } else {
    // Generate/Use random Gal Yossef avatar
    avatarUrl = getRandomAvatar();
  }

  try {
    fs.writeFileSync(audioFilePath, audioFile.buffer);
    const audioUrl = `/assets/voices/${userId || 'anonymous'}/${voiceId}${audioExt}`;

    res.json({ voiceId, audioUrl, avatarUrl });
  } catch (error) {
    console.error("Upload failed:", error);
    res.status(500).json({ error: "Failed to save voice to local storage" });
  }
});

// --- Local LLM Metadata Extraction via Ollama ---
app.post('/api/extract/youtube', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: "Missing YouTube URL" });
  
  let metadata = {
    artist: "YouTube Download",
    song_title: "Extracted Audio"
  };

  try {
    // 1. Get list of available models
    const tagsResponse = await fetch('http://localhost:11434/api/tags');
    if (!tagsResponse.ok) throw new Error("Could not connect to Ollama tags API");
    const { models } = await tagsResponse.json();
    
    // 2. Filter for generative models (exclude embedding/whisper) and pick smallest
    const generativeModels = models.filter((m: any) => 
      !m.name.includes('embed') && 
      !m.name.includes('whisper')
    ).sort((a: any, b: any) => a.size - b.size);
    
    if (generativeModels.length === 0) {
      throw new Error("No suitable generative model found in Ollama. Please pull a model (e.g., llama3.2)");
    }
    
    let extractedMetadata = null;
    let lastError = null;

    // Try models in order of size (lightest first)
    for (const model of generativeModels) {
      try {
        console.log(`Attempting extraction with model: ${model.name} (${(model.size / 1024 / 1024 / 1024).toFixed(2)} GB)`);
        
        const ollamaResponse = await fetch('http://localhost:11434/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: model.name,
            prompt: `You are a music metadata specialist. Extract artist and song title from this YouTube URL or title: "${url}". Return ONLY a JSON object with keys "artist" and "song_title". Remove any irrelevant tags like [Official Video].`,
            stream: false,
            keep_alive: '5m',
            format: 'json'
          })
        });
        
        if (!ollamaResponse.ok) continue;
        const ollamaData = await ollamaResponse.json();
        const rawResponse = ollamaData.response || '';
        
        if (!rawResponse) {
          console.warn(`Model ${model.name} returned empty response, trying next...`);
          continue;
        }

        const startIdx = rawResponse.indexOf('{');
        const endIdx = rawResponse.lastIndexOf('}');
        
        if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
          console.warn(`Model ${model.name} returned non-JSON, trying next...`);
          continue;
        }

        const jsonString = rawResponse.substring(startIdx, endIdx + 1);
        extractedMetadata = JSON.parse(jsonString);
        console.log(`Successfully extracted metadata using ${model.name}`);
        break; // Success!
      } catch (err) {
        lastError = err;
        console.warn(`Model ${model.name} failed:`, err instanceof Error ? err.message : err);
      }
    }

    if (extractedMetadata) {
      metadata = extractedMetadata;
    } else {
      console.warn(lastError ? `All models failed. Last error: ${lastError.message}` : "Failed to extract metadata with any available model. Using fallback.");
    }
    
    res.json(metadata);
  } catch (error) {
    console.warn("Extraction error, using fallback metadata:", error);
    res.json(metadata);
  }
});

// --- Local DB API (additional job endpoint) ---

app.get('/api/jobs/:id', async (req, res) => {
  try {
    const job = await dbInvoke("get", "jobs", req.params.id);
    if (!job) return res.status(404).json({ error: "Job not found" });
    res.json(job);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch job" });
  }
});

app.post('/api/covers/create', async (req, res) => {
  const { 
    userId, 
    youtubeUrl, 
    audioUrl, 
    voiceId, 
    title, 
    artist, 
    engine, 
    pitch, 
    isAcapella, 
    highQuality 
  } = req.body;
  const jobId = uuidv4();

  try {
    // 1. Create Job in Local DB
    await dbInvoke("upsert", "jobs", jobId, {
      id: jobId,
      type: 'conversion',
      status: 'pending',
      progress: 0,
      message: 'Queued for processing...',
      targetId: '',
      userId,
      voiceId,
      youtubeUrl: youtubeUrl || "",
      audioUrl: audioUrl || "",
      title: title || "",
      artist: artist || "",
      engine: engine || 'rvc',
      pitch: pitch || 0, // Default pitch to 0 if not provided
      isAcapella: isAcapella || false,
      highQuality: highQuality || false, // Default highQuality to false if not provided
      createdAt: new Date().toISOString()
    });

    // Add to queue
    jobQueue.push(jobId);
    processQueue();

    res.json({ jobId, status: 'pending' });
  } catch (error) {
    console.error("Failed to start job:", error);
    res.status(500).json({ error: "Failed to initiate processing" });
  }
});

// --- Vite Middleware ---

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log("Available environment variables:", Object.keys(process.env));
  });
}

startServer();
