import { STAGES, OPEN_STAGES, DISCOVERY_STATUSES, isDisqualifiedLoss } from "../config/pipeline.js";

export function formatMoney(n) {
  if (n == null || isNaN(n)) return "-";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${Math.round(n).toLocaleString()}`;
}

export function formatNum(n) {
  if (n == null || isNaN(n)) return "-";
  return n.toLocaleString();
}

export function formatPct(n, digits = 0) {
  if (n == null || isNaN(n)) return "-";
  return `${(n * 100).toFixed(digits)}%`;
}

export function formatDate(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function daysBetween(a, b = new Date()) {
  if (!a) return null;
  const start = new Date(a);
  const end = b instanceof Date ? b : new Date(b);
  return Math.round((end - start) / (1000 * 60 * 60 * 24));
}

export function bucketByStage(deals) {
  const map = Object.fromEntries(STAGES.map((s) => [s.name, []]));
  for (const d of deals) {
    if (map[d.stage]) map[d.stage].push(d);
  }
  return map;
}

function inMonth(dt, activeMonth) {
  return !activeMonth || (dt && String(dt).slice(0, 7) === activeMonth);
}

function discoveryDate(d) {
  if (d.discoveryStatus === "Completed" || d.discoveryStatus === "Follow-Up Demo") {
    return d.discoveryCompletedDate || d.discoveryScheduledTime;
  }
  return d.discoveryScheduledTime;
}

function demoDate(d) {
  if (d.demoStatus === "Completed") return d.demoCompletedDate || d.demoScheduledTime;
  return d.demoScheduledTime;
}

export function showRateBreakdown(deals, activeMonth = null) {
  let completed = 0, noShow = 0, cancelled = 0, scheduled = 0, rescheduled = 0, pending = 0, followUpDemo = 0;
  for (const d of deals) {
    if (!inMonth(discoveryDate(d), activeMonth)) continue;
    switch (d.discoveryStatus) {
      case "Completed": completed++; break;
      case "No Show": noShow++; break;
      case "Cancelled": cancelled++; break;
      case "Scheduled": scheduled++; break;
      case "Rescheduled": rescheduled++; break;
      case "Pending": pending++; break;
      case "Follow-Up Demo": followUpDemo++; break;
      default: break;
    }
  }
  const denom = completed + noShow + cancelled;
  return {
    completed, noShow, cancelled, scheduled, rescheduled, pending, followUpDemo,
    showRate: denom === 0 ? 0 : completed / denom,
    meetingsBooked: completed + noShow + cancelled + rescheduled + scheduled + followUpDemo,
  };
}

export function discoveryStatusCounts(deals) {
  const counts = Object.fromEntries(DISCOVERY_STATUSES.map((s) => [s.name, 0]));
  let unset = 0;
  for (const d of deals) {
    if (d.discoveryStatus && counts[d.discoveryStatus] != null) counts[d.discoveryStatus]++;
    else unset++;
  }
  return { counts, unset };
}

function demoBreakdown(deals, activeMonth = null) {
  let completed = 0, noShow = 0, cancelled = 0, scheduled = 0, rescheduled = 0, pending = 0;
  for (const d of deals) {
    if (!inMonth(demoDate(d), activeMonth)) continue;
    switch (d.demoStatus) {
      case "Completed": completed++; break;
      case "No Show": noShow++; break;
      case "Cancelled": cancelled++; break;
      case "Scheduled": scheduled++; break;
      case "Rescheduled": rescheduled++; break;
      case "Pending": pending++; break;
      default: break;
    }
  }
  const denom = completed + noShow + cancelled;
  return {
    completed, noShow, cancelled, scheduled, rescheduled, pending,
    showRate: denom === 0 ? 0 : completed / denom,
  };
}

export function pipelineSummary(deals, { activeMonth = null } = {}) {
  const cohort = activeMonth
    ? deals.filter((d) => d.createdDate && String(d.createdDate).slice(0, 7) === activeMonth)
    : deals;

  const buckets = bucketByStage(cohort);
  const open = cohort.filter((d) => !d.isClosed);
  const won = cohort.filter((d) => d.isWon);
  const closedLost = cohort.filter((d) => d.isClosed && !d.isWon);
  const realLosses = closedLost.filter((d) => !isDisqualifiedLoss(d.lossReason));
  const disqualified = closedLost.filter((d) => isDisqualifiedLoss(d.lossReason));

  const openAmount = open.reduce((a, d) => a + (d.amount || 0), 0);
  const wonAmount = won.reduce((a, d) => a + (d.amount || 0), 0);
  const wonMrr = won.reduce((a, d) => a + (d.mrr || 0), 0);
  const paidLocations = won.reduce((a, d) => a + (d.paidLocations || 0), 0);
  const realDecided = won.length + realLosses.length;
  const rawClosed = won.length + closedLost.length;
  const weightedPipeline = open.reduce(
    (a, d) => a + (d.amount || 0) * ((d.probability || 0) / 100),
    0
  );

  return {
    buckets,
    counts: {
      total: cohort.length,
      open: open.length,
      won: won.length,
      lost: closedLost.length,
      realLost: realLosses.length,
      disqualified: disqualified.length,
    },
    openAmount,
    wonAmount,
    wonMrr,
    weightedPipeline,
    paidLocations,
    winRate: realDecided === 0 ? 0 : won.length / realDecided,
    rawWinRate: rawClosed === 0 ? 0 : won.length / rawClosed,
    discovery: showRateBreakdown(cohort),
    demo: demoBreakdown(cohort),
  };
}

export function bdrLeaderboard(deals) {
  const byBdr = new Map();
  for (const d of deals) {
    const key = d.bdrName || "Unassigned";
    if (!byBdr.has(key)) {
      byBdr.set(key, {
        bdrName: key,
        total: 0,
        open: 0,
        won: 0,
        lost: 0,
        disqualified: 0,
        fullCycle: 0,
        wonAmount: 0,
        wonMrr: 0,
        wonArr: 0,
        pipelineAmount: 0,
        paidLocations: 0,
        stageCounts: Object.fromEntries(STAGES.map((s) => [s.name, 0])),
        disco: { completed: 0, noShow: 0, cancelled: 0, scheduled: 0, rescheduled: 0, pending: 0, followUpDemo: 0 },
        demo: { completed: 0, noShow: 0, cancelled: 0, scheduled: 0, rescheduled: 0, pending: 0 },
        gamificationPoints: 0,
        discoveryAttempts: 0,
        demoAttempts: 0,
      });
    }
    const row = byBdr.get(key);
    row.total++;
    row.stageCounts[d.stage] = (row.stageCounts[d.stage] || 0) + 1;
    if (d.fullCycleOpp) row.fullCycle++;
    row.gamificationPoints += d.gamificationPoints || 0;
    row.discoveryAttempts += d.discoveryAttemptCount || 0;
    row.demoAttempts += d.demoAttemptCount || 0;
    if (d.isWon) {
      row.won++;
      row.wonAmount += d.amount || 0;
      row.wonMrr += d.mrr || 0;
      row.wonArr += d.arr || 0;
      row.paidLocations += d.paidLocations || 0;
    } else if (d.isClosed) {
      if (isDisqualifiedLoss(d.lossReason)) row.disqualified++;
      else row.lost++;
    } else {
      row.open++;
      row.pipelineAmount += d.amount || 0;
    }
    switch (d.discoveryStatus) {
      case "Completed": row.disco.completed++; break;
      case "No Show": row.disco.noShow++; break;
      case "Cancelled": row.disco.cancelled++; break;
      case "Scheduled": row.disco.scheduled++; break;
      case "Rescheduled": row.disco.rescheduled++; break;
      case "Pending": row.disco.pending++; break;
      case "Follow-Up Demo": row.disco.followUpDemo++; break;
      default: break;
    }
    switch (d.demoStatus) {
      case "Completed": row.demo.completed++; break;
      case "No Show": row.demo.noShow++; break;
      case "Cancelled": row.demo.cancelled++; break;
      case "Scheduled": row.demo.scheduled++; break;
      case "Rescheduled": row.demo.rescheduled++; break;
      case "Pending": row.demo.pending++; break;
      default: break;
    }
  }
  const rows = [...byBdr.values()].map((r) => {
    const realDecided = r.won + r.lost;
    const showDenom = r.disco.completed + r.disco.noShow + r.disco.cancelled;
    const demoShowDenom = r.demo.completed + r.demo.noShow + r.demo.cancelled;
    return {
      ...r,
      winRate: realDecided === 0 ? 0 : r.won / realDecided,
      showRate: showDenom === 0 ? 0 : r.disco.completed / showDenom,
      demoShowRate: demoShowDenom === 0 ? 0 : r.demo.completed / demoShowDenom,
    };
  });
  rows.sort(
    (a, b) =>
      b.gamificationPoints - a.gamificationPoints ||
      b.won - a.won ||
      b.disco.completed - a.disco.completed
  );
  return rows;
}

export function inboundOutboundSplit(deals, activeMonth = null) {
  const inCreatedMonth = (d) => !activeMonth || (d.createdDate && String(d.createdDate).slice(0, 7) === activeMonth);
  const inCloseMonth = (d) => !activeMonth || (d.closeDate && String(d.closeDate).slice(0, 7) === activeMonth);

  let inbound = 0, outbound = 0, unset = 0;
  let inboundWon = 0, outboundWon = 0;
  for (const d of deals) {
    if (inCreatedMonth(d)) {
      if (d.inboundOrOutbound === "Inbound") inbound++;
      else if (d.inboundOrOutbound === "Outbound") outbound++;
      else unset++;
    }
    if (d.isWon && inCloseMonth(d)) {
      if (d.inboundOrOutbound === "Inbound") inboundWon++;
      else if (d.inboundOrOutbound === "Outbound") outboundWon++;
    }
  }
  return {
    inbound, outbound, unset,
    inboundWonRate: inbound === 0 ? 0 : inboundWon / inbound,
    outboundWonRate: outbound === 0 ? 0 : outboundWon / outbound,
  };
}

export function demoStatusCounts(deals) {
  const counts = { Pending: 0, Scheduled: 0, Rescheduled: 0, Completed: 0, "No Show": 0, Cancelled: 0 };
  let unset = 0;
  for (const d of deals) {
    if (d.demoStatus && counts[d.demoStatus] != null) counts[d.demoStatus]++;
    else unset++;
  }
  return { counts, unset };
}

export { OPEN_STAGES };

export const FUNNEL_STEPS = [
  { key: "meetings", label: "Meetings", dateField: "createdDate" },
  { key: "discoveryScheduled", label: "Discovery Scheduled", dateField: "discoveryScheduledTime" },
  { key: "discoveryBooked", label: "Discovery Booked", dateField: "discoveryCompletedDate" },
  { key: "demoScheduled", label: "Demo Scheduled", dateField: "demoScheduledTime" },
  { key: "demoBooked", label: "Demo Booked", dateField: "demoCompletedDate" },
  { key: "closedWon", label: "Closed Won", dateField: "closeDate" },
];

const FUNNEL_PREDICATES = {
  meetings: (d) => !!d.bdrName,
  discoveryScheduled: (d) => d.discoveryScheduledFlag === true || !!d.discoveryScheduledTime,
  discoveryBooked: (d) => d.discoveryCompletedFlag === true || d.discoveryStatus === "Completed" || !!d.discoveryCompletedDate,
  demoScheduled: (d) => d.demoScheduledFlag === true || !!d.demoScheduledTime,
  demoBooked: (d) => d.demoCompletedFlag === true || d.demoStatus === "Completed" || !!d.demoCompletedDate,
  closedWon: (d) => d.isWon === true,
};

export function bdrFunnel(deals, { activeMonth = null } = {}) {
  const cohort = activeMonth
    ? deals.filter((d) => d.createdDate && String(d.createdDate).slice(0, 7) === activeMonth)
    : deals;

  const counts = {};
  for (const step of FUNNEL_STEPS) counts[step.key] = 0;
  for (const d of cohort) {
    for (const step of FUNNEL_STEPS) {
      if (FUNNEL_PREDICATES[step.key](d)) counts[step.key]++;
    }
  }
  const conversions = {};
  for (let i = 1; i < FUNNEL_STEPS.length; i++) {
    const prev = FUNNEL_STEPS[i - 1].key;
    const cur = FUNNEL_STEPS[i].key;
    conversions[`${prev}_to_${cur}`] = counts[prev] === 0 ? 0 : counts[cur] / counts[prev];
  }
  conversions.overall = counts.meetings === 0 ? 0 : counts.closedWon / counts.meetings;
  return { counts, conversions };
}

export function bucketDate(dt, period) {
  if (!dt) return null;
  const s = String(dt);
  if (period === "day") return s.slice(0, 10);
  if (period === "month") return s.slice(0, 7);
  if (period === "year") return s.slice(0, 4);
  if (period === "quarter") {
    const y = s.slice(0, 4);
    const m = parseInt(s.slice(5, 7), 10);
    if (!Number.isFinite(m)) return null;
    return `${y}-Q${Math.floor((m - 1) / 3) + 1}`;
  }
  return s.slice(0, 7);
}

export function eventTrend(deals, period = "month", activeMonth = null) {
  const buckets = new Map();
  function ensure(b) {
    if (!buckets.has(b)) {
      buckets.set(b, {
        period: b,
        meetings: 0,
        discoveryScheduled: 0,
        discoveryBooked: 0,
        demoScheduled: 0,
        demoBooked: 0,
        closedWon: 0,
      });
    }
    return buckets.get(b);
  }
  for (const d of deals) {
    for (const step of FUNNEL_STEPS) {
      if (!FUNNEL_PREDICATES[step.key](d)) continue;
      const dt = d[step.dateField];
      if (!dt) continue;
      if (activeMonth && String(dt).slice(0, 7) !== activeMonth) continue;
      const b = bucketDate(dt, period);
      if (b) ensure(b)[step.key]++;
    }
  }
  return [...buckets.values()].sort((a, b) => a.period.localeCompare(b.period));
}

export const monthlyEventTrend = (deals) => eventTrend(deals, "month");

export function isoWeekStart(dt) {
  if (!dt) return null;
  const d = new Date(dt);
  if (isNaN(d.getTime())) return null;
  const dayNr = (d.getUTCDay() + 6) % 7;
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() - dayNr);
  return monday.toISOString().slice(0, 10);
}

export function isoWeekKey(dt) {
  const start = isoWeekStart(dt);
  if (!start) return null;
  const d = new Date(start);
  const target = new Date(d.valueOf());
  target.setUTCDate(target.getUTCDate() + 3);
  const year = target.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(year, 0, 4));
  firstThursday.setUTCDate(firstThursday.getUTCDate() - ((firstThursday.getUTCDay() + 6) % 7) + 3);
  const week = 1 + Math.round((target - firstThursday) / 604800000);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

export function weeklyActivityTrend(activities) {
  const buckets = new Map();
  function ensure(k) {
    if (!buckets.has(k)) {
      buckets.set(k, { weekStart: k, calls: 0, conversations: 0, emails: 0, conversionRate: 0 });
    }
    return buckets.get(k);
  }
  for (const a of activities) {
    const dt = a.completedDate || a.date || a.createdDate;
    const k = isoWeekStart(dt);
    if (!k) continue;
    const b = ensure(k);
    if (a.activityKind === "email") b.emails++;
    else {
      b.calls++;
      if (a.isConversation) b.conversations++;
    }
  }
  const arr = [...buckets.values()].sort((a, b) => a.weekStart.localeCompare(b.weekStart));
  for (const b of arr) b.conversionRate = b.calls === 0 ? 0 : b.conversations / b.calls;
  return arr;
}

export function activitySummary(activities) {
  let calls = 0, conversations = 0, emails = 0;
  for (const a of activities) {
    if (a.activityKind === "email") emails++;
    else {
      calls++;
      if (a.isConversation) conversations++;
    }
  }
  return {
    calls, conversations, emails,
    callToConversation: calls === 0 ? 0 : conversations / calls,
  };
}

export function bdrActivityRollup(activities) {
  const map = new Map();
  for (const a of activities) {
    const key = a.bdrName || "Unassigned";
    if (!map.has(key)) map.set(key, { bdrName: key, calls: 0, conversations: 0, emails: 0 });
    const r = map.get(key);
    if (a.activityKind === "email") r.emails++;
    else {
      r.calls++;
      if (a.isConversation) r.conversations++;
    }
  }
  for (const r of map.values()) r.conversionRate = r.calls === 0 ? 0 : r.conversations / r.calls;
  return [...map.values()].sort((a, b) => b.calls - a.calls);
}

export function userTableFromSources(deals, activities, windowDays = 90) {
  const fromActivities = new Set();
  for (const a of activities) {
    if (a.bdrName) fromActivities.add(a.bdrName);
  }
  const fromOpps = activeBdrSet(deals, windowDays);
  return { all: new Set([...fromActivities, ...fromOpps]), fromActivities, fromOpps };
}

export function activeBdrSet(deals, windowDays = 90) {
  if (!deals.length) return new Set();
  let maxTs = 0;
  for (const d of deals) {
    if (!d.createdDate) continue;
    const t = new Date(d.createdDate).getTime();
    if (Number.isFinite(t) && t > maxTs) maxTs = t;
  }
  if (!maxTs) return new Set();
  const cutoff = maxTs - windowDays * 86400 * 1000;
  const active = new Set();
  for (const d of deals) {
    if (!d.bdrName || !d.createdDate) continue;
    const t = new Date(d.createdDate).getTime();
    if (Number.isFinite(t) && t >= cutoff) active.add(d.bdrName);
  }
  return active;
}
