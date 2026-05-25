import express from "express";
import "dotenv/config";
import { getMockDeals, getMockUsers } from "./mockData.mjs";
import { getSalesforceClient, fetchDeals as fetchSfDeals, fetchUsers as fetchSfUsers } from "./salesforce.mjs";
import { readDealsFromFile, readDealsFromBuffer, deriveUsersFromDeals, readActivitiesFromFile } from "./excel.mjs";
import { streamReadDeals, buildUserMapFromReference, applyBdrNameMap, streamReadUserTable, applyUserTable, streamReadTaskTable } from "./excelStream.mjs";
import fs from "node:fs";
import { downloadWorkbook } from "./sharepoint.mjs";

const app = express();
const PORT = process.env.PORT || 8787;
const SOURCE = (process.env.DATA_SOURCE || "mock").toLowerCase();

let sfClientPromise = null;
function sfClient() {
  if (!sfClientPromise) sfClientPromise = getSalesforceClient();
  return sfClientPromise;
}

const CACHE_TTL_MS = 5 * 60 * 1000;
let workbookCache = null;
let excelDealCache = null;
let excelUserTableCache = null;
let excelTaskCache = null;

async function loadFromSharepoint() {
  const now = Date.now();
  if (workbookCache && now - workbookCache.fetchedAt < CACHE_TTL_MS) {
    return workbookCache;
  }
  const { buffer, fileName, lastModified } = await downloadWorkbook();
  const parsed = await readDealsFromBuffer(buffer);
  workbookCache = {
    ...parsed,
    fileName,
    lastModified,
    fetchedAt: now,
  };
  return workbookCache;
}

async function loadDeals() {
  switch (SOURCE) {
    case "salesforce": {
      const deals = await fetchSfDeals(await sfClient());
      return { source: "salesforce", deals };
    }
    case "excel": {
      const filePath = process.env.EXCEL_FILE_PATH;
      if (!filePath) throw new Error("EXCEL_FILE_PATH not set");

      const stat = fs.statSync(filePath);
      const sheetName = process.env.EXCEL_SHEET_NAME;
      if (stat.size > 20 * 1024 * 1024) {
        const mtime = stat.mtimeMs;
        if (excelDealCache && excelDealCache.mtime === mtime) {
          return excelDealCache.result;
        }
        const start = Date.now();
        console.log(`[excel] Streaming ${(stat.size / 1024 / 1024).toFixed(1)} MB file...`);
        const parsed = await streamReadDeals(filePath, {
          sheetName: sheetName || "Opportunity",
          onProgress: (n) => console.log(`[excel]   ${n.toLocaleString()} rows read`),
        });
        console.log(`[excel] Done in ${((Date.now() - start) / 1000).toFixed(1)}s - ${parsed.deals.length.toLocaleString()} rows - sheet "${parsed.sheetName}" - ${parsed.unmappedHeaders.length} unmapped headers`);

        let userTable = new Map();
        try {
          if (excelUserTableCache && excelUserTableCache.mtime === mtime) {
            userTable = excelUserTableCache.users;
          } else {
            const userResult = await streamReadUserTable(filePath, {
              sheetName: process.env.USER_SHEET_NAME || "User",
            });
            userTable = userResult.users;
            excelUserTableCache = { mtime, users: userTable };
            if (!userResult.foundSheet) console.log(`[excel] No "User" sheet found - skipping primary resolution`);
          }
          const resolved = applyUserTable(parsed.deals, userTable);
          console.log(`[excel] User table: ${userTable.size.toLocaleString()} users loaded, ${resolved.toLocaleString()} deals resolved`);
        } catch (e) {
          console.warn(`[excel] User table read failed: ${e.message}`);
        }

        const refPath = process.env.BDR_NAME_REFERENCE_PATH;
        if (refPath && fs.existsSync(refPath)) {
          try {
            const refParsed = await readDealsFromFile(refPath);
            const fallbackMap = buildUserMapFromReference(refParsed.deals, parsed.deals);
            const resolved = applyBdrNameMap(parsed.deals, fallbackMap);
            if (resolved > 0) {
              console.log(`[excel] Fallback name resolution: ${fallbackMap.size} additional IDs from reference workbook, ${resolved.toLocaleString()} more deals updated`);
            }
          } catch (e) {
            console.warn(`[excel] BDR_NAME_REFERENCE_PATH failed: ${e.message}`);
          }
        }

        const result = {
          source: "excel",
          deals: parsed.deals,
          meta: {
            mode: "stream",
            sheetName: parsed.sheetName,
            headerMap: parsed.headerMap,
            unmappedHeaders: parsed.unmappedHeaders,
          },
        };
        excelDealCache = { mtime, result };
        return result;
      }

      const parsed = await readDealsFromFile(filePath, sheetName ? { sheetName } : {});
      return {
        source: "excel",
        deals: parsed.deals,
        meta: {
          mode: "bulk",
          sheetName: parsed.sheetName,
          allSheets: parsed.allSheets,
          headerMap: parsed.headerMap,
          unmappedHeaders: parsed.unmappedHeaders,
        },
      };
    }
    case "sharepoint": {
      const parsed = await loadFromSharepoint();
      return {
        source: "sharepoint",
        deals: parsed.deals,
        meta: {
          fileName: parsed.fileName,
          lastModified: parsed.lastModified,
          sheetName: parsed.sheetName,
          allSheets: parsed.allSheets,
          headerMap: parsed.headerMap,
          unmappedHeaders: parsed.unmappedHeaders,
          cachedAt: new Date(parsed.fetchedAt).toISOString(),
        },
      };
    }
    case "mock":
    default:
      return { source: "mock", deals: getMockDeals() };
  }
}

