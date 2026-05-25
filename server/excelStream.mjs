// Streaming reader for very large .xlsx files (BDR V2.xlsx is 68k rows x 416 cols).
// ExcelJS's streaming API loads one row at a time so we never blow up V8's
// string-size limit.

import ExcelJS from "exceljs";
import path from "node:path";
import fs from "node:fs";

// SF API names (with __c suffix) -> our internal aliases.
// Normalization strips non-alphanumeric, lowercases, and drops trailing "c"
// (so "BDR_Name__c" -> "bdrname" matches "BDR Name" -> "bdrname").
const HEADER_ALIASES = {
  // Core
  id: "id",
  isdeleted: "isDeleted",
  accountid: "accountId",
  name: "name",
  description: "description",
  stagename: "stage",
  amount: "amount",
  probability: "probability",
  expectedrevenue: "expectedRevenue",
  closedate: "closeDate",
  type: "type",
  nextstep: "nextStep",
  leadsource: "leadSource",
  isclosed: "isClosed",
  iswon: "isWon",
  ownerid: "ownerId",
  createddate: "createdDate",
  createdbyid: "createdById",
  lastmodifieddate: "lastModifiedDate",
  lastactivitydate: "lastActivityDate",
  contactid: "contactId",
  campaignid: "campaignId",

  // Revenue (custom)
  mrramount: "mrr",
  arramount: "arr",
  acvamount: "acv",
  forecastedacv: "forecastedAcv",
  rollupacv: "rollupAcv",
  finalacvamount: "finalAcv",

  // BDR / sourcing
  // BDR_Name__c stores the SF user ID (lookup) -- we capture it as bdrId so we
  // can resolve it to a real name via an external mapping (see resolveBdrNames).
  // Created_By_Name__c is the SF user who CREATED the record (often an admin),
  // not the BDR -- kept for diagnostics only.
  bdrname: "bdrId",
  createdbyname: "createdByName",
  bdrsourced: "bdrSourced",
  bdrselfsourced: "bdrSelfSourced",
  sellersource: "sellerSource",
  fullcycleopp: "fullCycleOpp",
  bdraeprestrat: "bdrAePreStrat",
  aedsprestrat: "aeDsPreStrat",
  bdraepostdcstrat: "bdrAePostDcStrat",
  bdrmeetingssetcount: "bdrMeetingsSetCount",
  bdrhiredate: "bdrHireDate",
  bdrdivision: "bdrDivision",
  bdrpaidlocations: "bdrPaidLocations",
  demospecialistname: "demoSpecialistName",
  sdrsourced: "sdrSourced",
  qualifiedbysdr: "sdrQualified",

  // Discovery
  discoverystatus: "discoveryStatus",
  discoveryscheduledtime: "discoveryScheduledTime",
  discoveryscheduled: "discoveryScheduledFlag",
  discoverycompleteddate: "discoveryCompletedDate",
  discoverycompleted: "discoveryCompletedFlag",
  discoveryrescheduledon: "discoveryRescheduledOn",
  discoveryattemptcount: "discoveryAttemptCount",

  // Demo
  demostatus: "demoStatus",
  demoscheduledtime: "demoScheduledTime",
  demoscheduled: "demoScheduledFlag",
  democompleteddate: "demoCompletedDate",
  democompleted: "demoCompletedFlag",
  demoattemptcount: "demoAttemptCount",
  daysbetweendccompleteddemodate: "daysBetweenDcAndDemo",

  // Outcome / size
  numberofpaidlocations: "paidLocations",
  rolluppaidlocations: "rollupPaidLocations",
  numberoflocations: "numberOfLocations",
  paidlocationsforbilling: "paidLocationsForBilling",
  lossreason: "lossReason",
  closedlostsubreason: "lossSubReason",
  closedlostcomment: "closedLostComment",
  inboundoroutbound: "inboundOrOutbound",
  teamtype: "teamType",
  lateststagereached: "latestStageReached",
  laeststagereached: "latestStageReached",
  opportunityageindays: "oppAgeDays",

  // Account-derived
  accountname: "accountName",
  accountclassification: "accountClassification",
  accountcountry: "accountCountry",
  accountstate: "accountState",
  accountcity: "accountCity",

  // Gamification (kept for back-compat; UI no longer uses Points column)
  gamificationtotalpoints: "gamificationPoints",
  sixpointsperdccompleted: "pointsDcCompleted",
  x5pointsdemocompleted: "pointsDemoCompleted",
  x10pointsperclosedwonbyae: "pointsClosedWonAe",
  x7pointsperclosedwonbyds: "pointsClosedWonDs",
  x90dayfucompletepoints: "points90DayFollowup",
  pointsperdemobookedin3daysofdc: "pointsDemoBookedFast",
};

