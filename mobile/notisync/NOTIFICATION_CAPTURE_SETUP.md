# NotiSync Mobile App - Notification Capture Setup

This guide will help you set up and test the notification capture functionality in the NotiSync mobile app.

## 📱 Prerequisites

- Node.js 18+ installed
- Expo CLI installed (`npm install -g @expo/cli`)
- Android Studio (for Android testing) or Xcode (for iOS testing)
- Physical device or emulator/simulator

## 🚀 Installation

1. **Navigate to the mobile app directory:**
   ```bash
   cd mobile/notisync
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start the development server:**
   ```bash
   npm start
   ```

## 📋 Testing the Notification Capture

### Option 1: Physical Device (Recommended)

1. **Install Expo Go app** on your phone from the App Store or Google Play Store

2. **Scan the QR code** displayed in your terminal or browser

3. **Grant permissions** when prompted:
   - Notification permissions
   - Background app refresh (iOS)
   - Battery optimization exclusion (Android)

4. **Test the functionality:**
   - Tap "Request Permissions" if not already granted
   - Tap "Start Capture" to begin capturing notifications
   - Send yourself test notifications from other apps
   - Check the "Recent Notifications" section to see captured notifications

### Option 2: Android Emulator

1. **Start Android emulator** from Android Studio

2. **Run the app:**
   ```bash
   npm run android
   ```

3. **Test with simulated notifications:**
   - Use `adb` commands to send test notifications
   - Or install other apps in the emulator and trigger notifications

### Option 3: iOS Simulator

1. **Start iOS simulator** from Xcode

2. **Run the app:**
   ```bash
   npm run ios
   ```

3. **Note:** iOS simulator has limited notification support, physical device testing is recommended

## 🧪 Testing Features

The test interface provides several features to verify:

### 1. **Permission Management**
- Request notification permissions
- Check permission status
- Handle permission denials gracefully

### 2. **Notification Capture**
- Start/stop notification capture
- Real-time capture of incoming notifications
- Extraction of notification metadata (app name, title, body, etc.)

### 3. **Data Synchronization**
- Sync captured notifications to the backend server
- Batch synchronization for offline scenarios
- Retry logic for failed sync attempts

### 4. **Device Registration**
- Register device with the backend
- Generate unique device identifiers
- Handle push notification tokens

### 5. **Statistics and Monitoring**
- View capture statistics
- Monitor sync success rates
- Track pending synchronizations

## 🔧 Configuration

### Backend Connection

Update the API base URL in `src/services/api.ts`:

```typescript
const API_BASE_URL = __DEV__ 
  ? 'http://YOUR_LOCAL_IP:8080/api/v1'  // Replace with your local IP
  : 'https://api.notisync.com/api/v1';
```

### Notification Filtering

Configure notification capture in the test interface:

- **Excluded Apps:** Apps to ignore (e.g., system notifications)
- **Included Apps:** Only capture from specific apps
- **Filter Keywords:** Only capture notifications containing certain keywords

## 📊 Test Scenarios

### Scenario 1: Basic Capture Test

1. Start the app and grant permissions
2. Start notification capture
3. Send yourself a WhatsApp message or email
4. Verify the notification appears in "Recent Notifications"
5. Check that it's marked as "Synced" if backend is connected

### Scenario 2: Offline Sync Test

1. Disconnect from internet/turn off backend server
2. Trigger several notifications
3. Verify they're captured but not synced
4. Reconnect to internet/start backend
5. Tap "Sync X Notifications" button
6. Verify notifications are now marked as synced

### Scenario 3: Permission Handling

1. Deny notification permissions initially
2. Verify app handles gracefully with appropriate messages
3. Grant permissions through device settings
4. Return to app and verify capture works

### Scenario 4: Background Capture

1. Start capture and minimize the app
2. Trigger notifications from other apps
3. Return to NotiSync app
4. Verify notifications were captured in background

## 🐛 Troubleshooting

### Common Issues

1. **Permissions not granted:**
   - Check device notification settings
   - Ensure app has notification access
   - On Android, check "Notification access" in special permissions

2. **Notifications not capturing:**
   - Verify permissions are granted
   - Check if capture is actually started
   - Look for error messages in the app

3. **Sync failures:**
   - Verify backend server is running
   - Check network connectivity
   - Ensure user is authenticated

4. **App crashes:**
   - Check console logs in development
   - Verify all dependencies are installed
   - Try clearing app data and restarting

### Debug Information

The test interface shows:
- Current permission status
- Capture state (active/inactive)
- Server connection status
- Sync progress and statistics
- Recent error messages

## 📱 Platform-Specific Notes

### Android
- Requires "Notification Listener Service" permission for full capture
- May need battery optimization exclusion for background operation
- Different notification structures across Android versions

### iOS
- More restrictive notification access
- Background processing limitations
- Push notifications work better than local capture

## 🔄 Next Steps

After successful testing:

1. **Implement authentication screens** for user login/registration
2. **Add notification display UI** for viewing synced notifications
3. **Implement user rules configuration** for filtering
4. **Add WebSocket integration** for real-time sync
5. **Optimize for production** with proper error handling and performance

## 📝 Test Checklist

- [ ] App installs and starts successfully
- [ ] Notification permissions can be requested and granted
- [ ] Notification capture starts without errors
- [ ] Incoming notifications are captured and displayed
- [ ] Device registration works with backend
- [ ] Notifications sync to backend server
- [ ] Offline notifications sync when connection restored
- [ ] Statistics update correctly
- [ ] Error handling works gracefully
- [ ] Background capture functions properly

## 🆘 Getting Help

If you encounter issues:

1. Check the console logs for error messages
2. Verify backend server is running and accessible
3. Test with different types of notifications
4. Try on different devices/platforms
5. Check network connectivity and API endpoints

The notification capture system is the foundation for the entire NotiSync experience, so thorough testing at this stage is crucial!