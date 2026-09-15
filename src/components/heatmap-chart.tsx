"use client";

import { useEffect, useState } from "react";
import { Flame } from "lucide-react";

type Cell = { dow: number; hour: number; count: number };

const DAYS = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
// Tampilkan mulai Senin (1) ... Sabtu (6) ... Minggu (0)
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

function cellColor(count: number, max: number): string {
  if (count === 0 || max === 0) return "bg-muted";
  const p = count / max;
  if (p < 0.1) return "bg-blue-100";
  if (p < 0.25) return "bg-blue-200";
  if (p < 0.45) return "bg-blue-300";
  if (p < 0.65) return "bg-blue-400";
  if (p < 0.8) return "bg-blue-500";
  if (p < 0.95) return "bg-blue-600";
  return "bg-blue-700";
}

function textColor(count: number, max: number): string {
  if (max === 0 || count / max < 0.45) return "text-foreground";
  return "text-white";
}

export function HeatmapChart() {
  const [days, setDays] = useState(30);
  const [grid, setGrid] = useState<Map<string, number>>(new Map());
  const [max, setMax] = useState(0);
  const [loading, setLoading] = useState(true);
  const [peak, setPeak] = useState<{ day: number; hour: number; count: number } | null>(null);
  const [tooltip, setTooltip] = useState<{ dow: number; hour: number; count: number } | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/analytics/heatmap?days=${days}`)
      .then((r) => r.json())
      .then(({ data }: { data: Cell[] }) => {
        const m = new Map<string, number>();
        let mx = 0;
        let pk: typeof peak = null;
        for (const c of data) {
          const key = `${c.dow}-${c.hour}`;
          m.set(key, c.count);
          if (c.count > mx) { mx = c.count; pk = c; }
        }
        setGrid(m);
        setMax(mx);
        setPeak(pk);
      })
      .finally(() => setLoading(false));
  }, [days]);

  const totalMsgs = Array.from(grid.values()).reduce((a, b) => a + b, 0);

  return (
    <div className="rounded-xl border border-border bg-white shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div className="flex items-center gap-2">
          <Flame className="h-4 w-4 text-orange-500" />
          <h3 className="text-sm font-semibold">Heatmap Jam Sibuk</h3>
          {peak && (
            <span className="ml-2 rounded-full bg-orange-100 px-2.5 py-0.5 text-xs font-medium text-orange-700">
              Puncak: {DAYS[peak.day]} jam {String(peak.hour).padStart(2, "0")}:00 ({peak.count} pesan)
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {([7, 30, 90] as const).map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={
                "rounded-md px-3 py-1 text-xs font-medium transition-colors border " +
                (days === d
                  ? "bg-primary text-white border-primary"
                  : "border-border text-muted-foreground hover:bg-muted")
              }
            >
              {d}h
            </button>
          ))}
        </div>
      </div>

      <div className="p-5">
        {loading ? (
          <div className="h-52 flex items-center justify-center text-sm text-muted-foreground animate-pulse">
            Memuat data...
          </div>
        ) : (
          <>
            {/* Grid */}
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse" style={{ minWidth: 600 }}>
                <thead>
                  <tr>
                    <th className="w-10 pr-2 text-right text-muted-foreground font-normal" />
                    {Array.from({ length: 24 }, (_, h) => (
                      <th key={h} className="text-center text-muted-foreground font-normal pb-1 w-8">
                        {h % 3 === 0 ? `${String(h).padStart(2, "0")}` : ""}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {DAY_ORDER.map((dow) => (
                    <tr key={dow}>
                      <td className="pr-2 text-right text-xs text-muted-foreground font-medium py-0.5">
                        {DAYS[dow]}
                      </td>
                      {Array.from({ length: 24 }, (_, hour) => {
                        const count = grid.get(`${dow}-${hour}`) ?? 0;
                        const isTooltip = tooltip?.dow === dow && tooltip?.hour === hour;
                        return (
                          <td key={hour} className="p-0.5 relative">
                            <div
                              onMouseEnter={() => setTooltip({ dow, hour, count })}
                              onMouseLeave={() => setTooltip(null)}
                              className={`h-7 w-full rounded-sm cursor-default transition-opacity hover:opacity-80 flex items-center justify-center ${cellColor(count, max)}`}
                            >
                              {count > 0 && (
                                <span className={`text-[10px] font-medium tabular-nums ${textColor(count, max)}`}>
                                  {count}
                                </span>
                              )}
                              {isTooltip && (
                                <div className="absolute z-10 bottom-full left-1/2 -translate-x-1/2 mb-1 rounded-lg border border-border bg-white px-2.5 py-1.5 shadow-lg text-xs whitespace-nowrap pointer-events-none">
                                  <div className="font-semibold">{DAYS[dow]}, {String(hour).padStart(2, "0")}:00–{String(hour + 1).padStart(2, "0")}:00</div>
                                  <div className="text-muted-foreground">{count} pesan masuk</div>
                                </div>
                              )}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Legend + stats */}
            <div className="mt-4 flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span>Lebih sepi</span>
                {["bg-muted", "bg-blue-100", "bg-blue-200", "bg-blue-300", "bg-blue-400", "bg-blue-500", "bg-blue-600", "bg-blue-700"].map((c, i) => (
                  <div key={i} className={`h-4 w-4 rounded-sm ${c} border border-border/30`} />
                ))}
                <span>Lebih ramai</span>
              </div>
              <div className="text-xs text-muted-foreground">
                Total <span className="font-semibold text-foreground">{totalMsgs.toLocaleString("id-ID")}</span> pesan masuk dalam {days} hari terakhir
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