function normalize(h) {
  let s = String(h ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  // Strip trailing custom-field marker so "bdrnamec" -> "bdrname".
  if (s.endsWith("c") && s.length > 4) {
    const stripped = s.slice(0, -1);
    if (HEADER_ALIASES[stripped] && !HEADER_ALIASES[s]) s = stripped;
  }
  return s;
}

// Cells of these field types are stored as numbers in xlsx -- coerce per alias.
const NUM_FIELDS = new Set([
  "amount", "probability", "expectedRevenue", "mrr", "arr", "acv",
  "forecastedAcv", "rollupAcv", "finalAcv",
  "paidLocations", "rollupPaidLocations", "numberOfLocations", "paidLocationsForBilling",
  "discoveryAttemptCount", "demoAttemptCount",
  "daysBetweenDcAndDemo", "oppAgeDays",
  "gamificationPoints", "pointsDcCompleted", "pointsDemoCompleted",
  "pointsClosedWonAe", "pointsClosedWonDs", "points90DayFollowup", "pointsDemoBookedFast",
]);
const BOOL_FIELDS = new Set([
  "isDeleted", "isClosed", "isWon",
  "bdrSourced", "fullCycleOpp",
  "discoveryScheduledFlag", "discoveryCompletedFlag",
  "demoScheduledFlag", "demoCompletedFlag",
  "bdrAePreStrat", "aeDsPreStrat", "bdrAePostDcStrat",
]);
const DATE_FIELDS = new Set([
  "closeDate", "createdDate", "lastModifiedDate", "lastActivityDate",
  "discoveryCompletedDate", "discoveryRescheduledOn", "demoCompletedDate",
]);
const DATETIME_FIELDS = new Set([
  "discoveryScheduledTime", "demoScheduledTime",
]);

function coerceCell(alias, value) {
  if (value == null) return null;
  if (typeof value === "object" && value.text != null) value = value.text;     // rich text
  if (typeof value === "object" && value.result != null) value = value.result; // formula
  if (typeof value === "object" && value.error != null) return null;
  if (typeof value === "string" && value === "") return null;
  if (typeof value === "string" && value === "-") return null;

  if (NUM_FIELDS.has(alias)) {
    if (typeof value === "number") return value;
    const n = parseFloat(String(value).replace(/[$,]/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  if (BOOL_FIELDS.has(alias)) {
    if (typeof value === "boolean") return value;
    if (typeof value === "number") return value !== 0;
    const s = String(value).trim().toLowerCase();
    return s === "true" || s === "yes" || s === "1" || s === "y";
  }
  if (DATE_FIELDS.has(alias) || DATETIME_FIELDS.has(alias)) {
    const d = parseExcelDate(value);
    if (!d) return null;
    return DATETIME_FIELDS.has(alias) ? d.toISOString() : d.toISOString().slice(0, 10);
  }
  return typeof value === "string" ? value.trim() : value;
}

// Parse a duration-ish string out of subject/description (post-March-2026
// convention where duration is embedded in text rather than the Duration field).
// Returns minutes (number) or null.
function parseDurationFromText(text) {
  if (!text) return null;
  const s = String(text);
  const hms = s.match(/(\d{1,2}):(\d{2}):(\d{2})/);
  if (hms) return +hms[1] * 60 + +hms[2] + +hms[3] / 60;
  const ms = s.match(/(?<!\d)(\d{1,3}):(\d{2})(?!:)/);
  if (ms) {
    const m = +ms[1], sec = +ms[2];
    if (m < 1000) return m + sec / 60;
  }
  const min = s.match(/(\d+(?:\.\d+)?)\s*(?:min|m\b|mins|minutes)/i);
  if (min) return parseFloat(min[1]);
  const sec = s.match(/(\d+(?:\.\d+)?)\s*(?:sec|s\b|secs|seconds)/i);
  if (sec) return parseFloat(sec[1]) / 60;
  return null;
}

// Convert any reasonable cell value into a JS Date, handling Excel serial dates.
// Returns Date or null.
function parseExcelDate(value) {
  if (value == null) return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  if (typeof value === "number") {
    if (value < 60) return null;                    // junk
    if (value > 0 && value < 2958466) {              // valid Excel range
      const ms = Math.round((value - 25569) * 86400 * 1000);
      const d = new Date(ms);
      return isNaN(d.getTime()) ? null : d;
    }
    return null;
  }
  if (typeof value === "string") {
    if (!value.trim() || value === "-") return null;
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function deriveDealDefaults(row) {
  if (row.isWon == null) row.isWon = /closed[\s_]*won/i.test(row.stage || "");
  if (row.isClosed == null) row.isClosed = /closed/i.test(row.stage || "");
  if (row.probability == null && row.stage) {
    const probMap = {
      "Discovery Scheduled": 10, "Discovery Completed": 25,
      "Demo Scheduled": 45, "Demo Completed": 70,
      "Closed Won": 100, "Closed Lost": 0,
      "Discovery No Show/Cancelled": 0, "Demo No Show/Cancelled": 0,
    };
    row.probability = probMap[row.stage] ?? null;
  }
  if (row.inboundOrOutbound == null && row.teamType) {
    if (/inbound/i.test(row.teamType)) row.inboundOrOutbound = "Inbound";
    else if (/outbound/i.test(row.teamType)) row.inboundOrOutbound = "Outbound";
  }
  if (row.fullCycleOpp == null && row.team) row.fullCycleOpp = /full.cycle/i.test(row.team);
  if (row.arr == null && row.mrr != null) row.arr = row.mrr * 12;
  if (row.mrr == null && row.amount != null && row.amount > 0) row.mrr = Math.round(row.amount / 12);
  if (row.gamificationPoints == null) {
    let pts = 0;
    if (row.discoveryCompletedFlag) pts += 6;
    if (row.demoCompletedFlag) pts += 5;
    if (row.isWon) pts += row.fullCycleOpp ? 7 : 10;
    row.gamificationPoints = pts;
  }
  return row;
}

/**
 * Stream-read the User sheet from BDR V2.xlsx (Salesforce Data Cloud format,
 * ssot__* fields). Returns Map<sfUserId, { name, isActive, title, email }>.
 *
 * The User sheet stores the SF user ID in `ssot__Id__c` (NOT `Id`, which is the
 * Data Cloud's internal record ID). We key off ssot__Id__c so the map matches
 * `BDR_Name__c` values from the Opportunity sheet.
 */
export async function streamReadUserTable(filePath, { sheetName = "User" } = {}) {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) throw new Error(`Excel file not found: ${resolved}`);
  const wb = new ExcelJS.stream.xlsx.WorkbookReader(resolved, {
    entries: "emit", sharedStrings: "cache",
    hyperlinks: "ignore", styles: "ignore", worksheets: "emit",
  });

  const users = new Map();
  let foundSheet = false;
  for await (const ws of wb) {
    if (ws.name !== sheetName) {
      for await (const _row of ws) { /* drain */ }
      continue;
    }
    foundSheet = true;
    let rowIdx = 0;
    let cols = null;
    for await (const row of ws) {
      rowIdx++;
      const cells = row.values;
      if (rowIdx === 1) {
        cols = {};
        for (let i = 1; i < cells.length; i++) {
          const h = cells[i];
          if (h === "ssot__Id__c") cols.sfId = i;
          else if (h === "ssot__FullName__c") cols.fullName = i;
          else if (h === "ssot__FirstName__c") cols.firstName = i;
          else if (h === "ssot__LastName__c") cols.lastName = i;
          else if (h === "ssot__IsActive__c") cols.isActive = i;
          else if (h === "ssot__Title__c") cols.title = i;
          else if (h === "ssot__Email__c") cols.email = i;
        }
        if (cols.sfId == null) {
          // Fall back to standard SF User shape: Id + Name
          cols = { sfId: 1 };
          for (let i = 1; i < cells.length; i++) {
            const h = String(cells[i] || "").toLowerCase();
            if (h === "name") cols.fullName = i;
            if (h === "isactive") cols.isActive = i;
            if (h === "title" || h === "userrole.name") cols.title = i;
            if (h === "email") cols.email = i;
          }
        }
        continue;
      }
      const sfId = cells[cols.sfId];
      if (!sfId) continue;
      const name = cells[cols.fullName] ||
        ([cells[cols.firstName], cells[cols.lastName]].filter(Boolean).join(" ").trim());
      if (!name) continue;
      const isActiveRaw = cells[cols.isActive];
      const isActive = isActiveRaw === true || /^true|yes|1$/i.test(String(isActiveRaw ?? ""));
      users.set(String(sfId), {
        name: String(name).trim(),
        isActive,
        title: cells[cols.title] ? String(cells[cols.title]).trim() : null,
        email: cells[cols.email] ? String(cells[cols.email]).trim() : null,
      });
    }
    break;
  }
  return { users, foundSheet };
}

/**
 * Stream-read a Task sheet from the same workbook. Tasks are SF activities
 * (calls / emails / etc). Returns array of normalized activity objects,
 * matching the shape used by /api/activities.
 *
 * Standard SF Task fields expected (case-insensitive, ssot__ prefix tolerated):
 *   Id, OwnerId, ActivityDate / ActivityDateTime, Subject, Description,
 *   CallDurationInSeconds, TaskSubtype (Call/Email/Task), Status,
 *   WhoId, WhatId, AccountId, CreatedDate
 *
 * The User table (passed in) lets us resolve OwnerId -> BDR name.
 * Subjects matching [Outreach][Call] are excluded.
 */
export async function streamReadTaskTable(filePath, userTable = new Map(), { sheetName = "Task" } = {}) {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) throw new Error(`Excel file not found: ${resolved}`);
  const wb = new ExcelJS.stream.xlsx.WorkbookReader(resolved, {
    entries: "emit", sharedStrings: "cache",
    hyperlinks: "ignore", styles: "ignore", worksheets: "emit",
  });

  const activities = [];
  let foundSheet = false;
  const OUTREACH_RE = /\[outreach\][\s_-]*\[call\]/i;

  for await (const ws of wb) {
    if (ws.name !== sheetName) { for await (const _r of ws) {} continue; }
    foundSheet = true;
    let rowIdx = 0;
    let cols = null;
    for await (const row of ws) {
      rowIdx++;
      const cells = row.values;
      if (rowIdx === 1) {
        cols = {};
        for (let i = 1; i < cells.length; i++) {
          const h = String(cells[i] || "").toLowerCase().replace(/^ssot__/, "").replace(/__c$/, "");
          if (h === "id") cols.id = i;
          else if (h === "ownerid") cols.ownerId = i;
          else if (h === "subject") cols.subject = i;
          else if (h === "description") cols.description = i;
          else if (h === "activitydate") cols.activityDate = i;
          else if (h === "activitydatetime" || h === "completeddatetime") cols.completedDate = i;
          else if (h === "calldurationinseconds") cols.durationSeconds = i;
          else if (h === "durationminutes" || h === "duration") cols.durationMinutes = i;
          else if (h === "tasksubtype") cols.taskSubtype = i;
          else if (h === "type" || h === "activitytype") cols.activityType = i;
          else if (h === "status") cols.status = i;
          else if (h === "createddate") cols.createdDate = i;
          else if (h === "whoid") cols.whoId = i;
          else if (h === "whatid") cols.whatId = i;
          else if (h === "accountid") cols.accountId = i;
        }
        continue;
      }
      if (!cols) continue;
      const subject = cells[cols.subject];
      if (subject && OUTREACH_RE.test(String(subject))) continue;

      const ownerId = cells[cols.ownerId];
      const user = ownerId ? userTable.get(String(ownerId)) : null;

      const durSec = cells[cols.durationSeconds];
      const durMin = cells[cols.durationMinutes];
      let durationMinutes = null;
      if (typeof durMin === "number") durationMinutes = durMin;
      else if (typeof durSec === "number") durationMinutes = durSec / 60;
      else durationMinutes = parseDurationFromText(subject) ?? parseDurationFromText(cells[cols.description]);

      const subtype = String(cells[cols.taskSubtype] || cells[cols.activityType] || "").toLowerCase();
      const activityKind = subtype.includes("email") ? "email" : subtype.includes("call") ? "call" : "task";

      activities.push({
        id: cells[cols.id] || `task_${activities.length + 1}`,
        bdrName: user ? user.name : null,
        bdrId: ownerId || null,
        ownerRole: user?.title || null,
        subject: subject || null,
        description: cells[cols.description] || null,
        date: parseExcelDate(cells[cols.activityDate] ?? cells[cols.completedDate])?.toISOString() || null,
        createdDate: parseExcelDate(cells[cols.createdDate])?.toISOString() || null,
        completedDate: parseExcelDate(cells[cols.completedDate])?.toISOString() || null,
        durationMinutes,
        isConversation: typeof durationMinutes === "number" && durationMinutes >= 3,
        status: cells[cols.status] || null,
        activityKind,
        activityType: cells[cols.activityType] || subtype,
        accountId: cells[cols.accountId] || null,
        whoId: cells[cols.whoId] || null,
        whatId: cells[cols.whatId] || null,
      });
    }
    break;
  }
  return { activities, foundSheet };
}

/**
 * Apply a Map<sfUserId, {name,...}> to streamed deals -- populates `bdrName`
 * by looking up `bdrId` in the user table.
 */
export function applyUserTable(deals, userTable) {
  let resolved = 0;
  for (const d of deals) {
    if (d.bdrName || !d.bdrId) continue;
    const u = userTable.get(d.bdrId);
    if (u) {
      d.bdrName = u.name;
      if (u.isActive != null) d.bdrIsActive = u.isActive;
      if (u.title) d.bdrTitle = u.title;
      resolved++;
    }
  }
  return resolved;
}

/**
 * Build a User ID -> BDR Name map by joining the streamed deals against an
 * alternate file (e.g. BDR data sheet.xlsx) that has both opportunity IDs
 * AND resolved BDR names. Returns a Map<sfUserId, name>.
 *
 * Pass the result of readDealsFromFile(BDR_DATA_SHEET) -- that file's deals
 * carry both `id` (15- or 18-char opp ID) and `bdrName` (resolved string).
 */
export function buildUserMapFromReference(referenceDeals, streamedDeals) {
  // Join key: 15-char base opp ID (everything before the 3-char suffix).
  const refByOppId = new Map();
  for (const d of referenceDeals) {
    if (d.id && d.bdrName) refByOppId.set(String(d.id).slice(0, 15), d.bdrName);
  }
  const userMap = new Map();      // bdrId (SF user id) -> resolved name
  for (const d of streamedDeals) {
    if (!d.bdrId) continue;
    const oppKey = String(d.id).slice(0, 15);
    const name = refByOppId.get(oppKey);
    if (name) userMap.set(d.bdrId, name);
  }
  return userMap;
}

/**
 * Apply a Map<bdrId, name> in-place to the streamed deals -- populates `bdrName`
 * for any deal whose `bdrId` is in the map. Returns the count of resolutions.
 */
export function applyBdrNameMap(deals, userMap) {
  let resolved = 0;
  for (const d of deals) {
    if (d.bdrName) continue;
    if (d.bdrId && userMap.has(d.bdrId)) {
      d.bdrName = userMap.get(d.bdrId);
      resolved++;
    }
  }
  return resolved;
}

/**
 * Stream-read deals from a large xlsx file. Returns { deals, headerMap, unmappedHeaders, sheetName }.
 * Default targets the "Opportunity" sheet that BDR V2.xlsx uses.
 */
export async function streamReadDeals(filePath, { sheetName = "Opportunity", onProgress } = {}) {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) throw new Error(`Excel file not found: ${resolved}`);

  const wb = new ExcelJS.stream.xlsx.WorkbookReader(resolved, {
    entries: "emit",
    sharedStrings: "cache",
    hyperlinks: "ignore",
    styles: "ignore",
    worksheets: "emit",
  });

  let activeSheet = null;
  let headerMap = {};
  let unmappedHeaders = [];
  const deals = [];

  for await (const ws of wb) {
    // Pick the first matching sheet (case-insensitive). If none matches the name,
    // fall back to the first sheet with data.
    if (sheetName && ws.name && ws.name.toLowerCase() !== sheetName.toLowerCase() && activeSheet == null) {
      // Drain rows to advance the stream
      for await (const _row of ws) { /* skip */ }
      continue;
    }
    activeSheet = ws.name;
    let rowIdx = 0;
    for await (const row of ws) {
      rowIdx++;
      const cells = row.values; // index-1 array
      if (rowIdx === 1) {
        const headers = cells.slice(1); // drop the empty 0 index
        for (let i = 0; i < headers.length; i++) {
          const raw = headers[i];
          if (raw == null) continue;
          const norm = normalize(raw);
          const alias = HEADER_ALIASES[norm];
          if (alias) headerMap[i + 1] = { alias, raw }; // store column index (1-based)
          else unmappedHeaders.push(String(raw));
        }
        continue;
      }
      const out = {};
      for (const [colIdxStr, info] of Object.entries(headerMap)) {
        const colIdx = +colIdxStr;
        const v = coerceCell(info.alias, cells[colIdx]);
        if (v != null) out[info.alias] = v;
      }
      if (!out.id) continue; // skip empty rows
      deals.push(deriveDealDefaults(out));
      if (onProgress && deals.length % 5000 === 0) onProgress(deals.length);
    }
    break; // we've consumed our target sheet
  }
  return {
    deals,
    headerMap: Object.fromEntries(Object.values(headerMap).map((v) => [v.raw, v.alias])),
    unmappedHeaders,
    sheetName: activeSheet,
  };
}
