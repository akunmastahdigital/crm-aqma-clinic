import { PageHeader } from "@/components/page-header";
import { Rocket } from "lucide-react";

export function ComingSoon({
  title,
  description,
  phase,
}: {
  title: string;
  description?: string;
  phase: string;
}) {
  return (
    <>
      <PageHeader title={title} description={description} />
      <div className="flex flex-col items-center justify-center px-6 py-24 text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-soft">
          <Rocket className="h-6 w-6 text-primary" />
        </div>
        <h2 className="text-lg font-semibold">Segera hadir</h2>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          Menu ini dikerjakan pada {phase}. Kerangka & navigasinya sudah siap.
        </p>
      </div>
    </>
  );
}
