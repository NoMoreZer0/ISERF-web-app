// Shared domain types for ISERF alerts.

export type AlertType = "drowsiness" | "bpm_abnormal";
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
};
