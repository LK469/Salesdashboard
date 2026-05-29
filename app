/**
 * Cerby Sales Dashboard — Google Apps Script Web App
 *
 * SETUP (one-time, ~3 minutes):
 *  1. In the Google Sheet go to Extensions → Apps Script
 *  2. Delete any existing code in Code.gs
 *  3. Paste this entire file in
 *  4. Click Deploy → New deployment → Web app
 *     • Execute as: Me
 *     • Who has access: Anyone (within Cerby org)
 *  5. Copy the Web app URL into SCRIPT_URL in sales_dashboard.html
 *
 * Re-deploy after any change to this file.
 */

// ── Spreadsheet with Coefficient custom SQL (Account + Opportunity tabs) ─────
const COEFF_SS_ID = '19LBBYCRL3ru3OohJbbZPGLTFAD14XBq3ojXXWYClBVI';

function openCoeffSs_() {
  try { return SpreadsheetApp.openById(COEFF_SS_ID); } catch(e) { return null; }
}

function doGet(e) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // Wrap each function so one failure doesn't crash the whole response
  function safe(fn) {
    try { return fn(); } catch(err) { return { _error: err.message }; }
  }

  // All data is calculated from the Opportunity, Account, and Product tabs in
  // the Coefficient spreadsheet.  No hardcoded fallback numbers.
  const data = {
    oppMetrics  : safe(() => getOppMetrics(ss)),
    accounts    : safe(() => getAccountData(ss)),
    products    : safe(() => getProductData(ss)),
    quotas      : safe(() => getQuotaData(ss)),
    lastUpdated : new Date().toISOString(),
  };

  const json = JSON.stringify(data);

  // JSONP support — bypasses CORS for local file:// and cross-origin usage
  const cb = (e && e.parameter || {}).callback;
  if (cb) {
    return ContentService
      .createTextOutput(cb + '(' + json + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  return ContentService
    .createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}

// ── Opportunity metrics (pipeline, funnel, velocity, closed won) ───────────
function getOppMetrics(ss) {
  // Prefer the Coefficient custom SQL spreadsheet; fall back to active SS
  const extSs = openCoeffSs_();
  const sh = (extSs && (extSs.getSheetByName('Opportunity') ||
                        extSs.getSheetByName('Opportunities') ||
                        extSs.getSheetByName('opportunities') ||
                        extSs.getSheetByName('opportunity') ||
                        extSs.getSheetByName('Opps') ||
                        extSs.getSheetByName('opps'))) ||
             ss.getSheetByName('Opportunity') ||
             ss.getSheetByName('opportunities');
  if (!sh) return null;

  const lastRow = sh.getLastRow();
  const lastCol = sh.getLastColumn();
  if (lastRow < 2) return null;

  // Auto-detect header row (row 1 may be Coefficient metadata)
  const r1val = String(sh.getRange(1,1,1,1).getValue()).toLowerCase();
  const headerRow = (r1val.includes('salesforce') || r1val.includes('admin') ||
                     r1val === '' || r1val === 'id') ? (r1val === 'id' ? 1 : 2) : 1;

  const rawHeaders = sh.getRange(headerRow, 1, 1, lastCol).getValues()[0];
  const headers    = rawHeaders.map(h => String(h).trim().toLowerCase());

  // Exact match first, then partial — prevents 'id' matching 'accountid'
  const col = (...names) => {
    for (const name of names) {
      const ln = name.toLowerCase();
      const exact = headers.indexOf(ln);
      if (exact >= 0) return exact;
      const partial = headers.findIndex(h => h.includes(ln));
      if (partial >= 0) return partial;
    }
    return -1;
  };

  const C = {
    oppId       : col('id'),
    oppName     : col('name', 'opportunity name', 'opportunityname'),
    accountName : col('account.name', 'account name', 'accountname', 'account'),
    stage       : col('stagename', 'stage'),
    isWon       : col('iswon'),
    isClosed    : col('isclosed'),
    forecastCat : col('forecastcategoryname', 'forecast category', 'forecastcategory', 'forecast cat'),
    // Stage date columns — API names from new sheet, then legacy label fallbacks
    s1          : col('stage_1_meeting_scheduled_start_date__c', 'stage 1. meeting scheduled start', '1. meeting scheduled start', '1. meeting scheduled'),
    s2          : col('stage_2_discovery_start_date__c', 'stage 2. discovery start', '2. discovery start'),
    s3          : col('stage_3_scoping_start_date__c',   'stage 3. scoping start',   '3. scoping start'),
    s4          : col('stage_4_solutions_validation_start_date__c', 'stage 4. solutions validation start', '4. solutions validation'),
    s5          : col('stage_5_solutions_proposal_start_date__c',  'stage 5. solutions proposal start',  '5. proposal start'),
    s6          : col('stage_6_negotiate_close_start_date__c',     'stage 6. negotiate close start',     '6. negotiate'),
    s8          : col('stage_8_close_pending_start_date__c',       'stage 8. close pending start',       '8. close pending'),
    s9          : col('stage_9_closed_won_start_date__c',          'stage 9. closed-won start',          '9. closed-won'),
    closeDate   : col('closedate', 'close date'),
    createdDate : col('createddate', 'created date', 'created'),
    netNewARR   : col('net_new_arr__c'),
    deltaARR    : col('subskribe order delta arr', 'delta arr'),
    amount      : col('amount'),
    segment     : col('company_segment__c', 'company segment'),
    type        : col('type'),
    ownerName   : col('owner.name', 'owner_name', 'owner name', 'rep name', 'ownername', 'assignee'),
    oppSource   : col('opp_source__c', 'opp source'),
    sourceDetail: col('opp_source_details__c', 'opp source details', 'opp source detail'),
    lostReason  : col('lost_reason__c', 'close_lost_reason__c', 'closed_lost_reason__c', 'lost_reason_category__c', 'closed lost reason', 'loss reason', 'lost reason', 'close lost reason'),
  };

  const dataStart = headerRow + 1;
  const numRows   = lastRow - headerRow;
  if (numRows <= 0) return null;

  const data = sh.getRange(dataStart, 1, numRows, lastCol).getValues();

  function toDate(v) {
    if (v instanceof Date && !isNaN(v.getTime())) return v;
    if (typeof v === 'string' && v.trim()) { const d = new Date(v); return isNaN(d) ? null : d; }
    return null;
  }

  function toQtr(d) {
    if (!d) return null;
    const mo = d.getMonth(); // 0=Jan … 11=Dec
    let fq, fy;
    if      (mo === 11) { fq = 1; fy = d.getFullYear() + 1; } // Dec → FQ1 next FY
    else if (mo <= 1)   { fq = 1; fy = d.getFullYear(); }     // Jan–Feb  → FQ1
    else if (mo <= 4)   { fq = 2; fy = d.getFullYear(); }     // Mar–May  → FQ2
    else if (mo <= 7)   { fq = 3; fy = d.getFullYear(); }     // Jun–Aug  → FQ3
    else                { fq = 4; fy = d.getFullYear(); }     // Sep–Nov  → FQ4
    return 'Q' + fq + "'" + String(fy).slice(2);
  }

  function toIso(d) {
    if (!d) return '';
    return d.getFullYear() + '-' +
           String(d.getMonth()+1).padStart(2,'0') + '-' +
           String(d.getDate()).padStart(2,'0');
  }

  function daysBetween(d1, d2) {
    if (!d1 || !d2) return null;
    const n = Math.round((d2 - d1) / 86400000);
    return (n >= 0 && n < 730) ? n : null;
  }

  const pipeByQ         = {};
  const wonByQ          = {};
  const openByStage     = {};
  const funnelIn        = { s2:0, s3:0, s4:0, s5:0, s6:0, s8:0, s9:0 };
  const stageDurRaw     = { s2s3:[], s3s4:[], s4s5:[], s5s6:[], s6s9:[] };
  let wonCount = 0, wonARR = 0, lostCount = 0;
  let cycleDaysSum = 0, cycleDaysN = 0;
  const byType       = {};
  const bySegment    = {};
  const byForecast   = {}; // byForecast[closeQtr][forecastCat] = {count, arr}
  const rawOpps      = []; // one entry per opportunity row

  // Per-rep breakdown (keyed by owner name)
  const repBreakdown = {};
  function ensureRep(name) {
    if (!repBreakdown[name]) {
      repBreakdown[name] = {
        pipeByQ: {}, wonByQ: {}, openByStage: {},
        funnel: { s2:0, s3:0, s4:0, s5:0, s6:0, s8:0, s9:0 },
        stageDurRaw: { s2s3:[], s3s4:[], s4s5:[], s5s6:[], s6s9:[] },
        wonCount:0, wonARR:0, lostCount:0, cycleDaysSum:0, cycleDaysN:0,
      };
    }
    return repBreakdown[name];
  }

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const id  = C.oppId >= 0 ? String(row[C.oppId] || '').trim() : String(i + 1);
    if (C.oppId >= 0 && !id) continue;
    const repName = C.ownerName >= 0 ? clean(row[C.ownerName]) : '';
    const rd = repName ? ensureRep(repName) : null;

    // Win/loss: use boolean IsWon/IsClosed fields if present (new sheet),
    // fall back to parsing StageName (old sheet)
    let isWon, isLost;
    if (C.isWon >= 0) {
      const w = row[C.isWon];
      isWon  = w === true || String(w).toLowerCase() === 'true';
    } else {
      const sl = String(row[C.stage] || '').toLowerCase();
      isWon  = sl.includes('closed-won') || sl.includes('closed won');
    }
    if (C.isClosed >= 0) {
      const cl = row[C.isClosed];
      const closed = cl === true || String(cl).toLowerCase() === 'true';
      isLost = closed && !isWon;
    } else {
      const sl = String(row[C.stage] || '').toLowerCase();
      isLost = sl.includes('lost') || sl.includes('qualified out') || sl.includes('disqualified');
    }
    const isOpen = !isWon && !isLost;

    const stage  = C.stage >= 0 ? String(row[C.stage] || '').trim() : '';
    // Prefer Net_New_ARR__c (delta), fall back to legacy delta ARR, then Amount
    const arrVal = num(C.netNewARR >= 0 ? row[C.netNewARR] : 0) ||
                   num(C.deltaARR  >= 0 ? row[C.deltaARR]  : 0) ||
                   num(C.amount    >= 0 ? row[C.amount]    : 0);

    const s1 = C.s1 >= 0 ? toDate(row[C.s1]) : null;
    const s2 = C.s2 >= 0 ? toDate(row[C.s2]) : null;
    const s3 = C.s3 >= 0 ? toDate(row[C.s3]) : null;
    const s4 = C.s4 >= 0 ? toDate(row[C.s4]) : null;
    const s5 = C.s5 >= 0 ? toDate(row[C.s5]) : null;
    const s6 = C.s6 >= 0 ? toDate(row[C.s6]) : null;
    const s8 = C.s8 >= 0 ? toDate(row[C.s8]) : null;
    const s9 = C.s9 >= 0 ? toDate(row[C.s9]) : null;
    const cd = C.closeDate   >= 0 ? toDate(row[C.closeDate])   : null;
    const cr = C.createdDate >= 0 ? toDate(row[C.createdDate]) : null;

    const closeQtr = toQtr(cd);
    const wonQtr   = isWon ? (toQtr(s9 || cd)) : null;
    const forecastCat = C.forecastCat >= 0 ? clean(row[C.forecastCat]) : '';
    const typeVal  = C.type >= 0 ? clean(row[C.type]) : '';
    const today    = new Date();
    const ageStart = isWon ? s2 : (s2 || cr);
    const age      = ageStart ? Math.round((today - ageStart) / 86400000) : null;

    // ── rawOpps entry (all statuses)
    rawOpps.push({
      id,
      name        : C.oppName     >= 0 ? clean(row[C.oppName])     : id,
      account     : C.accountName >= 0 ? clean(row[C.accountName]) : '',
      stage,
      arr         : arrVal,
      type        : typeVal,
      rep         : repName,
      closeDate   : toIso(cd),
      closeQtr,
      wonQtr,
      forecastCat,
      isOpen,
      isWon,
      isLost,
      age         : age !== null && age >= 0 && age < 1460 ? age : null,
      s1Date      : toIso(s1),
      s2Date      : toIso(s2),
      createdDate : toIso(cr),
      pipeQtr     : s2 ? toQtr(s2) : null,
      oppSource   : C.oppSource    >= 0 ? clean(row[C.oppSource])    : '',
      sourceDetail: C.sourceDetail >= 0 ? clean(row[C.sourceDetail]) : '',
      lostReason  : C.lostReason   >= 0 ? clean(row[C.lostReason])   : '',
    });

    // ── byForecast (open opps only)
    if (isOpen && closeQtr && forecastCat) {
      if (!byForecast[closeQtr]) byForecast[closeQtr] = {};
      if (!byForecast[closeQtr][forecastCat]) byForecast[closeQtr][forecastCat] = { count:0, arr:0 };
      byForecast[closeQtr][forecastCat].count++;
      byForecast[closeQtr][forecastCat].arr += arrVal;
    }

    // Funnel: count any deal that reached each stage
    if (s2) { funnelIn.s2++; if(rd) rd.funnel.s2++; }
    if (s3) { funnelIn.s3++; if(rd) rd.funnel.s3++; }
    if (s4) { funnelIn.s4++; if(rd) rd.funnel.s4++; }
    if (s5) { funnelIn.s5++; if(rd) rd.funnel.s5++; }
    if (s6) { funnelIn.s6++; if(rd) rd.funnel.s6++; }
    if (s8) { funnelIn.s8++; if(rd) rd.funnel.s8++; }
    if (s9 || isWon) { funnelIn.s9++; if(rd) rd.funnel.s9++; }

    if (isOpen) {
      const isNewBiz = typeVal.toLowerCase().includes('new');
      if (!openByStage[stage]) openByStage[stage] = { count:0, arr:0, newArr:0, existingArr:0 };
      openByStage[stage].count++;
      openByStage[stage].arr += arrVal;
      if (isNewBiz) openByStage[stage].newArr     += arrVal;
      else          openByStage[stage].existingArr += arrVal;
      // Per-rep open pipeline
      if (rd) {
        if (!rd.openByStage[stage]) rd.openByStage[stage] = { count:0, arr:0, newArr:0, existingArr:0 };
        rd.openByStage[stage].count++;
        rd.openByStage[stage].arr += arrVal;
        if (isNewBiz) rd.openByStage[stage].newArr     += arrVal;
        else          rd.openByStage[stage].existingArr += arrVal;
      }
      const q = s2 ? toQtr(s2) : null;
      if (q) {
        if (!pipeByQ[q]) pipeByQ[q] = { count:0, arr:0 };
        pipeByQ[q].count++;
        pipeByQ[q].arr += arrVal;
        if (rd) {
          if (!rd.pipeByQ[q]) rd.pipeByQ[q] = { count:0, arr:0 };
          rd.pipeByQ[q].count++;
          rd.pipeByQ[q].arr += arrVal;
        }
      }
    }

    if (isWon) {
      wonCount++;
      wonARR += arrVal;
      if (rd) { rd.wonCount++; rd.wonARR += arrVal; }
      const wonDate = s9 || cd;
      if (wonDate) {
        const q = toQtr(wonDate);
        if (!wonByQ[q]) wonByQ[q] = { count:0, arr:0 };
        wonByQ[q].count++;
        wonByQ[q].arr += arrVal;
        if (rd) {
          if (!rd.wonByQ[q]) rd.wonByQ[q] = { count:0, arr:0 };
          rd.wonByQ[q].count++;
          rd.wonByQ[q].arr += arrVal;
        }
      }
      if (s2 && (s9 || cd)) {
        const d = daysBetween(s2, s9 || cd);
        if (d !== null) { cycleDaysSum += d; cycleDaysN++; if(rd) { rd.cycleDaysSum += d; rd.cycleDaysN++; } }
      }
      const push = (key, d1, d2) => {
        const n = daysBetween(d1,d2);
        if (n !== null) { stageDurRaw[key].push(n); if(rd) rd.stageDurRaw[key].push(n); }
      };
      push('s2s3', s2, s3); push('s3s4', s3, s4); push('s4s5', s4, s5);
      push('s5s6', s5, s6); push('s6s9', s6, s9 || cd);
    }

    if (isLost) { lostCount++; if(rd) rd.lostCount++; }

    // Accumulate by Opportunity Type and Segment
    const segLabel  = C.segment >= 0 ? clean(row[C.segment]) : '';
    [['byType', typeVal, byType], ['bySegment', segLabel, bySegment]].forEach(([,lbl,map]) => {
      if (!lbl) return;
      if (!map[lbl]) map[lbl] = { openCount:0, openARR:0, wonCount:0, wonARR:0 };
      if (isOpen) { map[lbl].openCount++; map[lbl].openARR += arrVal; }
      if (isWon)  { map[lbl].wonCount++;  map[lbl].wonARR  += arrVal; }
    });
  }

  function avg(a) { return a.length ? Math.round(a.reduce((x,y)=>x+y,0)/a.length) : null; }
  const avgStageDays = {
    s2s3: avg(stageDurRaw.s2s3), s3s4: avg(stageDurRaw.s3s4),
    s4s5: avg(stageDurRaw.s4s5), s5s6: avg(stageDurRaw.s5s6),
    s6s9: avg(stageDurRaw.s6s9),
  };

  const totalOpen    = Object.values(openByStage).reduce((s,v)=>s+v.count, 0);
  const totalOpenARR = Object.values(openByStage).reduce((s,v)=>s+v.arr,   0);
  const winRate      = (wonCount + lostCount) > 0 ? Math.round(wonCount/(wonCount+lostCount)*100) : 0;
  const avgCycle     = cycleDaysN  > 0 ? Math.round(cycleDaysSum/cycleDaysN) : 90;
  const avgDeal      = wonCount    > 0 ? Math.round(wonARR/wonCount)         : 0;
  const velocityMo   = avgCycle    > 0 ? Math.round(totalOpen*(winRate/100)*avgDeal/avgCycle*30) : 0;

  const sortQ = obj => Object.entries(obj)
    .sort((a,b) => a[0].localeCompare(b[0]))
    .map(([q,v]) => ({ q, ...v }));

  // Finalize per-rep breakdowns
  const finalRepBreakdown = {};
  for (const [rep, r] of Object.entries(repBreakdown)) {
    const rOpen    = Object.values(r.openByStage).reduce((s,v)=>s+v.count,0);
    const rOpenARR = Object.values(r.openByStage).reduce((s,v)=>s+v.arr,  0);
    const rWR      = (r.wonCount+r.lostCount)>0 ? Math.round(r.wonCount/(r.wonCount+r.lostCount)*100) : 0;
    const rCycle   = r.cycleDaysN>0 ? Math.round(r.cycleDaysSum/r.cycleDaysN) : 90;
    const rDeal    = r.wonCount>0 ? Math.round(r.wonARR/r.wonCount) : 0;
    const rVelMo   = rCycle>0 ? Math.round(rOpen*(rWR/100)*rDeal/rCycle*30) : 0;
    finalRepBreakdown[rep] = {
      pipeByQ: sortQ(r.pipeByQ), wonByQ: sortQ(r.wonByQ),
      openByStage: r.openByStage, funnel: r.funnel,
      avgStageDays: {
        s2s3: avg(r.stageDurRaw.s2s3), s3s4: avg(r.stageDurRaw.s3s4),
        s4s5: avg(r.stageDurRaw.s4s5), s5s6: avg(r.stageDurRaw.s5s6),
        s6s9: avg(r.stageDurRaw.s6s9),
      },
      velocity: {
        totalOpenOpps: rOpen, openPipeARR: rOpenARR,
        wonCount: r.wonCount, wonARR: r.wonARR, lostCount: r.lostCount,
        winRate: rWR, avgDealARR: rDeal, avgCycleDays: rCycle, velocityMonthly: rVelMo,
      },
    };
  }

  return {
    pipeByQ: sortQ(pipeByQ), wonByQ: sortQ(wonByQ),
    openByStage, funnel: funnelIn, avgStageDays,
    velocity: {
      totalOpenOpps: totalOpen, openPipeARR: totalOpenARR,
      wonCount, wonARR, lostCount, winRate,
      avgDealARR: avgDeal, avgCycleDays: avgCycle, velocityMonthly: velocityMo,
    },
    repBreakdown: finalRepBreakdown,
    reps: Object.keys(finalRepBreakdown).sort(),
    byType, bySegment,
    byForecast,
    rawOpps,
  };
}

