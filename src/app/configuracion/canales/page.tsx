import { Suspense } from "react";
import { CanalesHubInner } from "./CanalesHubInner";

/** Evita prerender estático; la vista usa search params en el cliente. */
export const dynamic = "force-dynamic";

/**
 * Server Component que envuelve `CanalesHubInner` en Suspense.
 * No marcar esta página como "use client": en App Router, `useSearchParams()` dentro del hijo
 * cliente debe colgar de un boundary Suspense cuyo padre sea Server Component; si el padre es
 * cliente, en producción Next puede fallar el render con el mensaje genérico de error en RSC.
 */
export default function ConfiguracionCanalesHubPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center gap-3 py-24 text-sm text-slate-500">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-[#4FAEB2]" />
          Cargando canales…
        </div>
      }
    >
      <CanalesHubInner />
    </Suspense>
  );
}
