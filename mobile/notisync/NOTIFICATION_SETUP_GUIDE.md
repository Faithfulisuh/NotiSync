# NotiSync - Notification Capture Setup Guide

## 🚀 Getting Started

### For Mobile Devices (iOS/Android)

#### 1. **Grant Permissions**
- Open the NotiSync app
- Tap "Request Permissions" when prompted
- Allow notification access in your device settings
- For Android: Enable "Notification Access" in Settings > Apps > Special Access

#### 2. **Start Notification Capture**
- Tap "Start Capture" in the app
- The app will begin monitoring notifications from other apps
- You'll see a green "Active" status when capture is running

#### 3. **Test the Capture**
- Send yourself a test notification (email, message, etc.)
- Check the "Recent Notifications" section in NotiSync
- Verify notifications are being captured and displayed

#### 4. **Sync with Server** (Optional)
- Tap "Register Device" to connect to the backend server
- Use "Sync Notifications" to upload captured notifications
- Check connection with "Test Connection"

### For Web Browser

#### Web Platform Limitations
- **Real notification capture is not supported** in web browsers
- The web version is primarily for:
  - Viewing synced notifications from mobile devices
  - Managing notification rules and settings
  - Accessing notification history and analytics

#### Web Features Available
- ✅ Server connection and API calls
- ✅ Notification history viewing
- ✅ User account management
- ✅ Notification rules configuration
- ❌ Live notification capture
- ❌ Background monitoring

## 📱 Mobile App Features

### Notification Capture
- **Real-time monitoring** of all app notifications
- **Background capture** continues when app is closed
- **Smart filtering** based on your preferences
- **Automatic categorization** (Work, Personal, Junk)

### Sync & Storage
- **Local storage** of up to 1000 recent notifications
- **Cloud sync** with backend server (when authenticated)
- **Offline support** with automatic retry
- **Cross-device sync** between mobile and web

### Privacy & Control
- **Local-first** - notifications stored on your device
- **Configurable filters** - choose which apps to monitor
- **Keyword filtering** - capture only relevant notifications
- **Easy cleanup** - automatic 7-day expiration

## 🔧 Troubleshooting

### Permissions Issues
**Problem**: "Notification permissions denied"
**Solution**: 
1. Go to device Settings > Apps > NotiSync > Permissions
2. Enable "Notification Access" or "Notification Listener"
3. Restart the NotiSync app

### Capture Not Working
**Problem**: No notifications being captured
**Solution**:
1. Check permissions are granted
2. Ensure "Start Capture" was pressed
3. Verify the app isn't in excluded apps list
4. Try restarting the capture service

### Sync Issues
**Problem**: Notifications not syncing to server
**Solution**:
1. Check internet connection
2. Verify device is registered ("Register Device")
3. Test server connection ("Test Connection")
4. Try manual sync ("Sync Notifications")

### Background Capture
**Problem**: Capture stops when app is closed
**Solution**:
1. Disable battery optimization for NotiSync
2. Add NotiSync to "Auto-start" apps (Android)
3. Enable background app refresh (iOS)

## 📊 Understanding the Interface

### Status Indicators
- **🟢 Active**: Notification capture is running
- **🔴 Inactive**: Capture is stopped
- **🟡 Syncing**: Uploading notifications to server
- **🔵 Online**: Connected to server
- **⚫ Offline**: No server connection

### Statistics
- **Total Captured**: All notifications monitored
- **Total Synced**: Notifications uploaded to server
- **Pending Sync**: Notifications waiting to upload
- **Sync Rate**: Percentage of successful uploads

### Actions Available
- **Request Permissions**: Grant notification access
- **Start/Stop Capture**: Control monitoring
- **Sync Notifications**: Manual upload to server
- **Register Device**: Connect to backend
- **Test Connection**: Check server status
- **Clear All Data**: Reset local storage

## 🎯 Best Practices

### For Optimal Performance
1. **Grant all permissions** when first setting up
2. **Keep the app updated** for latest features
3. **Regularly sync** to avoid data loss
4. **Monitor storage usage** and clear old data

### For Privacy
1. **Review excluded apps** to avoid capturing sensitive notifications
2. **Use keyword filters** to capture only relevant content
3. **Regularly clear data** you no longer need
4. **Understand what data is synced** to the server

### For Battery Life
1. **Use selective app monitoring** instead of capturing everything
2. **Set up keyword filters** to reduce processing
3. **Sync periodically** rather than continuously
4. **Close the app interface** when not actively using it

## 🔗 Next Steps

Once notification capture is working:
1. **Configure notification rules** for automatic categorization
2. **Set up daily digest** for notification summaries
3. **Use the web interface** for advanced management
4. **Explore notification history** and search features

## 📞 Support

If you encounter issues:
1. Check this guide first
2. Review the app logs in the interface
3. Try restarting the app and device
4. Check for app updates

The notification capture system is designed to work reliably in the background while respecting your privacy and device performance.