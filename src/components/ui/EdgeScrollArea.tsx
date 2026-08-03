"use client";

import {
  useCallback,
  useEffect,
  useRef,
  type HTMLAttributes,
  type ReactNode,
} from "react";

export type EdgeScrollAreaProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  /** Ancho de la zona sensible en píxeles cerca de cada borde. */
  edgeZone?: number;
  /** Velocidad máxima de scroll en píxeles por frame (~60fps). */
  maxSpeed?: number;
  /** Mostrar degradados sutiles en los bordes como hint visual. */
  showHints?: boolean;
};

/**
 * Contenedor con scroll horizontal automático al acercar el cursor a los bordes.
 * Funciona junto con overflow-x-auto: el scroll manual sigue habilitado.
 */
export default function EdgeScrollArea({
  children,
  className = "",
  edgeZone = 70,
  maxSpeed = 22,
  showHints = false,
  ...rest
}: EdgeScrollAreaProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const speedRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  const stopLoop = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    speedRef.current = 0;
  }, []);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const fromLeft = x;
      const fromRight = rect.width - x;

      let speed = 0;
      if (fromLeft < edgeZone) {
        const intensity = (edgeZone - fromLeft) / edgeZone;
        speed = -Math.ceil(maxSpeed * intensity);
      } else if (fromRight < edgeZone) {
        const intensity = (edgeZone - fromRight) / edgeZone;
        speed = Math.ceil(maxSpeed * intensity);
      }

      speedRef.current = speed;

      if (speed !== 0 && rafRef.current === null) {
        const step = () => {
          const node = containerRef.current;
          if (!node || speedRef.current === 0) {
            rafRef.current = null;
            return;
          }
          const maxScroll = node.scrollWidth - node.clientWidth;
          const next = Math.min(Math.max(node.scrollLeft + speedRef.current, 0), maxScroll);
          if (next === node.scrollLeft) {
            speedRef.current = 0;
            rafRef.current = null;
            return;
          }
          node.scrollLeft = next;
          rafRef.current = requestAnimationFrame(step);
        };
        rafRef.current = requestAnimationFrame(step);
      }
    },
    [edgeZone, maxSpeed]
  );

  const handleMouseLeave = useCallback(() => {
    stopLoop();
  }, [stopLoop]);

  useEffect(() => () => stopLoop(), [stopLoop]);

  return (
    <div className={`relative ${className}`} {...rest}>
      <div
        ref={containerRef}
        className="overflow-x-auto"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        {children}
      </div>
      {showHints ? (
        <>
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-white/80 to-transparent"
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-white/80 to-transparent"
          />
        </>
      ) : null}
    </div>
  );
}
