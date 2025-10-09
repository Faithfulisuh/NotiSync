# Android NotificationListenerService Setup

## Prerequisites

1. **Expo Development Build** - You need a development build, not Expo Go
2. **Android Device** - Physical device or emulator with API level 18+
3. **Backend Server** - Running at `http://192.168.43.155:8080`

## Build Steps

### 1. Install Dependencies
```bash
cd mobile/notisync
npm install
```

### 2. Create Development Build
```bash
# Install EAS CLI if not already installed
npm install -g @expo/eas-cli

# Login to Expo
eas login

# Create development build
eas build --platform android --profile development
```

### 3. Install on Device
```bash
# Download and install the APK from EAS build
# OR use local build:
npx expo run:android
```

## Required Permissions

The app will request these permissions:

1. **Notification Access** - Required for capturing system notifications
2. **Foreground Service** - For background processing
3. **Network Access** - For syncing with backend

## Setup Process

### 1. First Launch
- App will check for notification access permission
- If not granted, it will show setup screen

### 2. Grant Notification Access
- Tap "Grant Notification Access"
- Android Settings will open
- Find "NotiSync" in the list
- Toggle the switch to enable
- Return to app

### 3. Login
- Enter your credentials
- App will connect to backend at `192.168.43.155:8080`
- Device will auto-register after successful login

### 4. Test Notification Capture
- Send yourself notifications (WhatsApp, email, etc.)
- Check if they appear in the app
- Generate digest to see captured notifications

## Troubleshooting

### Notification Access Not Working
1. Check if permission is actually granted in Android Settings
2. Restart the app after granting permission
3. Check logs for any native module errors

### Backend Connection Issues
1. Ensure backend is running on `192.168.43.155:8080`
2. Check if device is on same network
3. Test connection with: `curl http://192.168.43.155:8080/health`

### Build Issues
1. Clear cache: `npx expo start --clear`
2. Clean build: `cd android && ./gradlew clean`
3. Rebuild: `eas build --platform android --profile development --clear-cache`

## Development Commands

```bash
# Start development server
npx expo start --dev-client

# Run on Android
npx expo run:android

# View logs
npx expo logs --platform android

# Clear cache
npx expo start --clear
```

## File Structure

```
mobile/notisync/
├── android/app/src/main/java/com/faithfulisuh/notisync/
│   ├── NotificationListenerModule.kt      # Expo module
│   └── NotificationListenerService.kt     # Android service
├── plugins/
│   └── android-notification-listener.js   # Expo config plugin
├── src/modules/
│   ├── NotificationListener.ts            # React Native interface
│   └── NotificationListenerModule.ts      # Module definition
└── app.json                               # Expo configuration
```

## Testing Checklist

- [ ] App builds successfully
- [ ] Notification access permission can be granted
- [ ] Backend connection works
- [ ] Login/registration works
- [ ] System notifications are captured
- [ ] Notifications are stored in SQLite
- [ ] Digest generation works
- [ ] Background processing works

## Next Steps

After basic functionality works:
1. Test cross-device sync
2. Implement push notifications (task 16.7)
3. Add web application interface
4. Test complete notification flow