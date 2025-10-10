# Android Cross-App Notification Capture Implementation Guide

## Overview
This guide provides step-by-step instructions for implementing system-wide notification capture on Android using React Native native modules.

## Phase 1: Project Setup

### 1.1 Eject from Expo (CRITICAL STEP)
```bash
# Backup your current project first!
cp -r mobile/notisync mobile/notisync-expo-backup

# Navigate to your project
cd mobile/notisync

# Eject from Expo
npx expo eject

# Choose "bare" workflow when prompted
# This will create android/ and ios/ directories
```

### 1.2 Install Required Dependencies
```bash
# Install React Native CLI tools
npm install -g @react-native-community/cli

# Install additional dependencies for native modules
npm install react-native-device-info
npm install @react-native-async-storage/async-storage
```

## Phase 2: Create Android NotificationListenerService

### 2.1 Create the Service Class
Create `android/app/src/main/java/com/notisync/NotificationListenerService.java`:

```java
package com.notisync;

import android.app.Notification;
import android.content.Intent;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import android.util.Log;
import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.modules.core.DeviceEventManagerModule;
import com.facebook.react.ReactApplication;
import com.facebook.react.ReactInstanceManager;
import com.facebook.react.bridge.ReactContext;

public class NotificationListener extends NotificationListenerService {
    private static final String TAG = "NotificationListener";
    
    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        super.onNotificationPosted(sbn);
        
        // Extract notification data
        Notification notification = sbn.getNotification();
        String packageName = sbn.getPackageName();
        String title = "";
        String text = "";
        
        // Skip system notifications
        if (isSystemNotification(packageName)) {
            return;
        }
        
        // Extract title and text
        Bundle extras = notification.extras;
        if (extras != null) {
            title = extras.getString(Notification.EXTRA_TITLE, "");
            text = extras.getString(Notification.EXTRA_TEXT, "");
        }
        
        // Create notification data object
        WritableMap notificationData = Arguments.createMap();
        notificationData.putString("id", sbn.getKey());
        notificationData.putString("packageName", packageName);
        notificationData.putString("appName", getAppName(packageName));
        notificationData.putString("title", title);
        notificationData.putString("body", text);
        notificationData.putDouble("timestamp", System.currentTimeMillis());
        notificationData.putInt("priority", notification.priority);
        
        // Send to React Native
        sendNotificationToReactNative(notificationData);
        
        Log.d(TAG, "Notification captured: " + title + " from " + packageName);
    }
    
    @Override
    public void onNotificationRemoved(StatusBarNotification sbn) {
        super.onNotificationRemoved(sbn);
        // Handle notification removal if needed
    }
    
    private boolean isSystemNotification(String packageName) {
        return packageName.equals("android") || 
               packageName.equals("com.android.systemui") ||
               packageName.contains("system");
    }
    
    private String getAppName(String packageName) {
        try {
            return getPackageManager()
                .getApplicationLabel(getPackageManager()
                .getApplicationInfo(packageName, 0)).toString();
        } catch (Exception e) {
            return packageName;
        }
    }
    
    private void sendNotificationToReactNative(WritableMap data) {
        try {
            ReactApplication reactApplication = (ReactApplication) getApplication();
            ReactInstanceManager reactInstanceManager = reactApplication
                .getReactNativeHost().getReactInstanceManager();
            ReactContext reactContext = reactInstanceManager.getCurrentReactContext();
            
            if (reactContext != null) {
                reactContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                    .emit("onNotificationCaptured", data);
            }
        } catch (Exception e) {
            Log.e(TAG, "Failed to send notification to React Native", e);
        }
    }
}
```

### 2.2 Update AndroidManifest.xml
Add to `android/app/src/main/AndroidManifest.xml`:

```xml
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    
    <!-- Add permission -->
    <uses-permission android:name="android.permission.BIND_NOTIFICATION_LISTENER_SERVICE" />
    
    <application>
        <!-- Add service declaration -->
        <service
            android:name=".NotificationListener"
            android:label="NotiSync Notification Listener"
            android:permission="android.permission.BIND_NOTIFICATION_LISTENER_SERVICE"
            android:exported="true">
            <intent-filter>
                <action android:name="android.service.notification.NotificationListenerService" />
            </intent-filter>
        </service>
        
        <!-- Your existing activity and other components -->
    </application>
</manifest>
```

