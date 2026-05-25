# AGENTS.md

## Cursor Cloud specific instructions

### Project overview

This is a zero-dependency, zero-build static HTML dashboard project (Cerby Sales Dashboard). It consists of three standalone HTML pages and a Google Apps Script backend file. There is no package manager, no lockfile, no test framework, and no build step.

### Running the application

Serve the files locally with any HTTP server:

```bash
python3 -m http.server 8080 --directory /workspace
```

Then open in a browser:
- `http://localhost:8080/sales_dashboard.html` — Sales & Revenue Dashboard
- `http://localhost:8080/forecast_review.html` — Weekly Forecast Review
- `http://localhost:8080/sales_rep_dashboard.html` — Sales Rep Dashboard (AE)

### Data connectivity

The dashboards fetch live data via JSONP from a Google Apps Script web app deployed within the Cerby organization. Without access to that endpoint, the UI still renders fully but shows placeholder/zero values. This is expected in the Cloud Agent environment.

### Key files

| File | Purpose |
|------|---------|
| `sales_dashboard.html` | Main executive dashboard with KPIs, pipeline charts, funnel, leaderboard |
| `forecast_review.html` | Weekly forecast review with linearity tracking and AE outlook |
| `sales_rep_dashboard.html` | Individual AE view with per-rep filtering |
| `dashboard_apps_script.gs` | Google Apps Script backend (deployed to Google, not run locally) |
| `app` | Identical copy of the Apps Script backend |

### Lint / test / build

- **Lint**: No linter configured. HTML files can be validated with any HTML linter if needed.
- **Tests**: No automated test framework exists.
- **Build**: No build step — files are served as-is.

### Gotchas

- The `SCRIPT_URL` constants in the HTML files point to Cerby org-internal Google Apps Script deployments. These are not accessible outside that organization.
- `sales_rep_dashboard.html` is an older-format HTML file (exported from Cocoa HTML Writer) and differs structurally from the other two dashboards.
- Chart.js is loaded from CDN (`cdn.jsdelivr.net`); internet access is required for charts to render.
