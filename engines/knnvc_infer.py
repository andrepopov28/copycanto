"""
CopyCanto KNN-VC High Quality Inference Engine
================================================
Uses bshall/knn-vc (WavLM-Large + HiFi-GAN) to perform voice conversion.
Supports a directory of reference files for richer kNN matching (reference pooling).

Usage:
    python engines/knnvc_infer.py <src_wav> <ref_dir_or_wav> <out_wav> [--topk 4]
"""
import os
import sys
import argparse
import tempfile
import shutil

os.environ["OMP_NUM_THREADS"] = "1"
os.environ["KMP_DUPLICATE_LIB_OK"] = "TRUE"

import torch
import torchaudio
import torchaudio.transforms as T
import soundfile as sf


def load_and_resample(wav_path: str, target_sr: int = 16000):
    """Load any audio file (WAV or MP3) and resample to target_sr mono."""
    try:
        # Try soundfile first (handles WAV reliably)
        wav, sr = sf.read(wav_path)
        wav = torch.from_numpy(wav).float()
        if len(wav.shape) > 1:
            wav = wav.mean(dim=-1)  # stereo -> mono
    except Exception:
        # Fallback to torchaudio for MP3/other formats
        wav, sr = torchaudio.load(wav_path)
        if wav.shape[0] > 1:
            wav = wav.mean(dim=0)  # stereo -> mono
        else:
            wav = wav.squeeze(0)
    
    wav = wav.unsqueeze(0)  # (1, samples) for Resample
    if sr != target_sr:
        resampler = T.Resample(sr, target_sr)
        wav = resampler(wav)
    return wav.squeeze(0), target_sr  # (samples,)


def collect_ref_paths(ref_arg: str):
    """Return a list of audio file paths from a file or directory."""
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
    parser = argparse.ArgumentParser(description="KNN-VC High Quality Inference")
    parser.add_argument("src", help="Source vocals WAV file")
    parser.add_argument("ref", help="Reference voice file or directory")
    parser.add_argument("out", help="Output WAV path")
    parser.add_argument("--topk", type=int, default=4, help="kNN top-k neighbours (default: 4, max quality)")
    args = parser.parse_args()

    # Resolve reference files
    ref_paths = collect_ref_paths(args.ref)
    if not ref_paths:
        print(f"Error: No audio files found at: {args.ref}", file=sys.stderr)
        sys.exit(1)
    print(f"[KNN-VC] Using {len(ref_paths)} reference file(s) from: {args.ref}")

    # Load model (CPU to avoid MPS float64 issues on Apple Silicon)
    print("[KNN-VC] Loading bshall/knn-vc model...")
    device = torch.device("cpu")
    knn_vc = torch.hub.load(
        "bshall/knn-vc", "knn_vc",
        prematched=True,
        trust_repo=True,
        pretrained=True,
        device=device
    )

    # Use a temp directory to avoid collisions when running parallel jobs
    tmp_dir = tempfile.mkdtemp(prefix="knnvc_")
    try:
        # Prepare source at 16kHz
        print(f"[KNN-VC] Loading source: {args.src}")
        src_wav, _ = load_and_resample(args.src)
        tmp_src = os.path.join(tmp_dir, "src_16k.wav")
        torchaudio.save(tmp_src, src_wav.unsqueeze(0), 16000)

        # Prepare references at 16kHz
        tmp_refs = []
        for i, ref_path in enumerate(ref_paths):
            try:
                ref_wav, _ = load_and_resample(ref_path)
                tmp_ref = os.path.join(tmp_dir, f"ref_{i:03d}_16k.wav")
                torchaudio.save(tmp_ref, ref_wav.unsqueeze(0), 16000)
                tmp_refs.append(tmp_ref)
                print(f"[KNN-VC] Reference {i+1}/{len(ref_paths)} loaded: {os.path.basename(ref_path)}")
            except Exception as e:
                print(f"[KNN-VC] Warning: Skipping {ref_path}: {e}")

        if not tmp_refs:
            print("[KNN-VC] Error: No valid reference audio files could be loaded.", file=sys.stderr)
            sys.exit(1)

        # Feature extraction
        print("[KNN-VC] Extracting features from source...")
        query_seq = knn_vc.get_features(tmp_src)

        print(f"[KNN-VC] Building matching set from {len(tmp_refs)} reference(s)...")
        matching_set = knn_vc.get_matching_set(tmp_refs)

        # kNN matching + HiFi-GAN vocoder
        print(f"[KNN-VC] Running match() with topk={args.topk}...")
        out_wav = knn_vc.match(query_seq, matching_set, topk=args.topk)

        # Save output
        os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
        torchaudio.save(args.out, out_wav[None], 16000)
        print(f"[KNN-VC] Success. Output: {args.out}")

    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


if __name__ == "__main__":
    main()
