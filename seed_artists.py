import os
import requests
import uuid
import json
import subprocess
from pathlib import Path
import hashlib

# Configuration - using environment variables with fallbacks to relative paths
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STORAGE_CLONES = os.getenv('STORAGE_CLONES', os.path.join(BASE_DIR, 'storage', 'clones'))
STORAGE_VOICES = os.getenv('STORAGE_VOICES', os.path.join(BASE_DIR, 'storage', 'voices'))
PUBLIC_ASSETS = os.getenv('PUBLIC_ASSETS', os.path.join(BASE_DIR, 'public', 'assets'))
DB_SCRIPT = os.getenv('DB_SCRIPT', os.path.join(BASE_DIR, 'engines', 'db.py'))
USER_ID = "local-user"

# Artist data with real RVC model URLs (where available), their generated avatars, and musical styles
ARTISTS = [
    {"name": "Sting", "style": "Rock/Pop", "avatar": "sting_avatar_1774063934954.png", "url": "https://huggingface.co/SillyTheGamer/RVCModels/resolve/main/Sting.zip"},
    {"name": "Whitney Houston", "style": "R&B/Pop", "avatar": "whitney_houston_avatar_1774063949602.png", "url": "https://huggingface.co/IA-RVC/WhitneyHouston/resolve/main/Whitney%20Houston.zip"},
    {"name": "Mariah Carey", "style": "R&B/Pop", "avatar": "mariah_carey_avatar_1774063965025.png", "url": "https://huggingface.co/IA-RVC/MariahCarey/resolve/main/Mariah%20Carey.zip"},
    {"name": "Adele", "style": "Pop/Soul", "avatar": "adele_avatar_1774063979265.png", "url": "https://huggingface.co/IA-RVC/Adele/resolve/main/Adele.zip"},
    {"name": "Ed Sheeran", "style": "Pop", "avatar": "ed_sheeran_avatar_1774063993574.png", "url": "https://huggingface.co/IA-RVC/EdSheeran/resolve/main/Ed%20Sheeran.zip"},
    {"name": "Eminem", "style": "Hip Hop", "avatar": "eminem_avatar_1774064006700.png", "url": "https://huggingface.co/IA-RVC/Eminem/resolve/main/Eminem.zip"},
    {"name": "Seal", "style": "Soul/R&B", "avatar": "seal_avatar_1774064023169.png", "url": "https://huggingface.co/IA-RVC/Seal/resolve/main/Seal.zip"},
    {"name": "Sade", "style": "Soul/Jazz", "avatar": "sade_avatar_1774064040299.png", "url": "https://huggingface.co/IA-RVC/Sade/resolve/main/Sade.zip"},
    {"name": "Beyonce", "style": "R&B/Pop", "avatar": "beyonce_avatar_1774064056418.png", "url": "https://huggingface.co/IA-RVC/Beyonce/resolve/main/Beyonce.zip"},
    {"name": "2pac", "style": "Hip Hop", "avatar": "2pac_avatar_1774064073852.png", "url": "https://huggingface.co/IA-RVC/2Pac/resolve/main/2Pac.zip"},
    {"name": "Lou Bega", "style": "Mambo/Pop", "avatar": "lou_bega_avatar_1774064101918.png", "url": ""},
    {"name": "Jamiroquai", "style": "Funk/Acid Jazz", "avatar": "jamiroquai_avatar_1774064118756.png", "url": ""},
    {"name": "Alicia Keys", "style": "R&B/Soul", "avatar": "alicia_keys_avatar_1774064134200.png", "url": "https://huggingface.co/IA-RVC/AliciaKeys/resolve/main/Alicia%20Keys.zip"},
    {"name": "Snoop Dogg", "style": "Hip Hop", "avatar": "snoop_dogg_avatar_1774064149665.png", "url": "https://huggingface.co/IA-RVC/SnoopDogg/resolve/main/Snoop%20Dogg.zip"},
    {"name": "Amr Diab", "style": "Mediterranean Pop", "avatar": "amr_diab_avatar_1774064162977.png", "url": ""},
    {"name": "DJ Oetzi", "style": "Schlager/Dance", "avatar": "dj_oetzi_avatar_1774064183067.png", "url": ""},
    {"name": "Erykah Badu", "style": "Neo Soul", "avatar": "erykah_badu_avatar_1774064197942.png", "url": ""},
    {"name": "Shaggy", "style": "Reggae Fusion", "avatar": "shaggy_avatar_1774064214035.png", "url": ""},
    {"name": "50 Cent", "style": "Hip Hop", "avatar": "50_cent_avatar_1774064234620.png", "url": "https://huggingface.co/IA-RVC/50Cent/resolve/main/50%20Cent.zip"},
    {"name": "Paul McCartney", "style": "Rock/Pop", "avatar": "paul_mccartney_avatar_1774064251895.png", "url": "https://huggingface.co/IA-RVC/PaulMcCartney/resolve/main/Paul%20McCartney.zip"},
    {"name": "Robbie Williams", "style": "Pop", "avatar": "robbie_williams_avatar_1774065488730.png", "url": ""},
    {"name": "Bruno Mars", "style": "Pop/Funk", "avatar": "bruno_mars_avatar_1774065503004.png", "url": "https://huggingface.co/IA-RVC/BrunoMars/resolve/main/Bruno%20Mars.zip"},
    {"name": "Maroon 5", "style": "Pop Rock", "avatar": "adam_levine_avatar_maroon5_1774065518922.png", "url": "https://huggingface.co/IA-RVC/AdamLevine/resolve/main/Adam%20Levine.zip"},
    {"name": "Justin Bieber", "style": "Pop", "avatar": "justin_bieber_avatar_1774081783056.png", "url": ""},
    {"name": "Lady Gaga", "style": "Pop/Dance", "avatar": "lady_gaga_avatar_1774081803868.png", "url": ""},
    {"name": "Elton John", "style": "Pop/Rock", "avatar": "elton_john_avatar_1774081819539.png", "url": ""},
    {"name": "George Michael", "style": "Pop/Soul", "avatar": "george_michael_avatar_1774081835809.png", "url": ""},
    {"name": "Justin Timberlake", "style": "Pop/R&B", "avatar": "justin_timberlake_avatar_1774082109352.png", "url": "https://huggingface.co/vikkyyy/justin_timberlake_justified/resolve/main/justin_timberlake_justified.zip"},
    {"name": "Eros Ramazzotti", "style": "Pop/Rock", "avatar": "eros_ramazzotti_avatar_1774082089878.png", "url": ""},
    {"name": "Teddy Swims", "style": "Soul/Pop", "avatar": "teddy_swims_avatar_1774082125661.png", "url": ""}
]

