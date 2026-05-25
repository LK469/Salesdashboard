import { useMemo, useRef, useState, useEffect } from "react";
import { BRAND, STAGES, DISCOVERY_STATUSES } from "../config/pipeline.js";

export default function FilterBar({
  deals,
  bdrSourcedOnly, setBdrSourcedOnly,
  activeBdrsOnly, setActiveBdrsOnly,
  activeBdrCount,
  activeBdr, setActiveBdr,
  activeStage, setActiveStage,
  activeDiscoStatus, setActiveDiscoStatus,
  activeIO, setActiveIO,
  activeMonth, setActiveMonth,
  period, setPeriod,
  scopedCount, filteredCount,
  windowDays = 90,
}) {
  const bdrOptions = useMemo(() => {
    const counts = new Map();
    for (const d of deals) {
      if (!d.bdrName) continue;
      counts.set(d.bdrName, (counts.get(d.bdrName) || 0) + 1);
    }
    return [...counts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name));
  }, [deals]);

  const monthOptions = useMemo(() => {
    const counts = new Map();
    for (const d of deals) {
      if (!d.createdDate) continue;
      const m = String(d.createdDate).slice(0, 7);
      counts.set(m, (counts.get(m) || 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([month, count]) => ({ value: month, label: monthLabel(month), count }));
  }, [deals]);

  const filterCount = [activeBdr, activeStage, activeDiscoStatus, activeIO, activeMonth].filter(Boolean).length;

  function clearAll() {
    setActiveBdr(null);
    setActiveStage(null);
    setActiveDiscoStatus(null);
    setActiveIO(null);
    setActiveMonth(null);
  }

  return (
    <section
      style={{
        background: BRAND.surface,
        border: `1px solid ${BRAND.border}`,
        borderRadius: 10,
        padding: "16px 18px",
        marginBottom: 20,
      }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end" }}>
        <Dropdown
          label={`BDR (${bdrOptions.length})`}
          width={240}
          value={activeBdr}
          displayValue={activeBdr}
          placeholder="All BDRs"
          searchable
          options={bdrOptions.map((o) => ({ value: o.name, label: o.name, count: o.count }))}
          onChange={setActiveBdr}
        />
        <Dropdown
          label="Month"
          width={200}
          value={activeMonth}
          displayValue={activeMonth ? monthLabel(activeMonth) : null}
          placeholder="All months"
          options={monthOptions}
          onChange={setActiveMonth}
        />
        <Dropdown
          label="Group by"
          width={140}
          value={period}
          displayValue={period ? periodLabel(period) : null}
          placeholder="Month"
          options={[
            { value: "day", label: "Day" },
            { value: "month", label: "Month" },
            { value: "quarter", label: "Quarter" },
            { value: "year", label: "Year" },
          ]}
          onChange={(v) => setPeriod(v || "month")}
        />
        <Dropdown
          label="Stage"
          width={200}
          value={activeStage}
          displayValue={activeStage}
          placeholder="All stages"
          options={STAGES.map((s) => ({ value: s.name, label: s.name }))}
          onChange={setActiveStage}
        />
        <Dropdown
          label="Discovery"
          width={170}
          value={activeDiscoStatus}
          displayValue={activeDiscoStatus}
          placeholder="All statuses"
          options={DISCOVERY_STATUSES.map((s) => ({ value: s.name, label: s.name }))}
          onChange={setActiveDiscoStatus}
        />
        <Dropdown
          label="Source"
          width={140}
          value={activeIO}
          displayValue={activeIO}
          placeholder="In + Out"
          options={[{ value: "Inbound", label: "Inbound" }, { value: "Outbound", label: "Outbound" }]}
          onChange={setActiveIO}
        />
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <label
            style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontFamily: BRAND.fontSans, fontSize: 13, color: BRAND.ink }}
            title={`A BDR is "active" if they had a deal in the last ${windowDays} days of the dataset.`}
          >
            <input
              type="checkbox"
              checked={activeBdrsOnly}
              onChange={(e) => setActiveBdrsOnly(e.target.checked)}
              style={{ accentColor: BRAND.primary, width: 14, height: 14 }}
            />
            Active BDRs only ({activeBdrCount})
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontFamily: BRAND.fontSans, fontSize: 13, color: BRAND.ink }}>
            <input
              type="checkbox"
              checked={bdrSourcedOnly}
              onChange={(e) => setBdrSourcedOnly(e.target.checked)}
              style={{ accentColor: BRAND.primary, width: 14, height: 14 }}
            />
            BDR-sourced only
          </label>
          {filterCount > 0 && (
            <button
              onClick={clearAll}
              style={{
                background: BRAND.surface,
                border: `1px solid ${BRAND.primary}`,
                color: BRAND.primary,
                padding: "6px 12px",
                borderRadius: 6,
                fontFamily: BRAND.fontSans,
                fontSize: 12,
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              Clear {filterCount} filter{filterCount !== 1 ? "s" : ""}
            </button>
          )}
        </div>
      </div>

      {filterCount > 0 && (
        <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
          <span style={{ fontFamily: BRAND.fontSans, fontSize: 11, fontWeight: 600, letterSpacing: 0.8, textTransform: "uppercase", color: BRAND.muted }}>
            Active filters:
          </span>
          {activeBdr && <Chip label={`BDR: ${activeBdr}`} onClear={() => setActiveBdr(null)} />}
          {activeMonth && <Chip label={`Month: ${monthLabel(activeMonth)}`} onClear={() => setActiveMonth(null)} />}
          {activeStage && <Chip label={`Stage: ${activeStage}`} onClear={() => setActiveStage(null)} />}
          {activeDiscoStatus && <Chip label={`Discovery: ${activeDiscoStatus}`} onClear={() => setActiveDiscoStatus(null)} />}
          {activeIO && <Chip label={`Source: ${activeIO}`} onClear={() => setActiveIO(null)} />}
        </div>
      )}

      <div
        style={{
          marginTop: 12,
          paddingTop: 12,
          borderTop: `1px solid ${BRAND.border}`,
          fontFamily: BRAND.fontSans,
          fontSize: 12,
          color: BRAND.muted,
          display: "flex",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <span>
          Showing <strong style={{ color: BRAND.primary, fontVariantNumeric: "tabular-nums" }}>{filteredCount.toLocaleString()}</strong>{" "}
          of <strong style={{ color: BRAND.ink2, fontVariantNumeric: "tabular-nums" }}>{scopedCount.toLocaleString()}</strong> deals
        </span>
        <span>-</span>
        <span>{bdrOptions.length} BDRs in scope</span>
        <span>-</span>
        <span>{monthOptions.length} months of history</span>
      </div>
    </section>
  );
}

function Dropdown({ label, width = 200, value, displayValue, placeholder, options, onChange, searchable = false }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapRef = useRef(null);

  useEffect(() => {
    function onDocClick(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const filtered = useMemo(() => {
    if (!searchable) return options;
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query, searchable]);

  function select(v) {
    onChange(v);
    setOpen(false);
    setQuery("");
  }
  function clear(e) {
    e.stopPropagation();
    onChange(null);
    setQuery("");
  }

  return (
    <div ref={wrapRef} style={{ display: "flex", flexDirection: "column", gap: 4, width, position: "relative" }}>
      <label style={{ fontFamily: BRAND.fontSans, fontSize: 10, fontWeight: 600, letterSpacing: 0.8, color: BRAND.muted, textTransform: "uppercase" }}>
        {label}
      </label>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          background: value ? BRAND.primarySoft : BRAND.surfaceElevated,
          border: `1px solid ${value ? BRAND.primary : BRAND.border}`,
          padding: "8px 10px",
          fontFamily: BRAND.fontSans,
          fontSize: 13,
          color: BRAND.ink,
          borderRadius: 6,
          cursor: "pointer",
          textAlign: "left",
          width: "100%",
          outline: "none",
        }}
      >
        <span style={{ flex: 1, fontWeight: value ? 600 : 400, color: value ? BRAND.primary : BRAND.mutedSoft, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {displayValue || placeholder}
        </span>
        {value ? (
          <span onClick={clear} style={{ color: BRAND.primary, fontSize: 16, fontWeight: 600, lineHeight: 1, padding: "0 2px", cursor: "pointer" }} title="Clear" role="button">x</span>
        ) : (
          <span style={{ color: BRAND.muted, fontSize: 10 }}>v</span>
        )}
      </button>
      {open && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            marginTop: 4,
            background: BRAND.surfaceHigh,
            border: `1px solid ${BRAND.borderStrong}`,
            borderRadius: 8,
            boxShadow: "0 16px 40px rgba(0,0,0,0.5)",
            zIndex: 50,
            maxHeight: 320,
            overflowY: "auto",
            minWidth: "100%",
          }}
        >
          {searchable && (
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${options.length}...`}
              style={{
                width: "100%",
                border: "none",
                borderBottom: `1px solid ${BRAND.border}`,
                padding: "10px 12px",
                fontFamily: BRAND.fontSans,
                fontSize: 13,
                outline: "none",
                boxSizing: "border-box",
                background: BRAND.surfaceHigh,
                color: BRAND.ink,
              }}
            />
          )}
          {filtered.length === 0 && (
            <div style={{ padding: 12, color: BRAND.muted, fontSize: 12, fontFamily: BRAND.fontSans }}>
              No matches
            </div>
          )}
          {filtered.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => select(o.value)}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                width: "100%",
                background: o.value === value ? BRAND.primarySoft : "transparent",
                border: "none",
                padding: "8px 12px",
                fontFamily: BRAND.fontSans,
                fontSize: 13,
                cursor: "pointer",
                textAlign: "left",
                color: BRAND.ink,
              }}
            >
              <span>{o.label}</span>
              {o.count != null && (
                <span style={{ fontFamily: BRAND.fontMono, fontSize: 11, color: BRAND.muted }}>{o.count.toLocaleString()}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Chip({ label, onClear }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        background: BRAND.primarySoft,
        border: `1px solid ${BRAND.primary}`,
        color: BRAND.primary,
        padding: "3px 8px 3px 10px",
        borderRadius: 999,
        fontFamily: BRAND.fontSans,
        fontSize: 12,
        fontWeight: 500,
      }}
    >
      {label}
      <button
        onClick={onClear}
        style={{ background: "transparent", border: "none", color: BRAND.primary, cursor: "pointer", fontSize: 14, padding: 0, lineHeight: 1, fontWeight: 600 }}
        title="Clear this filter"
      >x</button>
    </span>
  );
}

function periodLabel(p) {
  return p === "day" ? "Day" : p === "quarter" ? "Quarter" : p === "year" ? "Year" : "Month";
}

function monthLabel(m) {
  if (!m) return "-";
  const [y, mm] = m.split("-");
  return new Date(Number(y), Number(mm) - 1, 1).toLocaleString("en", { month: "long", year: "numeric" });
}
