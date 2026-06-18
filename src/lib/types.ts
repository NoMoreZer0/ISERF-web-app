// Shared domain types for ISERF alerts.

export type AlertType = "drowsiness" | "bpm_abnormal" | "air_quality";
export type AlertSeverity = "warning" | "critical";
export type AlertStatus = "active" | "cleared";

export interface Alert {
  id: string;
  device_id: string;
  driver_id: string | null;
  type: AlertType;
  severity: AlertSeverity;
  status: AlertStatus;
  ear_value: number | null;
  bpm_value: number | null;
  message: string | null;
  created_at: string; // ISO timestamp
}

// Payload accepted by POST /api/alerts (from the Raspberry Pi).
export interface AlertIngestPayload {
  device_id: string;
  driver_id?: string | null;
  type: AlertType;
  severity?: AlertSeverity;
  status?: AlertStatus;
  ear_value?: number | null;
  bpm_value?: number | null;
  message?: string | null;
}

export const ALERT_LABELS: Record<AlertType, string> = {
  drowsiness: "Drowsiness",
  bpm_abnormal: "Abnormal Heart Rate",
  air_quality: "Air Quality",
};

// ---------------------------------------------------------------------------
// Continuous telemetry: latest known state per device (upserted on device_id).
// BPM arrives ~every 5s; air quality is a digital MQ-135 reading (good/bad).
// ---------------------------------------------------------------------------
export interface DeviceTelemetry {
  device_id: string;
  driver_id: string | null;
  bpm_value: number | null;
  air_ok: boolean | null; // true = good air (digital 1), false = bad air (digital 0)
  updated_at: string; // ISO timestamp
}

// Payload accepted by POST /api/bpm (from the Raspberry Pi).
export interface BpmIngestPayload {
  device_id: string;
  driver_id?: string | null;
  bpm_value: number;
}

// Payload accepted by POST /api/oxygen (from the Raspberry Pi).
// Send the raw digital pin as `value` (0|1), or a pre-parsed `air_ok` boolean.
export interface OxygenIngestPayload {
  device_id: string;
  driver_id?: string | null;
  value?: number;
  air_ok?: boolean;
}
