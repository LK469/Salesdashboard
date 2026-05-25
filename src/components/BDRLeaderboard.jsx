import { BRAND, STAGES, stageColor } from "../config/pipeline.js";
import { formatPct, formatNum } from "../lib/metrics.js";

export default function BDRLeaderboard({ rows, activities = [], activeBdr, onBdrClick }) {
  const callsByBdr = (() => {
    const m = new Map();
    for (const a of activities) {
      if (a.activityKind !== "call") continue;
      const k = a.bdrName || "Unassigned";
      const cur = m.get(k) || { calls: 0, conversations: 0 };
      cur.calls++;
      if (a.isConversation) cur.conversations++;
      m.set(k, cur);
    }
    return m;
  })();

  return (
    <section style={{ marginBottom: 24 }}>
      <SectionHeader title="BDR Leaderboard" subtitle="Click a row to filter the dashboard by that BDR" />
      {!rows.length ? (
        <Card>
          <div style={{ padding: 20, color: BRAND.muted, fontFamily: BRAND.fontSans }}>
            No BDRs in the selected window.
          </div>
        </Card>
      ) : (
        <Card noPad>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: BRAND.fontSans, minWidth: 1320 }}>
              <thead>
                <tr style={{ background: BRAND.surfaceElevated, color: BRAND.muted }}>
                  <Th>#</Th>
                  <Th>BDR</Th>
                  <Th align="right" title="Tasks with Activity Type = Call (excluding [Outreach][Call])">Calls</Th>
                  <Th align="right" title="Calls >= 3 minutes">Conv</Th>
                  <Th align="right" title="Conversations / Calls">Conv %</Th>
                  <Th align="right" title="Opportunities created with this BDR">Meetings</Th>
                  <Th align="right" title="Discovery_Status__c = Completed">DC Done</Th>
                  <Th align="right" title="DC Completed / Meetings">DC %</Th>
                  <Th align="right" title="Demo_Status__c = Completed">Demo Done</Th>
                  <Th align="right" title="Demo Completed / DC Completed">Demo %</Th>
                  <Th align="right">Won</Th>
                  <Th align="right" title="Won / Demo Completed">Win %</Th>
                  <Th align="right" title="Closed Won / Meetings">Overall %</Th>
                  <Th align="right" title="Number_of_Paid_Locations__c sum on Closed Won">Locs</Th>
                  <Th>Stage Mix</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const isActive = activeBdr === r.bdrName;
                  const ca = callsByBdr.get(r.bdrName) || { calls: 0, conversations: 0 };
                  const convPct = ca.calls === 0 ? null : ca.conversations / ca.calls;
                  return (
                    <tr
                      key={r.bdrName}
                      onClick={() => onBdrClick(isActive ? null : r.bdrName)}
                      style={{
                        cursor: "pointer",
                        background: isActive ? BRAND.primarySoft : (i % 2 ? BRAND.surfaceElevated : BRAND.surface),
                        borderTop: `1px solid ${BRAND.borderSoft}`,
                        transition: "background 120ms ease",
                      }}
                    >
                      <Td mono muted>{String(i + 1).padStart(2, "0")}</Td>
                      <Td>
                        <span style={{ fontWeight: 600, color: BRAND.ink }}>{r.bdrName}</span>
                        {r.disqualified > 0 && (
                          <div style={{ fontSize: 10, color: BRAND.muted, marginTop: 2 }}>
                            {r.disqualified} disqualified
                          </div>
                        )}
                      </Td>
                      <Td align="right">
                        <span style={{ fontFamily: BRAND.fontMono, fontWeight: 600, color: ca.calls > 0 ? BRAND.info : BRAND.mutedSoft, fontVariantNumeric: "tabular-nums" }}>
                          {formatNum(ca.calls)}
                        </span>
                      </Td>
                      <Td align="right" mono>{ca.conversations}</Td>
                      <Td align="right" mono>{convPct == null ? "-" : formatPct(convPct)}</Td>
                      <Td align="right">
                        <span style={{ fontFamily: BRAND.fontMono, fontWeight: 600, color: BRAND.ink, fontVariantNumeric: "tabular-nums" }}>
                          {formatNum(r.total)}
                        </span>
                      </Td>
                      <Td align="right" mono>{r.disco.completed}</Td>
                      <Td align="right" mono>{r.total === 0 ? "-" : formatPct(r.disco.completed / r.total)}</Td>
                      <Td align="right" mono>{r.demo.completed}</Td>
                      <Td align="right" mono>{r.disco.completed === 0 ? "-" : formatPct(r.demo.completed / r.disco.completed)}</Td>
                      <Td align="right" mono>{r.won}</Td>
                      <Td align="right" mono>{r.demo.completed === 0 ? "-" : formatPct(r.won / r.demo.completed)}</Td>
                      <Td align="right" mono>{r.total === 0 ? "-" : formatPct(r.won / r.total)}</Td>
                      <Td align="right" mono>{formatNum(r.paidLocations)}</Td>
                      <Td>
                        <StageBar counts={r.stageCounts} total={r.total} />
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </section>
  );
}

function StageBar({ counts, total }) {
  if (!total) return null;
  return (
    <div style={{ display: "flex", height: 12, minWidth: 200, borderRadius: 999, overflow: "hidden", background: BRAND.borderSoft }}>
      {STAGES.map((s) => {
        const n = counts[s.name] || 0;
        if (!n) return null;
        const pct = (n / total) * 100;
        return (
          <div key={s.name} title={`${s.name}: ${n}`} style={{ width: `${pct}%`, background: stageColor(s.name) }} />
        );
      })}
    </div>
  );
}

function SectionHeader({ title, subtitle }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: BRAND.ink, fontFamily: BRAND.fontSans }}>
        {title}
      </h2>
      {subtitle && (
        <div style={{ marginTop: 2, fontSize: 12, color: BRAND.muted, fontFamily: BRAND.fontSans }}>{subtitle}</div>
      )}
    </div>
  );
}

function Card({ children, noPad }) {
  return (
    <div style={{ background: BRAND.surface, border: `1px solid ${BRAND.border}`, borderRadius: 10, padding: noPad ? 0 : 20, overflow: "hidden" }}>
      {children}
    </div>
  );
}

function Th({ children, align = "left", title }) {
  return (
    <th
      title={title}
      style={{
        textAlign: align,
        padding: "10px 12px",
        fontFamily: BRAND.fontSans,
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: 0.8,
        textTransform: "uppercase",
        cursor: title ? "help" : "default",
      }}
    >{children}</th>
  );
}

function Td({ children, align = "left", mono = false, muted = false }) {
  return (
    <td
      style={{
        padding: "10px 12px",
        fontSize: 13,
        color: muted ? BRAND.muted : BRAND.ink2,
        textAlign: align,
        fontFamily: mono ? BRAND.fontMono : BRAND.fontSans,
        fontVariantNumeric: mono ? "tabular-nums" : "normal",
      }}
    >{children}</td>
  );
}