// ── Account data (IB ARR — active customers + health/expansion signals) ────
function getAccountData(ss) {
  const extSs = openCoeffSs_();
  const sh = (extSs && (extSs.getSheetByName('Account') ||
                        extSs.getSheetByName('Accounts') ||
                        extSs.getSheetByName('account') ||
                        extSs.getSheetByName('accounts'))) ||
             ss.getSheetByName('Account') ||
             ss.getSheetByName('accounts');
  if (!sh) return null;

  const lastRow = sh.getLastRow();
  const lastCol = sh.getLastColumn();
  if (lastRow < 2) return { customers:[], totalIbARR:0, activeCount:0 };

  // Auto-detect header row
  const r1val = String(sh.getRange(1,1,1,1).getValue()).toLowerCase();
  const headerRow = (r1val.includes('salesforce') || r1val.includes('admin') || r1val === '') ? 2 : 1;

  const headers = sh.getRange(headerRow, 1, 1, lastCol).getValues()[0]
                    .map(h => String(h).trim().toLowerCase());

  const col = (...names) => {
    for (const name of names) {
      const ln = name.toLowerCase();
      const exact = headers.indexOf(ln);
      if (exact >= 0) return exact;
      const partial = headers.findIndex(h => h.includes(ln));
      if (partial >= 0) return partial;
    }
    return -1;
  };

  const C = {
    id           : col('id'),
    name         : col('name'),
    type         : col('type'),
    status       : col('account_status__c', 'account status', 'customer status', 'status'),
    arr          : col('arr__c', 'arr'),
    segment      : col('company_segment__c', 'company segment', 'segment'),
    csm          : col('customer_success_manager__c', 'csm owner', 'csm'),
    renewal      : col('renewal_date__c', 'renewal date', 'renewal'),
    industry     : col('industry'),
    health       : col('account_health__c', 'account health', 'health'),
    lifecycle    : col('customer_lifecycle_stage__c', 'lifecycle stage', 'lifecycle'),
    expansion    : col('expansion_potential__c', 'expansion potential'),
    expansionDesc: col('expansion_potential_description__c', 'expansion description'),
    riskReason   : col('customer_risk_reason__c', 'risk reason'),
    stRisk       : col('statisfy_risk__c', 'statisfy risk'),
    stRelation   : col('statisfy_relationship__c', 'statisfy relationship'),
    stUsage      : col('statisfy_product_usage__c', 'statisfy product usage', 'product usage'),
    stOutcomes   : col('statisfy_outcomes__c', 'statisfy outcomes'),
    stExp        : col('statisfy_experience__c', 'statisfy experience'),
    activeUsers  : col('active_users__c', 'active users'),
    usersLic     : col('users_licensed__c', 'users licensed'),
    usersProv    : col('users_provisioned__c', 'users provisioned'),
    epmAccts     : col('epm_accounts_in_use__c', 'epm accounts'),
    lcmAccts     : col('lcm_accounts_in_use__c', 'lcm accounts'),
    socialAccts  : col('social_media_accounts_in_use__c', 'social media accounts'),
    package      : col('customer_success_package__c', 'cs package', 'package'),
    ownerName    : col('owner.name', 'owner_name', 'owner name', 'account owner'),
  };

  const dataStart = headerRow + 1;
  const numRows   = lastRow - headerRow;
  if (numRows <= 0) return { customers:[], totalIbARR:0, activeCount:0 };

  const data = sh.getRange(dataStart, 1, numRows, lastCol).getValues();
  const customers = [];

  for (const row of data) {
    const name   = C.name >= 0 ? clean(row[C.name]) : '';
    const type   = C.type >= 0 ? clean(row[C.type]) : '';
    const status = C.status >= 0 ? clean(row[C.status]) : '';
    const arrVal = C.arr   >= 0 ? num(row[C.arr])   : 0;

    if (!name) continue;

    // Type must be exactly "Customer" (excludes "Former Customer", "Lead", "Prospect")
    if (type.toLowerCase() !== 'customer') continue;
    if (arrVal <= 0) continue;

    customers.push({
      id          : C.id           >= 0 ? clean(row[C.id])           : '',
      name, type, status, arr: arrVal,
      segment     : C.segment      >= 0 ? clean(row[C.segment])      : '',
      csm         : C.csm          >= 0 ? clean(row[C.csm])          : '',
      ownerName   : C.ownerName    >= 0 ? clean(row[C.ownerName])    : '',
      renewal     : C.renewal      >= 0 ? fmtMonthKey(row[C.renewal]): '',
      industry    : C.industry     >= 0 ? clean(row[C.industry])     : '',
      health      : C.health       >= 0 ? clean(row[C.health])       : '',
      lifecycle   : C.lifecycle    >= 0 ? clean(row[C.lifecycle])    : '',
      expansion   : C.expansion    >= 0 ? clean(row[C.expansion])    : '',
      expansionDesc: C.expansionDesc >= 0 ? clean(String(row[C.expansionDesc]||'')).substring(0,250) : '',
      riskReason  : C.riskReason   >= 0 ? clean(row[C.riskReason])   : '',
      stRisk      : C.stRisk       >= 0 ? clean(row[C.stRisk])       : '',
      stRelation  : C.stRelation   >= 0 ? clean(row[C.stRelation])   : '',
      stUsage     : C.stUsage      >= 0 ? clean(row[C.stUsage])      : '',
      stOutcomes  : C.stOutcomes   >= 0 ? clean(row[C.stOutcomes])   : '',
      stExp       : C.stExp        >= 0 ? clean(row[C.stExp])        : '',
      activeUsers : C.activeUsers  >= 0 ? num(row[C.activeUsers])    : 0,
      usersLic    : C.usersLic     >= 0 ? num(row[C.usersLic])       : 0,
      usersProv   : C.usersProv    >= 0 ? num(row[C.usersProv])      : 0,
      epmAccts    : C.epmAccts     >= 0 ? num(row[C.epmAccts])       : 0,
      lcmAccts    : C.lcmAccts     >= 0 ? num(row[C.lcmAccts])       : 0,
      socialAccts : C.socialAccts  >= 0 ? num(row[C.socialAccts])    : 0,
      package     : C.package      >= 0 ? clean(row[C.package])      : '',
    });
  }

  customers.sort((a, b) => b.arr - a.arr);

  // Build renewal calendar from account renewal dates
  const calMap = {};
  for (const c of customers) {
    if (!c.renewal) continue;
    if (!calMap[c.renewal]) calMap[c.renewal] = { m: c.renewal, n: 0, arr: 0, topAccts: [] };
    calMap[c.renewal].n++;
    calMap[c.renewal].arr += c.arr;
    if (calMap[c.renewal].topAccts.length < 5) calMap[c.renewal].topAccts.push(c.name);
  }
  let cum = 0;
  const renewalCalendar = Object.values(calMap)
    .sort((a, b) => a.m.localeCompare(b.m))
    .map(r => { cum += r.arr; return { m: r.m, n: r.n, arr: r.arr, cum, top: r.topAccts.join(', ') }; });

  return {
    customers,
    totalIbARR     : customers.reduce((s,c) => s + c.arr, 0),
    activeCount    : customers.length,
    renewalCalendar,
  };
}

