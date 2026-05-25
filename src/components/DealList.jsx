import { useState, useMemo } from "react";
import { BRAND, stageColor, DISCOVERY_STATUSES, DEMO_STATUSES } from "../config/pipeline.js";
import { formatDate } from "../lib/metrics.js";

const DISCO_COLOR = Object.fromEntries(DISCOVERY_STATUSES.map((s) => [s.name, s.color]));
const DEMO_COLOR = Object.fromEntries(DEMO_STATUSES.map((s) => [s.name, s.color]));

export default function DealList({ deals }) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState("createdDate");
  const [sortDir, setSortDir] = useState("desc");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const out = q
      ? deals.filter((d) =>
          d.name?.toLowerCase().includes(q) ||
          d.accountName?.toLowerCase().includes(q) ||
          d.bdrName?.toLowerCase().includes(q) ||
          d.ownerName?.toLowerCase().includes(q))
      : deals.slice();
    out.sort((a, b) => {
      const av = a[sortKey]; const bv = b[sortKey];
      if (av == null) return 1;
      if (bv == null) return -1;
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return out;
  }, [deals, query, sortKey, sortDir]);

  function setSort(key) {
    if (sortKey === key) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  }

  return (
    <section style={{ marginBottom: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: BRAND.ink, fontFamily: BRAND.fontSans }}>
            Deal Detail
          </h2>
          <div style={{ marginTop: 2, fontSize: 12, color: BRAND.muted, fontFamily: BRAND.fontSans }}>
            {filtered.length.toLocaleString()} of {deals.length.toLocaleString()} deals - click headers to sort
          </div>
        </div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search deal, account, BDR, AE..."
          style={{
            background: BRAND.surfaceElevated,
            border: `1px solid ${BRAND.border}`,
            padding: "8px 12px",
            fontFamily: BRAND.fontSans,
            fontSize: 13,
            width: 280,
            outline: "none",
            borderRadius: 6,
            color: BRAND.ink,
          }}
        />
      </div>
      <div style={{ background: BRAND.surface, border: `1px solid ${BRAND.border}`, borderRadius: 10, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: BRAND.fontSans, minWidth: 1200 }}>
            <thead>
              <tr style={{ background: BRAND.surfaceElevated, color: BRAND.muted }}>
                <Th onClick={() => setSort("name")} active={sortKey === "name"} dir={sortDir}>Deal</Th>
                <Th onClick={() => setSort("accountName")} active={sortKey === "accountName"} dir={sortDir}>Account</Th>
                <Th onClick={() => setSort("stage")} active={sortKey === "stage"} dir={sortDir}>Stage</Th>
                <Th onClick={() => setSort("discoveryStatus")} active={sortKey === "discoveryStatus"} dir={sortDir}>Disco</Th>
                <Th onClick={() => setSort("demoStatus")} active={sortKey === "demoStatus"} dir={sortDir}>Demo</Th>
                <Th onClick={() => setSort("bdrName")} active={sortKey === "bdrName"} dir={sortDir}>BDR</Th>
                <Th onClick={() => setSort("ownerName")} active={sortKey === "ownerName"} dir={sortDir}>AE</Th>
                <Th onClick={() => setSort("paidLocations")} active={sortKey === "paidLocations"} dir={sortDir} align="right">Locs</Th>
                <Th onClick={() => setSort("createdDate")} active={sortKey === "createdDate"} dir={sortDir}>Created</Th>
                <Th onClick={() => setSort("closeDate")} active={sortKey === "closeDate"} dir={sortDir}>Close</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 250).map((d, i) => (
                <tr key={d.id} style={{ borderTop: `1px solid ${BRAND.borderSoft}`, background: i % 2 ? BRAND.surfaceElevated : BRAND.surface }}>
                  <Td>
                    <div style={{ fontWeight: 600, color: BRAND.ink }}>{d.name}</div>
                    <div style={{ fontFamily: BRAND.fontMono, fontSize: 10, color: BRAND.muted, marginTop: 2 }}>
                      {String(d.id).slice(-10)}
                      {d.bdrSourced && <span style={{ marginLeft: 6, color: BRAND.primary }}>- BDR-sourced</span>}
                      {d.lossSubReason && <span style={{ marginLeft: 6, color: BRAND.danger }}>- {d.lossSubReason}</span>}
                    </div>
                  </Td>
                  <Td>{d.accountName}</Td>
                  <Td><Tag color={stageColor(d.stage)}>{d.stage}</Tag></Td>
                  <Td>
                    {d.discoveryStatus ? <Tag color={DISCO_COLOR[d.discoveryStatus] || "#888"}>{d.discoveryStatus}</Tag> : dash()}
                    {d.discoveryAttemptCount > 1 && (
                      <div style={{ fontSize: 10, color: BRAND.muted, marginTop: 2, fontFamily: BRAND.fontMono }}>
                        {d.discoveryAttemptCount} attempts
                      </div>
                    )}
                  </Td>
                  <Td>
                    {d.demoStatus ? <Tag color={DEMO_COLOR[d.demoStatus] || "#888"}>{d.demoStatus}</Tag> : dash()}
                  </Td>
                  <Td>
                    {d.bdrName || dash()}
                    {d.fullCycleOpp && (
                      <div style={{ fontSize: 10, color: BRAND.primary, marginTop: 2, fontWeight: 500 }}>full-cycle</div>
                    )}
                  </Td>
                  <Td>{d.ownerName}</Td>
                  <Td align="right" mono>{d.paidLocations ?? "-"}</Td>
                  <Td mono>{formatDate(d.createdDate)}</Td>
                  <Td mono>{formatDate(d.closeDate)}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length > 250 && (
          <div style={{ padding: "12px 16px", fontFamily: BRAND.fontSans, fontSize: 12, color: BRAND.muted, borderTop: `1px solid ${BRAND.borderSoft}` }}>
            Showing first 250 of {filtered.length.toLocaleString()}. Refine your filters to narrow.
          </div>
        )}
      </div>
    </section>
  );
}

function dash() {
  return <span style={{ color: BRAND.mutedSoft }}>-</span>;
}

function Tag({ children, color }) {
  return (
    <span
      style={{
        display: "inline-block",
        background: `${color}1a`,
        color,
        border: `1px solid ${color}55`,
        borderRadius: 999,
        padding: "2px 10px",
        fontFamily: BRAND.fontSans,
        fontSize: 11,
        fontWeight: 500,
        whiteSpace: "nowrap",
      }}
    >{children}</span>
  );
}

function Th({ children, align = "left", onClick, active, dir }) {
  return (
    <th
      onClick={onClick}
      style={{
        textAlign: align,
        padding: "10px 12px",
        fontFamily: BRAND.fontSans,
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: 0.8,
        textTransform: "uppercase",
        cursor: onClick ? "pointer" : "default",
        userSelect: "none",
      }}
    >
      {children}
      {active && <span style={{ marginLeft: 4, color: BRAND.primary }}>{dir === "asc" ? "^" : "v"}</span>}
    </th>
  );
}

function Td({ children, align = "left", mono = false }) {
  return (
    <td
      style={{
        padding: "10px 12px",
        fontSize: 13,
        color: BRAND.ink2,
        textAlign: align,
        fontFamily: mono ? BRAND.fontMono : BRAND.fontSans,
        fontVariantNumeric: mono ? "tabular-nums" : "normal",
        verticalAlign: "top",
      }}
    >{children}</td>
  );
}
