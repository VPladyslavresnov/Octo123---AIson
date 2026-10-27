import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  PieChart, Pie, Cell, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, Tooltip, Legend, CartesianGrid, ResponsiveContainer,
} from "recharts";
import { Button } from "@/components/ui/button";
import { BarChart3 } from "lucide-react";

// Brand-aligned categorical palette.
const PALETTE = ["#EA4306", "#FF751A", "#FFC24B", "#A7C4A0", "#E8B4B8", "#5B8DEF", "#2C3E50"];

interface ChartSpec {
  kind: "pie" | "donut" | "bar" | "line";
  title?: string;
  unit?: string;
  data: { label: string; value: number }[];
}

type Segment = { type: "text"; text: string } | { type: "chart"; spec: ChartSpec };

// Split content into markdown text + ```aison:chart {json}``` (or ```chart) blocks.
function parse(content: string): Segment[] {
  const segs: Segment[] = [];
  const re = /```(?:aison:chart|chart)\s*\n?([\s\S]*?)```/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content))) {
    if (m.index > last) segs.push({ type: "text", text: content.slice(last, m.index) });
    try {
      const spec = JSON.parse(m[1].trim());
      if (spec && Array.isArray(spec.data) && spec.data.length) segs.push({ type: "chart", spec });
    } catch { /* leave it out — don't dump raw json */ }
    last = re.lastIndex;
  }
  if (last < content.length) segs.push({ type: "text", text: content.slice(last) });
  return segs;
}

function tooltipStyle() {
  return { background: "hsl(222 25% 12%)", border: "1px solid hsl(222 15% 22%)", borderRadius: 10, fontSize: 12, color: "#fff" };
}

function Chart({ spec, compact }: { spec: ChartSpec; compact?: boolean }) {
  const data = spec.data.map((d) => ({ name: String(d.label), value: Number(d.value) || 0 }));
  const h = compact ? 160 : 230;
  return (
    <div className="not-prose my-3 rounded-xl border border-border bg-background/40 p-3">
      {spec.title && <div className="text-xs font-medium text-muted-foreground mb-2">{spec.title}</div>}
      <ResponsiveContainer width="100%" height={h}>
        {spec.kind === "pie" || spec.kind === "donut" ? (
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%"
              innerRadius={spec.kind === "donut" ? "56%" : 0} outerRadius="82%" paddingAngle={2} stroke="none">
              {data.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
            </Pie>
            <Tooltip contentStyle={tooltipStyle()} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
          </PieChart>
        ) : spec.kind === "line" ? (
          <LineChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: -18 }}>
            <CartesianGrid strokeOpacity={0.08} vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#8A8F9C" }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 11, fill: "#8A8F9C" }} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={tooltipStyle()} />
            <Line dataKey="value" stroke="#EA4306" strokeWidth={2.5} dot={{ r: 3, fill: "#EA4306" }} />
          </LineChart>
        ) : (
          <BarChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: -18 }}>
            <CartesianGrid strokeOpacity={0.08} vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#8A8F9C" }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 11, fill: "#8A8F9C" }} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={tooltipStyle()} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
            <Bar dataKey="value" radius={[5, 5, 0, 0]}>
              {data.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
            </Bar>
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

const mdComponents = {
  table: (p: any) => <div className="not-prose my-2 overflow-x-auto rounded-lg border border-border"><table className="w-full text-sm border-collapse">{p.children}</table></div>,
  thead: (p: any) => <thead className="bg-muted/50">{p.children}</thead>,
  th: (p: any) => <th className="px-3 py-2 text-left font-semibold text-foreground border-b border-border">{p.children}</th>,
  td: (p: any) => <td className="px-3 py-2 border-b border-border/40 text-foreground/90">{p.children}</td>,
  a: (p: any) => <a {...p} className="text-primary underline underline-offset-2" target="_blank" rel="noreferrer" />,
};

export function RichMessage({ content, compact, analyticsQuery }: { content: string; compact?: boolean; analyticsQuery?: string }) {
  const navigate = useNavigate();
  const segs = useMemo(() => parse(content || ""), [content]);
  const hasChart = segs.some((s) => s.type === "chart");

  return (
    <div className={`prose prose-invert max-w-none ${compact ? "prose-sm" : "prose-sm"} [&_p]:my-1.5 [&_ul]:my-1.5 [&_h1]:text-base [&_h2]:text-sm [&_h3]:text-sm [&>*:first-child]:mt-0 [&>*:last-child]:mb-0`}>
      {segs.map((s, i) =>
        s.type === "chart"
          ? <Chart key={i} spec={s.spec} compact={compact} />
          : <ReactMarkdown key={i} remarkPlugins={[remarkGfm]} components={mdComponents}>{s.text}</ReactMarkdown>
      )}
      {hasChart && (
        <Button
          size="sm" variant="outline"
          className="not-prose mt-2 h-8 gap-1.5"
          onClick={() => navigate(`/analytics${analyticsQuery ? `?q=${encodeURIComponent(analyticsQuery)}` : ""}`)}
        >
          <BarChart3 className="w-3.5 h-3.5" /> Open full analytics
        </Button>
      )}
    </div>
  );
}