// ── Quota data — reads a "Quota" tab with rep names + per-quarter amounts ──
// Expected format (row 1 = headers, col A = Rep Name):
//   Rep Name  | Q1'26  | Q2'26  | Q3'26  | Q4'26
//   Carlos G  | 200000 | 200000 | 250000 | 250000
// Tab can be named: Quota, Quotas, Target, Targets, Rep Quota (case-insensitive)
function getQuotaData(ss) {
  const extSs = openCoeffSs_();
  const sh = (extSs && (
    extSs.getSheetByName('Quota')      || extSs.getSheetByName('Quotas')     ||
    extSs.getSheetByName('Target')     || extSs.getSheetByName('Targets')    ||
    extSs.getSheetByName('Rep Quota')  || extSs.getSheetByName('Rep Quotas') ||
    extSs.getSheetByName('quota')      || extSs.getSheetByName('quotas')     ||
    extSs.getSheetByName('target')     || extSs.getSheetByName('targets')
  )) ||
  ss.getSheetByName('Quota')  || ss.getSheetByName('Quotas') ||
  ss.getSheetByName('quota')  || ss.getSheetByName('quotas') ||
  ss.getSheetByName('Target') || ss.getSheetByName('Targets') ||
  ss.getSheetByName('target') || ss.getSheetByName('targets');

  if (!sh) return {};

  const lastRow = sh.getLastRow();
  const lastCol = sh.getLastColumn();
  if (lastRow < 2 || lastCol < 2) return {};

  const rawHeaders = sh.getRange(1, 1, 1, lastCol).getValues()[0];
  const rawData    = sh.getRange(2, 1, lastRow - 1, lastCol).getValues();

  const result = {};
  for (var i = 0; i < rawData.length; i++) {
    const row     = rawData[i];
    const repName = String(row[0] || '').trim();
    if (!repName) continue;
    result[repName] = {};
    for (var j = 1; j < rawHeaders.length; j++) {
      const qLabel = String(rawHeaders[j] || '').trim();
      if (!qLabel) continue;
      const amount = parseFloat(String(row[j]).replace(/[$,\s]/g, ''));
      if (!isNaN(amount) && amount > 0) result[repName][qLabel] = amount;
    }
  }
  return result;
}

