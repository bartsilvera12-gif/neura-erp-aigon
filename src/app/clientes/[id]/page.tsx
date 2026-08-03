"use client";

import { useParams, useRouter } from "next/navigation";
import ClienteDetalleClient from "@/app/clientes/components/ClienteDetalleClient";

export default function ClienteDetailPage() {
  const params = useParams();
  const router = useRouter();
  const rawId = params?.id;
  const id =
    typeof rawId === "string" ? rawId : Array.isArray(rawId) ? (rawId[0] ?? "") : "";

  return (
    <ClienteDetalleClient
      id={id}
      variant="page"
      onClose={() => router.push("/clientes")}
    />
  );
}
