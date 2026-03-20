import argparse
import sys
import json
import subprocess
import os
import shutil

# CopyCanto Python Engine Orchestrator
# This script is called by server.ts sequentially to avoid M1 Max OOMs.

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
    parser.add_argument("--isAcapella", action="store_true", help="Skip stem separation")
    parser.add_argument("--engine", default="rvc", choices=["rvc", "knn", "none"], help="Voice conversion engine: rvc, knn, or none")
    args = parser.parse_args()

    job_id = args.jobId
    url = args.inputUrl
    is_acapella = args.isAcapella
    engine = args.engine
    
    # Define working directories
    project_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
    songs_dir = os.path.join(project_dir, 'storage', 'songs', job_id)
    clones_dir = os.path.join(project_dir, 'storage', 'clones')
    covers_dir = os.path.join(project_dir, 'storage', 'covers')
    models_dir = os.path.join(project_dir, 'engines', 'models')
    
    os.makedirs(songs_dir, exist_ok=True)
    os.makedirs(clones_dir, exist_ok=True)
    os.makedirs(covers_dir, exist_ok=True)
    os.makedirs(models_dir, exist_ok=True)
    
    raw_audio_path = os.path.join(songs_dir, "original.mp3")

    try:
        # Step 1: Download from YouTube / process URL
        update_progress(job_id, 10, "Extracting audio from YouTube..." if url.startswith('http') else "Processing local audio...")
        if url.startswith('http'):
            # yt-dlp to grab best audio
            ytdlp_bin = shutil.which('yt-dlp') or '/opt/homebrew/bin/yt-dlp'
            if not ytdlp_bin or not os.path.exists(ytdlp_bin):
                update_progress(job_id, -1, "yt-dlp not found. Please run: brew install yt-dlp")
                sys.exit(1)
            try:
                subprocess.run([
                    ytdlp_bin, '-x', '--audio-format', 'mp3',
                    '-o', raw_audio_path, url
                ], check=True, capture_output=True)
            except subprocess.CalledProcessError as e:
                err_msg = e.stderr.decode('utf-8') if e.stderr else str(e)
                update_progress(job_id, -1, f"YouTube download failed: {err_msg[:300]}")
                sys.exit(1)
        else:
            # Handle local file uploads passed from the frontend proxy URL
            if url.startswith('/assets/'):
                relative_path = url.replace('/assets/', '')
                local_file_path = os.path.join(project_dir, 'storage', relative_path)
                if os.path.exists(local_file_path):
                    subprocess.run(['cp', local_file_path, raw_audio_path], check=True)
                else:
                    raise FileNotFoundError(f"Local audio file not found: {local_file_path}")
            else:
                # Direct file path fallback
                raw_audio_path = url
            
        # Step 2: Demucs Stem Separation
        demucs_out_dir = os.path.join(songs_dir, 'stems')
        if is_acapella:
            update_progress(job_id, 30, "Acapella mode: Skipping Stem Separation...")
            # If acapella, the raw audio IS the vocal track
            vocal_track = raw_audio_path
            inst_track = None
        else:
            update_progress(job_id, 30, "Splitting Stems (Demucs v4)...")
            # FIX: demucs is a Python module - no standalone binary on this system
            # Use `python3 -m demucs.separate` to call it correctly
            try:
                subprocess.run([
                    sys.executable, '-m', 'demucs.separate',
                    '--two-stems=vocals',
                    '-o', demucs_out_dir,
                    raw_audio_path
                ], check=True, capture_output=True)
            except subprocess.CalledProcessError as e:
                err_msg = e.stderr.decode('utf-8') if e.stderr else str(e)
                update_progress(job_id, -1, f"Stem separation failed: {err_msg[:300]}")
                sys.exit(1)
            
            # Move stems to clean paths
            original_stem_name = os.path.splitext(os.path.basename(raw_audio_path))[0]
            htdemucs_stem_dir = os.path.join(demucs_out_dir, 'htdemucs', original_stem_name)
            
            vocals_src = os.path.join(htdemucs_stem_dir, 'vocals.wav')
            no_vocals_src = os.path.join(htdemucs_stem_dir, 'no_vocals.wav')
            vocals_dst = os.path.join(songs_dir, 'vocals.wav')
            inst_dst = os.path.join(songs_dir, 'instrumental.wav')
            
            if os.path.exists(vocals_src):
                shutil.move(vocals_src, vocals_dst)
            else:
                update_progress(job_id, -1, f"Demucs did not produce vocals.wav. Check: {htdemucs_stem_dir}")
                sys.exit(1)
            if os.path.exists(no_vocals_src):
                shutil.move(no_vocals_src, inst_dst)
            
            vocal_track = vocals_dst
            inst_track = inst_dst if os.path.exists(inst_dst) else None
        
        # Step 3: Voice Clone Engine (skipped if engine == 'none')
        if engine != 'none':
            update_progress(job_id, 60, f"Optimizing Voice Model ({engine.upper()})...")
            converted_output = os.path.join(clones_dir, f"{job_id}.wav")
            refs_dir = os.path.join(project_dir, 'engines', 'refs')
            
            if engine == 'rvc':
                rvc_dir = os.path.join(project_dir, 'engines', 'repos', 'rvc_v2')
                env = os.environ.copy()
                env['weight_root'] = models_dir

                # Check for required model weight files
                hubert_path = os.path.join(rvc_dir, 'assets', 'hubert', 'hubert_base.pt')
                rmvpe_path = os.path.join(rvc_dir, 'assets', 'rmvpe', 'rmvpe.pt')
                model_pth = os.path.join(models_dir, f"{args.voiceId}.pth")
                
                missing = []
                if not os.path.exists(hubert_path) or os.path.getsize(hubert_path) < 1_000_000:
                    missing.append("HuBERT base model (assets/hubert/hubert_base.pt, ~190MB) — run: python3 engines/download_models.py")
                if not os.path.exists(rmvpe_path) or os.path.getsize(rmvpe_path) < 1_000_000:
                    missing.append("RMVPE pitch model (assets/rmvpe/rmvpe.pt, ~200MB) — run: python3 engines/download_models.py")
                if not os.path.exists(model_pth):
                    missing.append(f"Voice model: {args.voiceId}.pth — place it in engines/models/")
                
                if missing:
                    update_progress(job_id, -1, f"Missing model files: {'; '.join(missing)}")
                    sys.exit(1)

                update_progress(job_id, 65, f"RVC Inference (Voice: {args.voiceId})")
                subprocess.run([
                    sys.executable, 'tools/infer_cli.py',
                    '--f0up_key', '0',
                    '--f0method', 'rmvpe',
                    '--device', 'mps',
                    '--input_path', vocal_track,
                    '--index_path', os.path.join(models_dir, f"{args.voiceId}.index"),
                    '--opt_path', converted_output,
                    '--model_name', f"{args.voiceId}.pth"
                ], check=False, cwd=rvc_dir, env=env)
                
            elif engine == 'knn':
                knn_dir = os.path.join(project_dir, 'engines', 'repos', 'knn-svc')
                knn_ckpt_dir = os.path.join(models_dir, 'knn-svc')
                
                # Correct ref_audio path - use voicePath from args if available
                ref_audio = args.voicePath
                if not ref_audio or not os.path.exists(ref_audio):
                    update_progress(job_id, -1, f"kNN-SVC reference audio missing or invalid: {ref_audio}")
                    sys.exit(1)
                
                # kNN-SVC requires 16kHz mono WAV for reference
                ref_wav = os.path.join(songs_dir, "ref_voice_16k.wav")
                try:
                    subprocess.run([
                        'ffmpeg', '-y', '-i', ref_audio,
                        '-ar', '16000', '-ac', '1', ref_wav
                    ], check=True, capture_output=True)
                except Exception as e:
                    update_progress(job_id, -1, f"Failed to convert reference audio for kNN: {str(e)}")
                    sys.exit(1)

                update_progress(job_id, 65, "kNN-SVC: Converting vocals with Nearest Neighbors...")
                
                # The ddsp_inference.py actually outputs to the current directory or specified output_dir
                # It often has a randomized/timestamped filename, so we diff the directory.
                vocal_dir = os.path.dirname(vocal_track) or "."
                before_files = set(os.listdir(vocal_dir))
                
                try:
                    # Use sys.executable to run inside our venv
                    # ddsp_inference.py arguments: <source_audio> <ref_audio> --local_ckpt_dir <dir>
                    subprocess.run([
                        sys.executable, 'ddsp_inference.py',
                        vocal_track, ref_wav,
                        '--local_ckpt_dir', knn_ckpt_dir
                    ], check=True, cwd=knn_dir, capture_output=True)
                except subprocess.CalledProcessError as e:
                    err_msg = e.stderr.decode('utf-8') if e.stderr else str(e)
                    update_progress(job_id, -1, f"kNN-SVC inference failed: {err_msg[:500]}")
                    sys.exit(1)
                
                # Detect newly created .wav file
                after_files = set(os.listdir(vocal_dir))
                new_files = [f for f in (after_files - before_files) if f.endswith('.wav') and 'knn_ref' not in f]
                
                if new_files:
                    # Pick the most likely one (newest or first)
                    shutil.move(os.path.join(vocal_dir, new_files[0]), converted_output)
                else:
                    # Fallback check - maybe it saved into a subfolder?
                    update_progress(job_id, 70, "kNN output not detected via diff, using fallback...")

            # Fallback if conversion failed or model was missing
            if not os.path.exists(converted_output):
                update_progress(job_id, 80, "Conversion model unavailable, copying original vocals as fallback...")
                shutil.copy2(vocal_track, converted_output)

            # Step 4: Mix / Combine with FFmpeg
            final_output = os.path.join(covers_dir, f"{job_id}.mp3")
            if is_acapella or inst_track is None or not os.path.exists(inst_track):
                update_progress(job_id, 90, "Encoding final cover (no instrumental mix)...")
                subprocess.run([
                    'ffmpeg', '-y',
                    '-i', converted_output,
                    final_output
                ], check=False, capture_output=True)
            else:
                update_progress(job_id, 90, "Mixing vocals + instrumental with FFmpeg...")
                subprocess.run([
                    'ffmpeg', '-y',
                    '-i', converted_output, '-i', inst_track,
                    '-filter_complex', 'amix=inputs=2:duration=longest',
                    final_output
                ], check=False, capture_output=True)
        
        update_progress(job_id, 100, "Completed!")
        
    except subprocess.CalledProcessError as e:
        err_bytes = e.stderr if e.stderr else (e.stdout if e.stdout else b'')
        err_msg = err_bytes.decode('utf-8') if isinstance(err_bytes, bytes) else str(err_bytes)
        update_progress(job_id, -1, f"Process Failed: {err_msg[-500:]}")
        sys.exit(1)
    except Exception as e:
        update_progress(job_id, -1, f"Error: {str(e)}")
        sys.exit(1)

if __name__ == "__main__":
    main()