// ── Product / OpportunityLineItem data ────────────────────────────────────
function getProductData(ss) {
  const extSs = openCoeffSs_();
  const sh = (extSs && (
    extSs.getSheetByName('Product')              ||
    extSs.getSheetByName('Products')             ||
    extSs.getSheetByName('OpportunityLineItem')  ||
    extSs.getSheetByName('Opportunity Products') ||
    extSs.getSheetByName('Line Items')
  )) || ss.getSheetByName('Product');
  if (!sh) return { byProduct: [] };

  const lastRow = sh.getLastRow();
  const lastCol = sh.getLastColumn();
  if (lastRow < 2) return { byProduct: [] };

  const r1val = String(sh.getRange(1,1,1,1).getValue()).toLowerCase();
  const headerRow = (r1val.includes('salesforce') || r1val.includes('admin') || r1val === '') ? 2 : 1;

  const headers = sh.getRange(headerRow, 1, 1, lastCol).getValues()[0]
                    .map(h => String(h).trim().toLowerCase());

  const col = (...names) => {
    for (const name of names) {
      const ln = name.toLowerCase();
      const exact   = headers.indexOf(ln);   if (exact   >= 0) return exact;
      const partial = headers.findIndex(h => h.includes(ln)); if (partial >= 0) return partial;
    }
    return -1;
  };

  const C = {
    productName : col('product2.name', 'product name', 'productname', 'name'),
    totalPrice  : col('totalprice', 'total price', 'arr__c', 'arr', 'amount'),
    iswon       : col('opportunity.iswon', 'iswon'),
    isclosed    : col('opportunity.isclosed', 'isclosed'),
    stage       : col('opportunity.stagename', 'stagename', 'stage'),
  };

  const dataStart = headerRow + 1;
  const numRows   = lastRow - headerRow;
  if (numRows <= 0) return { byProduct: [] };

  const data = sh.getRange(dataStart, 1, numRows, lastCol).getValues();
  const byProductMap = {};

  for (const row of data) {
    const productName = C.productName >= 0 ? clean(row[C.productName]) : '';
    if (!productName) continue;

    const price = num(C.totalPrice >= 0 ? row[C.totalPrice] : 0);

    let isWon;
    if (C.iswon >= 0) {
      isWon = row[C.iswon] === true || String(row[C.iswon]).toLowerCase() === 'true';
    } else {
      const sl = String(row[C.stage] || '').toLowerCase();
      isWon = sl.includes('closed-won') || sl.includes('closed won');
    }
    let isClosed = isWon;
    if (C.isclosed >= 0) {
      isClosed = row[C.isclosed] === true || String(row[C.isclosed]).toLowerCase() === 'true';
    }
    const isOpen = !isClosed;

    if (!byProductMap[productName]) {
      byProductMap[productName] = { name: productName, openCount: 0, openARR: 0, wonCount: 0, wonARR: 0 };
    }
    if (isOpen) { byProductMap[productName].openCount++; byProductMap[productName].openARR += price; }
    if (isWon)  { byProductMap[productName].wonCount++;  byProductMap[productName].wonARR  += price; }
  }

  const byProduct = Object.values(byProductMap)
    .filter(p => p.openARR > 0 || p.wonARR > 0)
    .sort((a, b) => (b.openARR + b.wonARR) - (a.openARR + a.wonARR));

  return { byProduct };
}

