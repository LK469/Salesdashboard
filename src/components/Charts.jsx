import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
  ComposedChart,
} from "recharts";
import { BRAND, STAGES, stageColor } from "../config/pipeline.js";
import { bdrFunnel, eventTrend, FUNNEL_STEPS, weeklyActivityTrend } from "../lib/metrics.js";

const AXIS_TICK = { fill: BRAND.muted, fontSize: 11, fontFamily: BRAND.fontSans };
const TOOLTIP_STYLE = {
  background: BRAND.surfaceHigh,
  border: `1px solid ${BRAND.borderStrong}`,
  borderRadius: 6,
  fontFamily: BRAND.fontSans,
  fontSize: 12,
  color: BRAND.ink,
  boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
};
const TOOLTIP_ITEM_STYLE = { color: BRAND.ink };
const TOOLTIP_LABEL_STYLE = { color: BRAND.muted, fontWeight: 500 };

export function makePeriodFormatter(period) {
  switch (period) {
    case "day":
      return (s) => {
        if (!s) return "";
        const [y, m, d] = s.split("-").map(Number);
        return new Date(y, m - 1, d).toLocaleString("en", { month: "short", day: "numeric" });
      };
    case "quarter":
    case "year":
      return (s) => s;
    case "month":
    default:
      return (s) => {
        if (!s) return "";
        const [y, mm] = s.split("-");
        return new Date(Number(y), Number(mm) - 1, 1).toLocaleString("en", { month: "short", year: "2-digit" });
      };
  }
}

const TREND_SERIES = [
  { key: "meetings", label: "Meetings", color: "#9885c8" },
  { key: "discoveryScheduled", label: "Discovery Scheduled", color: BRAND.warn },
  { key: "discoveryBooked", label: "Discovery Booked", color: BRAND.primary },
  { key: "demoScheduled", label: "Demo Scheduled", color: BRAND.info },
  { key: "demoBooked", label: "Demo Booked", color: BRAND.pink },
  { key: "closedWon", label: "Closed Won", color: BRAND.success },
];

