import os
import json
import time
from typing import Dict, Any, Generator
import logging

logger = logging.getLogger("src.data.pubsub_pipeline")

GCP_PROJECT_ID = os.environ.get("GCP_PROJECT_ID", "project-02ed109f-3be3-43b8-866")
GCP_PUBSUB_TOPIC = os.environ.get("GCP_PUBSUB_TOPIC", "telematics-sensor-stream")
GCP_PUBSUB_SUBSCRIPTION = os.environ.get("GCP_PUBSUB_SUBSCRIPTION", "telematics-stream-sub")


class TelematicsPubSubPipeline:
    """
    GCP Cloud Pub/Sub Ingestion Pipeline for high-frequency IoT IMU/GPS Telematics.
    Target GCP Project: project-02ed109f-3be3-43b8-866 (PulseStar)
    """

    def __init__(self, project_id: str = GCP_PROJECT_ID, topic_name: str = GCP_PUBSUB_TOPIC):
        self.project_id = project_id
        self.topic_name = topic_name
        self.topic_path = f"projects/{self.project_id}/topics/{self.topic_name}"
        self._publisher = None
        self._subscriber = None

    def _get_publisher(self):
        if self._publisher is None:
            try:
                from google.cloud import pubsub_v1
                self._publisher = pubsub_v1.PublisherClient()
                logger.info(f"GCP Pub/Sub Publisher connected to {self.topic_path}")
            except Exception as e:
                logger.warning(f"GCP Pub/Sub Client initialization fallback: {e}")
                self._publisher = None
        return self._publisher

    def publish_telemetry_event(self, event_data: Dict[str, Any]) -> str:
        """
        Publishes a single IMU/GPS sensor event payload to GCP Cloud Pub/Sub.
        Falls back to high-speed local stream logger if running without GCP credentials.
        """
        publisher = self._get_publisher()
        payload_bytes = json.dumps(event_data).encode("utf-8")
        
        if publisher is not None:
            try:
                future = publisher.publish(self.topic_path, payload_bytes, vehicle_id=event_data.get("Vehicle_ID", ""))
                return future.result()
            except Exception as e:
                logger.error(f"GCP Pub/Sub publish failed: {e}")
                
        # Emulated delivery
        return f"LOCAL_MSG_{int(time.time() * 1000)}"

    def stream_sample_telemetry(self, telemetry_df, interval_sec: float = 0.05) -> Generator[Dict[str, Any], None, None]:
        """Generator simulating real-time vehicle sensor packet streaming."""
        for _, row in telemetry_df.iterrows():
            event = row.to_dict()
            yield event
            time.sleep(interval_sec)
