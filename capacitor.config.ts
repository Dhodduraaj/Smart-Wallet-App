import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.smartwallet.app',
  appName: 'Smart Wallet',
  webDir: 'frontend/dist',
  server: {
    androidScheme: 'https'
  }
};

export default config;
