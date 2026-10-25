import type { CapacitorConfig } from '@capacitor/cli';

/**
 * The iOS and Android apps wrap the same web build (`npm run build` → dist/).
 * `appId` is permanent once the app is published to a store.
 */
const config: CapacitorConfig = {
  appId: 'com.mannanomi.shiftly',
  appName: 'Shiftly',
  webDir: 'dist',
  ios: {
    contentInset: 'never',
    backgroundColor: '#0f172a',
  },
  android: {
    backgroundColor: '#0f172a',
  },
};

export default config;
