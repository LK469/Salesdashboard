import jsforce from "jsforce";

// SOQL field map -- left side = alias the UI uses, right side = real SF API name.
// Field names verified against BDR V2.xlsx (the field dictionary).
const DEAL_FIELD_MAP = {
  // Core opportunity
  id: "Id",
  name: "Name",
  stage: "StageName",
  amount: "Amount",
  probability: "Probability",
  closeDate: "CloseDate",
  createdDate: "CreatedDate",
  ownerId: "OwnerId",
  ownerName: "Owner.Name",
  accountName: "Account.Name",
  isWon: "IsWon",
  isClosed: "IsClosed",
  latestStageReached: "Latest_Stage_Reached__c",
  oppAgeDays: "Opportunity_Age_in_Days__c",
  inboundOrOutbound: "Inbound_or_Outbound__c",
  type: "Type",

  // Revenue
  mrr: "MRR_Amount__c",
  arr: "ARR_Amount__c",
  acv: "ACV_Amount__c",

  // BDR attribution
  bdrName: "BDR_Name__c",
  bdrSourced: "BDR_Sourced__c",
  sellerSource: "Seller_Source__c",
  fullCycleOpp: "Full_Cycle_Opp__c",

  // Discovery
  discoveryStatus: "Discovery_Status__c",
  discoveryScheduledTime: "Discovery_Scheduled_Time__c",
  discoveryCompletedDate: "Discovery_Completed_Date__c",
  discoveryAttemptCount: "Discovery_Attempt_Count__c",
  discoveryScheduledFlag: "Discovery_Scheduled__c",
  discoveryCompletedFlag: "Discovery_Completed__c",

  // Demo
  demoStatus: "Demo_Status__c",
  demoScheduledTime: "Demo_Scheduled_Time__c",
  demoCompletedDate: "Demo_Completed_Date__c",
  demoAttemptCount: "Demo_Attempt_Count__c",
  demoScheduledFlag: "Demo_Scheduled__c",
  demoCompletedFlag: "Demo_Completed__c",
  daysBetweenDcAndDemo: "Days_between_DC_Completed_Demo_Date__c",

  // Outcome / size
  paidLocations: "Number_of_Paid_Locations__c",
  rollupPaidLocations: "Roll_Up_Paid_Locations__c",
  lossReason: "Loss_Reason__c",
  lossSubReason: "Closed_Lost_Sub_Reason__c",

  // Gamification (BDR points system surfaced in the dictionary)
  gamificationPoints: "Gamification_Total_Points__c",
  pointsDcCompleted: "Six_Points_Per_DC_Completed__c",
  pointsDemoCompleted: "X5_Points_Demo_Completed__c",
  pointsClosedWonAe: "X10_Points_Per_Closed_Won_by_AE__c",
  pointsClosedWonDs: "X7_Points_Per_Closed_Won_by_DS__c",
  points90DayFollowup: "X90_Day_F_U_Complete_Points__c",
  pointsDemoBookedFast: "Points_Per_Demo_Booked_in_3_Days_of_DC__c",
};

const USER_FIELD_MAP = {
  id: "Id",
  name: "Name",
  email: "Email",
  role: "UserRole.Name",
  isActive: "IsActive",
};

export async function getSalesforceClient() {
  const {
    SF_LOGIN_URL = "https://login.salesforce.com",
    SF_USERNAME,
    SF_PASSWORD,
    SF_SECURITY_TOKEN,
    SF_CLIENT_ID,
    SF_CLIENT_SECRET,
    SF_REFRESH_TOKEN,
    SF_INSTANCE_URL,
  } = process.env;

  if (SF_REFRESH_TOKEN && SF_CLIENT_ID && SF_INSTANCE_URL) {
    const conn = new jsforce.Connection({
      oauth2: {
        loginUrl: SF_LOGIN_URL,
        clientId: SF_CLIENT_ID,
        clientSecret: SF_CLIENT_SECRET,
      },
      instanceUrl: SF_INSTANCE_URL,
      refreshToken: SF_REFRESH_TOKEN,
    });
    await conn.oauth2.refreshToken(SF_REFRESH_TOKEN);
    return conn;
  }

  if (SF_USERNAME && SF_PASSWORD) {
    const conn = new jsforce.Connection({ loginUrl: SF_LOGIN_URL });
    await conn.login(SF_USERNAME, `${SF_PASSWORD}${SF_SECURITY_TOKEN || ""}`);
    return conn;
  }

  throw new Error(
    "No Salesforce credentials configured. Set DATA_SOURCE=mock or provide SF_* env vars."
  );
}

function buildSoql(table, map, where = "", orderBy = "", limit = 5000) {
  const fields = Object.values(map).join(", ");
  let q = `SELECT ${fields} FROM ${table}`;
  if (where) q += ` WHERE ${where}`;
  if (orderBy) q += ` ORDER BY ${orderBy}`;
  q += ` LIMIT ${limit}`;
  return q;
}

function flatten(record, map) {
  const out = {};
  for (const [alias, soqlPath] of Object.entries(map)) {
    out[alias] = soqlPath.split(".").reduce((acc, key) => acc?.[key], record) ?? null;
  }
  return out;
}

export async function fetchDeals(conn) {
  // Pull last 180 days of BDR-sourced opportunities by default.
  // Adjust the WHERE clause if you want to widen or narrow the window.
  const soql = buildSoql(
    "Opportunity",
    DEAL_FIELD_MAP,
    "CreatedDate = LAST_N_DAYS:180",
    "CreatedDate DESC",
    5000
  );
  const result = await conn.query(soql);
  return result.records.map((r) => flatten(r, DEAL_FIELD_MAP));
}

export async function fetchUsers(conn) {
  const soql = buildSoql("User", USER_FIELD_MAP, "IsActive = true", "Name ASC", 500);
  const result = await conn.query(soql);
  return result.records.map((r) => flatten(r, USER_FIELD_MAP));
}
