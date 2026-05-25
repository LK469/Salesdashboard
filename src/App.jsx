import { useEffect, useMemo, useState } from "react";
import { BRAND } from "./config/pipeline.js";
import { fetchDeals, fetchUsers, fetchActivities } from "./services/api.js";
import { pipelineSummary, bdrLeaderboard, inboundOutboundSplit, activitySummary, userTableFromSources } from "./lib/metrics.js";
import Masthead from "./components/Masthead.jsx";
import MetricCards from "./components/MetricCards.jsx";
import BDRLeaderboard from "./components/BDRLeaderboard.jsx";
import DealList from "./components/DealList.jsx";
import FilterBar from "./components/FilterBar.jsx";
import {
  MonthlyTrendChart,
  TopBdrsChart,
  DiscoveryStatusDonut,
  InboundOutboundChart,
  BdrFunnelChart,
  WeeklyActivitiesChart,
  ConversionTrendChart,
} from "./components/Charts.jsx";

const ACTIVE_WINDOW_DAYS = 90;
const DATA_CUTOFF_DATE = "2025-08-01";
const EXCLUDED_BDRS = new Set(["Supriya Sorout"]);

export default function App() {
  const [deals, setDeals] = useState([]);
  const [users, setUsers] = useState([]);
  const [activities, setActivities] = useState([]);
  const [source, setSource] = useState("loading");
  const [activeStage, setActiveStage] = useState(null);
  const [activeBdr, setActiveBdr] = useState(null);
  const [activeDiscoStatus, setActiveDiscoStatus] = useState(null);
  const [activeIO, setActiveIO] = useState(null);
  const [activeMonth, setActiveMonth] = useState(null);
  const [activeTab, setActiveTab] = useState("overview");
  const [period, setPeriodRaw] = useState("month");
  const [bdrSourcedOnly, setBdrSourcedOnly] = useState(false);
  const [activeBdrsOnly, setActiveBdrsOnly] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const setActiveMonthSmart = (m) => {
    setActiveMonth(m);
    if (m && period === "month") setPeriodRaw("day");
    if (!m && period === "day") setPeriodRaw("month");
  };
  const setPeriod = (p) => setPeriodRaw(p || "month");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const [dealsRes, usersRes, activitiesRes] = await Promise.all([
          fetchDeals(),
          fetchUsers(),
          fetchActivities().catch(() => ({ activities: [] })),
        ]);
        if (cancelled) return;
        setDeals(dealsRes.deals || []);
        setUsers(usersRes.users || []);
        setActivities(activitiesRes.activities || []);
        setSource(dealsRes.source);
      } catch (e) {
        if (!cancelled) setError(String(e?.message || e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const includedDeals = useMemo(
    () => deals.filter((d) => {
      if (!d.bdrName) return false;
      if (EXCLUDED_BDRS.has(d.bdrName)) return false;
      if (!d.createdDate || String(d.createdDate) < DATA_CUTOFF_DATE) return false;
      return true;
    }),
    [deals]
  );

  const userTable = useMemo(
    () => userTableFromSources(includedDeals, activities, ACTIVE_WINDOW_DAYS),
    [includedDeals, activities]
  );
  const activeBdrs = userTable.all;

  const scopedDeals = useMemo(() => {
    return includedDeals.filter((d) => {
      if (bdrSourcedOnly && !(d.bdrSourced || d.sellerSource === "BDR")) return false;
      if (activeBdrsOnly && d.bdrName && !activeBdrs.has(d.bdrName)) return false;
      return true;
    });
  }, [includedDeals, bdrSourcedOnly, activeBdrsOnly, activeBdrs]);

  const scopedActivities = useMemo(() => {
    return activities.filter((a) => {
      if (activeBdrsOnly && a.bdrName && !activeBdrs.has(a.bdrName)) return false;
      if (activeBdr && a.bdrName !== activeBdr) return false;
      return true;
    });
  }, [activities, activeBdrsOnly, activeBdrs, activeBdr]);

  const filteredDealsAllTime = useMemo(() => {
    return scopedDeals.filter((d) => {
      if (activeStage && d.stage !== activeStage) return false;
      if (activeBdr && d.bdrName !== activeBdr) return false;
      if (activeDiscoStatus && d.discoveryStatus !== activeDiscoStatus) return false;
      if (activeIO && d.inboundOrOutbound !== activeIO) return false;
      return true;
    });
  }, [scopedDeals, activeStage, activeBdr, activeDiscoStatus, activeIO]);

  const filteredDeals = useMemo(() => {
    if (!activeMonth) return filteredDealsAllTime;
    return filteredDealsAllTime.filter((d) => {
      const m = d.createdDate ? String(d.createdDate).slice(0, 7) : "";
      return m === activeMonth;
    });
  }, [filteredDealsAllTime, activeMonth]);

  const lbDeals = useMemo(() => {
    return scopedDeals.filter((d) => {
      if (activeStage && d.stage !== activeStage) return false;
      if (activeDiscoStatus && d.discoveryStatus !== activeDiscoStatus) return false;
      if (activeIO && d.inboundOrOutbound !== activeIO) return false;
      if (activeMonth) {
        const m = d.createdDate ? String(d.createdDate).slice(0, 7) : "";
        if (m !== activeMonth) return false;
      }
      return true;
    });
  }, [scopedDeals, activeStage, activeDiscoStatus, activeIO, activeMonth]);

  const summary = useMemo(
    () => pipelineSummary(filteredDealsAllTime, { activeMonth }),
    [filteredDealsAllTime, activeMonth]
  );
  const lbRows = useMemo(() => bdrLeaderboard(lbDeals), [lbDeals]);
  const io = useMemo(
    () => inboundOutboundSplit(filteredDealsAllTime, activeMonth),
    [filteredDealsAllTime, activeMonth]
  );
  const actSummary = useMemo(() => activitySummary(scopedActivities), [scopedActivities]);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: BRAND.pageGradient,
        fontFamily: BRAND.fontSans,
        color: BRAND.ink,
        padding: "20px 20px 64px",
      }}
    >
      <div style={{ maxWidth: 1400, margin: "0 auto" }}>
        <Masthead counts={summary.counts} source={source} />

        {loading && <Banner kind="info">Loading data from backend...</Banner>}
        {error && (
          <Banner kind="error">
            Could not reach the backend at <code>/api/deals</code>. Did you run{" "}
            <code>npm run server</code>? - {error}
          </Banner>
        )}

        {!loading && !error && (
          <>
            <FilterBar
              deals={scopedDeals}
              bdrSourcedOnly={bdrSourcedOnly}
              setBdrSourcedOnly={setBdrSourcedOnly}
              activeBdrsOnly={activeBdrsOnly}
              setActiveBdrsOnly={setActiveBdrsOnly}
              activeBdrCount={activeBdrs.size}
              activeBdr={activeBdr}
              setActiveBdr={setActiveBdr}
              activeStage={activeStage}
              setActiveStage={setActiveStage}
              activeDiscoStatus={activeDiscoStatus}
              setActiveDiscoStatus={setActiveDiscoStatus}
              activeIO={activeIO}
              setActiveIO={setActiveIO}
              activeMonth={activeMonth}
              setActiveMonth={setActiveMonthSmart}
              period={period}
              setPeriod={setPeriod}
              scopedCount={scopedDeals.length}
              filteredCount={filteredDeals.length}
              windowDays={ACTIVE_WINDOW_DAYS}
            />

            {activeBdr && <BdrSpotlight bdrName={activeBdr} summary={summary} />}

            <Tabs
              tabs={[
                { id: "overview", label: "Overview" },
                { id: "opportunities", label: `Opportunity Detail (${filteredDeals.length.toLocaleString()})` },
              ]}
              active={activeTab}
              onChange={setActiveTab}
            />

            {activeTab === "overview" && (
              <>
                <MetricCards summary={summary} io={io} act={actSummary} source={source} />

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
                  <WeeklyActivitiesChart activities={scopedActivities} />
                  <ConversionTrendChart activities={scopedActivities} />
                </div>

                <div style={{ marginBottom: 16 }}>
                  <BdrFunnelChart deals={filteredDealsAllTime} activeMonth={activeMonth} />
                </div>

                <div style={{ marginBottom: 16 }}>
                  <MonthlyTrendChart deals={filteredDealsAllTime} period={period} activeMonth={activeMonth} />
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
                  <DiscoveryStatusDonut deals={filteredDeals} />
                  <InboundOutboundChart deals={filteredDeals} />
                </div>

                <div style={{ marginBottom: 24 }}>
                  <TopBdrsChart deals={filteredDeals} metric="wins" topN={10} />
                </div>

                <BDRLeaderboard
                  rows={lbRows}
                  activities={scopedActivities}
                  activeBdr={activeBdr}
                  onBdrClick={setActiveBdr}
                />
              </>
            )}

            {activeTab === "opportunities" && (
              <DealList deals={filteredDeals} />
            )}
          </>
        )}

        <footer
          style={{
            marginTop: 40,
            paddingTop: 16,
            borderTop: `1px solid ${BRAND.border}`,
            fontSize: 12,
            color: BRAND.muted,
            display: "flex",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 16,
          }}
        >
          <span style={{ color: BRAND.ink2 }}>WellnessLiving - BDR Dashboard</span>
          <span>Source: <span style={{ color: BRAND.primary }}>{source}</span></span>
          <span>{scopedDeals.length.toLocaleString()} scoped - {activeBdrs.size} active BDRs - {users.length} users</span>
        </footer>
      </div>
    </div>
  );
}

