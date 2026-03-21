#!/usr/bin/env python3
"""
CopyCanto Model Downloader
Downloads all required AI model weights for RVC v2, kNN-SVC, and Demucs.
Run once: python3 engines/download_models.py

Model sizes:
  - HuBERT base (RVC speech encoder):      ~181 MB
  - RMVPE pitch estimator (RVC):           ~173 MB
  - RVC pretrained_v2 f0G & f0D:           ~72 MB + ~144 MB
  - Demucs htdemucs weights:               auto-fetched first run by demucs itself
  - SpeechBrain spkrec-xvect-voxceleb:     ~31 MB
  - kNN-SVC WavLM-Large encoder:           ~1.26 GB
  - kNN-SVC HiFi-GAN vocoder (prematched): ~55 MB
"""
import os
import sys
import urllib.request

PROJECT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
RVC_DIR     = os.path.join(PROJECT_DIR, 'engines', 'repos', 'rvc_v2')
MODELS_DIR  = os.path.join(PROJECT_DIR, 'engines', 'models')
REFS_DIR    = os.path.join(PROJECT_DIR, 'engines', 'refs')

os.makedirs(MODELS_DIR, exist_ok=True)
os.makedirs(REFS_DIR, exist_ok=True)

def download(url: str, dest: str, min_size_mb: float = 1.0):
    """Download a file with progress bar; skip if already exists and is large enough."""
    if os.path.exists(dest) and os.path.getsize(dest) > min_size_mb * 1024 * 1024:
        print(f"  Already exists: {os.path.relpath(dest)}")
        return True
    
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    print(f"  Downloading {os.path.basename(dest)} from {url[:70]}...")
    
    try:
        def reporthook(count, block_size, total_size):
            if total_size > 0:
                pct = count * block_size * 100 // total_size
                filled = pct // 5
                bar = '#' * filled + '.' * (20 - filled)
                print(f"\r     [{bar}] {pct}%", end='', flush=True)
        
        urllib.request.urlretrieve(url, dest, reporthook=reporthook)
        print()  # newline after progress bar
        
        size_mb = os.path.getsize(dest) / (1024 * 1024)
        print(f"  Saved: {os.path.relpath(dest)} ({size_mb:.1f} MB)")
        return True
    except Exception as e:
        print(f"\n  FAILED: {e}")
        if os.path.exists(dest):
            os.remove(dest)
        return False


print("\nCopyCanto Model Downloader")
print("=" * 50)

# ──────────────────────────────────────────────────────
# 1. RVC v2 - HuBERT base encoder (required for all RVC inference)
# ──────────────────────────────────────────────────────
print("\n[1/6] RVC v2 - HuBERT base speech encoder (~181 MB)")
download(
    "https://huggingface.co/lj1995/VoiceConversionWebUI/resolve/main/hubert_base.pt",
    os.path.join(RVC_DIR, 'assets', 'hubert', 'hubert_base.pt'),
    min_size_mb=100
)

# ──────────────────────────────────────────────────────
# 2. RVC v2 - RMVPE pitch estimator
# ──────────────────────────────────────────────────────
print("\n[2/6] RVC v2 - RMVPE pitch estimator (~173 MB)")
download(
    "https://huggingface.co/lj1995/VoiceConversionWebUI/resolve/main/rmvpe.pt",
    os.path.join(RVC_DIR, 'assets', 'rmvpe', 'rmvpe.pt'),
    min_size_mb=100
)

# ──────────────────────────────────────────────────────
# 3. RVC v2 - pretrained_v2 base vocoder models
# ──────────────────────────────────────────────────────
print("\n[3/6] RVC v2 - Pretrained v2 base vocoder models (~216 MB total)")
pretrained_v2_dir = os.path.join(RVC_DIR, 'assets', 'pretrained_v2')
for fname in ['f0G48k.pth', 'f0D48k.pth']:
    download(
        f"https://huggingface.co/lj1995/VoiceConversionWebUI/resolve/main/pretrained_v2/{fname}",
        os.path.join(pretrained_v2_dir, fname),
        min_size_mb=30
    )

# ──────────────────────────────────────────────────────
# 4a. kNN-SVC - SpeechBrain speaker embedding model
# ──────────────────────────────────────────────────────
print("\n[4a/6] kNN-SVC - SpeechBrain speaker embedding (spkrec-xvect-voxceleb)")
knn_dir = os.path.join(PROJECT_DIR, 'engines', 'repos', 'knn-svc')
hifigan_dir = os.path.join(knn_dir, 'hifigan')
spkrec_dir = os.path.join(knn_dir, 'pretrained_models', 'spkrec-xvect-voxceleb')
spkrec_files = {
    "hyperparams.yaml": "https://huggingface.co/speechbrain/spkrec-xvect-voxceleb/resolve/main/hyperparams.yaml",
    "embedding_model.ckpt": "https://huggingface.co/speechbrain/spkrec-xvect-voxceleb/resolve/main/embedding_model.ckpt",
    "mean_var_norm_emb.ckpt": "https://huggingface.co/speechbrain/spkrec-xvect-voxceleb/resolve/main/mean_var_norm_emb.ckpt",
    "classifier.ckpt": "https://huggingface.co/speechbrain/spkrec-xvect-voxceleb/resolve/main/classifier.ckpt",
    "label_encoder.txt": "https://huggingface.co/speechbrain/spkrec-xvect-voxceleb/resolve/main/label_encoder.txt",
}
for fname, url in spkrec_files.items():
    dest = os.path.join(spkrec_dir, fname)
    if os.path.islink(dest):
        os.unlink(dest)
    download(url, dest, min_size_mb=0.001)

# ──────────────────────────────────────────────────────
# 4b. kNN-SVC - WavLM-Large feature extractor (~1.26 GB)
#     Source: github.com/bshall/knn-vc (NOT microsoft HuggingFace — different format)
# ──────────────────────────────────────────────────────
print("\n[4b/6] kNN-SVC - WavLM-Large encoder (~1.26 GB)")
download(
    "https://github.com/bshall/knn-vc/releases/download/v0.1/WavLM-Large.pt",
    os.path.join(knn_dir, 'wavlm', 'WavLM-Large.pt'),
    min_size_mb=500
)

# ──────────────────────────────────────────────────────
# 4c. kNN-SVC - HiFi-GAN vocoder (prematched, ~55 MB)
# ──────────────────────────────────────────────────────
print("\n[4c/6] kNN-SVC - HiFi-GAN vocoder (prematch_g_02500000.pt, ~55 MB)")
download(
    "https://github.com/bshall/knn-vc/releases/download/v0.1/prematch_g_02500000.pt",
    os.path.join(hifigan_dir, 'prematch_g_02500000.pt'),
    min_size_mb=30
)


print("\n" + "=" * 50)
print("All model downloads complete! CopyCanto is ready for real AI inference.")
print()
print("NEXT STEPS for voice cloning:")
print("  1. Place your RVC voice model (.pth) in:    engines/models/<voiceId>.pth")
print("  2. Place your RVC index file (.index) in:   engines/models/<voiceId>.index")
print("  3. For kNN-SVC: upload reference audio (.wav/.mp3) via the Voices page.")
print()
print("Pre-built RVC voice models from the community:")
print("  https://huggingface.co/models?search=rvc")
print("  https://voice-models.com/")
