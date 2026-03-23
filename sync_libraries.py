import os
import json
import uuid
import datetime
import subprocess
import sys

# Add the current directory to sys.path to import engines.db
sys.path.append(os.getcwd())

def db_invoke(action, collection, data=None):
    """Simple wrapper to call engines/db.py since we can't easily import it as a module if it's not structured."""
    cmd = [sys.executable, "engines/db.py", action, "--collection", collection]
    if data:
        cmd.extend(["--data", json.dumps(data)])
    
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        if action == "list":
            return json.loads(result.stdout)
        return result.stdout
    except Exception as e:
        print(f"Error invoking db.py: {e}")
        return None

def sync_clones():
    print("--- Syncing Clones ---")
    storage_path = "storage/clones"
    if not os.path.exists(storage_path):
        print(f"Directory {storage_path} does not exist.")
        return

    # Get existing clones from DB
    existing_clones = db_invoke("list", "clones") or []
    existing_paths = {c.get("path") for c in existing_clones if c.get("path")}
    
    files = [f for f in os.listdir(storage_path) if f.endswith((".wav", ".mp3", ".flac"))]
    
    for filename in files:
        rel_path = f"storage/clones/{filename}"
        if rel_path not in existing_paths:
            print(f"Found orphaned clone: {filename}")
            # Create metadata
            clone_id = str(uuid.uuid4())
            name = filename.rsplit('.', 1)[0].replace('_', ' ').title()
            
            clone_data = {
                "id": clone_id,
                "name": name,
                "path": rel_path,
                "userId": "local-user",
                "createdAt": datetime.datetime.now().isoformat(),
                "type": "cloned",
                "status": "ready"
            }
            db_invoke("upsert", "clones", clone_data)
            print(f"  Inserted {name} into DB.")

def sync_covers():
    print("\n--- Syncing Covers ---")
    storage_path = "storage/covers"
    if not os.path.exists(storage_path):
        print(f"Directory {storage_path} does not exist.")
        return

    # Get existing covers from DB
    existing_covers = db_invoke("list", "covers") or []
    existing_paths = {c.get("outputPath") for c in existing_covers if c.get("outputPath")}
    
    files = [f for f in os.listdir(storage_path) if f.endswith((".wav", ".mp3", ".flac"))]
    
    for filename in files:
        rel_path = f"storage/covers/{filename}"
        if rel_path not in existing_paths:
            print(f"Found orphaned cover: {filename}")
            # Create metadata
            cover_id = str(uuid.uuid4())
            # Try to guess song/voice from filename if it follows a pattern (e.g. Song_Name_Voice_Name.wav)
            parts = filename.rsplit('.', 1)[0].split('_')
            title = filename.rsplit('.', 1)[0].replace('_', ' ').title()
            
            cover_data = {
                "id": cover_id,
                "title": title,
                "outputPath": rel_path,
                "userId": "local-user",
                "createdAt": datetime.datetime.now().isoformat(),
                "status": "completed",
                "engine": "unknown",
                "metadata": {
                    "source": "manual_sync"
                }
            }
            db_invoke("upsert", "covers", cover_data)
            print(f"  Inserted {title} into DB.")

if __name__ == "__main__":
    sync_clones()
    sync_covers()
    print("\nSync Complete!")
