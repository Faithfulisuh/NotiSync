import { Platform } from 'react-native';

// Web polyfills for native modules that don't work in browsers

if (Platform.OS === 'web') {
  // AsyncStorage polyfill for web
  const AsyncStoragePolyfill = {
    getItem: async (key: string): Promise<string | null> => {
      try {
        return localStorage.getItem(key);
      } catch (error) {
        console.warn('AsyncStorage getItem failed:', error);
        return null;
      }
    },
    setItem: async (key: string, value: string): Promise<void> => {
      try {
        localStorage.setItem(key, value);
      } catch (error) {
        console.warn('AsyncStorage setItem failed:', error);
      }
    },
    removeItem: async (key: string): Promise<void> => {
      try {
        localStorage.removeItem(key);
      } catch (error) {
        console.warn('AsyncStorage removeItem failed:', error);
      }
    },
    clear: async (): Promise<void> => {
      try {
        localStorage.clear();
      } catch (error) {
        console.warn('AsyncStorage clear failed:', error);
      }
    },
    getAllKeys: async (): Promise<string[]> => {
      try {
        return Object.keys(localStorage);
      } catch (error) {
        console.warn('AsyncStorage getAllKeys failed:', error);
        return [];
      }
    },
  };

  // Mock AsyncStorage module
  const mockAsyncStorage = () => {
    try {
      // Try to mock the module if it's being imported
      const AsyncStorage = require('@react-native-async-storage/async-storage');
      if (AsyncStorage && !AsyncStorage.getItem) {
        Object.assign(AsyncStorage, AsyncStoragePolyfill);
      }
    } catch (error) {
      // Module not found, create global mock
      (global as any).AsyncStorage = AsyncStoragePolyfill;
    }
  };

  // Apply the mock
  mockAsyncStorage();
  // Suppress console warnings for known web incompatibilities
  const originalWarn = console.warn;
  console.warn = (...args: any[]) => {
    const message = args[0];
    if (typeof message === 'string') {
      // Suppress specific native module warnings
      if (
        message.includes('RNGestureHandlerModule') ||
        message.includes('ExpoPushTokenManager') ||
        message.includes('ExpoTaskManager') ||
        message.includes('ExpoDevice')
      ) {
        return; // Don't log these warnings
      }
    }
    originalWarn.apply(console, args);
  };

  // Suppress console errors for known web incompatibilities
  const originalError = console.error;
  console.error = (...args: any[]) => {
    const message = args[0];
    if (typeof message === 'string') {
      // Suppress specific native module errors
      if (
        message.includes('TurboModuleRegistry.getEnforcing') ||
        message.includes('Cannot find native module') ||
        message.includes('RNGestureHandlerModule') ||
        message.includes('ExpoPushTokenManager')
      ) {
        return; // Don't log these errors
      }
    }
    originalError.apply(console, args);
  };
}

export {};