## Phase 3: Create React Native Bridge Module

### 3.1 Create Native Module
Create `android/app/src/main/java/com/notisync/NotificationCaptureModule.java`:

```java
package com.notisync;

import android.content.ComponentName;
import android.content.Intent;
import android.provider.Settings;
import android.text.TextUtils;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.Promise;

public class NotificationCaptureModule extends ReactContextBaseJavaModule {
    private static final String MODULE_NAME = "NotificationCapture";
    
    public NotificationCaptureModule(ReactApplicationContext reactContext) {
        super(reactContext);
    }
    
    @Override
    public String getName() {
        return MODULE_NAME;
    }
    
    @ReactMethod
    public void isNotificationAccessGranted(Promise promise) {
        try {
            String enabledListeners = Settings.Secure.getString(
                getReactApplicationContext().getContentResolver(),
                "enabled_notification_listeners"
            );
            
            String packageName = getReactApplicationContext().getPackageName();
            boolean isEnabled = enabledListeners != null && 
                enabledListeners.contains(packageName);
            
            promise.resolve(isEnabled);
        } catch (Exception e) {
            promise.reject("ERROR", e.getMessage());
        }
    }
    
    @ReactMethod
    public void requestNotificationAccess(Promise promise) {
        try {
            Intent intent = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getReactApplicationContext().startActivity(intent);
            promise.resolve(true);
        } catch (Exception e) {
            promise.reject("ERROR", e.getMessage());
        }
    }
    
    @ReactMethod
    public void startNotificationService(Promise promise) {
        try {
            // The service starts automatically when permission is granted
            // This method can be used for additional setup if needed
            promise.resolve(true);
        } catch (Exception e) {
            promise.reject("ERROR", e.getMessage());
        }
    }
    
    @ReactMethod
    public void stopNotificationService(Promise promise) {
        try {
            // Service lifecycle is managed by Android system
            // This method can be used for cleanup if needed
            promise.resolve(true);
        } catch (Exception e) {
            promise.reject("ERROR", e.getMessage());
        }
    }
}
```

### 3.2 Register the Module
Create `android/app/src/main/java/com/notisync/NotificationCapturePackage.java`:

```java
package com.notisync;

import com.facebook.react.ReactPackage;
import com.facebook.react.bridge.NativeModule;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.uimanager.ViewManager;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

public class NotificationCapturePackage implements ReactPackage {
    @Override
    public List<ViewManager> createViewManagers(ReactApplicationContext reactContext) {
        return Collections.emptyList();
    }
    
    @Override
    public List<NativeModule> createNativeModules(ReactApplicationContext reactContext) {
        List<NativeModule> modules = new ArrayList<>();
        modules.add(new NotificationCaptureModule(reactContext));
        return modules;
    }
}
```

### 3.3 Register Package in MainApplication
Update `android/app/src/main/java/com/notisync/MainApplication.java`:

```java
// Add import
import com.notisync.NotificationCapturePackage;

// In getPackages() method, add:
@Override
protected List<ReactPackage> getPackages() {
    @SuppressWarnings("UnnecessaryLocalVariable")
    List<ReactPackage> packages = new PackageList(this).getPackages();
    // Add your custom package
    packages.add(new NotificationCapturePackage());
    return packages;
}
```

## Phase 4: Create TypeScript Interface

### 4.1 Create Native Module Types
Create `mobile/notisync/src/services/nativeNotificationCapture.ts`:

