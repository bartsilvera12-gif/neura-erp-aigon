"use client";

import { useEffect, useState } from "react";
import ProyectoDetalleInner from "../components/ProyectoDetalleInner";

export default function ProyectoDetalleClient({
  params,
  dataSchema,
}: {
  params: Promise<{ id: string }>;
  dataSchema: string;
}) {
  const [id, setId] = useState<string>("");

  useEffect(() => {
    void params.then((p) => setId(p.id));
  }, [params]);

  if (!id) return null;

  return <ProyectoDetalleInner projectId={id} variant="page" dataSchema={dataSchema} />;
}
