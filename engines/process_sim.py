import argparse
import sys
import json
import time
import os

# CopyCanto Simulation Engine (For UAT)
# Mimics the STDOUT behavior of engines/process.py without requiring torch/demucs.

def update_progress(job_id, progress, message):
    status = {
        "jobId": job_id,
        "progress": progress,
        "message": message
    }
    print(json.dumps(status))
    sys.stdout.flush()

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--jobId", required=True)
    parser.add_argument("--userId", required=True)
    parser.add_argument("--voiceId", required=True)
    parser.add_argument("--voicePath", required=False, default="")
    parser.add_argument("--inputUrl", required=True)
    parser.add_argument("--isAcapella", action="store_true")
    parser.add_argument("--engine", default="rvc")
    # Accept (and ignore) the same optional flags the server passes to the real
    # engine, so the simulator doesn't crash on argparse when MOCK_ENGINE=true.
    parser.add_argument("--highQuality", action="store_true", default=False)
    parser.add_argument("--pitch", type=int, default=0)
    args = parser.parse_args()

    job_id = args.jobId
    url = args.inputUrl
    
    # 1. Download / File Check
    update_progress(job_id, 10, "Extracting audio from YouTube..." if url.startswith('http') else "Processing local audio...")
    time.sleep(2)
    
    # 2. Stem Separation
    if args.isAcapella:
        update_progress(job_id, 30, "Acapella mode: Skipping Stem Separation...")
    else:
        update_progress(job_id, 30, "Splitting Stems (Demucs v4)...")
    time.sleep(3)
    
    # 3. Model Optimization
    update_progress(job_id, 60, f"Optimizing Voice Model ({args.engine.upper()})...")
    time.sleep(2)
    
    # 4. Inference
    update_progress(job_id, 65, f"RVC Inference (Processing {args.voiceId})")
    time.sleep(4)
    
    # 5. Mix
    update_progress(job_id, 90, "Applying Final Mix...")
    time.sleep(2)
    
    # 6. Completion
    # Ensure directories exist so server.ts can find the "output"
    project_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
    songs_dir = os.path.join(project_dir, 'storage', 'songs', job_id)
    covers_dir = os.path.join(project_dir, 'storage', 'covers')
    os.makedirs(songs_dir, exist_ok=True)
    os.makedirs(covers_dir, exist_ok=True)
    
    # Create empty mock files so the server's fs.existsSync tests pass
    open(os.path.join(covers_dir, f"{job_id}.mp3"), 'a').close()
    if not args.isAcapella:
        open(os.path.join(songs_dir, "vocals.wav"), 'a').close()
        open(os.path.join(songs_dir, "instrumental.wav"), 'a').close()
    else:
        open(os.path.join(songs_dir, "original.mp3"), 'a').close()

    update_progress(job_id, 100, "Completed!")

if __name__ == "__main__":
    main()
