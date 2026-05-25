import { BRAND } from "../config/pipeline.js";

export default function Masthead({ counts, source }) {
  return (
    <header
      style={{
        background: BRAND.heroGradient,
        color: BRAND.onDark,
        padding: "32px 32px",
        marginBottom: 24,
        borderRadius: 12,
        boxShadow: "0 12px 32px -16px rgba(46, 16, 101, 0.4)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        aria-hidden
        style={{
          position: "absolute",
          right: -80,
          top: -80,
          width: 320,
          height: 320,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(255,255,255,0.10) 0%, transparent 70%)",
        }}
      />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 20, position: "relative" }}>
        <div>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "4px 10px",
              borderRadius: 999,
              background: "rgba(255,255,255,0.14)",
              fontSize: 11,
              fontWeight: 500,
              letterSpacing: 1.5,
              textTransform: "uppercase",
              fontFamily: BRAND.fontSans,
              color: BRAND.mutedOnDark,
              marginBottom: 14,
            }}
          >
            <Flower /> WellnessLiving - BDR Operations
          </div>
          <h1
            style={{
              fontSize: 38,
              fontWeight: 700,
              margin: "0 0 4px",
              letterSpacing: -0.8,
              lineHeight: 1.1,
              color: BRAND.onDark,
              fontFamily: BRAND.fontSans,
            }}
          >
            BDR Performance Dashboard
          </h1>
          <div style={{ fontSize: 14, color: BRAND.mutedOnDark, maxWidth: 560, fontFamily: BRAND.fontSans }}>
            Pipeline, rep performance, and discovery health - sourced from{" "}
            <strong style={{ color: BRAND.onDark }}>{sourceLabel(source)}</strong>.
          </div>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(80px, auto))",
            gap: "12px 28px",
            fontFamily: BRAND.fontSans,
            background: "rgba(255,255,255,0.10)",
            border: "1px solid rgba(255,255,255,0.18)",
            borderRadius: 10,
            padding: "16px 22px",
            minWidth: 220,
          }}
        >
          <Stat label="Deals" value={counts.total} />
          <Stat label="Open" value={counts.open} />
          <Stat label="Won" value={counts.won} />
          <Stat label="Lost" value={counts.lost} />
        </div>
      </div>
    </header>
  );
}

function Stat({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 500, letterSpacing: 1.5, opacity: 0.7, textTransform: "uppercase", color: "#fff" }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: "#fff", lineHeight: 1.1, marginTop: 2, fontVariantNumeric: "tabular-nums" }}>
        {Number(value || 0).toLocaleString()}
      </div>
    </div>
  );
}

function Flower() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <circle cx="12" cy="12" r="2.4" stroke="currentColor" strokeWidth="1.6" />
      {[0, 60, 120, 180, 240, 300].map((deg) => (
        <ellipse key={deg} cx="12" cy="5.2" rx="2" ry="3.6" stroke="currentColor" strokeWidth="1.6" fill="none" transform={`rotate(${deg} 12 12)`} />
      ))}
    </svg>
  );
}

function sourceLabel(s) {
  if (s === "salesforce") return "Salesforce (live)";
  if (s === "excel") return "BDR data sheet / OneDrive";
  if (s === "sharepoint") return "SharePoint";
  if (s === "mock") return "sample data";
  return s || "-";
}
