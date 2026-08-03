"use client";

import { useParams, useRouter } from "next/navigation";
import ColaEditor from "../components/ColaEditor";
import { queueEditorRouteId } from "../queue-route-params";

export default function EditarColaPage() {
  const router = useRouter();
  const params = useParams();
  const queueId = queueEditorRouteId(params?.queueId as string | string[] | undefined);

  return (
    <ColaEditor
      queueId={queueId}
      mode="page"
      onSaved={() => router.push("/configuracion/colas?cola_guardada=1")}
      onDeleted={() => router.push("/configuracion/colas")}
      onCancel={() => router.push("/configuracion/colas")}
    />
  );
}
