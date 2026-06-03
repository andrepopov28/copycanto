import argparse
import sys
import json
import subprocess
import os
import shutil
import torch

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
    parser.add_argument("--engine", default="rvc", choices=["rvc", "knn", "neucosvc", "amphion", "none"], help="Voice conversion engine: rvc, knn, neucosvc, amphion, or none")
    parser.add_argument("--highQuality", action="store_true", default=True, help="Enable highest quality settings")
    parser.add_argument("--pitch", type=int, default=0, help="Pitch shift in semitones (applied as RVC f0_key)")
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
                # Direct file path fallback - handle file:// prefix and absolute paths
                local_path = url.replace("file://", "")
                if os.path.exists(local_path):
                    subprocess.run(['cp', local_path, raw_audio_path], check=True)
                elif os.path.exists(url):
                    subprocess.run(['cp', url, raw_audio_path], check=True)
                else:
                    raise FileNotFoundError(f"Local audio file not found: {url}")
            
        # Step 2: Demucs Stem Separation
        demucs_out_dir = os.path.join(songs_dir, 'stems')
        vocals_dst = os.path.join(songs_dir, 'vocals.wav')
        inst_dst = os.path.join(songs_dir, 'instrumental.wav')
        bass_dst = os.path.join(songs_dir, 'bass.wav')
        drums_dst = os.path.join(songs_dir, 'drums.wav')
        other_dst = os.path.join(songs_dir, 'other.wav')

        if is_acapella:
            update_progress(job_id, 30, "Acapella mode: Skipping Stem Separation...")
            vocal_track = raw_audio_path
            inst_track = None
        elif os.path.exists(vocals_dst) and os.path.exists(inst_dst):
            update_progress(job_id, 50, "Stems already exist, skipping Demucs...")
            vocal_track = vocals_dst
            inst_track = inst_dst
        else:
            update_progress(job_id, 30, "Splitting Stems (Demucs htdemucs, 4-stem)...")
            demucs_out_dir = os.path.join(songs_dir, "stems")
            os.makedirs(demucs_out_dir, exist_ok=True)

            
            # Use the venv Python (where demucs is installed)
            demucs_python = sys.executable
            
            # 4-stem htdemucs for highest quality (bass, drums, other, vocals)
            # This gives individual stems for use in the KNN mixing step.
            try:
                subprocess.run([
                    demucs_python, '-m', 'demucs.separate',
                    '-n', 'htdemucs',
                    '-d', 'cpu',
                    '-o', demucs_out_dir,
                    raw_audio_path
                ], check=True, capture_output=True)
            except subprocess.CalledProcessError as e:
                err_msg = e.stderr.decode('utf-8') if e.stderr else str(e)
                update_progress(job_id, -1, f"Stem separation failed: {err_msg[:300]}")
                sys.exit(1)
            
            # Move stems to clean paths
            original_stem_name = os.path.splitext(os.path.basename(raw_audio_path))[0]
            # htdemucs outputs to: <demucs_out_dir>/htdemucs/<track_name>/
            htdemucs_stem_dir = os.path.join(demucs_out_dir, 'htdemucs', original_stem_name)
            
            vocals_src = os.path.join(htdemucs_stem_dir, 'vocals.wav')
            bass_src = os.path.join(htdemucs_stem_dir, 'bass.wav')
            drums_src = os.path.join(htdemucs_stem_dir, 'drums.wav')
            other_src = os.path.join(htdemucs_stem_dir, 'other.wav')
            
            if os.path.exists(vocals_src):
                shutil.move(vocals_src, vocals_dst)
            else:
                update_progress(job_id, -1, f"Demucs did not produce vocals.wav. Check: {htdemucs_stem_dir}")
                sys.exit(1)
            
            # Move individual stems for KNN mixing
            for stem_src, stem_dst in [(bass_src, bass_dst), (drums_src, drums_dst), (other_src, other_dst)]:
                if os.path.exists(stem_src):
                    shutil.move(stem_src, stem_dst)
            
            # Build an instrumental by mixing bass+drums+other with ffmpeg (for RVC and display)
            available_stems = [f for f in [bass_dst, drums_dst, other_dst] if os.path.exists(f)]
            if available_stems:
                mix_inputs = []
                for s in available_stems:
                    mix_inputs += ['-i', s]
                filter_graph = f"{''.join(f'[{i}:a]' for i in range(len(available_stems)))}amix=inputs={len(available_stems)}:duration=longest"
                subprocess.run([
                    'ffmpeg', '-y',
                    *mix_inputs,
                    '-filter_complex', filter_graph,
                    inst_dst
                ], check=False, capture_output=True)
            
            vocal_track = vocals_dst
            inst_track = inst_dst if os.path.exists(inst_dst) else None

        
        # Step 3: Voice Clone Engine (skipped if engine == 'none')
        if engine != 'none':
            update_progress(job_id, 60, f"Optimizing Voice Model ({engine.upper()})...")
            converted_output = os.path.join(clones_dir, f"{job_id}.wav")
            refs_dir = os.path.join(project_dir, 'engines', 'refs')
            
            if engine == 'rvc':
                rvc_infer_script = os.path.join(project_dir, 'engines', 'rvc_infer.py')
                rvc_dir = os.path.abspath(os.path.join(project_dir, 'engines', 'repos', 'rvc_v2'))
                rvc_weights_dir = os.path.join(rvc_dir, 'assets', 'weights')

                # Resolve voice model file — must be >1MB to be a real model.
                # Search order: storage/clones/ → engines/models/ → rvc_v2/assets/weights/
                model_pth = os.path.join(clones_dir, f"{args.voiceId}.pth")
                if not os.path.exists(model_pth) or os.path.getsize(model_pth) < 1_000_000:
                    model_pth = os.path.join(models_dir, f"{args.voiceId}.pth")
                if not os.path.exists(model_pth) or os.path.getsize(model_pth) < 1_000_000:
                    model_pth = os.path.join(rvc_weights_dir, f"{args.voiceId}.pth")

                # Verify HuBERT is installed (required for RVC)
                hubert_path = os.path.join(rvc_dir, 'assets', 'hubert', 'hubert_base.pt')

                missing = []
                if not os.path.exists(hubert_path) or os.path.getsize(hubert_path) < 1_000_000:
                    missing.append("HuBERT model (assets/hubert/hubert_base.pt, ~190MB)")
                if not os.path.exists(model_pth) or os.path.getsize(model_pth) < 1_000_000:
                    missing.append(f"Voice model: {args.voiceId}.pth (must be >1MB — not found in clones/, models/, or rvc_v2/assets/weights/)")
                if missing:
                    update_progress(job_id, -1, f"Missing model files: {'; '.join(missing)}")
                    sys.exit(1)

                import platform
                rvc_device = 'cpu' if platform.system() == 'Darwin' else 'cuda' if torch.cuda.is_available() else 'cpu'

                # Use 'pm' on macOS (rmvpe causes segfaults on M-series), 'rmvpe' elsewhere
                f0_method = 'pm' if platform.system() == 'Darwin' else 'rmvpe'

                update_progress(job_id, 65, f"RVC Inference (Voice: {args.voiceId}, method: {f0_method})")

                # Resolve FAISS index — search same directories as model
                # CRITICAL: Disabled on macOS to prevent segmentation faults (M1/M2/M3)
                index_path = ''
                if platform.system() != 'Darwin':
                    for idx_dir in [clones_dir, models_dir, rvc_weights_dir]:
                        candidate = os.path.join(idx_dir, f"{args.voiceId}.index")
                        if os.path.exists(candidate):
                            index_path = candidate
                            break

                print(f"DEBUG RVC: model={model_pth} ({os.path.getsize(model_pth)//1024//1024}MB), device={rvc_device}, f0={f0_method}")

                # Build command calling our clean rvc_infer.py wrapper
                # (which correctly sets env vars BEFORE importing RVC modules)
                infer_cmd = [
                    sys.executable,
                    rvc_infer_script,
                    '--model_path', os.path.abspath(model_pth),
                    '--input_path', os.path.abspath(vocal_track),
                    '--output_path', os.path.abspath(converted_output),
                    '--f0_method', f0_method,
                    '--f0_key', str(args.pitch),
                    '--index_rate', '0.75',
                    '--filter_radius', '3',
                    '--rms_mix_rate', '0.25',
                    '--protect', '0.33',
                    '--device', rvc_device,
                ]
                if index_path:
                    infer_cmd += ['--index_path', os.path.abspath(index_path)]

                print(f"DEBUG RVC: model={model_pth} ({os.path.getsize(model_pth)//1024//1024}MB), device={rvc_device}")
                result = subprocess.run(
                    infer_cmd,
                    check=True, # Raise exception on failure
                    cwd=project_dir,
                    capture_output=True,
                    text=True,
                    timeout=1200, # Increased timeout to 20 min for CPU stability
                )
                print(f"RVC Success: {result.stdout.strip()[-300:]}")
                
            elif engine in ['knn', 'neucosvc', 'amphion']:
                if engine == 'knn':
                    infer_script = os.path.join(project_dir, 'engines', 'knnvc_infer.py')
                elif engine == 'neucosvc':
                    infer_script = os.path.join(project_dir, 'engines', 'neucosvc_infer.py')
                elif engine == 'amphion':
                    infer_script = os.path.join(project_dir, 'engines', 'amphion_infer.py')
                
                # Resolve reference source: prefer a directory of audio files for reference pooling.
                # If voicePath points to a single file, check if its parent directory has more audio.
                ref_source = args.voicePath  # single file passed from server.ts
                
                if not ref_source or not os.path.exists(ref_source):
                    # Try to find audio directory by voiceId under storage/voices/
                    possible_dirs = [
                        os.path.join(project_dir, 'storage', 'voices', args.voiceId),
                        os.path.join(project_dir, 'storage', 'voices'),
                    ]
                    for d in possible_dirs:
                        if os.path.isdir(d):
                            ref_source = d
                            break
                
                if not ref_source or not (os.path.exists(ref_source)):
                    update_progress(job_id, -1, f"{engine.upper()}: Reference audio missing. voicePath='{args.voicePath}', voiceId='{args.voiceId}'")
                    sys.exit(1)
                
                # If voicePath is a file, check if parent dir has additional reference files
                # (enables reference pooling for better quality).
                if os.path.isfile(ref_source):
                    parent_dir = os.path.dirname(ref_source)
                    audio_exts = {'.wav', '.mp3', '.flac'}
                    siblings = [f for f in os.listdir(parent_dir)
                                if os.path.splitext(f)[1].lower() in audio_exts]
                    if len(siblings) > 1:
                        # Multiple audio files in the same directory — use the directory for pooling
                        ref_source = parent_dir
                
                update_progress(job_id, 65, f"{engine.upper()}: Converting vocals...")
                
                try:
                    cmd_args = [
                        sys.executable,
                        infer_script,
                        os.path.abspath(vocal_track),
                        os.path.abspath(ref_source),
                        os.path.abspath(converted_output),
                    ]
                    if engine == 'knn':
                        cmd_args += ['--topk', '4']

                    infer_result = subprocess.run(cmd_args, check=True, capture_output=True, text=True, timeout=2400)
                    print(f"{engine.upper()} stdout: {infer_result.stdout[-500:]}")
                except subprocess.CalledProcessError as e:
                    err = (e.stderr or e.stdout or str(e))[-600:]
                    update_progress(job_id, -1, f"{engine.upper()} inference failed: {err}")
                    sys.exit(1)


            # Strict validation: If conversion was requested but output doesn't exist, fail loud 
            if not os.path.exists(converted_output):
                if engine in ['rvc', 'knn', 'neucosvc', 'amphion']:
                    update_progress(job_id, -1, f"Voice conversion failed: {engine} output was not created ({converted_output})")
                    sys.exit(1)
                else:
                    update_progress(job_id, 80, "No conversion model specified, using original vocals...")
                    shutil.copy2(vocal_track, converted_output)

            # Step 4: Mix / Combine with FFmpeg
            cover_name = f"{job_id}_cover"
            final_output = os.path.join(covers_dir, f"{job_id}.mp3")
            if is_acapella or inst_track is None or not os.path.exists(inst_track):
                update_progress(job_id, 90, "Encoding final cover (no instrumental mix)...")
                subprocess.run([
                    'ffmpeg', '-y',
                    '-i', converted_output,
                    '-ar', '44100', '-ac', '2', '-q:a', '0',
                    final_output
                ], check=False, capture_output=True)
            elif engine in ['knn', 'neucosvc', 'amphion']:
                # KNN: mix swapped vocals (16kHz mono) with individual stems for max quality
                update_progress(job_id, 90, "KNN: Mixing swapped vocals with individual stems...")
                background_stems = [s for s in [bass_dst, drums_dst, other_dst] if os.path.exists(s)]
                
                if not background_stems:
                    # Fallback: mix with combined instrumental
                    background_stems = [inst_track]
                
                # Build ffmpeg inputs and filter
                inputs = ['-i', converted_output]  # Input 0: converted vocals (16kHz mono)
                for s in background_stems:
                    inputs += ['-i', s]
                
                n_bg = len(background_stems)
                # Upsample vocals to 44100Hz, spread to stereo, volume +3dB
                filter_parts = ['[0:a]aresample=44100,aformat=channel_layouts=stereo,volume=1.3[v]']
                for i, _ in enumerate(background_stems):
                    filter_parts.append(f'[{i+1}:a]aresample=44100[bg{i}]')
                
                bg_labels = ''.join(f'[bg{i}]' for i in range(n_bg))
                filter_parts.append(f'{bg_labels}amix=inputs={n_bg}:duration=longest[bgmix]')
                filter_parts.append('[v][bgmix]amix=inputs=2:duration=longest:weights=1 0.85')
                
                subprocess.run([
                    'ffmpeg', '-y',
                    *inputs,
                    '-filter_complex', ';'.join(filter_parts),
                    '-q:a', '0',
                    '-id3v2_version', '3',
                    '-metadata', f'title={cover_name}',
                    final_output
                ], check=False, capture_output=True)
            else:
                update_progress(job_id, 90, "Mixing vocals + instrumental with FFmpeg...")
                subprocess.run([
                    'ffmpeg', '-y',
                    '-i', converted_output, '-i', inst_track,
                        '-filter_complex', '[0:a]aresample=44100,pan=stereo|c0=c0|c1=c0[v];[1:a]aresample=44100[i];[v][i]amix=inputs=2:duration=longest:dropout_transition=0',
                        '-q:a', '0',
                        '-id3v2_version', '3',
                        '-metadata', f"title={cover_name}",
                        final_output
                ], check=False, capture_output=True)

        
        update_progress(job_id, 100, "Completed!")
        
    except subprocess.CalledProcessError as e:
        err_bytes = e.stderr if e.stderr else (e.stdout if e.stdout else b'')
        err_msg = err_bytes.decode('utf-8') if isinstance(err_bytes, bytes) else str(err_bytes)
        display_err = err_msg if len(err_msg) < 1000 else f"{err_msg[:500]} ... {err_msg[-500:]}"
        update_progress(job_id, -1, f"Process Failed: {display_err}")
        sys.exit(1)
    except Exception as e:
        update_progress(job_id, -1, f"Error: {str(e)}")
        sys.exit(1)

if __name__ == "__main__":
    main()
