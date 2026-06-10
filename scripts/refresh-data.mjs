const mode = process.argv.includes("--init") ? "initialize" : "scheduled";
const baseUrl = process.env.APP_URL || "http://localhost:3000";
const url = new URL("/api/data/cron/refresh", baseUrl);
url.searchParams.set("mode", mode);

const headers = {};
if (process.env.CRON_SECRET) {
  headers.authorization = `Bearer ${process.env.CRON_SECRET}`;
}

const response = await fetch(url, { headers });
const payload = await response.json().catch(() => ({ error: "invalid json response" }));

console.log(JSON.stringify(payload, null, 2));

if (!response.ok || payload.ok === false) {
  process.exitCode = 1;
}
