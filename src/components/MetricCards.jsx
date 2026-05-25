import { BRAND } from "../config/pipeline.js";
import { formatMoney, formatNum, formatPct } from "../lib/metrics.js";

export default function MetricCards({ summary, io, act }) {
  const cards = [
    act && act.calls > 0 && {
      label: "Calls",
      value: formatNum(act.calls),
      delta: `${act.conversations.toLocaleString()} conversations`,
      accent: BRAND.info,
      tip: "Tasks with Activity Type = Call, excluding [Outreach][Call].",
    },
    act && act.calls > 0 && {
      label: "Call -> Conversation",
      value: formatPct(act.callToConversation),
      delta: `${act.conversations.toLocaleString()} of ${act.calls.toLocaleString()} calls were >=3 min`,
      accent: BRAND.success,
    },
    {
      label: "Show Rate",
      value: formatPct(summary.discovery.showRate),
      delta: `${summary.discovery.completed.toLocaleString()} of ${(summary.discovery.completed + summary.discovery.noShow + summary.discovery.cancelled).toLocaleString()} held`,
      accent: BRAND.success,
      tip: "Completed / (Completed + No Show + Cancelled).",
    },
    {
      label: "Discoveries Completed",
      value: formatNum(summary.discovery.completed),
      delta: `${summary.discovery.noShow} no-show - ${summary.discovery.cancelled} cancelled`,
      accent: BRAND.primary,
    },
    {
      label: "Demos Completed",
      value: formatNum(summary.demo?.completed ?? 0),
      delta: "from Demo_Status__c",
      accent: BRAND.info,
    },
    {
      label: "Wins",
      value: formatNum(summary.counts.won),
      delta: `Win rate ${formatPct(summary.winRate)} (real)`,
      accent: BRAND.success,
    },
    {
      label: "Paid Locations Won",
      value: formatNum(summary.paidLocations),
      delta: "sum across Closed Won",
      accent: BRAND.primary,
    },
    {
      label: "Weighted Pipeline",
      value: formatMoney(summary.weightedPipeline),
      delta: "open amount x probability",
      accent: BRAND.pink,
    },
    io && {
      label: "Inbound / Outbound",
      value: `${io.inbound.toLocaleString()} / ${io.outbound.toLocaleString()}`,
      delta: `IN ${formatPct(io.inboundWonRate)} - OUT ${formatPct(io.outboundWonRate)} win`,
      accent: BRAND.warn,
    },
  ].filter(Boolean);

  return (
    <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 14, marginBottom: 24 }}>
      {cards.map((c) => (
        <KpiCard key={c.label} {...c} />
      ))}
    </section>
  );
}

function KpiCard({ label, value, delta, accent, tip }) {
  const accentColor = accent || BRAND.primary;
  return (
    <div
      title={tip || ""}
      style={{
        background: BRAND.surface,
        border: `1px solid ${BRAND.border}`,
        borderRadius: 10,
        padding: "16px 18px",
        position: "relative",
        overflow: "hidden",
        backgroundImage: `radial-gradient(at top right, ${accentColor}15, transparent 60%)`,
      }}
    >
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: accentColor, borderRadius: "3px 0 0 3px" }} />
      <div style={{ fontFamily: BRAND.fontSans, fontSize: 11, fontWeight: 600, letterSpacing: 0.8, color: BRAND.muted, textTransform: "uppercase" }}>
        {label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, marginTop: 4, color: BRAND.ink, lineHeight: 1.1, fontVariantNumeric: "tabular-nums" }}>
        {value}
      </div>
      <div style={{ fontSize: 12, color: BRAND.muted, marginTop: 6 }}>
        {delta}
      </div>
    </div>
  );
}
