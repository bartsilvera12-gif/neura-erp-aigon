"use client";

import { Suspense } from "react";
import { useParams, useSearchParams } from "next/navigation";
import PlanDetalleClient from "@/app/planes/components/PlanDetalleClient";

function PlanDetailContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const id = params?.id as string | undefined;
  const editMode = searchParams?.get("edit") === "1";

  if (!id) {
    return (
      <div className="flex items-center justify-center py-24 text-sm text-gray-400">
        Cargando…
      </div>
    );
  }

  return <PlanDetalleClient id={id} variant="page" initialEditing={editMode} />;
}

export default function PlanDetailPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-24 text-sm text-gray-400">
          Cargando…
        </div>
      }
    >
      <PlanDetailContent />
    </Suspense>
  );
}
