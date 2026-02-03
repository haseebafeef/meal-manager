import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.mealmanager.app',
  appName: 'MealManager',
  webDir: 'public', // We are not using static export, so this is just a placeholder or public assets
  server: {
    // REPLACE with your computer's local IP (e.g., http://192.168.1.5:3000) for real device testing
    // OR use http://10.0.2.2:3000 for Android Emulator
    url: 'http://10.0.2.2:3000',
    cleartext: true, // Allow HTTP for development
  },
};

export default config;
