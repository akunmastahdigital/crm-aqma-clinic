import { PageHeader } from "@/components/page-header";
import { PaketClient } from "./paket-client";

export const dynamic = "force-dynamic";

export default function PaketPage() {
  return (
    <>
      <PageHeader title="Paket" description="Kelola jenis paket dan lihat tabulasi potensi closing per paket" />
      <div className="p-6">
        <PaketClient />
      </div>
    </>
  );
}
