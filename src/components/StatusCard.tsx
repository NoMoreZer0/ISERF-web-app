interface StatusCardProps {
  label: string;
  value: string;
  sub?: string;
  tone?: "neutral" | "ok" | "warning" | "critical";
}

const toneStyles: Record<NonNullable<StatusCardProps["tone"]>, string> = {
  neutral: "border-slate-700 bg-slate-800/50",
  ok: "border-emerald-600/50 bg-emerald-900/20",
  warning: "border-amber-500/50 bg-amber-900/20",
  critical: "border-red-500/60 bg-red-900/30",
};

export function StatusCard({ label, value, sub, tone = "neutral" }: StatusCardProps) {
  return (
    <div className={`rounded-xl border p-4 ${toneStyles[tone]}`}>
      <div className="text-xs font-medium uppercase tracking-wide text-slate-400">
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold text-slate-100">{value}</div>
      {sub && <div className="mt-1 text-sm text-slate-400">{sub}</div>}
    </div>
  );
}
