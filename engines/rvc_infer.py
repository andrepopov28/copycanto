"""
engines/rvc_infer.py
====================
Self-contained RVC v2 inference script for CopyCanto.

This script fully controls all required environment variables BEFORE importing
any RVC modules, so that:
  - weight_root is NOT overwritten by .env's relative path "assets/weights"
  - rmvpe_root, index_root, outside_index_root are set correctly
  - Config() singleton is not polluted by argparse from infer-web.py

Usage (called directly from process.py via subprocess):
    python3 engines/rvc_infer.py \
        --model_path /abs/path/to/elton_john.pth \
        --input_path /abs/path/to/vocals.wav \
        --output_path /abs/path/to/output.wav \
        [--index_path /abs/path/to/elton_john.index] \
        [--f0_key 0] \
        [--f0_method harvest] \
        [--index_rate 0.75] \
        [--filter_radius 3] \
        [--protect 0.33] \
        [--device cpu]
"""

import argparse
import sys
import os

def parse_args():
    parser = argparse.ArgumentParser(description="RVC v2 inference")
    parser.add_argument("--model_path", required=True, help="Absolute path to .pth voice model")
    parser.add_argument("--input_path", required=True, help="Absolute path to input vocal wav (16kHz mono)")
    parser.add_argument("--output_path", required=True, help="Absolute path for output wav")
    parser.add_argument("--index_path", default="", help="Absolute path to .index file (optional)")
    parser.add_argument("--f0_key", type=int, default=0, help="Pitch shift in semitones (0 = no shift)")
    parser.add_argument("--f0_method", default="harvest", choices=["pm", "harvest", "crepe", "rmvpe"],
                        help="Pitch extraction method")
    parser.add_argument("--index_rate", type=float, default=0.75, help="Feature index retrieval rate (0-1)")
    parser.add_argument("--filter_radius", type=int, default=3, help="Median filter radius for pitch smoothing")
    parser.add_argument("--resample_sr", type=int, default=0, help="Output resample rate (0=keep model rate)")
    parser.add_argument("--rms_mix_rate", type=float, default=0.25, help="Volume envelope mix (0=input, 1=output)")
    parser.add_argument("--protect", type=float, default=0.33, help="Protect unvoiced consonants (0-0.5)")
    parser.add_argument("--device", default="cpu", help="Inference device: cpu, cuda, mps")
    return parser.parse_args()


