/**
 * Vibration feedback. Uses the Vibration API where available (Android browsers / WebViews);
 * silently does nothing elsewhere. A native backend (e.g. @capacitor/haptics) can be plugged in
 * with `setBackend` without touching game code.
 */
export type HapticKind = 'tap' | 'switch' | 'collect' | 'light' | 'hit' | 'success' | 'failure';

export type HapticBackend = (kind: HapticKind) => void;

const PATTERNS: Record<HapticKind, number | number[]> = {
  tap: 8,
  switch: 14,
  collect: 6,
  light: [8, 30, 8],
  hit: [60, 40, 90],
  success: [20, 60, 30, 60, 50],
  failure: [60, 80, 60],
};

const vibrationBackend: HapticBackend = (kind) => {
  try {
    navigator.vibrate?.(PATTERNS[kind]);
  } catch {
    /* not supported */
  }
};

class HapticsController {
  enabled = true;
  private backend: HapticBackend = vibrationBackend;
  private lastThrottled = 0;

  setBackend(backend: HapticBackend): void {
    this.backend = backend;
  }

  play(kind: HapticKind): void {
    if (!this.enabled) return;
    if (kind === 'collect' || kind === 'light') {
      // Throttle frequent pulses so a row of coins does not buzz continuously.
      const now = performance.now();
      if (now - this.lastThrottled < 140) return;
      this.lastThrottled = now;
    }
    this.backend(kind);
  }
}

export const Haptics = new HapticsController();
