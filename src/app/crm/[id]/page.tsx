"use client";

import { useParams, useRouter } from "next/navigation";
import ProspectoDetalleForm from "@/app/crm/components/ProspectoDetalleForm";

export default function EditProspectoPage() {
  const params = useParams();
  const router = useRouter();
  if (!params) return null;
  const id = params.id as string;

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <ProspectoDetalleForm
        id={id}
        variant="page"
        onUpdated={() => router.push("/crm")}
        onDeleted={() => router.push("/crm")}
        onCancel={() => router.push("/crm")}
      />
    </div>
  );
}