// ── Sales Play config (optional "Sales Play" tab, else built-in defaults) ───
function getSalesPlayConfig(ss) {
  const extSs = openCoeffSs_();
  const sh = (extSs && (
    extSs.getSheetByName('Sales Play')   || extSs.getSheetByName('SalesPlay')   ||
    extSs.getSheetByName('Sales Plays')  || extSs.getSheetByName('sales play')  ||
    extSs.getSheetByName('ICP Play')     || extSs.getSheetByName('Playbook')
  )) ||
  ss.getSheetByName('Sales Play') || ss.getSheetByName('SalesPlay');

  const defaults = [
    {
      id: 'shadow-it',
      name: 'Shadow IT & Unauthorized Access',
      segments: ['Mid-Market', 'Enterprise', 'Commercial'],
      industries: ['Technology', 'Software', 'Financial Services', 'Media', 'Retail'],
      minEmployees: 200, maxEmployees: 50000,
      description: 'Companies with app sprawl and unmanaged credentials — Cerby secures non-SSO apps.',
    },
    {
      id: 'compliance',
      name: 'Compliance & Audit Readiness',
      segments: ['Enterprise', 'Mid-Market'],
      industries: ['Financial Services', 'Healthcare', 'Insurance', 'Government', 'Legal'],
      minEmployees: 500, maxEmployees: 100000,
      description: 'Regulated orgs needing access governance, audit trails, and policy enforcement.',
    },
    {
      id: 'enterprise-sso',
      name: 'Enterprise SSO Modernization',
      segments: ['Enterprise', 'Strategic'],
      industries: ['Technology', 'Financial Services', 'Manufacturing', 'Energy', 'Telecommunications'],
      minEmployees: 1000, maxEmployees: 500000,
      description: 'Large enterprises extending SSO to apps that don\'t support SAML/OIDC natively.',
    },
    {
      id: 'partner-led',
      name: 'Partner-Led Growth',
      segments: ['Mid-Market', 'Commercial', 'Enterprise'],
      industries: [],
      minEmployees: 100, maxEmployees: 50000,
      description: 'Accounts sourced via partners — prioritize warm intros and co-sell motions.',
    },
  ];

  if (!sh) return { plays: defaults, source: 'default' };

  const lastRow = sh.getLastRow();
  const lastCol = sh.getLastColumn();
  if (lastRow < 2) return { plays: defaults, source: 'default' };

  const headers = sh.getRange(1, 1, 1, lastCol).getValues()[0]
    .map(h => String(h).trim().toLowerCase());
  const col = (...names) => {
    for (const name of names) {
      const ln = name.toLowerCase();
      const exact = headers.indexOf(ln);
      if (exact >= 0) return exact;
      const partial = headers.findIndex(h => h.includes(ln));
      if (partial >= 0) return partial;
    }
    return -1;
  };

  const C = {
    id       : col('id', 'play id'),
    name     : col('play name', 'name', 'play'),
    segments : col('target segments', 'segments', 'segment'),
    industries: col('target industries', 'industries', 'industry'),
    minEmp   : col('min employees', 'min emp', 'min employees'),
    maxEmp   : col('max employees', 'max emp', 'max employees'),
    desc     : col('description', 'desc'),
  };

  const data = sh.getRange(2, 1, lastRow - 1, lastCol).getValues();
  const plays = [];
  for (const row of data) {
    const name = C.name >= 0 ? clean(row[C.name]) : '';
    if (!name) continue;
    const segStr = C.segments >= 0 ? clean(row[C.segments]) : '';
    const indStr = C.industries >= 0 ? clean(row[C.industries]) : '';
    plays.push({
      id: C.id >= 0 ? clean(row[C.id]) : name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      name,
      segments: segStr ? segStr.split(/[,;|]/).map(s => s.trim()).filter(Boolean) : [],
      industries: indStr ? indStr.split(/[,;|]/).map(s => s.trim()).filter(Boolean) : [],
      minEmployees: C.minEmp >= 0 ? num(row[C.minEmp]) : 0,
      maxEmployees: C.maxEmp >= 0 ? num(row[C.maxEmp]) : 999999,
      description: C.desc >= 0 ? clean(row[C.desc]) : '',
    });
  }

  return { plays: plays.length ? plays : defaults, source: plays.length ? 'sheet' : 'default' };
}

