import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.rafal4433.dziennik',
  appName: 'Dziennik',
  webDir: 'dist',
  ios: {
    // Marginesy pod notch i pasek domowy obsługuje CSS (viewport-fit=cover + env(safe-area-inset-*)).
    contentInset: 'never',
    // Kolor tła pod stroną ustawia ViewController (AppDelegate.swift) z kolorem „Paper” — jasnym lub ciemnym.
  },
};

export default config;
