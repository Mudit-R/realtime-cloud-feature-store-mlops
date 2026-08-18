"""
Utility script to load lakehouse Parquet partitions into GCP BigQuery dataset `telematics_lakehouse`.
"""
import os
import glob
from pathlib import Path

try:
    from google.cloud import bigquery
    BIGQUERY_AVAILABLE = True
except ImportError:
    BIGQUERY_AVAILABLE = False


def load_parquet_to_bigquery(project_id: str = "project-02ed109f-3be3-43b8-866", dataset_id: str = "telematics_lakehouse"):
    if not BIGQUERY_AVAILABLE:
        print("[WARNING] google-cloud-bigquery package not installed. Using local fallback.")
        return

    client = bigquery.Client(project=project_id)
    dataset_ref = client.dataset(dataset_id)
    
    lakehouse_dir = Path(__file__).resolve().parent.parent / "data" / "lakehouse"
    parquet_files = glob.glob(str(lakehouse_dir / "*.parquet"))

    if not parquet_files:
        print(f"[ERROR] No parquet files found in {lakehouse_dir}")
        return

    job_config = bigquery.LoadJobConfig(
        source_format=bigquery.SourceFormat.PARQUET,
        write_disposition=bigquery.WriteDisposition.WRITE_TRUNCATE,
    )

    print(f"Loading {len(parquet_files)} tables into BigQuery dataset '{project_id}.{dataset_id}'...")

    for file_path in parquet_files:
        table_name = Path(file_path).stem
        table_ref = dataset_ref.table(table_name)
        
        with open(file_path, "rb") as source_file:
            job = client.load_table_from_file(source_file, table_ref, job_config=job_config)
        
        job.result()  # Wait for table load to complete
        table = client.get_table(table_ref)
        print(f"  ✓ Loaded table '{table_name}': {table.num_rows} rows, {table.num_bytes / 1024:.1f} KB")

    print("[SUCCESS] All lakehouse tables loaded into BigQuery successfully!")


if __name__ == "__main__":
    project = os.getenv("GCP_PROJECT_ID", "project-02ed109f-3be3-43b8-866")
    dataset = os.getenv("BIGQUERY_DATASET", "telematics_lakehouse")
    load_parquet_to_bigquery(project, dataset)