// ── ICP / target account data (prospects + territory + firmographics) ───────
function getIcpAccountData(ss, oppMetrics) {
  const extSs = openCoeffSs_();
  const sh = (extSs && (extSs.getSheetByName('Account') ||
                        extSs.getSheetByName('Accounts') ||
                        extSs.getSheetByName('account') ||
                        extSs.getSheetByName('accounts'))) ||
             ss.getSheetByName('Account') ||
             ss.getSheetByName('accounts');
  if (!sh) return null;

  const lastRow = sh.getLastRow();
  const lastCol = sh.getLastColumn();
  if (lastRow < 2) return { accounts: [], byAe: {}, byTerritory: {}, byTier: {}, summary: {} };

  const r1val = String(sh.getRange(1,1,1,1).getValue()).toLowerCase();
  const headerRow = (r1val.includes('salesforce') || r1val.includes('admin') || r1val === '') ? 2 : 1;

  const headers = sh.getRange(headerRow, 1, 1, lastCol).getValues()[0]
    .map(h => String(h).trim().toLowerCase());

  const col = (...names) => {
    for (const name of names) {
      const ln = name.toLowerCase();
      const exact = headers.indexOf(ln);
      if (exact >= 0) return exact;
      const partial = headers.findIndex(h => h.includes(ln));
      if (partial >= 0) return partial;
    }
    return -1;
  };

  const C = {
    id           : col('id'),
    name         : col('name'),
    type         : col('type'),
    status       : col('account_status__c', 'account status', 'status'),
    segment      : col('company_segment__c', 'company segment', 'segment'),
    industry     : col('industry'),
    ownerName    : col('owner.name', 'owner_name', 'owner name', 'account owner'),
    territory    : col('territory__c', 'territory', 'sales_territory__c', 'sales territory', 'region'),
    employees    : col('numberofemployees', 'number of employees', 'employees', 'employee count'),
    revenue      : col('annualrevenue', 'annual revenue', 'revenue'),
    country      : col('billingcountry', 'billing country', 'country'),
    state        : col('billingstate', 'billing state', 'state'),
    icpScore     : col('icp_score__c', 'icp score', 'icp fit score'),
    icpTier      : col('icp_tier__c', 'icp tier', 'fit tier'),
    targetAcct   : col('target_account__c', 'target account', 'is target'),
    lastActivity : col('lastactivitydate', 'last activity date', 'last activity', 'lastactivity'),
    website      : col('website'),
  };

  const dataStart = headerRow + 1;
  const numRows   = lastRow - headerRow;
  if (numRows <= 0) return { accounts: [], byAe: {}, byTerritory: {}, byTier: {}, summary: {} };

  const data = sh.getRange(dataStart, 1, numRows, lastCol).getValues();
  const salesPlays = getSalesPlayConfig(ss).plays || [];
  const activityMap = buildAccountActivityMap_(oppMetrics);
  const accounts = [];

  for (const row of data) {
    const name   = C.name >= 0 ? clean(row[C.name]) : '';
    const type   = C.type >= 0 ? clean(row[C.type]) : '';
    if (!name) continue;

    const typeLower = type.toLowerCase();
    const isCustomer = typeLower === 'customer';
    const isFormer   = typeLower.includes('former');
    const isTarget   = C.targetAcct >= 0 && (
      row[C.targetAcct] === true ||
      String(row[C.targetAcct]).toLowerCase() === 'true' ||
      String(row[C.targetAcct]).toLowerCase() === 'yes'
    );

    if (isCustomer || isFormer) continue;
    const isProspectType = typeLower.includes('prospect') || typeLower.includes('lead') ||
      typeLower.includes('target') || typeLower.includes('opportunity') || !type;
    if (!isProspectType && !isTarget) continue;

    const segment   = C.segment   >= 0 ? clean(row[C.segment])   : '';
    const industry  = C.industry  >= 0 ? clean(row[C.industry])  : '';
    const ownerName = C.ownerName  >= 0 ? clean(row[C.ownerName]) : '';
    const territory = C.territory  >= 0 ? clean(row[C.territory]) : '';
    const employees = C.employees  >= 0 ? num(row[C.employees])  : 0;
    const revenue   = C.revenue    >= 0 ? num(row[C.revenue])    : 0;
    const country   = C.country    >= 0 ? clean(row[C.country])  : '';
    const state     = C.state      >= 0 ? clean(row[C.state])    : '';
    const sfIcpScore = C.icpScore  >= 0 ? num(row[C.icpScore])   : null;
    const sfIcpTier  = C.icpTier   >= 0 ? clean(row[C.icpTier])  : '';

    let lastAct = null;
    if (C.lastActivity >= 0) {
      const v = row[C.lastActivity];
      if (v instanceof Date && !isNaN(v.getTime())) lastAct = v;
      else if (typeof v === 'string' && v.trim()) { const d = new Date(v); if (!isNaN(d)) lastAct = d; }
    }

    const actKey = name.toLowerCase().trim();
    const oppAct = activityMap[actKey] || { openOpps: 0, openArr: 0, lastOppDate: null, stages: [] };

    if (!lastAct && oppAct.lastOppDate) lastAct = oppAct.lastOppDate;

    const playScores = scoreAccountAgainstPlays_({
      segment, industry, employees, revenue, territory, country, state,
    }, salesPlays);

    const bestPlay = playScores.length ? playScores[0] : null;
    const computedScore = sfIcpScore !== null && sfIcpScore > 0
      ? Math.round(sfIcpScore)
      : (bestPlay ? bestPlay.score : 0);
    const tier = sfIcpTier || tierFromScore_(computedScore);

    const daysSinceActivity = lastAct
      ? Math.round((new Date() - lastAct) / 86400000)
      : null;
    const activityLevel = activityLevel_(daysSinceActivity, oppAct.openOpps);

    accounts.push({
      id          : C.id >= 0 ? clean(row[C.id]) : '',
      name, type, status: C.status >= 0 ? clean(row[C.status]) : '',
      segment, industry, ownerName,
      territory: territory || inferTerritory_(country, state),
      employees, revenue, country, state,
      website     : C.website >= 0 ? clean(row[C.website]) : '',
      isTarget,
      icpScore    : computedScore,
      icpTier     : tier,
      bestPlay    : bestPlay ? bestPlay.name : '',
      bestPlayId  : bestPlay ? bestPlay.id : '',
      playScores,
      lastActivity: lastAct ? toIsoDate_(lastAct) : '',
      daysSinceActivity,
      activityLevel,
      openOpps    : oppAct.openOpps,
      openArr     : oppAct.openArr,
      oppStages   : oppAct.stages,
    });
  }

  accounts.sort((a, b) => b.icpScore - a.icpScore || b.openArr - a.openArr);

  const byAe = {}, byTerritory = {}, byTier = {};
  for (const a of accounts) {
    const ae = a.ownerName || 'Unassigned';
    if (!byAe[ae]) byAe[ae] = { count: 0, perfectFit: 0, engaged: 0, avgScore: 0, totalScore: 0 };
    byAe[ae].count++;
    byAe[ae].totalScore += a.icpScore;
    if (a.icpTier === 'Perfect Fit') byAe[ae].perfectFit++;
    if (a.activityLevel !== 'None') byAe[ae].engaged++;

    const terr = a.territory || 'Unknown';
    if (!byTerritory[terr]) byTerritory[terr] = { count: 0, perfectFit: 0, avgScore: 0, totalScore: 0 };
    byTerritory[terr].count++;
    byTerritory[terr].totalScore += a.icpScore;
    if (a.icpTier === 'Perfect Fit') byTerritory[terr].perfectFit++;

    if (!byTier[a.icpTier]) byTier[a.icpTier] = 0;
    byTier[a.icpTier]++;
  }
  for (const k of Object.keys(byAe)) byAe[k].avgScore = Math.round(byAe[k].totalScore / byAe[k].count);
  for (const k of Object.keys(byTerritory)) byTerritory[k].avgScore = Math.round(byTerritory[k].totalScore / byTerritory[k].count);

  const perfectFit = accounts.filter(a => a.icpTier === 'Perfect Fit');
  const noActivityPerfect = perfectFit.filter(a => a.activityLevel === 'None');

  return {
    accounts,
    byAe,
    byTerritory,
    byTier,
    territories: Object.keys(byTerritory).sort(),
    summary: {
      total: accounts.length,
      perfectFit: perfectFit.length,
      goodFit: accounts.filter(a => a.icpTier === 'Good Fit').length,
      engaged: accounts.filter(a => a.activityLevel !== 'None').length,
      noActivityPerfect: noActivityPerfect.length,
      avgScore: accounts.length ? Math.round(accounts.reduce((s, a) => s + a.icpScore, 0) / accounts.length) : 0,
    },
    perfectFitNoActivity: noActivityPerfect.slice(0, 20).map(a => ({
      name: a.name, ownerName: a.ownerName, icpScore: a.icpScore,
      bestPlay: a.bestPlay, territory: a.territory, segment: a.segment, industry: a.industry,
    })),
  };
}

