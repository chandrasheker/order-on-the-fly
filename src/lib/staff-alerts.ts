export type NotificationPermissionState = "default" | "granted" | "denied" | "unsupported";

let audioContext: AudioContext | null = null;

export function getNotificationPermission(): NotificationPermissionState {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported";
  }
  return Notification.permission as NotificationPermissionState;
}

export async function requestStaffNotificationPermission(): Promise<NotificationPermissionState> {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported";
  }
  if (Notification.permission === "granted") {
    await unlockAudio();
    return "granted";
  }
  if (Notification.permission === "denied") {
    return "denied";
  }
  const result = await Notification.requestPermission();
  if (result === "granted") {
    await unlockAudio();
  }
  return result as NotificationPermissionState;
}

export async function unlockAudio() {
  if (typeof window === "undefined") return;
  try {
    if (!audioContext) {
      audioContext = new AudioContext();
    }
    if (audioContext.state === "suspended") {
      await audioContext.resume();
    }
  } catch {
    // ignore — autoplay may stay blocked until user gesture
  }
}

function getAudioContext() {
  if (!audioContext) {
    audioContext = new AudioContext();
  }
  return audioContext;
}

/** Harsh alternating buzzer for customer service alarms. */
export async function playAlarmBuzzer(durationMs = 4000) {
  if (typeof window === "undefined") return;
  try {
    const ctx = getAudioContext();
    if (ctx.state === "suspended") await ctx.resume();

    const start = ctx.currentTime;
    const end = start + durationMs / 1000;
    let t = start;

    while (t < end) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "square";
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.35, t + 0.02);
      gain.gain.setValueAtTime(0.35, t + 0.18);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.25);

      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = "square";
      osc2.frequency.value = 660;
      gain2.gain.setValueAtTime(0.0001, t + 0.25);
      gain2.gain.exponentialRampToValueAtTime(0.35, t + 0.27);
      gain2.gain.setValueAtTime(0.35, t + 0.43);
      gain2.gain.exponentialRampToValueAtTime(0.0001, t + 0.47);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(t + 0.25);
      osc2.stop(t + 0.5);

      t += 0.5;
    }

    if (navigator.vibrate) {
      navigator.vibrate([300, 120, 300, 120, 400]);
    }
  } catch {
    // audio blocked
  }
}

/** Short tone for overdue prep alerts. */
export async function playOverdueChime() {
  if (typeof window === "undefined") return;
  try {
    const ctx = getAudioContext();
    if (ctx.state === "suspended") await ctx.resume();

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(523, ctx.currentTime);
    osc.frequency.setValueAtTime(784, ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.4);

    if (navigator.vibrate) {
      navigator.vibrate(180);
    }
  } catch {
    // audio blocked
  }
}

/** Bright double ping when a new kitchen ticket arrives. */
export async function playNewKitchenChime() {
  if (typeof window === "undefined") return;
  try {
    const ctx = getAudioContext();
    if (ctx.state === "suspended") await ctx.resume();

    const tones = [659, 880];
    for (let i = 0; i < tones.length; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.value = tones[i]!;
      const t = ctx.currentTime + i * 0.14;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.28, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.24);
    }

    if (navigator.vibrate) {
      navigator.vibrate([120, 60, 120]);
    }
  } catch {
    // audio blocked
  }
}

/** Distinct ascending tone when an item is ready to bump for staff. */
export async function playReadyBumpChime() {
  if (typeof window === "undefined") return;
  try {
    const ctx = getAudioContext();
    if (ctx.state === "suspended") await ctx.resume();

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(440, ctx.currentTime);
    osc.frequency.setValueAtTime(587, ctx.currentTime + 0.1);
    osc.frequency.setValueAtTime(880, ctx.currentTime + 0.2);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.45);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.5);

    if (navigator.vibrate) {
      navigator.vibrate([200, 80, 200]);
    }
  } catch {
    // audio blocked
  }
}

export function showStaffBrowserNotification(
  title: string,
  body: string,
  options?: { tag?: string; urgent?: boolean }
) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;

  try {
    const notification = new Notification(title, {
      body,
      tag: options?.tag,
      requireInteraction: options?.urgent ?? false,
    });

    notification.onclick = () => {
      window.focus();
      notification.close();
    };

    setTimeout(() => notification.close(), options?.urgent ? 15000 : 8000);
  } catch {
    // notification failed
  }
}

export const STAFF_ALERTS_PREF_KEY = "tabletap_staff_alerts_enabled";

export function readStaffAlertsEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(STAFF_ALERTS_PREF_KEY) === "true";
}

export function writeStaffAlertsEnabled(enabled: boolean) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STAFF_ALERTS_PREF_KEY, enabled ? "true" : "false");
}
