import os
import shutil
import polars as pl
import glob
import uuid

def execute():
    # 1. Clean Clones Parquet
    if os.path.exists("storage/db/clones.parquet"):
        clones_df = pl.read_parquet("storage/db/clones.parquet")
        
        # Identify items that are covers (they have a path ending in .wav or .mp3)
        # Note: Some real clones might have path=None, so we handle nulls
        is_cover = clones_df["path"].is_not_null() & (clones_df["path"].str.ends_with(".wav") | clones_df["path"].str.ends_with(".mp3"))
        
        covers_in_clones = clones_df.filter(is_cover)
        new_clones_df = clones_df.filter(~is_cover)
        
        new_clones_df.write_parquet("storage/db/clones.parquet")
        print(f"Removed {len(covers_in_clones)} cover entries from clones.parquet")

    # 2. Move files from storage/clones/ to storage/covers/
    clones_dir = "storage/clones/"
    covers_dir = "storage/covers/"
    os.makedirs(covers_dir, exist_ok=True)

    moved_files = []

    if os.path.exists(clones_dir):
        for file in os.listdir(clones_dir):
            if file.endswith(".wav") or file.endswith(".mp3"):
                src = os.path.join(clones_dir, file)
                dst = os.path.join(covers_dir, file)
                if not os.path.exists(dst): 
                    shutil.move(src, dst)
                moved_files.append(file)
                print(f"Moved {file} from clones/ to covers/")

    # 3. Move misplaced covers from storage/songs/ 
    songs_dir = "storage/songs/"
    if os.path.exists(songs_dir):
        for file in os.listdir(songs_dir):
            if file in ["song1 - neucosvc.mp3", "song1_asdis_hq_final.mp3"]:
                src = os.path.join(songs_dir, file)
                dst = os.path.join(covers_dir, file)
                if not os.path.exists(dst):
                    shutil.move(src, dst)
                moved_files.append(file)
                print(f"Moved {file} from songs/ to covers/")

    # 4. Add moved files to covers.parquet
    if os.path.exists("storage/db/covers.parquet"):
        covers_df = pl.read_parquet("storage/db/covers.parquet")
    else:
        schema = {
            "id": pl.Utf8, "title": pl.Utf8, "artist": pl.Utf8, "thumbnail": pl.Utf8,
            "audioUrl": pl.Utf8, "userId": pl.Utf8, "createdAt": pl.Utf8, "songId": pl.Utf8, 
            "voiceId": pl.Utf8, "engine": pl.Utf8, "outputPath": pl.Utf8, "status": pl.Utf8, "metadata": pl.Utf8
        }
        covers_df = pl.DataFrame(schema=schema)

    covers_records = covers_df.to_dicts()

    existing_files = [c.get("outputPath", "") for c in covers_records if c.get("outputPath")]

    for file in moved_files:
        output_path = f"storage/covers/{file}"
        if output_path not in existing_files:
            title = file.replace(".wav", "").replace(".mp3", "").replace("_", " ").title()
            new_record = {
                "id": str(uuid.uuid4()),
                "title": f"{title} (Cover)",
                "artist": "AI Generated",
                "thumbnail": None,
                "audioUrl": f"/assets/covers/{file}",
                "userId": "local-user",
                "createdAt": "2026-03-23T12:00:00.000Z",
                "songId": None,
                "voiceId": None,
                "engine": "unknown",
                "outputPath": output_path,
                "status": "completed",
                "metadata": '{"source": "automatic_migration"}'
            }
            covers_records.append(new_record)

    for c in covers_records:
        if c.get("outputPath") and not c.get("audioUrl"):
            filename = os.path.basename(c["outputPath"])
            c["audioUrl"] = f"/assets/covers/{filename}"

    # Recreate dataframe ensuring schema alignment
    from collections import OrderedDict
    keys = list(covers_df.schema.keys())
    
    final_records = []
    for r in covers_records:
        ordered_r = {}
        for k in keys:
            ordered_r[k] = r.get(k, None)
        final_records.append(ordered_r)

    new_covers_df = pl.DataFrame(final_records, schema=covers_df.schema)
    new_covers_df.write_parquet("storage/db/covers.parquet")
    print(f"Covers Parquet updated to {len(final_records)} records")
    
if __name__ == "__main__":
    execute()
