"use client";

import { Suspense } from "react";
import { useParams, useSearchParams } from "next/navigation";
import UsuarioDetalleClient from "@/app/usuarios/components/UsuarioDetalleClient";

function UsuarioDetailContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const id = String(params?.id ?? "");
  const editMode = searchParams?.get("edit") === "1";

  if (!id) {
    return (
      <div className="flex items-center justify-center py-24 text-sm text-gray-400">
        Cargando…
      </div>
    );
  }

  return <UsuarioDetalleClient id={id} variant="page" initialEditing={editMode} />;
}

export default function UsuarioDetailPage() {
  return (
    <Suspense
      fallback={<div className="flex items-center justify-center py-24 text-sm text-gray-400">Cargando…</div>}
    >
      <UsuarioDetailContent />
    </Suspense>
  );
}
