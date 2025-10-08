// Storage utility with fallback for AsyncStorage issues
import { Platform } from 'react-native';

let AsyncStorage: any = null;

// Try to import AsyncStorage with error handling
try {
  AsyncStorage = require('@react-native-async-storage/async-storage').default;
} catch (error) {
  console.warn('AsyncStorage import failed:', error);
}

// Fallback storage for when AsyncStorage fails
const fallbackStorage: { [key: string]: string } = {};

export const Storage = {
  async getItem(key: string): Promise<string | null> {
    // Web fallback
    if (Platform.OS === 'web') {
      try {
        return localStorage.getItem(key);
      } catch {
        return fallbackStorage[key] || null;
      }
    }

    // Native with AsyncStorage
    if (AsyncStorage) {
      try {
        return await AsyncStorage.getItem(key);
      } catch (error) {
        console.warn('AsyncStorage getItem failed, using fallback:', error);
        return fallbackStorage[key] || null;
      }
    }

    // Fallback to in-memory storage
    console.warn('AsyncStorage not available, using in-memory storage');
    return fallbackStorage[key] || null;
  },

  async setItem(key: string, value: string): Promise<void> {
    // Web fallback
    if (Platform.OS === 'web') {
      try {
        localStorage.setItem(key, value);
        return;
      } catch {
        fallbackStorage[key] = value;
        return;
      }
    }

    // Native with AsyncStorage
    if (AsyncStorage) {
      try {
        await AsyncStorage.setItem(key, value);
        return;
      } catch (error) {
        console.warn('AsyncStorage setItem failed, using fallback:', error);
        fallbackStorage[key] = value;
        return;
      }
    }

    // Fallback to in-memory storage
    console.warn('AsyncStorage not available, using in-memory storage');
    fallbackStorage[key] = value;
  },

  async removeItem(key: string): Promise<void> {
    // Web fallback
    if (Platform.OS === 'web') {
      try {
        localStorage.removeItem(key);
        return;
      } catch {
        delete fallbackStorage[key];
        return;
      }
    }

    // Native with AsyncStorage
    if (AsyncStorage) {
      try {
        await AsyncStorage.removeItem(key);
        return;
      } catch (error) {
        console.warn('AsyncStorage removeItem failed, using fallback:', error);
        delete fallbackStorage[key];
        return;
      }
    }

    // Fallback to in-memory storage
    console.warn('AsyncStorage not available, using in-memory storage');
    delete fallbackStorage[key];
  },

  async clear(): Promise<void> {
    // Web fallback
    if (Platform.OS === 'web') {
      try {
        localStorage.clear();
        return;
      } catch {
        Object.keys(fallbackStorage).forEach(key => delete fallbackStorage[key]);
        return;
      }
    }

    // Native with AsyncStorage
    if (AsyncStorage) {
      try {
        await AsyncStorage.clear();
        return;
      } catch (error) {
        console.warn('AsyncStorage clear failed, using fallback:', error);
        Object.keys(fallbackStorage).forEach(key => delete fallbackStorage[key]);
        return;
      }
    }

    // Fallback to in-memory storage
    console.warn('AsyncStorage not available, using in-memory storage');
    Object.keys(fallbackStorage).forEach(key => delete fallbackStorage[key]);
  },

  async getAllKeys(): Promise<string[]> {
    // Web fallback
    if (Platform.OS === 'web') {
      try {
        return Object.keys(localStorage);
      } catch {
        return Object.keys(fallbackStorage);
      }
    }

    // Native with AsyncStorage
    if (AsyncStorage) {
      try {
        return await AsyncStorage.getAllKeys();
      } catch (error) {
        console.warn('AsyncStorage getAllKeys failed, using fallback:', error);
        return Object.keys(fallbackStorage);
      }
    }

    // Fallback to in-memory storage
    console.warn('AsyncStorage not available, using in-memory storage');
    return Object.keys(fallbackStorage);
  },

  // Check if AsyncStorage is available
  isAvailable(): boolean {
    return AsyncStorage !== null;
  },

  // Get storage type for debugging
  getStorageType(): string {
    if (Platform.OS === 'web') {
      return 'localStorage';
    }
    if (AsyncStorage) {
      return 'AsyncStorage';
    }
    return 'fallback';
  }
};

export default Storage;