def main():
    args = parse_args()

    # -------------------------------------------------------------------------
    # 1. Validate inputs BEFORE any imports that trigger GPU/model init
    # -------------------------------------------------------------------------
    if not os.path.isfile(args.model_path):
        print(f"[ERROR] Model not found: {args.model_path}", file=sys.stderr)
        sys.exit(1)
    if os.path.getsize(args.model_path) < 1_000_000:
        print(f"[ERROR] Model file too small ({os.path.getsize(args.model_path)} bytes) — is it a placeholder? {args.model_path}", file=sys.stderr)
        sys.exit(1)
    if not os.path.isfile(args.input_path):
        print(f"[ERROR] Input audio not found: {args.input_path}", file=sys.stderr)
        sys.exit(1)

    # -------------------------------------------------------------------------
    # 2. Resolve the RVC repo root from this script's location
    # -------------------------------------------------------------------------
    script_dir = os.path.dirname(os.path.abspath(__file__))
    rvc_root = os.path.join(script_dir, "repos", "rvc_v2")

    if not os.path.isdir(rvc_root):
        print(f"[ERROR] RVC repo not found at: {rvc_root}", file=sys.stderr)
        sys.exit(1)

    # -------------------------------------------------------------------------
    # 3. Set ALL required env vars BEFORE any dot-env or RVC import can clobber them
    #    These mirror what .env sets but with correct absolute paths.
    # -------------------------------------------------------------------------
    # weight_root: directory containing .pth files
    weight_root = os.path.dirname(args.model_path)
    os.environ["weight_root"]           = weight_root
    os.environ["weight_uvr5_root"]      = os.path.join(rvc_root, "assets", "uvr5_weights")
    os.environ["index_root"]            = os.path.join(rvc_root, "logs")
    os.environ["outside_index_root"]    = os.path.join(rvc_root, "assets", "indices")
    os.environ["rmvpe_root"]            = os.path.join(rvc_root, "assets", "rmvpe")
    # Disable half-precision on CPU — float32 only
    os.environ["PYTORCH_ENABLE_MPS_FALLBACK"] = "1"
    # Suppress OpenBLAS thread flooding
    os.environ["OPENBLAS_NUM_THREADS"] = "1"
    # Fix: macOS fairseq + torch both load libomp.dylib → SIGABRT without this
    os.environ["KMP_DUPLICATE_LIB_OK"] = "TRUE"

    # -------------------------------------------------------------------------
    # 4. Add RVC to sys.path and change working dir so relative asset paths work
    # -------------------------------------------------------------------------
    sys.path.insert(0, rvc_root)
    os.chdir(rvc_root)

    # -------------------------------------------------------------------------
    # 5. Clear sys.argv so Config()'s arg_parse() doesn't pick up our args
    # -------------------------------------------------------------------------
    sys.argv = [sys.argv[0]]  # arg_parse in Config reads sys.argv; clear it

    # -------------------------------------------------------------------------
    # 6. Now import RVC modules (env vars are already set, sys.argv is clean)
    # -------------------------------------------------------------------------
    import logging
    logging.basicConfig(level=logging.INFO)
    logger = logging.getLogger("rvc_infer")

    import numpy as np
    import torch
    from scipy.io import wavfile

    logger.info(f"Loading RVC config (device={args.device})...")
    from configs.config import Config
    config = Config()
    # Override device and precision explicitly
    config.device = args.device
    config.is_half = False  # Force float32 — required for stable CPU inference

    logger.info(f"Config ready. Device={config.device}, half={config.is_half}")

    # -------------------------------------------------------------------------
    # 7. Load model and run inference
    # -------------------------------------------------------------------------
    from infer.modules.vc.modules import VC

    vc = VC(config)
    model_filename = os.path.basename(args.model_path)  # e.g. "elton_john.pth"
    logger.info(f"Loading voice model: {model_filename} from {weight_root}")
    vc.get_vc(model_filename)
    logger.info(f"Model loaded. Version={vc.version}, target_sr={vc.tgt_sr}, if_f0={vc.if_f0}")

    # Resolve index path
    index_path = args.index_path
    if index_path and not os.path.isfile(index_path):
        logger.warning(f"Index file not found, running without index: {index_path}")
        index_path = ""

    logger.info(f"Running voice conversion: {args.input_path} -> {args.output_path}")
    logger.info(f"  f0_method={args.f0_method}, f0_key={args.f0_key}, index_rate={args.index_rate}, protect={args.protect}")

    result = vc.vc_single(
        sid=0,
        input_audio_path=args.input_path,
        f0_up_key=args.f0_key,
        f0_file=None,
        f0_method=args.f0_method,
        file_index=index_path,
        file_index2=None,
        index_rate=args.index_rate,
        filter_radius=args.filter_radius,
        resample_sr=args.resample_sr,
        rms_mix_rate=args.rms_mix_rate,
        protect=args.protect,
    )

    if isinstance(result, tuple):
        info, wav_opt = result
    else:
        info = str(result)
        wav_opt = None

    if wav_opt is None or (isinstance(wav_opt, tuple) and len(wav_opt) < 2):
        print(f"[ERROR] vc_single returned no audio. Info: {info}", file=sys.stderr)
        sys.exit(1)

    sr_out, audio_out = wav_opt[0], wav_opt[1]
    os.makedirs(os.path.dirname(os.path.abspath(args.output_path)), exist_ok=True)
    wavfile.write(args.output_path, sr_out, audio_out)
    logger.info(f"[SUCCESS] Output written: {args.output_path} ({sr_out}Hz, {len(audio_out)} samples)")
    print(f"SUCCESS:{args.output_path}")


if __name__ == "__main__":
    main()
