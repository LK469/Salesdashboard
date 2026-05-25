import * as XLSX from "xlsx";
import fs from "node:fs";
import path from "node:path";

// Header -> alias map. The lookup is normalized (lowercase, alphanumeric only)
// so "BDR Name", "BDR_Name__c", and "bdrname" all collapse to "bdrname".
const HEADER_ALIASES = {
  // Core
  id: "id",
  oppid: "id",
  oppid18digits: "id",
  opportunityid: "id",
  recordid: "id",
  parentaccountid: "parentAccountId",
  accountid: "accountId",

  name: "name",
  dealname: "name",
  opportunityname: "name",
  potentialname: "name",

  stage: "stage",
  stagename: "stage",

  amount: "amount",
  dealamount: "amount",
  probability: "probability",
  prob: "probability",

  closedate: "closeDate",
  targetclosedate: "closeDate",
  createddate: "createdDate",
  created: "createdDate",
  createdby: "createdBy",

  ownerid: "ownerId",
  owner: "ownerName",
  ownername: "ownerName",
  opportunityowner: "ownerName",
  aename: "ownerName",
  ae: "ownerName",
  ownerrole: "ownerRole",
  ownerrole2: "ownerRole2",

  account: "accountName",
  accountname: "accountName",
  company: "accountName",

  iswon: "isWon",
  won: "isWon",
  isclosed: "isClosed",

  // BDR / sourcing
  bdrname: "bdrName",
  bdr: "bdrName",
  bdrsourced: "bdrSourced",
  sellersource: "sellerSource",
  team: "team",
  teamtype: "teamType",
  fullcycleopp: "fullCycleOpp",

  // Discovery
  discoverystatus: "discoveryStatus",
  discostatus: "discoveryStatus",
  discoveryscheduledtime: "discoveryScheduledTime",
  discoveryscheduled: "discoveryScheduledFlag",
  discoverycompleteddate: "discoveryCompletedDate",
  discoverycompleted: "discoveryCompletedFlag",
  discoveryrescheduledon: "discoveryRescheduledOn",
  rescheduledon: "discoveryRescheduledOn",
  discoveryattemptcount: "discoveryAttemptCount",
  discoveryscheduleddayoftheweek: "discoveryScheduledDay",
  discoverymeetingtype: "discoveryMeetingType",

  sdrdiscoverycompleted: "sdrDiscoveryCompleted",
  aediscovery: "aeDiscovery",

  discoveryaicoachingperformancescore: "aiCoachingScore",
  discoveryaicoachingpeformancescore: "aiCoachingScore",
  aicoachingscore: "aiCoachingScore",
  coachingscore: "aiCoachingScore",
  aiscore: "aiCoachingScore",
  discoveryaicoachinglink: "discoveryAiCoachingLink",
  discoveryairecordinglink: "discoveryAiRecordingLink",

  // Demo
  demostatus: "demoStatus",
  demoscheduledtime: "demoScheduledTime",
  demoscheduled: "demoScheduledFlag",
  democompleteddate: "demoCompletedDate",
  democompleted: "demoCompletedFlag",
  demoattemptcount: "demoAttemptCount",
  demospecialistname: "demoSpecialistName",
  demospecialistrole: "demoSpecialistRole",
  democompletedbyae: "demoCompletedByAe",
  demomeetingtype: "demoMeetingType",
  demoaicoachingpeformancescore: "demoAiCoachingScore",
  demoaicoachingperformancescore: "demoAiCoachingScore",
  demoaicoachinglink: "demoAiCoachingLink",

  // Outcome / size
  numberofpaidlocations: "paidLocations",
  paidlocations: "paidLocations",
  locations: "paidLocations",
  rolluppaidlocations: "rollupPaidLocations",

  lossreason: "lossReason",
  closedlostreason: "lossReason",
  reasonlost: "lossReason",
  closedlostsubreason: "lossSubReason",

  // Revenue
  mrr: "mrr",
  mrramount: "mrr",
  arr: "arr",
  arramount: "arr",
  acv: "acv",
  acvamount: "acv",

  // Misc
  inboundoroutbound: "inboundOrOutbound",
  nextstep: "nextStep",
  type: "type",
};

