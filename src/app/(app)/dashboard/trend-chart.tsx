interface DayData {
  day: string;
  leads: number;
  msgs: number;
}

interface Props {
  data: DayData[];
}

function dayLabel(dateStr: string) {
  const d = new Date(dateStr + "T12:00:00+07:00");
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
  if (dateStr === today) return "Hari ini";
  return d.toLocaleDateString("id-ID", { weekday: "short", timeZone: "Asia/Jakarta" });
}

export function TrendChart({ data }: Props) {
  const maxVal = Math.max(...data.map((d) => Math.max(d.leads, d.msgs)), 1);

  return (
    <div className="w-full">
      <div className="flex items-end gap-1.5 h-28">
        {data.map((d) => (
          <div key={d.day} className="flex-1 flex flex-col items-center gap-1 h-full">
            <div className="flex-1 w-full flex items-end gap-0.5">
              <div
                className="flex-1 rounded-t-sm bg-primary transition-all"
                style={{ height: d.msgs > 0 ? `${Math.max((d.msgs / maxVal) * 100, 4)}%` : "0%" }}
                title={`Pesan masuk: ${d.msgs}`}
              />
              <div
                className="flex-1 rounded-t-sm bg-accent transition-all"
                style={{ height: d.leads > 0 ? `${Math.max((d.leads / maxVal) * 100, 4)}%` : "0%" }}
                title={`Lead baru: ${d.leads}`}
              />
            </div>
            <span className="text-[9px] text-muted-foreground leading-none whitespace-nowrap">
              {dayLabel(d.day)}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-4">
        <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <span className="inline-block h-2 w-3 rounded-sm bg-primary" /> Pesan masuk
        </span>
        <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <span className="inline-block h-2 w-3 rounded-sm bg-accent" /> Lead baru
        </span>
      </div>
    </div>
  );
}
