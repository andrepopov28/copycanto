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

def load_and_resample(wav_path: str, target_sr: int = 44100):
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
    
    tmp_dir = tempfile.mkdtemp(prefix="amphion_")
    try:
        print(f"[Amphion] Loading source: {args.src}")
        src_wav, _ = load_and_resample(args.src, 44100)
        tmp_src = os.path.join(tmp_dir, "src_44k.wav")
        sf.write(tmp_src, src_wav.numpy(), 44100)

        refs_wavs = []
        for i, ref_path in enumerate(ref_paths):
            try:
                rw, _ = load_and_resample(ref_path, 44100)
                refs_wavs.append(rw)
                print(f"[Amphion] Loaded ref {i+1}/{len(ref_paths)}: {os.path.basename(ref_path)}")
            except Exception as e:
                print(f"[Amphion] Warning: Skipping {ref_path}: {e}")
        
        if not refs_wavs:
            print("[Amphion] Error: No valid reference audio", file=sys.stderr)
            sys.exit(1)
            
        combined_ref = torch.cat(refs_wavs, dim=0)
        tmp_ref = os.path.join(tmp_dir, "ref_44k.wav")
        sf.write(tmp_ref, combined_ref.numpy(), 44100)

        amphion_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "repos", "Amphion"))
        out_abs_path = os.path.abspath(args.out)
        
        bridge_script = os.path.join(tmp_dir, "bridge.py")
        with open(bridge_script, "w") as f:
            f.write(f"""
import sys
import os
sys.path.append(r"{amphion_dir}")
from models.svc.vevosing.infer_vevosing_fm import load_inference_pipeline
from models.svc.vevosing.vevosing_utils import save_audio

print("[Amphion Bridge] Loading pipeline...")
pipeline = load_inference_pipeline()
print("[Amphion Bridge] Running inference...")
gen_audio = pipeline.inference_fm(
    src_wav_path=r"{tmp_src}",
    timbre_ref_wav_path=r"{tmp_ref}",
    use_shifted_src_to_extract_prosody=True,
    flow_matching_steps=32,
)
print("[Amphion Bridge] Saving audio...")
save_audio(gen_audio, output_path=r"{out_abs_path}")
print("[Amphion Bridge] Done.")
""")
        
        print(f"[Amphion] Running inference bridge...")
        res = subprocess.run([sys.executable, bridge_script], cwd=amphion_dir)
        if res.returncode != 0:
            print("[Amphion] Inference failed", file=sys.stderr)
            sys.exit(res.returncode)
            
        print(f"[Amphion] Success. Output at {args.out}")

    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)

if __name__ == "__main__":
    main()
