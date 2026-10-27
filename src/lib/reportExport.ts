import { supabase } from "@/integrations/supabase/client";

// Client-ready export of the AIson strategy report (competitor + brand analysis).
// Produces a self-contained, printable HTML document the user can share with
// their client or "Print → Save as PDF".

export interface StrategyReportRow {
  title?: string | null;
  research_report?: any;
  resolved_competitors?: string[] | null;
  prompt_score?: number | null;
  created_at?: string | null;
}

export async function fetchLatestReport(): Promise<StrategyReportRow | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;
  const { data } = await supabase
    .from("strategy_reports")
    .select("title, research_report, resolved_competitors, prompt_score, created_at")
    .eq("user_id", session.user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as StrategyReportRow) || null;
}

const esc = (s: unknown): string =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

const ul = (arr?: unknown[]): string =>
  Array.isArray(arr) && arr.length ? `<ul>${arr.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : `<p class="muted">Not specified.</p>`;

const para = (s?: unknown): string => (s ? `<p>${esc(s)}</p>` : `<p class="muted">Not specified.</p>`);

export function buildReportHtml(report: StrategyReportRow, brandName?: string): string {
  const r = report.research_report || {};
  const brand = r.client_branding || {};
  const comp = r.competitor_analysis || {};
  const acct = r.client_account_analysis || {};
  const strat = r.strategy || {};
  const name = brandName || brand.brand_name || "Your Brand";
  const date = report.created_at ? new Date(report.created_at).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }) : new Date().toLocaleDateString();
  const colors = Array.isArray(brand.colors) ? brand.colors.filter(Boolean).slice(0, 6) : [];
  const competitors = report.resolved_competitors || [];

  const swatches = colors.length
    ? `<div class="swatches">${colors.map((c: string) => `<span class="sw" style="background:${esc(c)}"></span><code>${esc(c)}</code>`).join("")}</div>`
    : `<p class="muted">Not specified.</p>`;

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${esc(name)} — Marketing Strategy Report</title>
<style>
  :root { --ink:#1a1512; --muted:#6b6560; --line:#e7e2dc; --accent:#d9772e; --bg:#fbf9f6; }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--ink); font:15px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif; }
  .wrap { max-width:840px; margin:0 auto; padding:48px 32px 80px; }
  .bar { display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; }
  .brandmark { font-weight:700; letter-spacing:.02em; color:var(--accent); }
  .print { border:1px solid var(--line); background:#fff; padding:8px 14px; border-radius:8px; cursor:pointer; font-size:13px; color:var(--ink); }
  h1 { font-size:30px; line-height:1.2; margin:18px 0 4px; }
  .sub { color:var(--muted); margin:0 0 4px; }
  .score { display:inline-block; margin-top:8px; background:var(--accent); color:#fff; font-size:12px; font-weight:600; padding:3px 10px; border-radius:20px; }
  section { background:#fff; border:1px solid var(--line); border-radius:14px; padding:22px 24px; margin-top:20px; }
  h2 { font-size:13px; text-transform:uppercase; letter-spacing:.08em; color:var(--accent); margin:0 0 12px; }
  h3 { font-size:14px; margin:16px 0 4px; color:var(--ink); }
  p { margin:0 0 10px; } .muted { color:var(--muted); }
  ul { margin:0 0 10px; padding-left:20px; } li { margin:4px 0; }
  .grid2 { display:grid; grid-template-columns:1fr 1fr; gap:20px; }
  .kv { color:var(--muted); font-size:13px; } .kv b { color:var(--ink); }
  .swatches { display:flex; flex-wrap:wrap; gap:10px; align-items:center; }
  .sw { width:26px; height:26px; border-radius:6px; border:1px solid var(--line); display:inline-block; }
  code { font-size:12px; color:var(--muted); margin-right:10px; }
  footer { margin-top:28px; text-align:center; color:var(--muted); font-size:12px; }
  @media print { body{background:#fff;} .print{display:none;} section{break-inside:avoid;} .wrap{padding:0;} }
  @media (max-width:640px){ .grid2{grid-template-columns:1fr;} }
</style></head>
<body><div class="wrap">
  <div class="bar">
    <span class="brandmark">AIson</span>
    <button class="print" onclick="window.print()">Print / Save as PDF</button>
  </div>
  <h1>${esc(report.title || `${name} — Marketing Strategy Report`)}</h1>
  <p class="sub">${esc(name)} · Prepared ${esc(date)}</p>
  ${report.prompt_score ? `<span class="score">Strategy quality: ${esc(report.prompt_score)}/100</span>` : ""}

  <section>
    <h2>Executive summary</h2>
    ${para(r.executive_summary)}
  </section>

  <section>
    <h2>Brand snapshot</h2>
    <div class="grid2">
      <div>
        <p class="kv"><b>Tone of voice:</b> ${esc(brand.tone_of_voice || "—")}</p>
        <p class="kv"><b>Visual style:</b> ${esc(brand.visual_style || "—")}</p>
        <p class="kv"><b>Target audience:</b> ${esc(brand.target_audience || "—")}</p>
      </div>
      <div>
        <p class="kv"><b>Brand colours</b></p>
        ${swatches}
      </div>
    </div>
  </section>

  <section>
    <h2>Competitor analysis</h2>
    ${competitors.length ? `<p class="kv"><b>Competitors reviewed:</b> ${competitors.map((c: string) => esc(c)).join(", ")}</p>` : ""}
    ${para(comp.landscape_summary)}
    <h3>Patterns that work (emulate)</h3>${ul(comp.patterns_to_emulate)}
    <h3>Gaps to exploit</h3>${ul(comp.gaps_to_exploit)}
    <h3>Risks to avoid</h3>${ul(comp.risks_to_avoid)}
  </section>

  <section>
    <h2>Your account analysis</h2>
    ${para(acct.positioning_summary)}
    <div class="grid2">
      <div><h3>Strengths</h3>${ul(acct.strengths)}</div>
      <div><h3>Weaknesses</h3>${ul(acct.weaknesses)}</div>
    </div>
    <h3>Content patterns</h3>${ul(acct.content_patterns)}
  </section>

  <section>
    <h2>Recommended strategy</h2>
    <h3>Angle</h3>${para(strat.recommended_angle)}
    <h3>Hooks that will land</h3>${ul(strat.recommended_hooks)}
    <h3>Calls to action</h3>${ul(strat.recommended_ctas)}
    <h3>Best-performing formats</h3>${ul(strat.recommended_formats)}
  </section>

  <footer>Generated by AIson · aison.co.uk</footer>
</div></body></html>`;
}

export function downloadReport(report: StrategyReportRow, brandName?: string): void {
  const html = buildReportHtml(report, brandName);
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const safe = (brandName || report.research_report?.client_branding?.brand_name || "brand").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");
  a.href = url;
  a.download = `AIson-Strategy-Report-${safe || "brand"}.html`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
