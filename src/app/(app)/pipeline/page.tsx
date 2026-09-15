import { PipelineClient } from "./pipeline-client";

export const dynamic = "force-dynamic";

export default function PipelinePage() {
  return (
    <div className="h-full">
      <PipelineClient />
    </div>
  );
}
