import polars as pl
import os

db_dir = os.path.join(os.getcwd(), 'storage', 'db')
clones_path = os.path.join(db_dir, 'clones.parquet')
voices_path = os.path.join(db_dir, 'voices.parquet')

df_clones = pl.read_parquet(clones_path)
clones_list = [dict(zip(df_clones.columns, row)) for row in df_clones.iter_rows()]

asdis_entry = None
new_clones = []

for c in clones_list:
    if (c.get('title') or '').lower() == 'asdís'.lower() or (c.get('voiceId') or '').lower() == 'asdis'.lower():
        asdis_entry = {
            "id": "asdis",
            "name": "Asdís",
            "avatar": "/assets/asdis_avatar_1774063953518.png",
            "audioUrl": "/api/storage/voices/asdis_sample.mp3",
            "type": "Source Audio",
            "creatorId": "local-user",
            "isPublic": True,
            "description": "Pop Singer Source Audio",
            "modelPath": None,
            "archived": False
        }
    else:
        new_clones.append(c)

if asdis_entry:
    df_voices_new = pl.DataFrame([asdis_entry])
    tmp_path = voices_path + ".tmp"
    df_voices_new.write_parquet(tmp_path)
    os.replace(tmp_path, voices_path)
    
    df_clones_new = pl.DataFrame(new_clones)
    tmp_path2 = clones_path + ".tmp"
    df_clones_new.write_parquet(tmp_path2)
    os.replace(tmp_path2, clones_path)
    print("Recovered Asdis to voices and removed from clones.")
else:
    # If not found, just artificially re-insert it straight into voices.parquet
    asdis_entry = {
        "id": "asdis",
        "name": "Asdís",
        "avatar": "/assets/asdis_avatar_1774063953518.png",
        "audioUrl": "/api/storage/voices/asdis_sample.mp3",
        "type": "Source Audio",
        "creatorId": "local-user",
        "isPublic": True,
        "description": "Pop Singer Source Audio",
        "modelPath": None,
        "archived": False
    }
    df_voices_new = pl.DataFrame([asdis_entry])
    tmp_path = voices_path + ".tmp"
    df_voices_new.write_parquet(tmp_path)
    os.replace(tmp_path, voices_path)
    print("Artificially inserted Asdis back to voices.")