import os
import sys
import argparse
import tempfile
import shutil
import subprocess

import torch
import torchaudio
import torchaudio.transforms as T
import soundfile as sf

def load_and_resample(wav_path: str, target_sr: int = 24000):
    try:
        wav, sr = sf.read(wav_path)
        wav = torch.from_numpy(wav).float()
        if len(wav.shape) > 1:
            wav = wav.mean(dim=-1)
    except Exception:
        wav, sr = torchaudio.load(wav_path)
        if wav.shape[0] > 1:
            wav = wav.mean(dim=0)
        else:
            wav = wav.squeeze(0)
    
    wav = wav.unsqueeze(0)
    if sr != target_sr:
        resampler = T.Resample(sr, target_sr)
        wav = resampler(wav)
    return wav.squeeze(0), target_sr

def collect_ref_paths(ref_arg: str):
    AUDIO_EXTS = {".wav", ".mp3", ".flac"}
    if os.path.isdir(ref_arg):
        paths = []
        for f in sorted(os.listdir(ref_arg)):
            if os.path.splitext(f)[1].lower() in AUDIO_EXTS:
                paths.append(os.path.join(ref_arg, f))
        return paths
    else:
        return [ref_arg]

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("src", help="Source vocals WAV file")
    parser.add_argument("ref", help="Reference voice file or directory")
    parser.add_argument("out", help="Output WAV path")
    args = parser.parse_args()

    ref_paths = collect_ref_paths(args.ref)
    if not ref_paths:
        print(f"Error: No audio files found at: {args.ref}", file=sys.stderr)
        sys.exit(1)
    
    tmp_dir = tempfile.mkdtemp(prefix="neucosvc_")
    try:
        print(f"[NeuCoSVC] Loading source: {args.src}")
        src_wav, _ = load_and_resample(args.src, 24000)
        tmp_src = os.path.join(tmp_dir, "src_24k.wav")
        sf.write(tmp_src, src_wav.numpy(), 24000)

        refs_wavs = []
        for i, ref_path in enumerate(ref_paths):
            try:
                rw, _ = load_and_resample(ref_path, 24000)
                refs_wavs.append(rw)
                print(f"[NeuCoSVC] Loaded ref {i+1}/{len(ref_paths)}: {os.path.basename(ref_path)}")
            except Exception as e:
                print(f"[NeuCoSVC] Warning: Skipping {ref_path}: {e}")
        
        if not refs_wavs:
            print("[NeuCoSVC] Error: No valid reference audio", file=sys.stderr)
            sys.exit(1)
            
        combined_ref = torch.cat(refs_wavs, dim=0)
        tmp_ref = os.path.join(tmp_dir, "ref_24k.wav")
        sf.write(tmp_ref, combined_ref.numpy(), 24000)

        neucosvc_dir = os.path.join(os.path.dirname(__file__), "repos", "NeuCoSVC")
        out_abs_path = os.path.abspath(args.out)
        
        cmd = [
            sys.executable, "infer.py",
            "--src_wav_path", tmp_src,
            "--ref_wav_path", tmp_ref,
            "--out_path", out_abs_path
        ]
        
        print(f"[NeuCoSVC] Running inference...")
        res = subprocess.run(cmd, cwd=neucosvc_dir)
        if res.returncode != 0:
            print("[NeuCoSVC] Inference failed", file=sys.stderr)
            sys.exit(res.returncode)
            
        print(f"[NeuCoSVC] Success. Output at {args.out}")

    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)

if __name__ == "__main__":
    main()
