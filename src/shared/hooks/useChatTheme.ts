"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Preferencia de tema para el área de chat (fondo de mensajes + burbujas entrantes).
 * Persistido en localStorage bajo `chat-theme`. Compartido entre mobile y desktop
 * para que el usuario tenga la misma vista en ambos.
 *
 * Solo aplica al área de mensajes — no cambia sidebar, panel admin ni el resto del ERP.
 */

const STORAGE_KEY = "chat-theme";

export type ChatTheme = "light" | "dark";

export type ChatThemeColors = {
  /** Fondo del área scrollable de mensajes. */
  bg: string;
  /** Fondo de burbujas entrantes (del cliente). Las salientes siguen teal (#4FAEB2). */
  inboundBg: string;
  /** Color de texto de burbujas entrantes. */
  inboundText: string;
  /** Color secundario (timestamps, metadata). */
  inboundMeta: string;
};

const LIGHT: ChatThemeColors = {
  bg: "#E5DDD5",       // beige clásico WhatsApp
  inboundBg: "#FFFFFF",
  inboundText: "#0F172A",
  inboundMeta: "#64748B",
};

const DARK: ChatThemeColors = {
  bg: "#0B141A",       // fondo dark WhatsApp
  inboundBg: "#202C33",
  inboundText: "#E9EDEF",
  inboundMeta: "#8696A0",
};

function readInitialTheme(): ChatTheme {
  if (typeof window === "undefined") return "light";
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

export function useChatTheme() {
  const [theme, setTheme] = useState<ChatTheme>("light");

  // Hidratación en cliente — evita mismatch SSR.
  useEffect(() => {
    setTheme(readInitialTheme());
  }, []);

  const toggle = useCallback(() => {
    setTheme((prev) => {
      const next: ChatTheme = prev === "dark" ? "light" : "dark";
      try {
        window.localStorage.setItem(STORAGE_KEY, next);
      } catch {
        /* noop — private mode */
      }
      return next;
    });
  }, []);

  const colors = theme === "dark" ? DARK : LIGHT;
  return { theme, isDark: theme === "dark", colors, toggle };
}