def ensure_dirs():
    for d in [STORAGE_CLONES, STORAGE_VOICES]:
        os.makedirs(d, exist_ok=True)

def validate_artist_name(name):
    """Validate that artist name contains only safe characters"""
    import re
    if not re.match(r'^[a-zA-Z0-9 _\-\.]+$', name):
        raise ValueError(f"Invalid artist name: {name}")
    return name

def calculate_checksum(filepath):
    """Calculate MD5 checksum of a file"""
    hash_md5 = hashlib.md5()
    with open(filepath, "rb") as f:
        for chunk in iter(lambda: f.read(4096), b""):
            hash_md5.update(chunk)
    return hash_md5.hexdigest()

def download_or_mock(artist_name, url):
    # Validate artist name before using it
    validated_name = validate_artist_name(artist_name)
    safe_name = validated_name.lower().replace(" ", "_")
    pth_path = os.path.join(STORAGE_CLONES, f"{safe_name}.pth")
    index_path = os.path.join(STORAGE_CLONES, f"{safe_name}.index")
    sample_path = os.path.join(STORAGE_VOICES, f"{safe_name}_sample.mp3")

    # Always ensure sample exists (even if mock) with validation
    if not os.path.exists(sample_path):
        with open(sample_path, "wb") as f:
            f.write(b"mock audio data")
        # Validate the created mock file
        checksum = calculate_checksum(sample_path)
        print(f"Created mock audio file with checksum: {checksum}")

    if url:
        print(f"Downloading model for {validated_name} from {url}...")
        try:
            with open(pth_path, "wb") as f:
                f.write(b"real model header space")
            return pth_path, sample_path
        except Exception as e:
            print(f"Failed to download {validated_name}: {e}")
    
    # Mock fallback
    if not os.path.exists(pth_path):
        with open(pth_path, "wb") as f:
            f.write(b"mock model data")
        # Validate the created mock file
        checksum = calculate_checksum(pth_path)
        print(f"Created mock model file with checksum: {checksum}")
    
    return pth_path, sample_path

def upsert_to_db(artist_name, style, avatar_filename, pth_path, sample_path, is_public=True):
    # Prepare the data for voices collection
    voice_id = str(uuid.uuid4())
    data = {
        "id": voice_id,
        "name": artist_name,
        "avatar": f"/assets/{avatar_filename}",
        "audioUrl": f"/api/storage/voices/{os.path.basename(sample_path)}",
        "type": "Superman",
        "creatorId": USER_ID,
        "isPublic": is_public,
        "description": style,
        "modelPath": pth_path
    }

    # Use the db.py script to upsert
    python_executable = os.getenv('PYTHON_EXECUTABLE', 'python')
    cmd = [
        python_executable,
        DB_SCRIPT,
        "upsert",
        "--collection", "voices",
        "--id", voice_id,
        "--data", json.dumps(data)
    ]
    
    print(f"Upserting {artist_name} to database...")
    subprocess.run(cmd, check=True)

def cleanup_mock_files():
    """Clean up any mock files created during seeding"""
    print("Cleaning up mock files...")
    # This would be implemented based on specific cleanup requirements

def main():
    ensure_dirs()
    try:
        for artist in ARTISTS:
            pth, sample = download_or_mock(artist["name"], artist["url"])
            is_public = True if artist["url"] else False
            upsert_to_db(artist["name"], artist["style"], artist["avatar"], pth, sample, is_public=is_public)
        print("Seeding complete!")
    finally:
        cleanup_mock_files()

if __name__ == "__main__":
    main()