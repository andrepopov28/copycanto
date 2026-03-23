# RVC v2 High-Quality Inference Guide

To achieve the highest quality voice clones with RVC v2, follow these guidelines for inference.

## 1. Pitch Extraction Algorithm (f0 Method)
**Recommended: RMVPE**
- **RMVPE (Robust Minimum Vice-Pitch Estimation)** is currently the state-of-the-art for RVC v2. 
- It provides much higher accuracy and cleaner pitch tracking compared to `pm`, `harvest`, or `dio`.
- It is also faster than `harvest`.

## 2. Retrieval Settings (Index)
The `.index` file is a FAISS retrieval index of the training features. It helps the model match the input vocal timbre to the target voice more accurately.
- **Index Rate**: Recommended **0.75**. 
  - A higher rate (closer to 1.0) increases the similarity to the target voice but can introduce artifacts if the training data wasn't perfectly clean.
  - A lower rate (around 0.2 - 0.5) makes it smoother but less like the target.
- **Search Method**: Usually automatic if the `.index` file path is provided.

## 3. Voice Protection
- **Protect Value**: Recommended **0.33**.
  - This protects the breath sounds and consonant clarity. 
  - Setting it too high can leak the original voice; setting it too low can make the output sound "robotic" or muffled during breaths.

## 4. Output Configuration
- **Sample Rate**: Always use **48000 Hz** (48k) for maximum fidelity.
- **Filtering**: Keep default filters unless specific noise issues occur.

## 5. Pre-processing
- **Stem Separation**: Use Demucs v4 or MDX-Net to separate vocals from accompaniment before inference. 
- **Denoiser**: Ensure the input vocal is clean. Use a denoiser if necessary before running RVC.

---
*Last updated for CopyCanto Local App - March 22, 2026*
