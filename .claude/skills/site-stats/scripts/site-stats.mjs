#!/usr/bin/env node
// GearDrop site-stats: fetch aggregate stats from Supabase (public.site_stats)
// and save a dated PDF report. Uses the Playwright Chromium the app's e2e tests use.
//
//   node site-stats.mjs                      fetch live stats, save PDF report
//   node site-stats.mjs --visitors 1234      add a visitor count (from Vercel Analytics)
//   node site-stats.mjs --visitors-label "Last 30 days"
//   node site-stats.mjs --out <dir>          report folder (default: GEARDROP_REPORTS_DIR,
//                                            else Documents\GearDrop Reports)
//   node site-stats.mjs --from-json f.json   render from a saved stats JSON (no network)
//   node site-stats.mjs --app <dir>          app folder (default: auto-detected)
//   node site-stats.mjs --html               also save the HTML version (debugging)
//   node site-stats.mjs --help

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { homedir } from "node:os";
import { createRequire } from "node:module";

const APP_REL = join("2026-09-14", "hel", "work", "GearDrop");
const here = dirname(fileURLToPath(import.meta.url));

// The repo root is the nearest folder (from this script, then from the
// current directory) that contains the nested app folder.
function findRepoRoot() {
  for (const start of [here, process.cwd()]) {
    let dir = resolve(start);
    for (;;) {
      if (existsSync(join(dir, APP_REL, "package.json"))) return dir;
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  return null;
}

// ---------- args ----------
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") out.help = true;
    else if (a === "--html") out.html = true;
    else if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) throw new Error(`Missing value for ${a}`);
      out[key] = next; i++;
    } else throw new Error(`Unexpected argument: ${a}`);
  }
  return out;
}

// ---------- env ----------
function readEnvFile(path) {
  if (!existsSync(path)) return {};
  const vars = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    vars[m[1]] = v;
  }
  return vars;
}
function loadConfig(appDir) {
  const files = [".env", ".env.local", ".env.production", ".env.production.local"].map(f => join(appDir, f));
  const merged = Object.assign({}, ...files.map(readEnvFile));
  const url = process.env.VITE_SUPABASE_URL || merged.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_ANON_KEY || merged.VITE_SUPABASE_ANON_KEY;
  return { url, key };
}

// ---------- fetch ----------
async function fetchStats({ url, key }) {
  if (!url || !key) {
    throw new Error(
      "Supabase URL/key not found. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY " +
      "in the app's .env.local (same values the website uses), or as environment variables.");
  }
  let jwtRole = null;
  try { jwtRole = JSON.parse(Buffer.from(key.split(".")[1] ?? "", "base64url").toString()).role ?? null; } catch { /* not a JWT */ }
  if (/service_role|sb_secret_/i.test(key) || (jwtRole && jwtRole !== "anon")) {
    throw new Error("Refusing to use a service_role/secret key. Use the public anon/publishable key.");
  }
  const headers = { "Content-Type": "application/json", apikey: key };
  // Legacy anon keys are JWTs and also go in Authorization; new sb_publishable_ keys don't.
  if (!key.startsWith("sb_publishable_")) headers.Authorization = `Bearer ${key}`;
  let res;
  try {
    res = await fetch(`${url.replace(/\/+$/, "")}/rest/v1/rpc/site_stats`, {
      method: "POST", headers, body: "{}", signal: AbortSignal.timeout(20000),
    });
  } catch (err) {
    throw new Error(`Couldn't reach Supabase at ${url} (${err.cause?.code || err.name}). Check your internet connection and VITE_SUPABASE_URL.`);
  }
  const text = await res.text();
  if (!res.ok) {
    if (res.status === 404 || /PGRST202|Could not find the function/i.test(text)) {
      throw new Error("public.site_stats() doesn't exist yet. Run supabase-stats-setup.sql in the Supabase SQL Editor first.");
    }
    throw new Error(`Supabase returned ${res.status}: ${text.slice(0, 300)}`);
  }
  return JSON.parse(text);
}

