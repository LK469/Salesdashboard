const BASE = ""; // Vite proxies /api -> backend

export async function fetchDeals() {
  const res = await fetch(`${BASE}/api/deals`);
  if (!res.ok) throw new Error(`Deals fetch failed: ${res.status}`);
  return res.json();
}

export async function fetchActivities() {
  const res = await fetch(`${BASE}/api/activities`);
  if (!res.ok) throw new Error(`Activities fetch failed: ${res.status}`);
  return res.json();
}

export async function fetchUsers() {
  const res = await fetch(`${BASE}/api/users`);
  if (!res.ok) throw new Error(`Users fetch failed: ${res.status}`);
  return res.json();
}

export async function fetchHealth() {
  const res = await fetch(`${BASE}/api/health`);
  if (!res.ok) throw new Error(`Health fetch failed: ${res.status}`);
  return res.json();
}