```typescript
import { NativeModules, NativeEventEmitter, EmitterSubscription } from 'react-native';

interface NotificationCaptureModule {
  isNotificationAccessGranted(): Promise<boolean>;
  requestNotificationAccess(): Promise<boolean>;
  startNotificationService(): Promise<boolean>;
  stopNotificationService(): Promise<boolean>;
}

interface CapturedNotificationData {
  id: string;
  packageName: string;
  appName: string;
  title: string;
  body: string;
  timestamp: number;
  priority: number;
}

const { NotificationCapture } = NativeModules as {
  NotificationCapture: NotificationCaptureModule;
};

class NativeNotificationCaptureService {
  private eventEmitter: NativeEventEmitter;
  private notificationListener: EmitterSubscription | null = null;
  private onNotificationCallback: ((notification: CapturedNotificationData) => void) | null = null;

  constructor() {
    this.eventEmitter = new NativeEventEmitter(NativeModules.NotificationCapture);
  }

  async isPermissionGranted(): Promise<boolean> {
    try {
      return await NotificationCapture.isNotificationAccessGranted();
    } catch (error) {
      console.error('Failed to check notification permission:', error);
      return false;
    }
  }

  async requestPermission(): Promise<boolean> {
    try {
      return await NotificationCapture.requestNotificationAccess();
    } catch (error) {
      console.error('Failed to request notification permission:', error);
      return false;
    }
  }

  async startCapture(onNotification: (notification: CapturedNotificationData) => void): Promise<boolean> {
    try {
      this.onNotificationCallback = onNotification;
      
      // Start listening for notifications
      this.notificationListener = this.eventEmitter.addListener(
        'onNotificationCaptured',
        this.handleNotificationCaptured.bind(this)
      );

      return await NotificationCapture.startNotificationService();
    } catch (error) {
      console.error('Failed to start notification capture:', error);
      return false;
    }
  }

  async stopCapture(): Promise<void> {
    try {
      if (this.notificationListener) {
        this.notificationListener.remove();
        this.notificationListener = null;
      }
      
      this.onNotificationCallback = null;
      await NotificationCapture.stopNotificationService();
    } catch (error) {
      console.error('Failed to stop notification capture:', error);
    }
  }

  private handleNotificationCaptured(data: CapturedNotificationData): void {
    console.log('📱 Native notification captured:', data);
    
    if (this.onNotificationCallback) {
      this.onNotificationCallback(data);
    }
  }
}

export const nativeNotificationCaptureService = new NativeNotificationCaptureService();
export type { CapturedNotificationData };
```

## Phase 5: Integration with Existing System

### 5.1 Update Notification Capture Service
Update `mobile/notisync/src/services/notificationCapture.ts` to use native capture:

```typescript
// Add import at the top
import { Platform } from 'react-native';
import { nativeNotificationCaptureService, CapturedNotificationData } from './nativeNotificationCapture';

// Update the startCapturing method
async startCapturing(): Promise<boolean> {
  if (this.isCapturing) {
    console.log('Notification capture is already running');
    return true;
  }

  try {
    console.log('Starting notification capture...');
    
    if (Platform.OS === 'android') {
      // Use native Android notification capture
      const hasPermission = await nativeNotificationCaptureService.isPermissionGranted();
      
      if (!hasPermission) {
        throw new Error('Notification access permission not granted');
      }

      const success = await nativeNotificationCaptureService.startCapture(
        this.handleNativeNotificationReceived.bind(this)
      );

      if (success) {
        this.isCapturing = true;
        console.log('Native Android notification capture started successfully');
        return true;
      } else {
        throw new Error('Failed to start native notification capture');
      }
    } else {
      // Fallback to Expo notifications for other platforms
      // ... existing Expo code ...
    }
  } catch (error) {
    console.error('Failed to start notification capture:', error);
    return false;
  }
}

// Add new method to handle native notifications
private async handleNativeNotificationReceived(data: CapturedNotificationData): Promise<void> {
  console.log('🔔 Native notification received!', data);

  if (!this.captureConfig.enabled) {
    console.log('❌ Notification capture disabled in config');
    return;
  }

  try {
    // Convert native notification data to our format
    const capturedNotification: CapturedNotification = {
      id: data.id,
      appName: data.appName,
      title: data.title,
      body: data.body,
      priority: this.mapNativePriority(data.priority),
      timestamp: data.timestamp,
      packageName: data.packageName,
      extras: {},
    };

    console.log('📝 Converted notification data:', capturedNotification);
    
    if (this.shouldCaptureNotification(capturedNotification)) {
      console.log('✅ Notification passed filters, storing...');
      await this.storeNotification(capturedNotification);
      await this.updateStats('captured');
      
      // Attempt immediate sync if online
      this.syncNotificationInBackground(capturedNotification);
      console.log('💾 Notification stored and sync initiated');
    } else {
      console.log('❌ Notification filtered out');
    }
  } catch (error) {
    console.error('Failed to handle native notification:', error);
  }
}

// Add method to map native priority
private mapNativePriority(nativePriority: number): number {
  // Android priority: -2 to 2, map to our scale 0-3
  if (nativePriority >= 1) return 3; // High/Max priority
  if (nativePriority === 0) return 2; // Default priority
  if (nativePriority === -1) return 1; // Low priority
  return 0; // Min priority
}

// Update stopCapturing method
async stopCapturing(): Promise<void> {
  console.log('stopCapturing called, current state:', this.isCapturing);
  
  if (!this.isCapturing) {
    console.log('Notification capture is already stopped');
    return;
  }

  try {
    console.log('Stopping notification capture...');
    this.isCapturing = false;
    
    if (Platform.OS === 'android') {
      // Stop native Android capture
      await nativeNotificationCaptureService.stopCapture();
      console.log('Native Android notification capture stopped');
    } else {
      // ... existing Expo cleanup code ...
    }

    console.log('Notification capture stopped successfully');
  } catch (error) {
    console.error('Failed to stop notification capture:', error);
    this.isCapturing = false;
  }
}
```