// ---------- helpers ----------
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const num = v => (v === null || v === undefined || Number.isNaN(Number(v)) ? 0 : Number(v));
const fmt = v => num(v).toLocaleString("en-SG");
// Whole dollars stay whole; anything with cents always shows two decimals (S$389.50, not S$389.5).
const money = v => { const d = Number.isInteger(num(v)) ? 0 : 2; return "S$" + num(v).toLocaleString("en-SG", { minimumFractionDigits: d, maximumFractionDigits: d }); };
// Deals don't store a price; value only covers deals whose listing still exists.
const unpriced = d => d.completed_priced != null && num(d.completed_priced) < num(d.completed);
const dealValue = d => `${money(d.completed_value)} traded` + (unpriced(d) ? ` (${fmt(d.completed_priced)} of ${fmt(d.completed)} priced)` : "");
const plural = (v, word) => `${fmt(v)} ${word}${num(v) === 1 ? "" : "s"}`;
const pct = (a, b) => (num(b) > 0 ? Math.round((num(a) / num(b)) * 100) + "%" : "–");

const STATUSES = ["Available", "Reserved", "Sold"];
const CATEGORIES = ["PC/Laptops", "Keyboards", "Mouses", "Mics", "Headsets"];

function hbars(entries) {
  const max = Math.max(1, ...entries.map(e => num(e.value)));
  return `<div class="hbars">${entries.map(e => `
    <div class="hbar"><span class="hbar-label">${esc(e.label)}</span>
      <span class="hbar-track"><span class="hbar-fill" style="width:${(num(e.value) / max) * 100}%"></span></span>
      <span class="hbar-val">${fmt(e.value)}</span></div>`).join("")}</div>`;
}

function dailyChart(daily, key, title) {
  const W = 300, H = 90, pad = 2;
  const vals = daily.map(d => num(d[key]));
  const max = Math.max(0, ...vals);
  const scale = Math.max(1, max);
  const bw = (W - pad * 2) / Math.max(1, vals.length);
  const total = vals.reduce((a, b) => a + b, 0);
  const bars = vals.map((v, i) => {
    const h = v === 0 ? 1.5 : Math.max(3, (v / scale) * (H - 4));
    return `<rect class="${v === 0 ? "bar zero" : "bar"}" x="${(pad + i * bw + 1).toFixed(1)}" y="${(H - h).toFixed(1)}" width="${Math.max(1, bw - 2).toFixed(1)}" height="${h.toFixed(1)}" rx="1.5"><title>${esc(daily[i].day)}: ${fmt(v)}</title></rect>`;
  }).join("");
  const first = daily[0]?.day ?? "", last = daily[daily.length - 1]?.day ?? "";
  return `<figure class="spark">
    <figcaption><span>${esc(title)}</span><b>${fmt(total)}</b></figcaption>
    <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${esc(title)} per day, last 30 days, total ${fmt(total)}">${bars}</svg>
    <div class="spark-axis"><span>${esc(first)}</span><span>peak ${fmt(max)}/day</span><span>${esc(last)}</span></div>
  </figure>`;
}

function funnel(deals) {
  const steps = [
    ["Deals started", deals.started],
    ["Both sides confirmed", deals.both_confirmed],
    ["Completed (PayNow sent)", deals.completed],
  ];
  const max = Math.max(1, num(deals.started));
  return `<div class="funnel">${steps.map(([label, v], i) => `
    <div class="fstep"><div class="fbar" style="width:${Math.max(4, (num(v) / max) * 100)}%"><span>${fmt(v)}</span></div>
      <div class="flabel">${esc(label)}${i > 0 ? ` <em>${pct(v, steps[i - 1][1])} of previous</em>` : ""}</div></div>`).join("")}</div>`;
}