function buildAccountActivityMap_(oppMetrics) {
  const map = {};
  if (!oppMetrics || !oppMetrics.rawOpps) return map;

  function toDate(v) {
    if (!v) return null;
    const d = new Date(v);
    return isNaN(d) ? null : d;
  }

  for (const o of oppMetrics.rawOpps) {
    const k = (o.account || '').toLowerCase().trim();
    if (!k) continue;
    if (!map[k]) map[k] = { openOpps: 0, openArr: 0, lastOppDate: null, stages: [] };

    const dates = [o.s1Date, o.s2Date, o.createdDate, o.closeDate].map(toDate).filter(Boolean);
    for (const d of dates) {
      if (!map[k].lastOppDate || d > map[k].lastOppDate) map[k].lastOppDate = d;
    }

    if (o.isOpen) {
      map[k].openOpps++;
      map[k].openArr += o.arr || 0;
      if (o.stage && map[k].stages.indexOf(o.stage) < 0) map[k].stages.push(o.stage);
    }
  }
  return map;
}

function scoreAccountAgainstPlays_(acct, plays) {
  const results = [];
  for (const play of plays) {
    let score = 0;

    if (play.segments && play.segments.length) {
      const segMatch = play.segments.some(s =>
        acct.segment && acct.segment.toLowerCase().includes(s.toLowerCase().split('-')[0].trim())
      );
      score += segMatch ? 30 : (acct.segment ? 10 : 0);
    } else {
      score += 15;
    }

    if (play.industries && play.industries.length) {
      const indMatch = play.industries.some(i =>
        acct.industry && (
          acct.industry.toLowerCase().includes(i.toLowerCase()) ||
          i.toLowerCase().includes(acct.industry.toLowerCase())
        )
      );
      score += indMatch ? 25 : (acct.industry ? 8 : 0);
    } else {
      score += 12;
    }

    const emp = acct.employees || 0;
    if (emp > 0 && play.minEmployees != null) {
      if (emp >= play.minEmployees && emp <= (play.maxEmployees || 999999)) score += 25;
      else if (emp >= play.minEmployees * 0.5) score += 12;
    } else if (!play.minEmployees) {
      score += 12;
    }

    if (!emp && acct.revenue > 0 && play.minEmployees) {
      const estEmp = acct.revenue / 200000;
      if (estEmp >= play.minEmployees) score += 15;
    }

    score += acct.territory ? 10 : 5;
    if (acct.country) score += 10;
    else if (acct.state) score += 5;

    results.push({ id: play.id, name: play.name, score: Math.min(100, score) });
  }
  results.sort((a, b) => b.score - a.score);
  return results;
}

