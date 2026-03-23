# CopyCanto — Product Requirements Document (PRD)

## 1. Product Overview
CopyCanto is a local-first AI voice cover generation platform. It allows users to clone voices, separate stems from existing songs, and generate high-fidelity AI voice covers all running entirely on their local hardware (Apple Silicon optimized).

## 2. Core Features
- **Voice Library**: Upload custom voice samples to train/use as Source Audio. (Zero-shot cloning and RVC integration).
- **Song Library**: Upload MP3s or extract audio directly from YouTube URLs (using `yt-dlp`).
- **Cover Generation Pipeline**:
  - **Stem Separation**: Isolates vocals and instrumentals using Demucs v4.
  - **Voice Conversion**: Applies the selected voice model using RVC v2 or kNN-SVC.
  - **Mixing**: Recombines the converted vocals with the original instrumental using FFmpeg.
- **Local Operations**: No cloud processing. All data lives in the local `storage/` directory.

## 3. Architecture & Tech Stack
- **Frontend**: React, Vite, Tailwind CSS, TypeScript
- **Backend**: Node.js (Express), Vite Middleware
- **AI Engines**: Python 3.11+, PyTorch (MPS enabled)
  - *Note: System leverages Homebrew Python 3.14 for specific dependencies like Polars.*
- **Database**: Local Parquet flat-files via Polars (`storage/db/*.parquet`). Governed by file locks.
- **Storage**: Local filesystem (`storage/songs`, `storage/voices`, `storage/covers`, `storage/clones`).

## 4. Port Configuration 
- **Dedicated Port**: The application runs on **Port 7842** (`http://localhost:7842`).
- *Rationale*: This is a non-standard port chosen explicitly to prevent conflicts with common developer ports (like 3000, 5173, 8080) which might be occupied by other active projects on the user's machine.

## 5. Security & Privacy
- **Local-First**: Complete data sovereignty. No audio or generated covers are sent to external APIs (except for downloading YouTube audio and fetching model metadata if configured).
- **Environment Security**: Sensitive API keys (GitHub, Gemini, Firebase, etc.) must NEVER be hardcoded. They are managed via `.env` files and `firebase-applet-config.json` (both ignored by git).
- **File System Limits**: Multer configured for safe memory storage during uploads before flushing to disk.
- **Diagnostic Hygiene**: Diagnostic scripts that log environment variable metadata (e.g., `check_env_keys.ts`) are prohibited and must be removed after use.

## 6. Known Limitations & Roadmap
- **Model Weights**: Requires manual download of large model checkpoints (`hubert_base.pt`, `rmvpe.pt`, `wavlm_large.pt`) via `engines/download_models.py` before inference can run.
- **Engine Process Calls**: Currently migrating demucs OS binary calls to `python -m demucs.separate`.
- **UI Enhancements**: Transitioned from exposing raw AI engine names (RVC, kNN) to using benefit-driven marketing copy ("Flawless Vocals", "Zero-Shot Cloning") on the Home screen cards.

---
*Document reflects state as of V2 Hardening & UAT.*
