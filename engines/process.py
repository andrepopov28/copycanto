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
            # Demucs is installed in system Python, NOT in the venv.
            # Find it using shutil.which or fall back to known locations.
            import shutil as _shutil
            demucs_python = _shutil.which('python3') or sys.executable
            # Prefer system Python over venv if demucs is not in venv
            for _candidate in ['/opt/homebrew/bin/python3', '/usr/local/bin/python3', sys.executable]:
                if os.path.exists(_candidate):
                    try:
                        import subprocess as _sp
                        _sp.run([_candidate, '-c', 'import demucs'], check=True, capture_output=True)
                        demucs_python = _candidate
                        break
                    except Exception:
                        continue
            try:
                subprocess.run([
                    demucs_python, '-m', 'demucs.separate',
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
                # weight_root can be clones_dir OR models_dir — rvc infer_cli uses this to find .pth
                env['weight_root'] = clones_dir  # trained models live in storage/clones/
                env['PYTHONPATH'] = rvc_dir
                env['PYTORCH_ENABLE_MPS_FALLBACK'] = '1'

                # Check for required model weight files
                hubert_path = os.path.join(rvc_dir, 'assets', 'hubert', 'hubert_base.pt')
                rmvpe_path = os.path.join(rvc_dir, 'assets', 'rmvpe', 'rmvpe.pt')
                # Try storage/clones/ first (trained models), then engines/models/ (manually placed)
                model_pth = os.path.join(clones_dir, f"{args.voiceId}.pth")
                if not os.path.exists(model_pth):
                    model_pth = os.path.join(models_dir, f"{args.voiceId}.pth")
                
                missing = []
                if not os.path.exists(hubert_path) or os.path.getsize(hubert_path) < 1_000_000:
                    missing.append("HuBERT base model (assets/hubert/hubert_base.pt, ~190MB) — run: python3 engines/download_models.py")
                if not os.path.exists(rmvpe_path) or os.path.getsize(rmvpe_path) < 1_000_000:
                    missing.append("RMVPE pitch model (assets/rmvpe/rmvpe.pt, ~200MB) — run: python3 engines/download_models.py")
                if not os.path.exists(model_pth):
                    missing.append(f"Voice model: {args.voiceId}.pth — place it in storage/clones/ or engines/models/")
                
                if missing:
                    update_progress(job_id, -1, f"Missing model files: {'; '.join(missing)}")
                    sys.exit(1)

                update_progress(job_id, 65, f"RVC Inference (Voice: {args.voiceId})")
                # Prefer MPS for inference on Apple Silicon, fallback cpu
                import platform
                rvc_device = 'mps' if platform.system() == 'Darwin' else 'cpu'
                # Resolve FAISS index path — optional, inference works without it
                index_path = os.path.join(clones_dir, f"{args.voiceId}.index")
                if not os.path.exists(index_path):
                    index_path = os.path.join(models_dir, f"{args.voiceId}.index")
                if not os.path.exists(index_path):
                    index_path = ''  # run without index (less precise but functional)
                infer_cmd = [
                    sys.executable, 'tools/infer_cli.py',
                    '--f0up_key', '0',
                    '--f0method', 'rmvpe',
                    '--device', rvc_device,
                    '--input_path', vocal_track,
                    '--opt_path', converted_output,
                    '--model_name', f"{args.voiceId}.pth",
                ]
                if index_path:
                    infer_cmd += ['--index_path', index_path]
                subprocess.run(infer_cmd, check=False, cwd=rvc_dir, env=env)
                
            elif engine == 'knn':
                knn_dir = os.path.join(project_dir, 'engines', 'repos', 'knn-svc')
                # hifigan/ dir contains mix_g_00898000_harm_no_amp.pt (SmoothKen DDSP checkpoint)
                knn_hifigan_ckpt_dir = os.path.join(knn_dir, 'hifigan')
                
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
                
                # ddsp_inference.py outputs next to the source file as:
                # <src_basename>_to_<ref_basename>_knn_<ckpt_type>_<post_opt>.wav
                # We use --ckpt_type mix and --device cpu (MPS lacks float64 support)
                try:
                    subprocess.run([
                        sys.executable, 'ddsp_inference.py',
                        vocal_track, ref_wav,
                        '--ckpt_dir', knn_hifigan_ckpt_dir,
                        '--ckpt_type', 'mix',
                        '--device', 'cpu',
                        '--topk', '4',
                        '--prioritize_f0', 'true',
                        '--tgt_loudness_db', '-16',
                        '--post_opt', 'no_post_opt',
                    ], check=True, cwd=knn_dir, capture_output=True)
                except subprocess.CalledProcessError as e:
                    err_msg = e.stderr.decode('utf-8') if e.stderr else str(e)
                    update_progress(job_id, -1, f"kNN-SVC inference failed: {err_msg[:500]}")
                    sys.exit(1)
                
                # Output is placed next to the source file with predictable name
                src_stem = os.path.splitext(os.path.basename(vocal_track))[0]
                ref_stem = os.path.splitext(os.path.basename(ref_wav))[0]
                expected_out = os.path.join(
                    os.path.dirname(vocal_track),
                    f"{src_stem}_to_{ref_stem}_knn_mix_no_post_opt.wav"
                )
                
                if os.path.exists(expected_out):
                    shutil.move(expected_out, converted_output)
                else:
                    # Fallback: scan for any newly created wav
                    vocal_dir = os.path.dirname(vocal_track) or "."
                    wavs = sorted([f for f in os.listdir(vocal_dir) if f.endswith('.wav')],
                                   key=lambda f: os.path.getmtime(os.path.join(vocal_dir, f)),
                                   reverse=True)
                    if wavs:
                        shutil.move(os.path.join(vocal_dir, wavs[0]), converted_output)
                    else:
                        update_progress(job_id, 70, "kNN output not detected, using fallback...")

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
