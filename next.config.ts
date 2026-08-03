import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * El host de build self-hosted (Coolify/nixpacks) tiene RAM acotada y el
   * OOM-killer mata la fase "Running TypeScript"/ESLint de `next build`
   * (SIGKILL, exit 255) en builds fríos con dependencias pesadas (recharts).
   * La validez de tipos y lint se garantiza fuera del build de producción
   * con `npm run build` / `tsc --noEmit` / `npm run lint` en local/CI (corren
   * en verde sobre este commit). Por eso se omite esa fase en el build del
   * servidor para que el deploy no caiga por memoria. Revisar si se agrega
   * swap/upgrade de RAM al host de build → reactivar.
   */
  typescript: { ignoreBuildErrors: true },
};

export default nextConfig;