// ---------- render ----------
export function renderHtml(stats, opts = {}) {
  const u = stats.users ?? {}, l = stats.listings ?? {}, d = stats.deals ?? {}, r = stats.reviews ?? {},
        c = stats.chat ?? {}, n = stats.nyx ?? {}, daily = Array.isArray(stats.daily) ? stats.daily : [];
  const byStatus = l.by_status ?? {}, byCat = l.by_category ?? {}, byStars = r.by_stars ?? {};
  const generated = stats.generated_at ? new Date(stats.generated_at) : new Date();
  const genText = generated.toLocaleString("en-SG", { timeZone: "Asia/Singapore", dateStyle: "medium", timeStyle: "short" }) + " SGT";
  const hasVisitors = opts.visitors !== undefined && opts.visitors !== null;
  const feedbackTotal = num(n.helpful) + num(n.unhelpful);

  const kpis = [
    { label: "Visitors", value: hasVisitors ? fmt(opts.visitors) : "–", sub: hasVisitors ? esc(opts.visitorsLabel || "from Vercel Analytics") : "See Vercel → Analytics" },
    { label: "Users", value: fmt(u.total), sub: `+${fmt(u.new_7d)} this week · +${fmt(u.new_30d)} in 30 days` },
    { label: "Listings created", value: fmt(l.total), sub: `+${fmt(l.new_7d)} this week · avg ${l.avg_price == null ? "–" : money(l.avg_price)}` },
    { label: "Completed deals", value: fmt(d.completed), sub: `${dealValue(d)} · ${pct(d.completed, d.started)} of started` },
    { label: "Average rating", value: r.avg_stars == null ? "–" : `${num(r.avg_stars).toFixed(1)}★`, sub: plural(r.total, "review") },
    { label: "Chat messages", value: fmt(c.messages), sub: `${plural(c.conversations, "conversation")} · +${fmt(c.messages_7d)} this week` },
    { label: "Nyx questions", value: fmt(n.questions), sub: `+${fmt(n.questions_7d)} this week · ${feedbackTotal ? pct(n.helpful, feedbackTotal) + " helpful" : "no feedback yet"}` },
  ];

  const extra = (obj, known) => Object.keys(obj).filter(k => !known.includes(k)).map(k => ({ label: k, value: obj[k] }));
  const statusEntries = STATUSES.map(s => ({ label: s, value: byStatus[s] ?? 0 })).concat(extra(byStatus, STATUSES));
  const catEntries = CATEGORIES.map(k => ({ label: k, value: byCat[k] ?? 0 })).concat(extra(byCat, CATEGORIES));
  const starEntries = [5, 4, 3, 2, 1].map(s => ({ label: "★".repeat(s), value: byStars[String(s)] ?? 0 }));

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>GearDrop site stats · ${esc(genText)}</title>
<style>
:root{color-scheme:light dark;--bg:#f7f4fb;--surface:#fff;--surface-2:#efe9f7;--text:#221d33;--soft:#5a5270;--line:rgba(34,29,51,.12);--accent:#6d3cc7;--on-accent:#fff;--zero:rgba(34,29,51,.12)}
@media (prefers-color-scheme:dark){:root{--bg:#0e0c1a;--surface:#1a1729;--surface-2:#211d35;--text:#f7f4fb;--soft:#b7adcf;--line:rgba(247,244,251,.1);--accent:#b98aff;--on-accent:#1a1030;--zero:rgba(247,244,251,.12)}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:15px/1.5 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:1180px;margin:0 auto;padding:32px 24px 56px}
header{margin-bottom:24px}
h1{margin:0;font-size:28px;letter-spacing:-.02em}h1 span{color:var(--accent)}
.meta{color:var(--soft);font-size:13px}
h2{font-size:15px;margin:0 0 14px}
.kpis{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px;margin-bottom:12px}
.card{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:16px 18px}
.kpi .label{color:var(--soft);font-size:12px;text-transform:uppercase;letter-spacing:.06em;font-weight:600}
.kpi .value{font-size:30px;font-weight:700;letter-spacing:-.02em;font-variant-numeric:tabular-nums;margin:2px 0}
.kpi .sub{color:var(--soft);font-size:12.5px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(330px,1fr));gap:12px;margin-bottom:12px}
.sparks{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:18px}
.spark{margin:0}.spark figcaption{display:flex;justify-content:space-between;font-size:13px;color:var(--soft);margin-bottom:6px}.spark figcaption b{color:var(--text);font-variant-numeric:tabular-nums}
.spark svg{width:100%;height:90px;display:block}.bar{fill:var(--accent)}.bar.zero{fill:var(--zero)}
.spark-axis{display:flex;justify-content:space-between;font-size:11px;color:var(--soft);margin-top:4px;font-variant-numeric:tabular-nums}
.hbars{display:grid;gap:9px}.hbar{display:grid;grid-template-columns:96px 1fr 44px;align-items:center;gap:10px;font-size:13.5px}
.hbar-label{color:var(--soft);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.hbar-track{height:10px;border-radius:99px;background:var(--surface-2);overflow:hidden}.hbar-fill{display:block;height:100%;background:var(--accent);border-radius:99px}
.hbar-val{text-align:right;font-variant-numeric:tabular-nums;font-weight:600}
.funnel{display:grid;gap:12px}.fbar{background:var(--accent);color:var(--on-accent);border-radius:8px;padding:6px 10px;font-weight:700;font-variant-numeric:tabular-nums;min-width:44px}
.flabel{font-size:13px;color:var(--soft);margin-top:3px}.flabel em{font-style:normal;color:var(--accent);margin-left:6px}
.note{color:var(--soft);font-size:12.5px;margin-top:20px;line-height:1.6}
@page{size:A4;margin:10mm 11mm}
@media print{
  :root{--bg:#fff;--surface:#fff;--surface-2:#efe9f7;--text:#221d33;--soft:#5a5270;--line:rgba(34,29,51,.16);--accent:#6d3cc7;--on-accent:#fff;--zero:rgba(34,29,51,.14)}
  body{font-size:13px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  main{max-width:none;padding:0}
  .card,.spark,.fstep,.note{break-inside:avoid}
  h1{font-size:23px}
  .kpis{grid-template-columns:repeat(4,1fr);gap:8px}
  header{margin-bottom:14px}
  .card{padding:12px 14px;border-radius:12px}
  .kpis{margin-bottom:8px}.kpi .value{font-size:22px;margin:0}.kpi .sub{font-size:11px;line-height:1.35}
  .grid{grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px}
  section.card[style]{margin-bottom:8px!important}
  h2{margin-bottom:8px}
  .sparks{grid-template-columns:1fr 1fr;gap:10px 14px}.spark svg{height:46px}
  .hbars{gap:4px}.funnel{gap:4px}.fbar{padding:3px 10px}
  .note{margin-top:10px;font-size:11px;line-height:1.5}
}
</style></head>
<body><main>
<header><h1>Gear<span>Drop</span> site stats</h1><div class="meta">Generated ${esc(genText)} · real Supabase data only (the 22 built-in demo listings aren't counted)</div></header>

<section class="kpis" aria-label="Key numbers">${kpis.map(k => `
  <div class="card kpi"><div class="label">${esc(k.label)}</div><div class="value">${k.value}</div><div class="sub">${k.sub}</div></div>`).join("")}
</section>

<section class="card" style="margin-bottom:12px"><h2>Last 30 days</h2><div class="sparks">
  ${dailyChart(daily, "signups", "New users")}
  ${dailyChart(daily, "listings", "Listings created")}
  ${dailyChart(daily, "deals_completed", "Deals completed")}
  ${dailyChart(daily, "messages", "Chat messages")}
</div></section>

<div class="grid">
  <section class="card"><h2>Deal funnel</h2>${funnel(d)}</section>
  <section class="card"><h2>Listings by status</h2>${hbars(statusEntries)}</section>
  <section class="card"><h2>Listings by category</h2>${hbars(catEntries)}</section>
  <section class="card"><h2>Review stars</h2>${hbars(starEntries)}</section>
</div>

<p class="note">“Completed deals” = both sides confirmed in chat and the seller sent PayNow details. The site has no “mark as sold” button, so these are the sales number.
Deleted listings and their chats drop out of the counts, but their deals and reviews stay; a deal's value is only known while its listing exists.
Chat counts are totals only (messages are end-to-end encrypted).
${hasVisitors ? "" : "Visitor numbers come from Vercel Web Analytics (Vercel dashboard → your project → Analytics); mention the number when you run the report to include it."}</p>
</main></body></html>`;
}

export function summary(stats, opts = {}) {
  const u = stats.users ?? {}, l = stats.listings ?? {}, d = stats.deals ?? {}, r = stats.reviews ?? {}, c = stats.chat ?? {}, n = stats.nyx ?? {};
  const s = l.by_status ?? {};
  return [
    opts.visitors !== undefined ? `Visitors: ${fmt(opts.visitors)} (${opts.visitorsLabel || "Vercel Analytics"})` : "Visitors: not provided (see Vercel Analytics)",
    `Users: ${fmt(u.total)} (+${fmt(u.new_7d)} in 7d, +${fmt(u.new_30d)} in 30d)`,
    `Listings: ${fmt(l.total)} (+${fmt(l.new_7d)} in 7d) - Available ${fmt(s.Available)}, Reserved ${fmt(s.Reserved)}, Sold ${fmt(s.Sold)}; avg price ${l.avg_price == null ? "-" : money(l.avg_price)}`,
    `Deals: ${fmt(d.started)} started -> ${fmt(d.both_confirmed)} both confirmed -> ${fmt(d.completed)} completed, ${dealValue(d)}`,
    `Reviews: ${fmt(r.total)}, avg ${r.avg_stars == null ? "-" : num(r.avg_stars).toFixed(2)} stars`,
    `Chat: ${plural(c.conversations, "conversation")}, ${fmt(c.messages)} messages (+${fmt(c.messages_7d)} in 7d)`,
    `Nyx: ${fmt(n.questions)} questions (+${fmt(n.questions_7d)} in 7d), feedback ${fmt(n.helpful)} up / ${fmt(n.unhelpful)} down`,
  ].join("\n");
}

// ---------- output folder ----------
function defaultOutDir() {
  if (process.env.GEARDROP_REPORTS_DIR) return process.env.GEARDROP_REPORTS_DIR;
  const home = homedir();
  // Windows often redirects Documents into OneDrive.
  const docs = [join(home, "Documents"), join(home, "OneDrive", "Documents")].find(existsSync) ?? home;
  return join(docs, "GearDrop Reports");
}

// ---------- PDF (via the app's Playwright install) ----------
async function loadChromium(appDir) {
  const req = createRequire(join(appDir, "package.json"));
  for (const pkg of ["@playwright/test", "playwright", "playwright-core"]) {
    let path;
    try { path = req.resolve(pkg); } catch { continue; }
    const mod = await import(pathToFileURL(path).href);
    const chromium = mod.chromium ?? mod.default?.chromium;
    if (chromium) return chromium;
  }
  throw new Error(`Playwright not found in ${appDir}. Run \`pnpm install\` in the app folder first.`);
}

async function writePdf(html, pdfPath, appDir) {
  const chromium = await loadChromium(appDir);
  let browser;
  try {
    browser = await chromium.launch();
  } catch (err) {
    if (/Executable doesn't exist|install/i.test(err.message)) {
      throw new Error("Playwright's Chromium isn't installed. Run `pnpm exec playwright install chromium` in the app folder, then try again.");
    }
    throw err;
  }
  try {
    const page = await browser.newPage();
    await page.emulateMedia({ media: "print", colorScheme: "light" });
    await page.setContent(html, { waitUntil: "load" });
    await page.pdf({ path: pdfPath, format: "A4", printBackground: true, preferCSSPageSize: true });
  } finally {
    await browser.close();
  }
}

// ---------- main ----------
async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(readFileSync(fileURLToPath(import.meta.url), "utf8").split(/\r?\n/).slice(1, 14).map(x => x.replace(/^\/\/ ?/, "")).join("\n"));
    return;
  }
  const repoRoot = findRepoRoot();
  if (!repoRoot && !args.app) {
    throw new Error(`Couldn't find the GearDrop repo (looked for ${APP_REL}). Run from inside the repo or pass --app.`);
  }
  const appDir = resolve(args.app ?? join(repoRoot, APP_REL));
  const outDir = resolve(args.out ?? defaultOutDir());
  if (args.visitors !== undefined && !/^\d+$/.test(args.visitors)) throw new Error("--visitors must be a whole number");
  const opts = { visitors: args.visitors !== undefined ? Number(args.visitors) : undefined, visitorsLabel: args["visitors-label"] };

  const stats = args["from-json"]
    ? JSON.parse(readFileSync(resolve(args["from-json"]), "utf8"))
    : await fetchStats(loadConfig(appDir));

  mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toLocaleString("sv-SE", { timeZone: "Asia/Singapore" }).slice(0, 16).replace(" ", "_").replace(":", "");
  const html = renderHtml(stats, opts);
  // Never overwrite an earlier report from the same minute.
  let base = join(outDir, `GearDrop-site-stats-${stamp}`);
  for (let i = 2; existsSync(`${base}.pdf`); i++) base = join(outDir, `GearDrop-site-stats-${stamp}-${i}`);
  if (args.html) {
    writeFileSync(`${base}.html`, html);
    console.log(`HTML:   ${base}.html`);
  }
  await writePdf(html, `${base}.pdf`, appDir);

  console.log(summary(stats, opts));
  console.log(`\nReport: ${base}.pdf`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(err => { console.error(`site-stats: ${err.message}`); process.exit(1); });
}
