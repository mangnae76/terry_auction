import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.terry.auction',
  appName: '마이턴옥션',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
};

export default config;
