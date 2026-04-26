import polars as pl
import os

db_dir = os.path.join(os.getcwd(), 'storage', 'db')

# 1. Fix Covers audioUrls
covers_path = os.path.join(db_dir, 'covers.parquet')
if os.path.exists(covers_path):
    df_covers = pl.read_parquet(covers_path)

    fixed_covers = []
    for row in df_covers.iter_rows():
        d = dict(zip(df_covers.columns, row))
        if not d.get('audioUrl') and d.get('outputPath'):
            filename = os.path.basename(d['outputPath'])
            d['audioUrl'] = f"/assets/covers/{filename}"
        fixed_covers.append(d)

    df_covers_new = pl.DataFrame(fixed_covers)
    # Ensure atomic write
    tmp_path = covers_path + ".tmp"
    try:
        df_covers_new.write_parquet(tmp_path)
        os.replace(tmp_path, covers_path)
        print("Fixed covers.parquet audio URLs.")
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)

# 2. Migrate Voices to Clones
voices_path = os.path.join(db_dir, 'voices.parquet')
clones_path = os.path.join(db_dir, 'clones.parquet')

if os.path.exists(voices_path) and os.path.exists(clones_path):
    df_voices = pl.read_parquet(voices_path)
    df_clones = pl.read_parquet(clones_path)

    voices_list = [dict(zip(df_voices.columns, row)) for row in df_voices.iter_rows()]
    clones_list = [dict(zip(df_clones.columns, row)) for row in df_clones.iter_rows()]

    voices_to_keep = []
    clones_to_add = []

    migration_success = False
    try:
        for v in voices_list:
            if v.get('id') == 'asdis':
                voices_to_keep.append(v)
            else:
                clone_entry = {
                    "id": v.get("id"),
                    "title": v.get("name"),
                    "artist": "AI Avatar",
                    "thumbnail": v.get("avatar"),
                    "audioUrl": v.get("audioUrl"),
                    "voiceId": v.get("id"),
                    "engine": v.get("type", "rvc"),
                    "userId": v.get("creatorId", "local-user"),
                    "createdAt": "2026-03-21T00:00:00.000Z"
                }
                # Only add if not already in clones
                if not any(c.get('id') == clone_entry['id'] for c in clones_list):
                    clones_to_add.append(clone_entry)

        if clones_to_add:
            # We process clones_list slightly to ensure schemas align when making DataFrame
            # Polars can be strict about missing keys, so we pad them with Nones if necessary
            all_keys = set()
            for c in clones_list + clones_to_add:
                all_keys.update(c.keys())

            padded_clones = []
            for c in clones_list + clones_to_add:
                pc = {k: c.get(k, None) for k in all_keys}
                padded_clones.append(pc)

            df_clones_new = pl.DataFrame(padded_clones)
            tmp_path = clones_path + ".tmp"
            try:
                df_clones_new.write_parquet(tmp_path)
                os.replace(tmp_path, clones_path)
                print(f"Migrated {len(clones_to_add)} voices to clones.parquet.")
            finally:
                if os.path.exists(tmp_path):
                    os.remove(tmp_path)

        if len(voices_to_keep) < len(voices_list):
            df_voices_new = pl.DataFrame(voices_to_keep)
            tmp_path = voices_path + ".tmp"
            try:
                df_voices_new.write_parquet(tmp_path)
                os.replace(tmp_path, voices_path)
                print(f"Kept {len(voices_to_keep)} voices in voices.parquet.")
            finally:
                if os.path.exists(tmp_path):
                    os.remove(tmp_path)

        migration_success = True
    except Exception as e:
        print(f"Migration failed: {str(e)}")
        # Rollback logic would go here if needed
        # For now, we just report the failure

print("Library metadata fix complete.")