### 5.2 Update Permission Request
Update the `requestPermissions` method:

```typescript
async requestPermissions(): Promise<NotificationPermissionStatus> {
  if (Platform.OS === 'android') {
    try {
      const hasPermission = await nativeNotificationCaptureService.isPermissionGranted();
      
      if (!hasPermission) {
        // This will open Android settings
        await nativeNotificationCaptureService.requestPermission();
        
        // Return pending status as user needs to manually enable
        return {
          granted: false,
          canAskAgain: true,
          status: 'undetermined',
        };
      }

      return {
        granted: true,
        canAskAgain: false,
        status: 'granted',
      };
    } catch (error) {
      console.error('Android permission request failed:', error);
      return {
        granted: false,
        canAskAgain: true,
        status: 'undetermined',
      };
    }
  } else {
    // ... existing Expo permission code ...
  }
}
```

## Phase 6: Update UI Components

### 6.1 Update NotificationSetup Component
Add Android-specific setup steps to `mobile/notisync/src/components/NotificationSetup.tsx`:

```typescript
// Add this after the existing permission step
{Platform.OS === 'android' && (
  <View className="mt-3 p-3 bg-orange-50 rounded-lg border border-orange-200">
    <Text className="text-sm font-psemibold text-orange-800 mb-2">
      📱 Android Setup Required
    </Text>
    <Text className="text-xs font-pregular text-orange-700 mb-2">
      To capture notifications from other apps, you need to:
    </Text>
    <Text className="text-xs font-pregular text-orange-700 mb-1">
      1. Tap "Request Permissions" above
    </Text>
    <Text className="text-xs font-pregular text-orange-700 mb-1">
      2. Find "NotiSync" in the list
    </Text>
    <Text className="text-xs font-pregular text-orange-700 mb-1">
      3. Toggle the switch to enable
    </Text>
    <Text className="text-xs font-pregular text-orange-700">
      4. Return to this app
    </Text>
  </View>
)}
```

## Phase 7: Testing

### 7.1 Build and Test
```bash
# Clean and rebuild
cd android
./gradlew clean
cd ..

# Build and run
npx react-native run-android

# Or build APK for testing
cd android
./gradlew assembleDebug
```

### 7.2 Test Checklist
- [ ] App builds successfully after ejection
- [ ] Permission request opens Android settings
- [ ] Notification access can be enabled in settings
- [ ] App detects when permission is granted
- [ ] Notifications from other apps are captured
- [ ] Captured notifications appear in app
- [ ] Notifications are synced to server
- [ ] Service continues running in background

## Troubleshooting

### Common Issues:
1. **Build errors after ejection**: Clean project and reinstall dependencies
2. **Permission not working**: Check AndroidManifest.xml service declaration
3. **No notifications captured**: Verify service is running and permission granted
4. **App crashes**: Check native module registration in MainApplication.java

### Debug Commands:
```bash
# Check if service is running
adb shell dumpsys notification_listener

# View app logs
npx react-native log-android

# Check notification access
adb shell settings get secure enabled_notification_listeners
```

This implementation will give you full system-wide notification capture on Android devices!