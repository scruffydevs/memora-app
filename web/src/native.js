import { Capacitor, registerPlugin } from '@capacitor/core';

// True only inside the Memora Android app. In a normal browser these calls are never made.
export const isNative = () => Capacitor.isNativePlatform();

// The Health Connect plugin (installed in the Android app). Its name must match the plugin's native name.
export const Health = registerPlugin('Health');
