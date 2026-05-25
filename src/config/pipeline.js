// Pipeline schema lifted from the Zoho BDR layout (bdr_potential_layout.jsx).
// This is the canonical pipeline definition the dashboard renders against.
// If your SF org uses different stage names, edit the `name` fields here and
// the SOQL stage mapping in server/salesforce.mjs.

// Stage values match what's in the BDR Meetings Booked export.
// Each "phase" has a Scheduled / Completed / No Show-Cancelled triple, then Closed.
export const STAGES = [
  { name: "Discovery Scheduled", prob: 10, color: "#a47148", type: "open", phase: "discovery" },
  { name: "Discovery Completed", prob: 25, color: "#c69749", type: "open", phase: "discovery" },
  { name: "Demo Scheduled", prob: 45, color: "#5a7ba7", type: "open", phase: "demo" },
  { name: "Demo Completed", prob: 70, color: "#8b6daa", type: "open", phase: "demo" },
  { name: "Closed Won", prob: 100, color: "#5e8a5e", type: "won", phase: "closed" },
  { name: "Discovery No Show/Cancelled", prob: 0, color: "#b07060", type: "lost", phase: "discovery" },
  { name: "Demo No Show/Cancelled", prob: 0, color: "#9a5a5a", type: "lost", phase: "demo" },
  { name: "Closed Lost", prob: 0, color: "#a05858", type: "lost", phase: "closed" },
];

export const OPEN_STAGES = STAGES.filter((s) => s.type === "open").map((s) => s.name);

export const STAGE_THEME = {
  "Discovery Scheduled": { bg: "#fdf6e8", border: "#a47148", accent: "#7a5234" },
  "Discovery Completed": { bg: "#fdf4e0", border: "#c69749", accent: "#806033" },
  "Demo Scheduled": { bg: "#eef3f8", border: "#5a7ba7", accent: "#3d5680" },
  "Demo Completed": { bg: "#f3edf7", border: "#8b6daa", accent: "#674d80" },
  "Closed Won": { bg: "#eef5ee", border: "#5e8a5e", accent: "#3f6b3f" },
  "Discovery No Show/Cancelled": { bg: "#f7efea", border: "#b07060", accent: "#7a4030" },
  "Demo No Show/Cancelled": { bg: "#f5eaea", border: "#9a5a5a", accent: "#6e3a3a" },
  "Closed Lost": { bg: "#f7eded", border: "#a05858", accent: "#7a3f3f" },
};

export const NEUTRAL_THEME = { bg: "#faf8f3", border: "#3d3a35", accent: "#3d3a35" };

export const BRAND = {
  paper: "#0d0820",
  paperWarm: "#120a2e",
  surface: "#1a1133",
  surfaceElevated: "#231849",
  surfaceHigh: "#2d1f5c",

  border: "#2d1f5c",
  borderSoft: "#1f1442",
  borderStrong: "#4c1d95",

  primary: "#c084fc",
  primaryDeep: "#a855f7",
  primaryDark: "#7c3aed",
  primaryDarker: "#5b21b6",
  primarySoft: "rgba(192, 132, 252, 0.16)",
  primaryTint: "rgba(192, 132, 252, 0.08)",
  accent: "#d946ef",

  ink: "#f5f3ff",
  ink2: "#e0d6ff",
  muted: "#9885c8",
  mutedSoft: "#6b66a8",

  success: "#34d399",
  successSoft: "rgba(52, 211, 153, 0.16)",
  warn: "#fbbf24",
  warnSoft: "rgba(251, 191, 36, 0.16)",
  danger: "#f87171",
  dangerSoft: "rgba(248, 113, 113, 0.16)",
  info: "#22d3ee",
  infoSoft: "rgba(34, 211, 238, 0.16)",
  pink: "#f472b6",

  mutedOnDark: "#c4b5fd",
  onDark: "#ffffff",

  heroGradient: "linear-gradient(135deg, #5b21b6 0%, #7c3aed 50%, #a855f7 100%)",
  pageGradient: "linear-gradient(180deg, #0d0820 0%, #120a2e 100%)",

  fontSans: "'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  fontMono: "'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace",

  chart: ["#c084fc", "#22d3ee", "#34d399", "#fbbf24", "#f472b6", "#a855f7", "#60a5fa", "#f87171"],
};

export function stageColor(name) {
  return STAGES.find((s) => s.name === name)?.color || "#1c1a17";
}

export function stageMeta(name) {
  return STAGES.find((s) => s.name === name);
}

export const PIPELINE_SOURCES = ["Inbound", "Outbound"];

export const DEMO_STATUSES = [
  { name: "Pending", color: "#9ca3af", group: "open" },
  { name: "Scheduled", color: "#5a7ba7", group: "open" },
  { name: "Rescheduled", color: "#c69749", group: "open" },
  { name: "Completed", color: "#5e8a5e", group: "completed" },
  { name: "No Show", color: "#a05858", group: "missed" },
  { name: "Cancelled", color: "#7a3f3f", group: "missed" },
];

export const DISCOVERY_STATUSES = [
  { name: "Pending", color: "#9ca3af", group: "open" },
  { name: "Scheduled", color: "#5a7ba7", group: "open" },
  { name: "Rescheduled", color: "#c69749", group: "open" },
  { name: "Completed", color: "#5e8a5e", group: "completed" },
  { name: "Follow-Up Demo", color: "#8b6daa", group: "completed" },
  { name: "No Show", color: "#a05858", group: "missed" },
  { name: "Cancelled", color: "#7a3f3f", group: "missed" },
];

// Loss-reason values that are NOT counted as a "real" loss
// (sales disqualified / out-of-scope rather than lost-to-sales-process).
export const DISQUALIFIED_LOSS_REASONS = new Set([
  "Closed Business",
  "Country Not Supported - Sales Disqualified",
  "Junk",
  "Not a Solution Fit/ICP",
]);

export function isDisqualifiedLoss(lossReason) {
  if (!lossReason) return false;
  return DISQUALIFIED_LOSS_REASONS.has(lossReason);
}