export function MonthlyTrendChart({ deals, period = "month", activeMonth = null }) {
  const data = eventTrend(deals, period, activeMonth);
  const fmt = makePeriodFormatter(period);
  const subtitleMap = {
    day: "Daily breakdown - each series uses its own SF event date",
    month: "Monthly breakdown - each series uses its own SF event date",
    quarter: "Quarterly breakdown - each series uses its own SF event date",
    year: "Yearly breakdown - each series uses its own SF event date",
  };
  const titleMap = {
    day: "Daily Funnel Activity",
    month: "Monthly Funnel Activity",
    quarter: "Quarterly Funnel Activity",
    year: "Yearly Funnel Activity",
  };

  return (
    <Card title={titleMap[period]} subtitle={subtitleMap[period]}>
      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: -10 }}>
          <CartesianGrid stroke={BRAND.border} vertical={false} />
          <XAxis dataKey="period" tickFormatter={fmt} tick={AXIS_TICK} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={20} />
          <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={40} />
          <Tooltip contentStyle={TOOLTIP_STYLE} itemStyle={TOOLTIP_ITEM_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} labelFormatter={fmt} cursor={{ stroke: BRAND.borderStrong, strokeDasharray: "3 3" }} />
          <Legend wrapperStyle={{ fontSize: 12, fontFamily: BRAND.fontSans, paddingTop: 8, color: BRAND.ink2 }} iconType="circle" />
          {TREND_SERIES.map((s) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={s.color}
              strokeWidth={2.5}
              dot={{ r: 3, fill: s.color }}
              activeDot={{ r: 5, fill: s.color, stroke: BRAND.surface, strokeWidth: 2 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </Card>
  );
}

export function WeeklyActivitiesChart({ activities }) {
  const data = weeklyActivityTrend(activities);
  const fmt = (s) => {
    if (!s) return "";
    const [y, m, d] = s.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleString("en", { month: "short", day: "numeric" });
  };
  const totals = data.reduce((acc, w) => ({
    calls: acc.calls + w.calls,
    conversations: acc.conversations + w.conversations,
    emails: acc.emails + w.emails,
  }), { calls: 0, conversations: 0, emails: 0 });

  return (
    <Card
      title="Activities - Weekly Trend"
      subtitle={`Calls ${totals.calls.toLocaleString()} - Conversations ${totals.conversations.toLocaleString()} - Emails ${totals.emails.toLocaleString()} - Conversation = call >= 3 min`}
    >
      {data.length === 0 ? (
        <Empty>No activities in the current dataset window.</Empty>
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: -10 }}>
            <CartesianGrid stroke={BRAND.border} vertical={false} />
            <XAxis dataKey="weekStart" tickFormatter={fmt} tick={AXIS_TICK} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={20} />
            <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={40} />
            <Tooltip contentStyle={TOOLTIP_STYLE} itemStyle={TOOLTIP_ITEM_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} labelFormatter={(s) => `Week of ${fmt(s)}`} cursor={{ fill: BRAND.primaryTint }} />
            <Legend wrapperStyle={{ fontSize: 12, fontFamily: BRAND.fontSans, paddingTop: 8, color: BRAND.ink2 }} iconType="circle" />
            <Bar dataKey="calls" name="Calls" fill={BRAND.info} radius={[4, 4, 0, 0]} />
            <Bar dataKey="conversations" name="Conversations" fill={BRAND.success} radius={[4, 4, 0, 0]} />
            <Bar dataKey="emails" name="Emails" fill={BRAND.pink} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
}

export function ConversionTrendChart({ activities }) {
  const data = weeklyActivityTrend(activities);
  const fmt = (s) => {
    if (!s) return "";
    const [y, m, d] = s.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleString("en", { month: "short", day: "numeric" });
  };
  const totalCalls = data.reduce((a, w) => a + w.calls, 0);
  const totalConv = data.reduce((a, w) => a + w.conversations, 0);
  const overall = totalCalls === 0 ? 0 : totalConv / totalCalls;

  return (
    <Card
      title="Call -> Conversation Conversion"
      subtitle={`Weekly calls + conversations and conversion rate - Overall ${(overall * 100).toFixed(1)}% (${totalConv.toLocaleString()} of ${totalCalls.toLocaleString()})`}
    >
      {data.length === 0 ? (
        <Empty>No call data in the current window.</Empty>
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={data} margin={{ top: 8, right: 24, bottom: 0, left: -10 }}>
            <CartesianGrid stroke={BRAND.border} vertical={false} />
            <XAxis dataKey="weekStart" tickFormatter={fmt} tick={AXIS_TICK} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={20} />
            <YAxis yAxisId="count" tick={AXIS_TICK} axisLine={false} tickLine={false} width={40} />
            <YAxis yAxisId="pct" orientation="right" tick={{ ...AXIS_TICK, fill: BRAND.success }} axisLine={false} tickLine={false} tickFormatter={(v) => `${Math.round(v * 100)}%`} domain={[0, 1]} width={48} />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              itemStyle={TOOLTIP_ITEM_STYLE}
              labelStyle={TOOLTIP_LABEL_STYLE}
              labelFormatter={(s) => `Week of ${fmt(s)}`}
              formatter={(value, name) => name === "Conversion %" ? [`${(value * 100).toFixed(1)}%`, name] : [value.toLocaleString(), name]}
              cursor={{ fill: BRAND.primaryTint }}
            />
            <Legend wrapperStyle={{ fontSize: 12, fontFamily: BRAND.fontSans, paddingTop: 8, color: BRAND.ink2 }} iconType="circle" />
            <Bar yAxisId="count" dataKey="calls" name="Calls" fill={BRAND.info} radius={[4, 4, 0, 0]} />
            <Bar yAxisId="count" dataKey="conversations" name="Conversations" fill={BRAND.success} radius={[4, 4, 0, 0]} />
            <Line yAxisId="pct" type="monotone" dataKey="conversionRate" name="Conversion %" stroke={BRAND.primary} strokeWidth={3} dot={{ r: 4, fill: BRAND.primary, stroke: BRAND.surface, strokeWidth: 2 }} activeDot={{ r: 6, fill: BRAND.primary, stroke: BRAND.surface, strokeWidth: 2 }} />
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
}

export function BdrFunnelChart({ deals, activeMonth = null }) {
  const { counts, conversions } = bdrFunnel(deals, { activeMonth });
  const maxCount = Math.max(...FUNNEL_STEPS.map((s) => counts[s.key]), 1);
  const stepColor = {
    meetings: "#9885c8",
    discoveryScheduled: BRAND.warn,
    discoveryBooked: BRAND.primary,
    demoScheduled: BRAND.info,
    demoBooked: BRAND.pink,
    closedWon: BRAND.success,
  };
  const monthSuffix = activeMonth ? ` - ${activeMonth} cohort` : "";

  return (
    <Card
      title="BDR Funnel - Meetings -> Closed Won"
      subtitle={`${counts.meetings.toLocaleString()} meetings -> ${counts.closedWon.toLocaleString()} wins - overall conversion ${(conversions.overall * 100).toFixed(1)}%${monthSuffix}`}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {FUNNEL_STEPS.map((step, i) => {
          const c = counts[step.key];
          const widthPct = (c / maxCount) * 100;
          const color = stepColor[step.key];
          const prev = i > 0 ? FUNNEL_STEPS[i - 1] : null;
          const prevCount = prev ? counts[prev.key] : null;
          const conv = prev ? conversions[`${prev.key}_to_${step.key}`] : null;
          return (
            <div key={step.key}>
              {prev && (
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, paddingLeft: 8, fontFamily: BRAND.fontSans, fontSize: 11, color: BRAND.muted }}>
                  <span style={{ color: BRAND.mutedSoft }}>v</span>
                  <span style={{ fontFamily: BRAND.fontMono, fontWeight: 600, color: BRAND.ink2, fontVariantNumeric: "tabular-nums" }}>{(conv * 100).toFixed(1)}%</span>
                  <span>convert</span>
                  <span style={{ color: BRAND.mutedSoft }}>-</span>
                  <span>{c.toLocaleString()} of {prevCount.toLocaleString()}</span>
                </div>
              )}
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ minWidth: 180, fontSize: 14, fontWeight: 500, color: BRAND.ink, fontFamily: BRAND.fontSans }}>
                  {step.label}
                </div>
                <div style={{ flex: 1, position: "relative", height: 36, background: BRAND.borderSoft, borderRadius: 8, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${widthPct}%`, background: `linear-gradient(90deg, ${color}cc 0%, ${color} 100%)`, boxShadow: `0 0 24px ${color}66`, borderRadius: 8 }} />
                  <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", padding: "0 12px", fontFamily: BRAND.fontMono, fontSize: 13, fontWeight: 700, color: widthPct > 25 ? "#fff" : BRAND.ink, textShadow: widthPct > 25 ? "0 1px 2px rgba(0,0,0,0.4)" : "none", fontVariantNumeric: "tabular-nums" }}>
                    {c.toLocaleString()}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

export function StageFunnelChart({ deals }) {
  const data = STAGES.map((s) => ({
    name: s.name,
    count: deals.filter((d) => d.stage === s.name).length,
    color: s.color,
  }));
  return (
    <Card title="Stage Distribution" subtitle="Deal count by current stage">
      <ResponsiveContainer width="100%" height={Math.max(280, data.length * 36)}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 24, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={BRAND.border} horizontal={false} />
          <XAxis type="number" tick={AXIS_TICK} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey="name" tick={{ ...AXIS_TICK, fontSize: 12 }} axisLine={false} tickLine={false} width={180} />
          <Tooltip contentStyle={TOOLTIP_STYLE} itemStyle={TOOLTIP_ITEM_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} cursor={{ fill: BRAND.primaryTint }} />
          <Bar dataKey="count" radius={[0, 4, 4, 0]} label={{ position: "right", fill: BRAND.ink, fontSize: 11, fontFamily: BRAND.fontSans, fontWeight: 600 }}>
            {data.map((d, i) => <Cell key={i} fill={d.color} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
}

export function TopBdrsChart({ deals, metric = "wins", topN = 10 }) {
  const byBdr = new Map();
  for (const d of deals) {
    const key = d.bdrName || "Unassigned";
    if (!byBdr.has(key)) byBdr.set(key, { name: key, wins: 0, discoveries: 0, demos: 0, deals: 0, locations: 0 });
    const r = byBdr.get(key);
    r.deals++;
    if (d.isWon) { r.wins++; r.locations += d.paidLocations || 0; }
    if (d.discoveryCompletedFlag || d.discoveryStatus === "Completed") r.discoveries++;
    if (d.demoCompletedFlag || d.demoStatus === "Completed") r.demos++;
  }
  const labels = { wins: "Wins", discoveries: "Discoveries", demos: "Demos", deals: "Total Deals", locations: "Locations Won" };
  const sorted = [...byBdr.values()].sort((a, b) => b[metric] - a[metric]).slice(0, topN);

  return (
    <Card title={`Top ${topN} BDRs by ${labels[metric]}`} subtitle="Click leaderboard rows below for full ranking">
      <ResponsiveContainer width="100%" height={topN * 28 + 16}>
        <BarChart data={sorted} layout="vertical" margin={{ top: 4, right: 30, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={BRAND.border} horizontal={false} />
          <XAxis type="number" tick={AXIS_TICK} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey="name" tick={{ ...AXIS_TICK, fontSize: 12 }} axisLine={false} tickLine={false} width={150} />
          <Tooltip contentStyle={TOOLTIP_STYLE} itemStyle={TOOLTIP_ITEM_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} cursor={{ fill: BRAND.primaryTint }} />
          <Bar dataKey={metric} fill={BRAND.primary} radius={[0, 4, 4, 0]} label={{ position: "right", fill: BRAND.ink, fontSize: 11, fontFamily: BRAND.fontSans, fontWeight: 600 }} />
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
}

export function DiscoveryStatusDonut({ deals }) {
  const counts = new Map();
  for (const d of deals) {
    if (!d.discoveryStatus) continue;
    counts.set(d.discoveryStatus, (counts.get(d.discoveryStatus) || 0) + 1);
  }
  const data = [...counts.entries()].map(([name, value]) => ({ name, value }));
  const statusColors = {
    Completed: BRAND.success,
    "Follow-Up Demo": BRAND.primary,
    Scheduled: BRAND.info,
    Rescheduled: BRAND.warn,
    "No Show": BRAND.danger,
    Cancelled: BRAND.pink,
    Pending: BRAND.mutedSoft,
  };
  const total = data.reduce((a, d) => a + d.value, 0);

  return (
    <Card title="Discovery Status Mix" subtitle={`${total.toLocaleString()} deals classified`}>
      <ResponsiveContainer width="100%" height={260}>
        <PieChart>
          <Pie data={data} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={2} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={{ stroke: BRAND.muted }} style={{ fontFamily: BRAND.fontSans, fontSize: 11, fill: BRAND.ink2 }}>
            {data.map((entry, i) => (
              <Cell key={i} fill={statusColors[entry.name] || BRAND.chart[i % BRAND.chart.length]} />
            ))}
          </Pie>
          <Tooltip contentStyle={TOOLTIP_STYLE} itemStyle={TOOLTIP_ITEM_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} />
        </PieChart>
      </ResponsiveContainer>
    </Card>
  );
}

export function InboundOutboundChart({ deals }) {
  let inbound = 0, outbound = 0, inboundWon = 0, outboundWon = 0;
  for (const d of deals) {
    if (d.inboundOrOutbound === "Inbound") { inbound++; if (d.isWon) inboundWon++; }
    if (d.inboundOrOutbound === "Outbound") { outbound++; if (d.isWon) outboundWon++; }
  }
  const data = [
    { name: "Inbound", deals: inbound, wins: inboundWon, winRate: inbound ? inboundWon / inbound : 0 },
    { name: "Outbound", deals: outbound, wins: outboundWon, winRate: outbound ? outboundWon / outbound : 0 },
  ];

  return (
    <Card title="Inbound vs Outbound" subtitle="Deal volume and wins per pipeline source">
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: -10 }}>
          <CartesianGrid stroke={BRAND.border} vertical={false} />
          <XAxis dataKey="name" tick={AXIS_TICK} axisLine={false} tickLine={false} />
          <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={40} />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            formatter={(v, n) => {
              if (n === "winRate") return [`${(v * 100).toFixed(1)}%`, "Win Rate"];
              return [v, n === "deals" ? "Total Deals" : "Wins"];
            }}
            cursor={{ fill: BRAND.borderSoft }}
          />
          <Legend wrapperStyle={{ fontSize: 12, fontFamily: BRAND.fontSans, paddingTop: 8, color: BRAND.ink2 }} iconType="circle" />
          <Bar dataKey="deals" name="Total Deals" fill={BRAND.primary} radius={[4, 4, 0, 0]} />
          <Bar dataKey="wins" name="Wins" fill={BRAND.success} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
}

function Empty({ children }) {
  return (
    <div style={{ padding: "32px 0", color: BRAND.muted, fontSize: 13, textAlign: "center" }}>
      {children}
    </div>
  );
}

function Card({ title, subtitle, children }) {
  return (
    <div style={{ background: BRAND.surface, border: `1px solid ${BRAND.border}`, borderRadius: 10, padding: 20 }}>
      <div style={{ marginBottom: 12 }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: BRAND.ink, fontFamily: BRAND.fontSans, letterSpacing: -0.1 }}>
          {title}
        </h3>
        {subtitle && (
          <div style={{ marginTop: 4, fontSize: 12, color: BRAND.muted, fontFamily: BRAND.fontSans }}>
            {subtitle}
          </div>
        )}
      </div>
      {children}
    </div>
  );
}
