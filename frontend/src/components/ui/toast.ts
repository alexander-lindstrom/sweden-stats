/**
 * Tiny transient-message store, rendered by <Toaster />. Module-level like
 * fetchTiming so data hooks can report a failed fetch without threading
 * callbacks through the component tree.
 */

import { useSyncExternalStore } from 'react';

export interface ToastAction {
  label:   string;
  onClick: () => void;
}

export interface Toast {
  id:      number;
  message: string;
  action?: ToastAction;
}

const DEFAULT_DURATION_MS = 8000;

let toasts: readonly Toast[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const timers    = new Map<number, ReturnType<typeof setTimeout>>();

function emit(): void {
  listeners.forEach(l => l());
}

function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

function getSnapshot(): readonly Toast[] {
  return toasts;
}

export function dismissToast(id: number): void {
  const timer = timers.get(id);
  if (timer) { clearTimeout(timer); timers.delete(id); }
  if (!toasts.some(t => t.id === id)) { return; }
  toasts = toasts.filter(t => t.id !== id);
  emit();
}

/**
 * Show a message for a few seconds. A toast with the same text replaces the
 * earlier one, so a burst of identical failures reads as one notice.
 */
export function showToast(message: string, opts: { action?: ToastAction; durationMs?: number } = {}): number {
  const existing = toasts.find(t => t.message === message);
  if (existing) { dismissToast(existing.id); }

  const id = nextId++;
  toasts = [...toasts, { id, message, action: opts.action }];
  timers.set(id, setTimeout(() => dismissToast(id), opts.durationMs ?? DEFAULT_DURATION_MS));
  emit();
  return id;
}

export function useToasts(): readonly Toast[] {
  return useSyncExternalStore(subscribe, getSnapshot);
}
