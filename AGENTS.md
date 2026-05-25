# AGENTS.md

## Cursor Cloud specific instructions

### Project Overview

This is the **Cerby Sales Dashboard** — a set of static HTML dashboards for visualizing Salesforce CRM pipeline data. There is no build step, no package manager, and no local dependencies to install.

### Files

| File | Purpose |
|------|---------|
| `sales_dashboard.html` | Main sales & revenue metrics dashboard |
| `forecast_review.html` | Weekly forecast review with AE outlook |
| `sales_rep_dashboard.html` | Individual Account Executive performance view |
| `dashboard_apps_script.gs` | Google Apps Script backend (runs on Google's infra, not locally) |
| `app` | Duplicate of the Apps Script code (no extension) |

### Running Locally

Serve the HTML files with any static HTTP server:

```bash
cd /workspace && python3 -m http.server 8080
```

Then open `http://localhost:8080/sales_dashboard.html` (or the other HTML files).

### Important Notes

- **No dependencies to install** — Chart.js is loaded from CDN at runtime.
- **No build/lint/test commands** — This is pure static HTML with inline CSS and JS.
- **Data source** — Dashboards fetch live data via JSONP from a Google Apps Script endpoint at `script.google.com`. Without Cerby org Google authentication, the dashboards render their UI/layout with placeholder values (`—`).
- **The `.gs` file and `app` file are server-side code** that runs on Google Apps Script infrastructure, not locally. They cannot be executed or tested in this environment.
