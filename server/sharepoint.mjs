// Microsoft Graph fetcher for SharePoint / OneDrive Excel files.
//
// Auth: OAuth2 client credentials flow (app-only).
// Setup:
//   1. Azure Portal -> App Registrations -> New registration.
//   2. API permissions -> Microsoft Graph -> Application permissions ->
//      add `Files.Read.All` and `Sites.Read.All`. Grant admin consent.
//   3. Certificates & secrets -> New client secret. Copy the value.
//   4. Set in .env:
//        SP_TENANT_ID=...
//        SP_CLIENT_ID=...
//        SP_CLIENT_SECRET=...
//        SP_DRIVE_USER=lavan.k@wellnessliving.com
//        SP_FILE_PATH=Documents/BDR V2.xlsx
//
// For a SharePoint site library (not personal OneDrive), use instead:
//        SP_SITE_ID=wellnessliving.sharepoint.com,...
//        SP_FILE_PATH=Shared Documents/BDR V2.xlsx

const GRAPH = "https://graph.microsoft.com/v1.0";

async function getAccessToken() {
  const { SP_TENANT_ID, SP_CLIENT_ID, SP_CLIENT_SECRET } = process.env;
  if (!SP_TENANT_ID || !SP_CLIENT_ID || !SP_CLIENT_SECRET) {
    throw new Error("Missing SP_TENANT_ID / SP_CLIENT_ID / SP_CLIENT_SECRET env vars.");
  }
  const url = `https://login.microsoftonline.com/${SP_TENANT_ID}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: SP_CLIENT_ID,
    client_secret: SP_CLIENT_SECRET,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  });
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    throw new Error(`Token request failed (${res.status}): ${await res.text()}`);
  }
  const json = await res.json();
  return json.access_token;
}

async function graphGet(token, urlPath, asBuffer = false) {
  const res = await fetch(`${GRAPH}${urlPath}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`Graph GET ${urlPath} failed (${res.status}): ${await res.text()}`);
  }
  return asBuffer ? Buffer.from(await res.arrayBuffer()) : res.json();
}

/**
 * Download the configured workbook as a Buffer.
 * Returns { buffer, fileName, lastModified, source: "sharepoint" }.
 */
export async function downloadWorkbook() {
  const {
    SP_DRIVE_USER,
    SP_SITE_ID,
    SP_FILE_PATH,
  } = process.env;
  if (!SP_FILE_PATH) {
    throw new Error("SP_FILE_PATH is required (e.g. 'Documents/BDR V2.xlsx').");
  }

  const token = await getAccessToken();

  let basePath;
  if (SP_SITE_ID) {
    basePath = `/sites/${encodeURIComponent(SP_SITE_ID)}/drive`;
  } else if (SP_DRIVE_USER) {
    basePath = `/users/${encodeURIComponent(SP_DRIVE_USER)}/drive`;
  } else {
    throw new Error("Set either SP_DRIVE_USER (personal OneDrive) or SP_SITE_ID (SharePoint site).");
  }

  // 1. Look up the file metadata
  const metaPath = `${basePath}/root:/${encodeURI(SP_FILE_PATH)}`;
  const meta = await graphGet(token, metaPath);
  const downloadUrl = meta["@microsoft.graph.downloadUrl"];
  if (!downloadUrl) {
    throw new Error(`No download URL on file. Got: ${JSON.stringify(meta).slice(0, 200)}`);
  }

  // 2. Download the bytes (downloadUrl is pre-signed, no auth header)
  const fileRes = await fetch(downloadUrl);
  if (!fileRes.ok) {
    throw new Error(`File download failed (${fileRes.status})`);
  }
  const buffer = Buffer.from(await fileRes.arrayBuffer());

  return {
    buffer,
    fileName: meta.name,
    lastModified: meta.lastModifiedDateTime,
    size: meta.size,
    source: "sharepoint",
  };
}
