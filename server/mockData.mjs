// Synthetic SF Opportunity data shaped like WellnessLiving's real BDR fields.
// Field names + aliases mirror server/salesforce.mjs DEAL_FIELD_MAP.

const STAGES = ["Discovery", "Demo", "SAL", "Negotiation/Review", "Closed Won", "Closed Lost"];

const LOSS_REASONS = [
  "Closed Business",
  "Country Not Supported - Sales Disqualified",
  "Junk",
  "Not a Solution Fit/ICP",
  "Price", "Lost to Competitor", "Bad Timing", "No Decision", "Feature Gap",
];
const LOSS_SUB_REASONS = {
  "Price": ["Too Expensive", "Budget Cut", "Competitor Undercut"],
  "Lost to Competitor": ["Mindbody", "Mariana Tek", "ABC Fitness", "Other Vendor"],
  "Bad Timing": ["Revisit Q3", "Owner Pivot", "Other Priorities"],
  "Feature Gap": ["Reporting", "Marketing Suite", "Integrations"],
  "No Decision": ["No Champion", "Stalled"],
};

const ACCOUNTS = [
  "Lotus Yoga Collective", "PulseFit Studios", "Aurora Pilates", "Tidewater Wellness",
  "Sequoia Strength", "Ember Cycle Co", "Mountain Mind Yoga", "Sienna Sound Healing",
  "Northstar Athletics", "Kindred Movement", "Bluepeak Spa", "Coastline CrossFit",
  "Verdant Wellness Group", "Hearth & Flow Yoga", "Apex Performance Lab", "Willow Day Spa",
  "Open Sky Pilates", "Riverstone Reiki", "Cedar Climbing Co", "Phoenix Fitness Hub",
  "Maple Leaf Martial Arts", "Sunlit Strength Studio", "Harbor Holistic Health",
  "Granite Grit Gym", "Wildflower Wellness", "Echo Lake Yoga", "Lighthouse Lift Club",
  "Driftwood Dance", "Stoneridge Spa & Sauna", "Twilight Tai Chi",
];

const BDRS = ["Alex Tran", "Priya Shah", "Marcus Reid", "Jordan Lee", "Riya Patel", "Theo Becker"];
const AES = [
  { id: "u_ae_001", name: "Sasha Petrov" },
  { id: "u_ae_002", name: "Devon Wright" },
  { id: "u_ae_003", name: "Lena Marsh" },
];

const USERS = [
  ...BDRS.map((n, i) => ({ id: `u_bdr_${String(i + 1).padStart(3, "0")}`, name: n, email: `${n.toLowerCase().replace(/\s+/g, ".")}@wellnessliving.com`, role: "BDR" })),
  ...AES.map((u) => ({ ...u, email: `${u.name.toLowerCase().replace(/\s+/g, ".")}@wellnessliving.com`, role: "AE" })),
];

function rng(seed) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

function pick(arr, r) { return arr[Math.floor(r() * arr.length)]; }
function dayOffsetIso(days) { const d = new Date(); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10); }
function dateTimeOffsetIso(days, r) { const d = new Date(); d.setDate(d.getDate() + days); d.setHours(9 + Math.floor((r ? r() : Math.random()) * 8), 0, 0, 0); return d.toISOString(); }

function deriveStageContext(r) {
  const stage = pick(STAGES, r);
  let discoveryStatus, demoStatus, hasCompletedDiscovery, hasCompletedDemo;

  if (stage === "Discovery") {
    discoveryStatus = pick(["Pending", "Scheduled", "Rescheduled", "No Show", "Cancelled"], r);
    demoStatus = "Pending";
    hasCompletedDiscovery = false;
    hasCompletedDemo = false;
  } else if (stage === "Demo") {
    discoveryStatus = "Completed";
    demoStatus = pick(["Scheduled", "Rescheduled", "Completed", "No Show", "Cancelled"], r);
    hasCompletedDiscovery = true;
    hasCompletedDemo = demoStatus === "Completed";
  } else if (stage === "SAL" || stage === "Negotiation/Review") {
    discoveryStatus = pick(["Completed", "Follow-Up Demo"], r);
    demoStatus = "Completed";
    hasCompletedDiscovery = true;
    hasCompletedDemo = true;
  } else if (stage === "Closed Won") {
    discoveryStatus = "Completed";
    demoStatus = "Completed";
    hasCompletedDiscovery = true;
    hasCompletedDemo = true;
  } else {
    discoveryStatus = pick(["No Show", "Cancelled", "Completed", "Completed", "Completed"], r);
    hasCompletedDiscovery = discoveryStatus === "Completed";
    hasCompletedDemo = hasCompletedDiscovery && r() < 0.6;
    demoStatus = hasCompletedDemo ? "Completed" : (hasCompletedDiscovery ? pick(["No Show", "Cancelled", "Scheduled"], r) : "Pending");
  }
  return { stage, discoveryStatus, demoStatus, hasCompletedDiscovery, hasCompletedDemo };
}

