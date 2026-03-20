import polars as pl
import os
import json
import argparse
import fcntl
from contextlib import contextmanager

DB_DIR = os.path.join(os.getcwd(), 'storage', 'db')

def ensure_db_dir():
    if not os.path.exists(DB_DIR):
        os.makedirs(DB_DIR, exist_ok=True)

def get_parquet_path(collection):
    return os.path.join(DB_DIR, f"{collection}.parquet")

def get_lock_path(collection):
    return os.path.join(DB_DIR, f"{collection}.lock")

@contextmanager
def collection_lock(collection):
    ensure_db_dir()
    lock_path = get_lock_path(collection)
    with open(lock_path, 'w') as f:
        try:
            fcntl.flock(f, fcntl.LOCK_EX)
            yield
        finally:
            fcntl.flock(f, fcntl.LOCK_UN)

def upsert(collection, data_json):
    path = get_parquet_path(collection)
    new_data = json.loads(data_json)
    
    # Ensure ID is present
    if 'id' not in new_data:
        raise ValueError("Document must have an 'id' field")

    with collection_lock(collection):
        if os.path.exists(path) and os.path.getsize(path) > 0:
            try:
                df = pl.read_parquet(path)
                # Remove existing if present to update, only if column exists
                if "id" in df.columns:
                    df = df.filter(pl.col("id") != new_data['id'])
                
                # Stringify nested data
                for key, value in new_data.items():
                    if isinstance(value, (list, dict)):
                         new_data[key] = json.dumps(value)
                
                new_df = pl.DataFrame([new_data])
                # Ensure schema match by merging
                df = pl.concat([df, new_df], how="diagonal")
            except Exception as e:
                print(f"Warning: Failed to read {path}, overwriting. Error: {e}")
                # Fallback to creating new if read fails
                for key, value in new_data.items():
                    if isinstance(value, (list, dict)):
                         new_data[key] = json.dumps(value)
                df = pl.DataFrame([new_data])
        else:
            # Convert nested to strings for first write
            for key, value in new_data.items():
                if isinstance(value, (list, dict)):
                     new_data[key] = json.dumps(value)
            df = pl.DataFrame([new_data])
        
        # Write to temporary file then replace to make it atomic
        tmp_path = path + ".tmp"
        df.write_parquet(tmp_path)
        os.replace(tmp_path, path)
        print(f"Success: Upserted to {collection}")

def list_all(collection):
    path = get_parquet_path(collection)
    with collection_lock(collection):
        if not os.path.exists(path) or os.path.getsize(path) == 0:
            print(json.dumps([]))
            return

        try:
            df = pl.read_parquet(path)
            # Convert back from stringified JSON if needed
            dicts = df.to_dicts()
            for d in dicts:
                for k, v in d.items():
                    if isinstance(v, str):
                        try:
                            d[k] = json.loads(v)
                        except:
                            pass
            print(json.dumps(dicts))
        except Exception as e:
            print(json.dumps([]))

def get_by_id(collection, doc_id):
    path = get_parquet_path(collection)
    with collection_lock(collection):
        if not os.path.exists(path) or os.path.getsize(path) == 0:
            print(json.dumps(None))
            return

        try:
            df = pl.read_parquet(path)
            if "id" not in df.columns:
                print(json.dumps(None))
                return
            result = df.filter(pl.col("id") == doc_id)
            if result.is_empty():
                print(json.dumps(None))
            else:
                d = result.to_dicts()[0]
                for k, v in d.items():
                    if isinstance(v, str):
                        try:
                            d[k] = json.loads(v)
                        except:
                            pass
                print(json.dumps(d))
        except Exception as e:
            print(json.dumps(None))

def delete_by_id(collection, doc_id):
    path = get_parquet_path(collection)
    with collection_lock(collection):
        if not os.path.exists(path) or os.path.getsize(path) == 0:
            return

        try:
            df = pl.read_parquet(path)
            if "id" in df.columns:
                df = df.filter(pl.col("id") != doc_id)
                tmp_path = path + ".tmp"
                df.write_parquet(tmp_path)
                os.replace(tmp_path, path)
        except Exception as e:
            pass
        print(f"Success: Deleted {doc_id} from {collection}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("action", choices=["upsert", "list", "get", "delete"])
    parser.add_argument("--collection", required=True)
    parser.add_argument("--id", help="Document ID")
    parser.add_argument("--data", help="JSON data for upsert")
    
    args = parser.parse_args()
    
    if args.action == "upsert":
        upsert(args.collection, args.data)
    elif args.action == "list":
        list_all(args.collection)
    elif args.action == "get":
        get_by_id(args.collection, args.id)
    elif args.action == "delete":
        delete_by_id(args.collection, args.id)
