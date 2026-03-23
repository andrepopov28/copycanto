# CopyCanto — AI Voice Cloning Suite

A local-first AI voice cover generation platform. Clone any voice, transform any song, all running on your own hardware.

## Architecture

- **Frontend**: React + Vite + TypeScript
- **Backend**: Express.js + Vite middleware
- **AI Pipeline**: Python engine orchestrator (stem separation → voice conversion → audio mix)
- **Database**: Parquet flat-file DB via Polars (no cloud required)
- **Storage**: Local filesystem under `storage/`

## Running Locally

**Prerequisites:** Node.js 18+, Python 3.11+, ffmpeg, yt-dlp

```bash
# 1. Install Node dependencies
npm install

# 2. Create and activate Python virtualenv
python3.11 -m venv venv
source venv/bin/activate

# 3. Install Python dependencies
pip install -r requirements.txt

# 4. Download AI model weights (HuBERT, RMVPE)
python engines/download_models.py

# 5. Start the app
npm run dev
```

## App URL

> **http://localhost:7842**
>
> Port 7842 is hardcoded to avoid conflicts with other common dev-server ports (3000, 5173, 8080).

## Environment Variables

Copy `.env.example` to `.env` and fill in any required keys. **IMPORTANT**: `.env` is ignored by Git to prevent accidental leakage of sensitive keys. Never commit your `.env` file or hardcode keys in the source.

| Variable | Description |
|---|---|
| `GITHUB_TOKEN` | Optional — for GitHub Repos browser |
| `GEMINI_API_KEY` | Optional — for AI-assisted features |
| `MOCK_ENGINE` | Set to `true` to use simulated pipeline (no AI) |

## Storage Layout

```
storage/
  songs/       ← source audio per job
  voices/      ← uploaded voice samples
  clones/      ← converted isolated vocals
  covers/      ← final mixed outputs
  db/          ← Parquet flat-file database
```

## AI Pipeline

1. **Input**: YouTube URL or uploaded MP3
2. **Stem Separation**: Separates vocals from instrumentals
3. **Voice Conversion**: Applies the selected voice model
4. **Final Mix**: Recombines converted vocals + instrumental via FFmpeg
