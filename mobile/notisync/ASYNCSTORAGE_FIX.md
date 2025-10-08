# AsyncStorage Fix for Physical Device

## Problem
`[@RNC/AsyncStorage]: NativeModule: AsyncStorage is null` error on physical device.

## Root Cause
This happens when the native module isn't properly linked or the app cache is corrupted.

## Solutions (Try in Order)

### 1. **Clear Cache and Restart**
```bash
# Stop the current development server
# Then run:
npx expo start --clear

# Or if using development build:
npx expo run:android --clear-cache
# or
npx expo run:ios --clear-cache
```

### 2. **Reinstall Dependencies**
```bash
# Clear node modules and reinstall
rm -rf node_modules
npm install

# Clear Expo cache
npx expo install --fix
```

### 3. **Rebuild the App**
```bash
# For Android
npx expo run:android

# For iOS  
npx expo run:ios
```

### 4. **Check Expo SDK Compatibility**
```bash
# Check for any compatibility issues
npx expo doctor

# Update Expo CLI if needed
npm install -g @expo/cli@latest
```

### 5. **Manual Linking (If using bare React Native)**
If you're using a bare React Native project (not managed Expo):

#### Android
1. Check `android/settings.gradle`:
```gradle
include ':@react-native-async-storage_async-storage'
project(':@react-native-async-storage_async-storage').projectDir = new File(rootProject.projectDir, '../node_modules/@react-native-async-storage/async-storage/android')
```

2. Check `android/app/build.gradle`:
```gradle
dependencies {
    implementation project(':@react-native-async-storage_async-storage')
}
```

3. Check `MainApplication.java`:
```java
import com.reactnativecommunity.asyncstorage.AsyncStoragePackage;

@Override
protected List<ReactPackage> getPackages() {
    return Arrays.<ReactPackage>asList(
        new AsyncStoragePackage()
    );
}
```

#### iOS
1. Run in `ios/` directory:
```bash
cd ios
pod install
cd ..
```

### 6. **Alternative: Use Expo SecureStore (Temporary)**
If AsyncStorage continues to fail, you can temporarily use Expo SecureStore:

```bash
npx expo install expo-secure-store
```

Then create a wrapper:
```typescript
// src/utils/storage.ts
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

export const Storage = {
  async getItem(key: string): Promise<string | null> {
    if (Platform.OS === 'web') {
      return localStorage.getItem(key);
    }
    try {
      return await SecureStore.getItemAsync(key);
    } catch {
      return null;
    }
  },
  
  async setItem(key: string, value: string): Promise<void> {
    if (Platform.OS === 'web') {
      localStorage.setItem(key, value);
      return;
    }
    try {
      await SecureStore.setItemAsync(key, value);
    } catch (error) {
      console.warn('Storage setItem failed:', error);
    }
  },
  
  async removeItem(key: string): Promise<void> {
    if (Platform.OS === 'web') {
      localStorage.removeItem(key);
      return;
    }
    try {
      await SecureStore.deleteItemAsync(key);
    } catch (error) {
      console.warn('Storage removeItem failed:', error);
    }
  }
};
```

## Quick Fix Commands

### For Managed Expo Workflow:
```bash
# Stop current server
# Then:
npx expo start --clear
```

### For Development Build:
```bash
# Android
npx expo run:android --clear-cache

# iOS
npx expo run:ios --clear-cache
```

### If Still Failing:
```bash
# Complete reset
rm -rf node_modules
npm install
npx expo install --fix
npx expo start --clear
```

## Prevention
- Always use `npx expo install` instead of `npm install` for Expo-compatible packages
- Run `npx expo doctor` regularly to check for issues
- Keep Expo CLI updated: `npm install -g @expo/cli@latest`

## Expected Result
After applying the fix, AsyncStorage should work properly and you should see:
- No more "NativeModule: AsyncStorage is null" errors
- Notification capture working on device
- Local storage functioning correctly

Try the solutions in order - usually clearing cache and restarting resolves the issue.