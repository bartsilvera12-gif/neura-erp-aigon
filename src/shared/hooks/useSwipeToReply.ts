"use client";

import { useRef, useState } from "react";

/** Arrastre horizontal a partir del cual el gesto cuenta como "responder". */
export const SWIPE_REPLY_TRIGGER = 56;
/** Tope del arrastre: la burbuja no se sigue corriendo aunque estires más. */
const SWIPE_REPLY_MAX = 84;
/** Antes de este umbral no decidimos si es scroll vertical o swipe horizontal. */
const SWIPE_REPLY_DEADZONE = 12;

/**
 * Deslizar una burbuja en horizontal para citarla, como WhatsApp.
 *
 * El gesto se decide recién pasado el deadzone: si el dedo va más en vertical que en
 * horizontal es scroll de la lista y soltamos el gesto, así no se traba el scroll. El
 * `touchAction: pan-y` que devuelve en `style` es imprescindible — sin eso el WebView
 * se pelea por el gesto y la lista queda pegajosa.
 *
 * `onDragDetected` sirve para cancelar un long-press en curso cuando el gesto resultó
 * ser un arrastre.
 */
export function useSwipeToReply(onReply?: () => void, onDragDetected?: () => void) {
  const [dragX, setDragX] = useState(0);
  // Espejo en ref: el pointerup lee el desplazamiento real sin depender de que el
  // último setState del pointermove ya haya renderizado.
  const dragXRef = useRef(0);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const draggingRef = useRef(false);
  const armedRef = useRef(false);

  const reset = () => {
    startRef.current = null;
    draggingRef.current = false;
    armedRef.current = false;
    dragXRef.current = 0;
    setDragX(0);
  };

  const onPointerDown = (ev: React.PointerEvent) => {
    startRef.current = { x: ev.clientX, y: ev.clientY };
    draggingRef.current = false;
    armedRef.current = false;
  };

  const onPointerMove = (ev: React.PointerEvent) => {
    const start = startRef.current;
    if (!start || !onReply) return;
    const dx = ev.clientX - start.x;
    const dy = ev.clientY - start.y;

    if (!draggingRef.current) {
      if (Math.abs(dx) < SWIPE_REPLY_DEADZONE) return;
      if (Math.abs(dy) > Math.abs(dx)) {
        // Es scroll vertical: soltamos el gesto y no tocamos la burbuja.
        startRef.current = null;
        return;
      }
      draggingRef.current = true;
      onDragDetected?.();
    }

    const clamped = Math.max(-SWIPE_REPLY_MAX, Math.min(SWIPE_REPLY_MAX, dx));
    dragXRef.current = clamped;
    setDragX(clamped);
    // Vibra al cruzar el umbral: avisa que soltando ya cita, igual que WhatsApp.
    if (!armedRef.current && Math.abs(clamped) >= SWIPE_REPLY_TRIGGER) {
      armedRef.current = true;
      try {
        navigator.vibrate?.(20);
      } catch {
        /* noop */
      }
    }
  };

  const onPointerUp = () => {
    const fired = draggingRef.current && Math.abs(dragXRef.current) >= SWIPE_REPLY_TRIGGER;
    reset();
    if (fired) onReply?.();
  };

  const onPointerCancel = () => reset();

  return {
    dragX,
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel },
    style: {
      transform: dragX ? `translateX(${dragX}px)` : undefined,
      // Con dragX != 0 la burbuja sigue al dedo sin transición; al soltar vuelve a 0
      // y ahí sí anima el regreso.
      transition: dragX ? "none" : "transform 160ms ease-out",
      touchAction: "pan-y" as const,
    },
  };
}
