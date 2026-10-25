import { Capacitor } from '@capacitor/core';

/** True inside the App Store / Play Store app (Capacitor), false in a browser or home-screen web app. */
export const isNativeApp = Capacitor.isNativePlatform();

/** A light tap: the phone's haptic engine in the native app, the vibration API elsewhere (Android browsers). */
export function nativeHaptic(): void {
  if (isNativeApp) {
    void import('@capacitor/haptics').then(({ Haptics, ImpactStyle }) => Haptics.impact({ style: ImpactStyle.Light })).catch(() => {});
    return;
  }
  try {
    navigator.vibrate?.(10);
  } catch {
    /* unsupported */
  }
}

/** Keeps the native status bar's text readable over the app's light or dark background. */
export function syncStatusBar(isDark: boolean): void {
  if (!isNativeApp) return;
  void import('@capacitor/status-bar')
    .then(({ StatusBar, Style }) => StatusBar.setStyle({ style: isDark ? Style.Dark : Style.Light }))
    .catch(() => {});
}