async function loadUsers(dealsResult) {
  if (SOURCE === "salesforce") {
    return { source: "salesforce", users: await fetchSfUsers(await sfClient()) };
  }
  if (SOURCE === "mock") {
    return { source: "mock", users: getMockUsers() };
  }
  return {
    source: dealsResult.source,
    users: deriveUsersFromDeals(dealsResult.deals),
  };
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, source: SOURCE });
});

app.get("/api/deals", async (_req, res) => {
  try {
    const result = await loadDeals();
    res.json(result);
  } catch (err) {
    console.error("[/api/deals]", err);
    res.status(500).json({ error: String(err?.message || err) });
  }
});

app.get("/api/activities", async (_req, res) => {
  try {
    if (SOURCE !== "excel" && SOURCE !== "sharepoint" && SOURCE !== "mock") {
      return res.json({ source: SOURCE, activities: [], note: "Activities only available for excel/sharepoint/mock sources." });
    }
    if (SOURCE === "mock") {
      return res.json({ source: "mock", activities: [] });
    }
    if (SOURCE === "excel") {
      const filePath = process.env.EXCEL_FILE_PATH;
      if (!filePath) return res.json({ source: "excel", activities: [], note: "EXCEL_FILE_PATH not set" });
      const stat = fs.statSync(filePath);
      try {
        if (excelTaskCache && excelTaskCache.mtime === stat.mtimeMs) {
          return res.json({ source: "excel", activities: excelTaskCache.activities, meta: { sheetName: "Task", mode: "stream" } });
        }
        let userTable = excelUserTableCache?.users || new Map();
        if (userTable.size === 0) {
          const userResult = await streamReadUserTable(filePath, { sheetName: process.env.USER_SHEET_NAME || "User" });
          userTable = userResult.users;
          excelUserTableCache = { mtime: stat.mtimeMs, users: userTable };
        }
        const taskResult = await streamReadTaskTable(filePath, userTable, {
          sheetName: process.env.TASK_SHEET_NAME || "Task",
        });
        if (taskResult.foundSheet) {
          excelTaskCache = { mtime: stat.mtimeMs, activities: taskResult.activities };
          console.log(`[activities] Task sheet: ${taskResult.activities.length.toLocaleString()} activities loaded`);
          return res.json({ source: "excel", activities: taskResult.activities, meta: { sheetName: "Task", mode: "stream" } });
        }
      } catch (e) {
        console.warn(`[activities] Task sheet read failed: ${e.message}`);
      }

      const fallbackPath = process.env.ACTIVITIES_FALLBACK_PATH || process.env.BDR_NAME_REFERENCE_PATH;
      if (fallbackPath && fs.existsSync(fallbackPath)) {
        const parsed = await readActivitiesFromFile(fallbackPath);
        return res.json({
          source: "excel",
          activities: parsed.activities,
          meta: { sheetName: parsed.sheetName, mode: "fallback-bulk", headerMap: parsed.headerMap, unmappedHeaders: parsed.unmappedHeaders },
        });
      }
      return res.json({ source: "excel", activities: [], note: "No Task sheet found in workbook and no ACTIVITIES_FALLBACK_PATH configured." });
    }
    if (SOURCE === "sharepoint") {
      return res.json({ source: "sharepoint", activities: [], note: "Activities via SharePoint not yet wired. Use DATA_SOURCE=excel." });
    }
  } catch (err) {
    console.error("[/api/activities]", err);
    res.status(500).json({ error: String(err?.message || err) });
  }
});

app.get("/api/users", async (_req, res) => {
  try {
    const deals = SOURCE === "salesforce" || SOURCE === "mock" ? null : await loadDeals();
    const result = await loadUsers(deals);
    res.json(result);
  } catch (err) {
    console.error("[/api/users]", err);
    res.status(500).json({ error: String(err?.message || err) });
  }
});

app.get("/api/diagnostics", async (_req, res) => {
  try {
    if (SOURCE !== "excel" && SOURCE !== "sharepoint") {
      return res.json({ source: SOURCE, note: "Diagnostics only available for excel/sharepoint sources." });
    }
    const result = await loadDeals();
    res.json({
      source: result.source,
      dealCount: result.deals.length,
      ...result.meta,
    });
  } catch (err) {
    res.status(500).json({ error: String(err?.message || err) });
  }
});

app.listen(PORT, () => {
  console.log(`BDR backend listening on http://localhost:${PORT}`);
  console.log(`Data source: ${SOURCE}`);
  if (SOURCE === "excel") {
    console.log(`Excel file: ${process.env.EXCEL_FILE_PATH || "(unset)"}`);
  }
  if (SOURCE === "sharepoint") {
    console.log(`SharePoint file: ${process.env.SP_FILE_PATH || "(unset)"}`);
  }
});