function buildDeal(i, r) {
  const ctx = deriveStageContext(r);
  const account = pick(ACCOUNTS, r);
  const bdrName = pick(BDRS, r);
  const ae = pick(AES, r);
  const fullCycleOpp = r() < 0.15;
  const bdrSourced = fullCycleOpp || r() < 0.8;
  const sellerSource = bdrSourced ? "BDR" : pick(["Marketing", "Inbound", "Partner", "AE Self-Sourced"], r);
  const inboundOrOutbound = bdrSourced ? (r() < 0.65 ? "Outbound" : "Inbound") : pick(["Inbound", "Outbound"], r);

  const createdDaysAgo = Math.floor(r() * 150) + 5;
  const discoveryScheduledOffset = -createdDaysAgo + Math.floor(r() * 14) + 2;
  const discoveryCompletedOffset = discoveryScheduledOffset + Math.floor(r() * 4);
  const demoScheduledOffset = discoveryCompletedOffset + Math.floor(r() * 10) + 3;
  const demoCompletedOffset = demoScheduledOffset + Math.floor(r() * 5);

  const paidLocations = Math.max(1, Math.round(1 + r() * 30 + (ctx.stage === "Closed Won" ? r() * 20 : 0)));
  const rollupPaidLocations = paidLocations + Math.floor(r() * 5);
  const mrr = Math.round((150 + r() * 850) / 25) * 25;
  const arr = mrr * 12;
  const acv = arr;

  const isWon = ctx.stage === "Closed Won";
  const isLost = ctx.stage === "Closed Lost";
  const lossReason = isLost ? pick(LOSS_REASONS, r) : null;
  const subReasonPool = lossReason && LOSS_SUB_REASONS[lossReason];
  const lossSubReason = subReasonPool ? pick(subReasonPool, r) : null;

  const discoveryAttemptCount = ctx.discoveryStatus === "Pending" ? 0 :
    ctx.hasCompletedDiscovery ? 1 + Math.floor(r() * 3) :
    1 + Math.floor(r() * 4);
  const demoAttemptCount = ctx.hasCompletedDemo ? 1 + Math.floor(r() * 2) :
    (ctx.demoStatus === "Pending" ? 0 : 1 + Math.floor(r() * 3));

  const pointsDcCompleted = ctx.hasCompletedDiscovery ? 6 : 0;
  const pointsDemoCompleted = ctx.hasCompletedDemo ? 5 : 0;
  const pointsClosedWonAe = isWon && !fullCycleOpp ? 10 : 0;
  const pointsClosedWonDs = isWon && fullCycleOpp ? 7 : 0;
  const pointsDemoBookedFast = ctx.hasCompletedDiscovery && r() < 0.4 ? 1 : 0;
  const points90DayFollowup = isWon && r() < 0.6 ? 3 : 0;
  const gamificationPoints =
    pointsDcCompleted + pointsDemoCompleted + pointsClosedWonAe + pointsClosedWonDs +
    pointsDemoBookedFast + points90DayFollowup;

  const daysBetweenDcAndDemo = ctx.hasCompletedDemo ? Math.max(0, demoCompletedOffset - discoveryCompletedOffset) : null;

  return {
    id: `006${String(i).padStart(15, "0")}`,
    name: `${account} - ${ctx.stage === "Discovery" ? "Intro" : ctx.stage === "Demo" ? "Demo" : "WL Suite"}`,
    stage: ctx.stage,
    latestStageReached: ctx.stage,
    amount: mrr * 12,
    probability: { Discovery: 10, Demo: 25, SAL: 40, "Negotiation/Review": 70, "Closed Won": 100, "Closed Lost": 0 }[ctx.stage],
    closeDate: isWon || isLost ? dayOffsetIso(-Math.floor(r() * 30)) : dayOffsetIso(Math.floor(r() * 60) + 5),
    createdDate: dayOffsetIso(-createdDaysAgo),
    oppAgeDays: createdDaysAgo,
    inboundOrOutbound,
    type: pick(["New Business", "Expansion", "Renewal"], r),

    ownerId: ae.id,
    ownerName: ae.name,
    accountName: account,
    isWon,
    isClosed: isWon || isLost,

    mrr,
    arr,
    acv,

    bdrName,
    bdrSourced,
    sellerSource,
    fullCycleOpp,

    discoveryStatus: ctx.discoveryStatus,
    discoveryScheduledTime: ctx.discoveryStatus !== "Pending" ? dateTimeOffsetIso(discoveryScheduledOffset, r) : null,
    discoveryCompletedDate: ctx.hasCompletedDiscovery ? dayOffsetIso(discoveryCompletedOffset) : null,
    discoveryAttemptCount,
    discoveryScheduledFlag: ctx.discoveryStatus !== "Pending",
    discoveryCompletedFlag: ctx.hasCompletedDiscovery,

    demoStatus: ctx.demoStatus,
    demoScheduledTime: ctx.demoStatus !== "Pending" ? dateTimeOffsetIso(demoScheduledOffset, r) : null,
    demoCompletedDate: ctx.hasCompletedDemo ? dayOffsetIso(demoCompletedOffset) : null,
    demoAttemptCount,
    demoScheduledFlag: ctx.demoStatus !== "Pending",
    demoCompletedFlag: ctx.hasCompletedDemo,
    daysBetweenDcAndDemo,

    paidLocations,
    rollupPaidLocations,
    lossReason,
    lossSubReason,

    gamificationPoints,
    pointsDcCompleted,
    pointsDemoCompleted,
    pointsClosedWonAe,
    pointsClosedWonDs,
    points90DayFollowup,
    pointsDemoBookedFast,
  };
}

export function getMockDeals() {
  const r = rng(42);
  return Array.from({ length: 220 }, (_, i) => buildDeal(i + 1, r));
}

export function getMockUsers() {
  return USERS.map((u) => ({ ...u, isActive: true }));
}
