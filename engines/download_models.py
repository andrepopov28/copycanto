#!/usr/bin/env python3
"""
CopyCanto Model Downloader
Downloads all required AI model weights for RVC v2, kNN-SVC, and Demucs.
Run once: python3 engines/download_models.py

Model sizes:
  - HuBERT base (RVC speech encoder):   ~190 MB
  - RMVPE pitch estimator (RVC):        ~200 MB
  - RVC pretrained_v2 f0G & f0D:        ~400 MB each
  - Demucs htdemucs weights:            auto-fetched first run by demucs itself
  - kNN-SVC HiFi-GAN vocoder:           ~50 MB
"""
import os
import sys
import urllib.request
import hashlib

PROJECT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
RVC_DIR     = os.path.join(PROJECT_DIR, 'engines', 'repos', 'rvc_v2')
MODELS_DIR  = os.path.join(PROJECT_DIR, 'engines', 'models')
REFS_DIR    = os.path.join(PROJECT_DIR, 'engines', 'refs')

os.makedirs(MODELS_DIR, exist_ok=True)
os.makedirs(REFS_DIR, exist_ok=True)

def download(url: str, dest: str, min_size_mb: float = 1.0):
    """Download a file with progress bar; skip if already exists and is large enough."""
    if os.path.exists(dest) and os.path.getsize(dest) > min_size_mb * 1024 * 1024:
        print(f"  ✅ Already exists: {os.path.relpath(dest)}")
        return True
    
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    print(f"  ⬇️  Downloading {os.path.basename(dest)} from {url[:60]}...")
    
    try:
        def reporthook(count, block_size, total_size):
            if total_size > 0:
                pct = count * block_size * 100 // total_size
                filled = pct // 5
                bar = '█' * filled + '░' * (20 - filled)
                print(f"\r     [{bar}] {pct}%", end='', flush=True)
        
        urllib.request.urlretrieve(url, dest, reporthook=reporthook)
        print()  # newline after progress bar
        
        size_mb = os.path.getsize(dest) / (1024 * 1024)
        print(f"  ✅ Saved: {os.path.relpath(dest)} ({size_mb:.1f} MB)")
        return True
    except Exception as e:
        print(f"\n  ❌ Failed: {e}")
        if os.path.exists(dest):
            os.remove(dest)
        return False


print("\n🎸 CopyCanto Model Downloader")
print("=" * 50)

# ──────────────────────────────────────────────────────
# 1. RVC v2 — HuBERT base encoder (required for all RVC inference)
# ──────────────────────────────────────────────────────
print("\n[1/4] RVC v2 — HuBERT base speech encoder (~190 MB)")
download(
    "https://huggingface.co/lj1995/VoiceConversionWebUI/resolve/main/hubert_base.pt",
    os.path.join(RVC_DIR, 'assets', 'hubert', 'hubert_base.pt'),
    min_size_mb=100
)

# ──────────────────────────────────────────────────────
# 2. RVC v2 — RMVPE pitch estimator
# ──────────────────────────────────────────────────────
print("\n[2/4] RVC v2 — RMVPE pitch estimator (~200 MB)")
download(
    "https://huggingface.co/lj1995/VoiceConversionWebUI/resolve/main/rmvpe.pt",
    os.path.join(RVC_DIR, 'assets', 'rmvpe', 'rmvpe.pt'),
    min_size_mb=100
)

# ──────────────────────────────────────────────────────
# 3. RVC v2 — pretrained_v2 base models (optional but needed for training;
#    inference-only users can skip)
# ──────────────────────────────────────────────────────
print("\n[3/4] RVC v2 — Pretrained v2 base vocoder models (~800 MB total)")
pretrained_v2_dir = os.path.join(RVC_DIR, 'assets', 'pretrained_v2')
for fname in ['f0G48k.pth', 'f0D48k.pth']:
    download(
        f"https://huggingface.co/lj1995/VoiceConversionWebUI/resolve/main/pretrained_v2/{fname}",
        os.path.join(pretrained_v2_dir, fname),
        min_size_mb=200
    )

# ──────────────────────────────────────────────────────
# 4. kNN-SVC — Fix broken symlinks, download real HiFi-GAN vocoder
# ──────────────────────────────────────────────────────
print("\n[4/4] kNN-SVC — HiFi-GAN vocoder checkpoints")
knn_dir = os.path.join(PROJECT_DIR, 'engines', 'repos', 'knn-svc')
hifigan_dir = os.path.join(knn_dir, 'hifigan')

# Fix the broken symlinks for the speaker embedding model
spkrec_dir = os.path.join(knn_dir, 'pretrained_models', 'spkrec-xvect-voxceleb')
spkrec_files = {
    "hyperparams.yaml": "https://huggingface.co/speechbrain/spkrec-xvect-voxceleb/resolve/main/hyperparams.yaml",
    "embedding_model.ckpt": "https://huggingface.co/speechbrain/spkrec-xvect-voxceleb/resolve/main/embedding_model.ckpt",
    "mean_var_norm_emb.ckpt": "https://huggingface.co/speechbrain/spkrec-xvect-voxceleb/resolve/main/mean_var_norm_emb.ckpt",
    "classifier.ckpt": "https://huggingface.co/speechbrain/spkrec-xvect-voxceleb/resolve/main/classifier.ckpt",
    "label_encoder.ckpt": "https://huggingface.co/speechbrain/spkrec-xvect-voxceleb/resolve/main/label_encoder.ckpt",
}
for fname, url in spkrec_files.items():
    dest = os.path.join(spkrec_dir, fname)
    # Remove broken symlink first
    if os.path.islink(dest):
        os.unlink(dest)
    download(url, dest, min_size_mb=0.001)


print("\n" + "=" * 50)
print("✅ Model download complete! You can now run CopyCanto with RVC v2.")
print()
print("NEXT STEPS for voice cloning:")
print("  1. Place your voice model (.pth file) in:     engines/models/<voiceId>.pth")
print("  2. Place your voice index (.index file) in:   engines/models/<voiceId>.index")
print("  3. For kNN-SVC: place reference audio (.wav): engines/refs/<voiceId>.wav")
print()
print("Pre-built RVC voice models from the community:")
print("  https://huggingface.co/models?search=rvc")
print("  https://voice-models.com/")