function normalize(h) {
  return String(h ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Cells with literal "-" / "" / dash values represent missing data in the BDR export.
const NULL_TOKENS = new Set(["-", "—", "–", "", "n/a", "na", "null", "none"]);
function isNullish(v) {
  if (v == null) return true;
  if (typeof v === "string") return NULL_TOKENS.has(v.trim().toLowerCase());
  return false;
}

const TRUTHY = new Set(["true", "yes", "y", "1", "x", "checked"]);
const FALSY = new Set(["false", "no", "n", "0", ""]);

function coerce(alias, value) {
  if (isNullish(value)) return null;
  switch (alias) {
    case "amount":
    case "probability":
    case "mrr":
    case "arr":
    case "acv":
    case "paidLocations":
    case "rollupPaidLocations":
    case "aiCoachingScore":
    case "demoAiCoachingScore":
    case "discoveryAttemptCount":
    case "demoAttemptCount":
      if (typeof value === "number") return value;
      return parseFloat(String(value).replace(/[$,]/g, "")) || null;
    case "isWon":
    case "isClosed":
    case "bdrSourced":
    case "sdrDiscoveryCompleted":
    case "aeDiscovery":
    case "discoveryScheduledFlag":
    case "discoveryCompletedFlag":
    case "demoScheduledFlag":
    case "demoCompletedFlag":
    case "demoCompletedByAe":
    case "fullCycleOpp":
      return coerceBool(value);
    case "closeDate":
    case "createdDate":
    case "discoveryCompletedDate":
    case "discoveryRescheduledOn":
    case "demoCompletedDate":
      return parseDate(value);
    case "discoveryScheduledTime":
    case "demoScheduledTime":
      return parseDateTime(value);
    default:
      return typeof value === "string" ? value.trim() : value;
  }
}

function coerceBool(v) {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  const s = String(v).trim().toLowerCase();
  if (TRUTHY.has(s)) return true;
  if (FALSY.has(s)) return false;
  return null;
}

function parseDate(v) {
  if (v == null) return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10);
  if (typeof v === "number") {
    // Excel serial date (days since 1899-12-30, with 1900 leap-year quirk)
    const ms = Math.round((v - 25569) * 86400 * 1000);
    return new Date(ms).toISOString().slice(0, 10);
  }
  const d = new Date(v);
  return isNaN(d.getTime()) ? String(v) : d.toISOString().slice(0, 10);
}

function parseDateTime(v) {
  if (v == null) return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v.toISOString();
  if (typeof v === "number") {
    const ms = Math.round((v - 25569) * 86400 * 1000);
    return new Date(ms).toISOString();
  }
  // Handle BDR export format: "9/19/2025, 9:00 AM"
  const d = new Date(v);
  return isNaN(d.getTime()) ? String(v) : d.toISOString();
}

const STAGE_PROBABILITY = {
  "Discovery Scheduled": 10,
  "Discovery Completed": 25,
  "Demo Scheduled": 45,
  "Demo Completed": 70,
  "Closed Won": 100,
  "Discovery No Show/Cancelled": 0,
  "Demo No Show/Cancelled": 0,
  "Closed Lost": 0,
};

function deriveDealDefaults(row) {
  // Derive booleans from stage if the source didn't include explicit flags.
  if (row.isWon == null) row.isWon = /closed[\s_]*won/i.test(row.stage || "");
  if (row.isClosed == null) row.isClosed = /closed/i.test(row.stage || "");
  if (row.probability == null && row.stage) row.probability = STAGE_PROBABILITY[row.stage] ?? null;

  // Map Team / Team Type into our canonical flags.
  if (row.fullCycleOpp == null && row.team) {
    row.fullCycleOpp = /full.cycle/i.test(row.team);
  }
  if (row.inboundOrOutbound == null && row.teamType) {
    if (/inbound/i.test(row.teamType)) row.inboundOrOutbound = "Inbound";
    else if (/outbound/i.test(row.teamType)) row.inboundOrOutbound = "Outbound";
  }

  // Gamification: derive points from per-meeting flags when explicit field missing.
  // Rule of thumb: 6 pts per discovery completed, 5 pts per demo completed, 10 pts per won.
  if (row.gamificationPoints == null) {
    let pts = 0;
    if (row.discoveryCompletedFlag) pts += 6;
    if (row.demoCompletedFlag) pts += 5;
    if (row.isWon) pts += row.fullCycleOpp ? 7 : 10;
    row.gamificationPoints = pts;
  }

  // ARR/ACV derivation only if we have explicit MRR or Amount.
  if (row.arr == null && row.mrr != null) row.arr = row.mrr * 12;
  if (row.mrr == null && row.amount != null) row.mrr = Math.round(row.amount / 12);

  return row;
}

function pickSheet(workbook, preferredName) {
  if (preferredName && workbook.SheetNames.includes(preferredName)) return preferredName;
  // Prefer sheets that look like deals data, with the largest row count.
  const candidates = workbook.SheetNames
    .map((n) => {
      const ws = workbook.Sheets[n];
      if (!ws || !ws["!ref"]) return null;
      const rows = XLSX.utils.sheet_to_json(ws, { defval: null, raw: true });
      return { name: n, rows: rows.length, score: /deal|opportunit|pipeline|bdr|meeting/i.test(n) ? 1 : 0 };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || b.rows - a.rows);
  return candidates[0]?.name || workbook.SheetNames[0];
}

export function readDealsFromBuffer(buffer, { sheetName } = {}) {
  const wb = XLSX.read(buffer, { cellDates: true });
  const sheet = pickSheet(wb, sheetName);
  const raw = XLSX.utils.sheet_to_json(wb.Sheets[sheet], { defval: null, raw: true });
  return parseDeals(raw, sheet, wb.SheetNames);
}

export function readDealsFromFile(filePath, opts = {}) {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Excel file not found: ${resolved}`);
  }
  const buffer = fs.readFileSync(resolved);
  return readDealsFromBuffer(buffer, opts);
}

function parseDeals(raw, sheetName, allSheets) {
  if (!raw.length) {
    return { deals: [], headerMap: {}, unmappedHeaders: [], sheetName, allSheets };
  }
  const rawHeaders = Object.keys(raw[0]);
  const headerMap = {};
  const unmappedHeaders = [];
  for (const h of rawHeaders) {
    const alias = HEADER_ALIASES[normalize(h)];
    if (alias) headerMap[h] = alias;
    else unmappedHeaders.push(h);
  }

  const deals = raw.map((row, i) => {
    const out = {};
    for (const [rawHeader, alias] of Object.entries(headerMap)) {
      const v = coerce(alias, row[rawHeader]);
      // Don't let a later column overwrite a populated alias with null.
      if (v != null || out[alias] == null) out[alias] = v;
    }
    if (!out.id) out.id = `xlsx_${String(i + 1).padStart(6, "0")}`;
    return deriveDealDefaults(out);
  });

  return { deals, headerMap, unmappedHeaders, sheetName, allSheets };
}

// =============================================================================
// Activities (Calls / Emails / Conversations)
// =============================================================================
// Reads the "Calls report" sheet from BDR data sheet.xlsx (or whatever's
// configured). Excludes any task whose subject contains "[Outreach] [Call]"
// (case-insensitive). Conversations = calls whose duration >= 3 minutes.
//
// Starting March 2026, the duration may be embedded in the Subject or
// Description rather than the Duration field, so we also try to parse
// patterns like "5 min", "12:34 mins", "00:04:32" from the text fields.
// =============================================================================

const ACTIVITY_HEADER_ALIASES = {
  assigned: "bdrName",
  assignedrole: "assignedRole",
  assignedroledisplay: "assignedRoleDisplay",
  createddate: "createdDate",
  date: "date",
  completeddatetime: "completedDate",
  subject: "subject",
  description: "description",
  callobjectidentifier: "callObjectId",
  durationminutes: "durationMinutes",
  durationmin: "durationMinutes",
  duration: "durationMinutes",
  meetingtype: "meetingType",
  companyaccount: "accountName",
  account: "accountName",
  opportunity: "opportunityName",
  contact: "contactName",
  lead: "leadName",
  priority: "priority",
  status: "status",
  task: "isTask",
  calldispose: "callDispose",
  createdby: "createdBy",
  activitytype: "activityType",
  routername: "routerName",
  tasksubtype: "taskSubtype",
  calltype: "callType",
  activityid: "id",
};

const OUTREACH_RE = /\[outreach\][\s_-]*\[call\]/i;

// Parse a duration-ish string out of subject/description for the new
// post-March-2026 convention. Returns minutes (number) or null.
function parseDurationFromText(text) {
  if (!text) return null;
  const s = String(text);
  // hh:mm:ss -> minutes
  const hms = s.match(/(\d{1,2}):(\d{2}):(\d{2})/);
  if (hms) {
    const h = +hms[1], m = +hms[2], sec = +hms[3];
    return h * 60 + m + sec / 60;
  }
  // mm:ss
  const ms = s.match(/(?<!\d)(\d{1,3}):(\d{2})(?!:)/);
  if (ms) {
    const m = +ms[1], sec = +ms[2];
    if (m < 1000) return m + sec / 60;
  }
  // "5 min", "5min", "5m"
  const min = s.match(/(\d+(?:\.\d+)?)\s*(?:min|m\b|mins|minutes)/i);
  if (min) return parseFloat(min[1]);
  // "300 sec", "300 seconds"
  const sec = s.match(/(\d+(?:\.\d+)?)\s*(?:sec|s\b|secs|seconds)/i);
  if (sec) return parseFloat(sec[1]) / 60;
  return null;
}

function coerceActivity(alias, value) {
  if (isNullish(value)) return null;
  switch (alias) {
    case "durationMinutes":
      if (typeof value === "number") return value;
      return parseFloat(String(value).replace(/[^0-9.]/g, "")) || null;
    case "isTask":
      return coerceBool(value);
    case "createdDate":
    case "date":
    case "completedDate":
      return parseDateTime(value);
    default:
      return typeof value === "string" ? value.trim() : value;
  }
}

export function readActivitiesFromBuffer(buffer, { sheetName = "Calls report" } = {}) {
  const wb = XLSX.read(buffer, { cellDates: true });
  if (!wb.SheetNames.includes(sheetName)) {
    // Fall back to any sheet that looks like an activities log
    sheetName = wb.SheetNames.find((n) => /call|activit|task/i.test(n)) || wb.SheetNames[0];
  }
  const ws = wb.Sheets[sheetName];
  if (!ws || !ws["!ref"]) return { activities: [], sheetName, headerMap: {}, unmappedHeaders: [] };
  const raw = XLSX.utils.sheet_to_json(ws, { defval: null, raw: true });
  if (!raw.length) return { activities: [], sheetName, headerMap: {}, unmappedHeaders: [] };

  const headerMap = {};
  const unmappedHeaders = [];
  for (const h of Object.keys(raw[0])) {
    const alias = ACTIVITY_HEADER_ALIASES[normalize(h)];
    if (alias) headerMap[h] = alias;
    else unmappedHeaders.push(h);
  }

  const activities = [];
  for (let i = 0; i < raw.length; i++) {
    const out = {};
    for (const [rawHeader, alias] of Object.entries(headerMap)) {
      const v = coerceActivity(alias, raw[i][rawHeader]);
      if (v != null || out[alias] == null) out[alias] = v;
    }
    // Exclude outreach calls per user spec.
    if (out.subject && OUTREACH_RE.test(out.subject)) continue;

    // Derive duration from subject/description if not provided.
    if (out.durationMinutes == null) {
      out.durationMinutes = parseDurationFromText(out.subject) ?? parseDurationFromText(out.description);
    }
    // Classify: a "conversation" is any call with duration >= 3 minutes.
    const dur = out.durationMinutes;
    out.isConversation = typeof dur === "number" && dur >= 3;

    // Coarse type -- we only ingest the Calls report here, so default is "call".
    const type = String(out.activityType || out.taskSubtype || "Call").trim().toLowerCase();
    out.activityKind = type.includes("email") ? "email" : "call";

    if (!out.id) out.id = `act_${String(i + 1).padStart(7, "0")}`;
    activities.push(out);
  }
  return { activities, sheetName, headerMap, unmappedHeaders };
}

export function readActivitiesFromFile(filePath, opts = {}) {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Excel file not found: ${resolved}`);
  }
  return readActivitiesFromBuffer(fs.readFileSync(resolved), opts);
}

export function deriveUsersFromDeals(deals) {
  const set = new Map();
  for (const d of deals) {
    if (d.bdrName && !set.has(`bdr:${d.bdrName}`)) {
      set.set(`bdr:${d.bdrName}`, {
        id: `bdr_${d.bdrName.replace(/\s+/g, "_").toLowerCase()}`,
        name: d.bdrName,
        role: "BDR",
        isActive: true,
      });
    }
    if (d.ownerName && !set.has(`ae:${d.ownerName}`)) {
      set.set(`ae:${d.ownerName}`, {
        id: d.ownerId || `ae_${d.ownerName.replace(/\s+/g, "_").toLowerCase()}`,
        name: d.ownerName,
        role: d.ownerRole2 || "AE",
        isActive: true,
      });
    }
  }
  return [...set.values()].sort((a, b) => a.name.localeCompare(b.name));
}