function Tabs({ tabs, active, onChange }) {
  return (
    <div style={{ display: "flex", gap: 0, marginBottom: 16, borderBottom: `1px solid ${BRAND.border}` }}>
      {tabs.map((t) => {
        const isActive = t.id === active;
        return (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            style={{
              background: "transparent",
              border: "none",
              padding: "12px 20px",
              marginBottom: -1,
              fontFamily: BRAND.fontSans,
              fontSize: 14,
              fontWeight: isActive ? 600 : 500,
              color: isActive ? BRAND.primary : BRAND.muted,
              cursor: "pointer",
              borderBottom: `2px solid ${isActive ? BRAND.primary : "transparent"}`,
            }}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

function BdrSpotlight({ bdrName, summary }) {
  return (
    <div
      style={{
        background: BRAND.heroGradient,
        color: "#fff",
        padding: "20px 24px",
        marginBottom: 16,
        borderRadius: 10,
        display: "flex",
        justifyContent: "space-between",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 16,
      }}
    >
      <div>
        <div style={{ fontSize: 11, fontWeight: 500, letterSpacing: 1.5, textTransform: "uppercase", opacity: 0.75 }}>
          Spotlight
        </div>
        <div style={{ fontSize: 26, fontWeight: 700, marginTop: 2, letterSpacing: -0.3 }}>{bdrName}</div>
      </div>
      <div style={{ display: "flex", gap: 28, flexWrap: "wrap" }}>
        <SpotStat label="Discoveries" value={summary.discovery.completed} />
        <SpotStat label="Show Rate" value={`${Math.round(summary.discovery.showRate * 100)}%`} />
        <SpotStat label="Demos" value={summary.demo?.completed || 0} />
        <SpotStat label="Won" value={summary.counts.won} />
        <SpotStat label="Win Rate" value={`${Math.round(summary.winRate * 100)}%`} />
        <SpotStat label="Locations" value={summary.paidLocations} />
      </div>
    </div>
  );
}

function SpotStat({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 500, letterSpacing: 1.2, opacity: 0.75, textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, marginTop: 2, fontVariantNumeric: "tabular-nums" }}>
        {typeof value === "number" ? value.toLocaleString() : value}
      </div>
    </div>
  );
}

function Banner({ kind, children }) {
  const colors = kind === "error"
    ? { bg: BRAND.dangerSoft, border: BRAND.danger, text: "#ffd2d2" }
    : { bg: BRAND.primarySoft, border: BRAND.primary, text: BRAND.ink2 };
  return (
    <div
      style={{
        background: colors.bg,
        border: `1px solid ${colors.border}`,
        color: colors.text,
        padding: "12px 16px",
        marginBottom: 16,
        borderRadius: 8,
        fontSize: 13,
      }}
    >{children}</div>
  );
}