function tierFromScore_(score) {
  if (score >= 80) return 'Perfect Fit';
  if (score >= 60) return 'Good Fit';
  if (score >= 40) return 'Moderate Fit';
  return 'Low Fit';
}

function activityLevel_(daysSince, openOpps) {
  if (openOpps > 0) return 'Active Pipeline';
  if (daysSince === null) return 'None';
  if (daysSince <= 30) return 'Recent';
  if (daysSince <= 90) return 'Stale';
  return 'None';
}

function inferTerritory_(country, state) {
  if (!country && !state) return '';
  const c = (country || '').toLowerCase();
  const s = (state || '').toLowerCase();
  if (c.includes('united kingdom') || c === 'uk') return 'EMEA';
  if (c.includes('germany') || c.includes('france') || c.includes('netherlands')) return 'EMEA';
  if (c.includes('canada')) return 'Canada';
  if (c.includes('australia')) return 'APAC';
  if (s && ['ca','wa','or','nv','az','hi','ak'].some(x => s.startsWith(x) || s === x)) return 'West';
  if (s && ['ny','nj','pa','ma','ct','ri','vt','nh','me','md','de','dc','va','wv'].some(x => s.startsWith(x) || s === x)) return 'East';
  if (s && ['tx','ok','la','ar','nm'].some(x => s.startsWith(x) || s === x)) return 'Central';
  if (s && ['il','in','oh','mi','wi','mn','mo','ia','ks','ne','sd','nd'].some(x => s.startsWith(x) || s === x)) return 'Midwest';
  if (s && ['fl','ga','nc','sc','tn','al','ms','ky'].some(x => s.startsWith(x) || s === x)) return 'Southeast';
  if (c.includes('united states') || c === 'us' || c === 'usa') return 'US';
  return country || state || '';
}

function toIsoDate_(d) {
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

// ── Utilities ─────────────────────────────────────────────────────────────
function num(v) {
  if (v instanceof Date) return 0;
  const n = parseFloat(String(v).replace(/[$,\s]/g, ''));
  return isNaN(n) ? 0 : n;
}

function clean(v) {
  return String(v == null ? '' : v).trim();
}

function fmtDateLabel(v) {
  if (v instanceof Date) {
    return v.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }).replace(' ', '-');
  }
  return clean(v) || '?';
}

function fmtQuarterLabel(v) {
  if (v instanceof Date) {
    const q  = Math.floor(v.getMonth() / 3) + 1;
    const yr = String(v.getFullYear()).slice(2);
    return v.getMonth() === 0 ? `FY'${yr}` : `Q${q}'${yr}`;
  }
  return clean(v);
}

function fmtMonthKey(v) {
  if (v instanceof Date) {
    return `${v.getFullYear()}-${String(v.getMonth()+1).padStart(2,'0')}`;
  }
  return String(v).substring(0, 7);
}
