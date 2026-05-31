"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { ALERT_LABELS, type Alert } from "@/lib/types";
import { timeAgo, formatClock } from "@/lib/format";
import { StatusCard } from "./StatusCard";

const MAX_FEED = 100;
// A device is considered "offline" if no alert has arrived in this window.
// (With only discrete alerts this is approximate; add heartbeat telemetry later.)
const OFFLINE_AFTER_MS = 60_000;

type ConnState = "connecting" | "live" | "error";

export function Dashboard() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [conn, setConn] = useState<ConnState>("connecting");
  const [soundOn, setSoundOn] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Re-render every second so "x ago" labels and offline status stay fresh.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Synthesize a short alert beep with the Web Audio API (no asset file).
  const playBeep = useCallback(() => {
    if (!soundOn) return;
    try {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = audioCtxRef.current ?? (audioCtxRef.current = new Ctx());
      void ctx.resume();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "square";
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.4);
    } catch {
      /* audio not available */
    }
  }, [soundOn]);

  useEffect(() => {
    let cancelled = false;

    // 1) Initial load of recent alerts.
    (async () => {
      const { data, error } = await supabaseBrowser
        .from("alerts")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(MAX_FEED);
      if (!cancelled && !error && data) setAlerts(data as Alert[]);
    })();

    // 2) Realtime subscription for new inserts.
    const channel = supabaseBrowser
      .channel("alerts-stream")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "alerts" },
        (payload) => {
          if (cancelled) return;
          const alert = payload.new as Alert;
          setAlerts((prev) => [alert, ...prev].slice(0, MAX_FEED));
          if (alert.status === "active") playBeep();
        }
      )
      .subscribe((status) => {
        if (cancelled) return;
        if (status === "SUBSCRIBED") setConn("live");
        else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT")
          setConn("error");
      });

    return () => {
      cancelled = true;
      supabaseBrowser.removeChannel(channel);
    };
  }, [playBeep]);

  const latest = alerts[0];
  const lastSeenMs = latest ? new Date(latest.created_at).getTime() : null;
  const online = lastSeenMs !== null && now - lastSeenMs < OFFLINE_AFTER_MS;

  // Latest known sensor readings (scan recent alerts for non-null values).
  const lastBpm = alerts.find((a) => a.bpm_value != null)?.bpm_value ?? null;
  const lastEar = alerts.find((a) => a.ear_value != null)?.ear_value ?? null;

  // Current driver state derived from the most recent active alert.
  const activeAlert = alerts.find((a) => a.status === "active") ?? null;
  const stateTone = !online
    ? "neutral"
    : activeAlert
      ? activeAlert.severity === "critical"
        ? "critical"
        : "warning"
      : "ok";
  const stateValue = !online
    ? "Offline"
    : activeAlert
      ? ALERT_LABELS[activeAlert.type]
      : "Normal";

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">ISERF Dashboard</h1>
          <p className="text-sm text-slate-400">
            Real-time driver risk alerts
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSoundOn((s) => !s)}
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
          >
            {soundOn ? "🔔 Sound on" : "🔕 Sound off"}
          </button>
          <ConnectionBadge state={conn} />
        </div>
      </header>

      <section className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatusCard label="Driver state" value={stateValue} tone={stateTone} />
        <StatusCard
          label="Heart rate"
          value={lastBpm != null ? `${Math.round(lastBpm)} bpm` : "—"}
          tone={
            lastBpm != null && (lastBpm < 50 || lastBpm > 120)
              ? "warning"
              : "neutral"
          }
        />
        <StatusCard
          label="Eye aspect ratio"
          value={lastEar != null ? lastEar.toFixed(3) : "—"}
        />
        <StatusCard
          label="Last seen"
          value={lastSeenMs ? timeAgo(latest!.created_at) : "—"}
          sub={online ? "online" : "no recent data"}
          tone={online ? "ok" : "neutral"}
        />
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">
          Alert feed
        </h2>
        {alerts.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-700 p-8 text-center text-slate-500">
            No alerts yet. Waiting for the device…
          </div>
        ) : (
          <ul className="space-y-2">
            {alerts.map((a) => (
              <AlertRow key={a.id} alert={a} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function ConnectionBadge({ state }: { state: ConnState }) {
  const map = {
    connecting: { dot: "bg-amber-400", text: "Connecting…", color: "text-amber-300" },
    live: { dot: "bg-emerald-400", text: "Live", color: "text-emerald-300" },
    error: { dot: "bg-red-400", text: "Disconnected", color: "text-red-300" },
  }[state];
  return (
    <span className={`flex items-center gap-2 text-sm ${map.color}`}>
      <span className={`h-2 w-2 rounded-full ${map.dot} ${state === "live" ? "animate-pulse" : ""}`} />
      {map.text}
    </span>
  );
}

function AlertRow({ alert }: { alert: Alert }) {
  const critical = alert.severity === "critical";
  return (
    <li
      className={`flex items-center justify-between rounded-lg border p-3 ${
        critical
          ? "border-red-500/50 bg-red-900/20"
          : "border-amber-500/40 bg-amber-900/10"
      }`}
    >
      <div className="flex items-center gap-3">
        <span className="text-xl">{alert.type === "drowsiness" ? "😴" : "❤️"}</span>
        <div>
          <div className="font-medium text-slate-100">
            {ALERT_LABELS[alert.type]}
            {alert.status === "cleared" && (
              <span className="ml-2 text-xs font-normal text-slate-400">
                (cleared)
              </span>
            )}
          </div>
          <div className="text-xs text-slate-400">
            {alert.message ??
              [
                alert.bpm_value != null ? `${Math.round(alert.bpm_value)} bpm` : null,
                alert.ear_value != null ? `EAR ${alert.ear_value.toFixed(3)}` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            {alert.device_id ? ` · ${alert.device_id}` : ""}
          </div>
        </div>
      </div>
      <div className="text-right">
        <div
          className={`text-xs font-semibold uppercase ${
            critical ? "text-red-300" : "text-amber-300"
          }`}
        >
          {alert.severity}
        </div>
        <div className="text-xs text-slate-500">{formatClock(alert.created_at)}</div>
      </div>
    </li>
  );
}
