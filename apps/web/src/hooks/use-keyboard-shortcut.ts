"use client";

import { useEffect } from "react";

interface ShortcutOptions {
  key: string;
  metaOrCtrl?: boolean;
  handler: (e: KeyboardEvent) => void;
  enabled?: boolean;
}

/**
 * Registers a global keyboard shortcut. `metaOrCtrl: true` matches Cmd on
 * macOS and Ctrl on Windows/Linux, the standard cross-platform convention
 * for app-level shortcuts (used for the command palette, etc).
 */
export function useKeyboardShortcut({ key, metaOrCtrl = false, handler, enabled = true }: ShortcutOptions) {
  useEffect(() => {
    if (!enabled) return;

    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const isTyping =
        target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable;

      if (metaOrCtrl && !(e.metaKey || e.ctrlKey)) return;
      if (!metaOrCtrl && (e.metaKey || e.ctrlKey || e.altKey)) return;
      if (!metaOrCtrl && isTyping) return; // don't hijack single-key shortcuts while typing
      if (e.key.toLowerCase() !== key.toLowerCase()) return;

      e.preventDefault();
      handler(e);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [key, metaOrCtrl, handler, enabled]);
}
