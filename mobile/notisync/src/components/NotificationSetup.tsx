import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, Alert, Platform } from 'react-native';
import { useNotificationCapture } from '../hooks/useNotificationCapture';
import { Storage } from '../utils/storage';
import { apiService } from '../services/api';

export const NotificationSetup: React.FC = () => {
  const [state, actions] = useNotificationCapture();
  const [setupStep, setSetupStep] = useState(0);
  const [storageType, setStorageType] = useState<string>('checking...');

  useEffect(() => {
    // Determine current setup step based on state
    if (!state.permissions?.granted) {
      setSetupStep(1); // Need permissions
    } else if (!state.isCapturing) {
      setSetupStep(2); // Need to start capture
    } else {
      setSetupStep(3); // All set up
    }

    // Check storage type
    setStorageType(Storage.getStorageType());
  }, [state.permissions?.granted, state.isCapturing]);

  const handleRequestPermissions = async () => {
    try {
      const permissions = await actions.requestPermissions();
      if (permissions.granted) {
        Alert.alert(
          'Success! 🎉',
          'Notification permissions granted. You can now start capturing notifications.',
          [{ text: 'OK' }]
        );
      } else {
        Alert.alert(
          'Permissions Required',
          'NotiSync needs notification access to capture and sync your notifications. Please grant permissions in your device settings.',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Open Settings', onPress: () => {
                // This would ideally open device settings
                Alert.alert('Manual Setup', 'Please go to Settings > Apps > NotiSync > Permissions and enable Notification Access.');
              }
            }
          ]
        );
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to request permissions. Please try again.');
    }
  };

  const handleStartCapture = async () => {
    const success = await actions.startCapture();
    if (success) {
      Alert.alert(
        'Capture Started! 📱',
        'NotiSync is now monitoring your notifications. You can close the app and it will continue working in the background.',
        [{ text: 'Great!' }]
      );
    } else {
      Alert.alert(
        'Setup Issue',
        'Failed to start notification capture. Please check permissions and try again.',
        [{ text: 'OK' }]
      );
    }
  };

  const handleRegisterDevice = async () => {
    // TODO: Re-enable after cross-app notification capture is implemented
    Alert.alert(
      'Feature Temporarily Disabled',
      'Device registration is temporarily disabled while we implement cross-app notification capture. Focus is on getting Android NotificationListenerService working first.',
      [{ text: 'OK' }]
    );
    return;

    // // Check if user is authenticated first
    // if (!apiService.isAuthenticated()) {
    //   Alert.alert(
    //     'Authentication Required',
    //     'Please log in to your account first to register this device with the server.',
    //     [
    //       { text: 'Cancel', style: 'cancel' },
    //       {
    //         text: 'Go to Login', onPress: () => {
    //           // Navigate to login screen - you might want to implement navigation here
    //           Alert.alert('Login Required', 'Please use the login screen to authenticate first.');
    //         }
    //       }
    //     ]
    //   );
    //   return;
    // }

    // const success = await actions.registerDevice();
    // if (success) {
    //   Alert.alert(
    //     'Device Registered! ☁️',
    //     'Your device is now connected to the NotiSync server. Notifications will be synced automatically.',
    //     [{ text: 'Excellent!' }]
    //   );
    // } else {
    //   Alert.alert(
    //     'Registration Failed',
    //     'Could not register device with server. You can still use local capture and try again later.',
    //     [{ text: 'OK' }]
    //   );
    // }
  };

  if (Platform.OS === 'web') {
    return (
      <View className="bg-blue-50 p-4 rounded-lg border-l-4 border-blue-400 m-4">
        <Text className="text-base font-psemibold mb-2 text-slate-800">
          🌐 Web Platform
        </Text>
        <Text className="text-sm font-pregular text-slate-600 mb-3">
          Notification capture is not available in web browsers. Install the mobile app for full functionality.
        </Text>
      </View>
    );
  }

  return (
    <View className="bg-white p-4 m-4 rounded-lg shadow-sm border border-gray-200">
      <Text className="text-lg font-pbold mb-4 text-slate-800">
        📱 Notification Setup
      </Text>

      {/* Step 1: Permissions */}
      <View className={`mb-4 p-3 rounded-lg ${setupStep >= 1 ? 'bg-blue-50 border border-blue-200' : 'bg-gray-50'}`}>
        <View className="flex-row items-center mb-2">
          <Text className="text-base font-psemibold text-slate-800 mr-2">
            1. Grant Permissions
          </Text>
          {state.permissions?.granted ? (
            <Text className="text-green-600 font-pmedium">✅ Done</Text>
          ) : (
            <Text className="text-orange-600 font-pmedium">⏳ Required</Text>
          )}
        </View>
        <Text className="text-sm font-pregular text-slate-600 mb-3">
          Allow NotiSync to access your device notifications
        </Text>
        {!state.permissions?.granted && (
          <TouchableOpacity
            onPress={handleRequestPermissions}
            className="bg-blue-600 px-4 py-2 rounded-lg"
          >
            <Text className="text-white font-psemibold text-center">
              Request Permissions
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Step 2: Start Capture */}
      <View className={`mb-4 p-3 rounded-lg ${setupStep >= 2 ? 'bg-green-50 border border-green-200' : 'bg-gray-50'}`}>
        <View className="flex-row items-center mb-2">
          <Text className="text-base font-psemibold text-slate-800 mr-2">
            2. Start Capture
          </Text>
          {state.isCapturing ? (
            <Text className="text-green-600 font-pmedium">✅ Active</Text>
          ) : state.permissions?.granted ? (
            <Text className="text-orange-600 font-pmedium">⏳ Ready</Text>
          ) : (
            <Text className="text-gray-500 font-pmedium">⏸️ Waiting</Text>
          )}
        </View>
        <Text className="text-sm font-pregular text-slate-600 mb-3">
          Begin monitoring notifications from other apps
        </Text>
        {state.permissions?.granted && !state.isCapturing && (
          <TouchableOpacity
            onPress={handleStartCapture}
            className="bg-green-600 px-4 py-2 rounded-lg"
          >
            <Text className="text-white font-psemibold text-center">
              Start Capture
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Step 3: Server Connection (Temporarily Disabled) */}
      <View className="mb-4 p-3 rounded-lg bg-gray-100 border border-gray-300">
        <View className="flex-row items-center mb-2">
          <Text className="text-base font-psemibold text-gray-500 mr-2">
            3. Connect to Server
          </Text>
          <Text className="text-gray-500 font-pmedium">� C oming Soon</Text>
        </View>
        <Text className="text-sm font-pregular text-gray-500 mb-3">
          Device registration temporarily disabled while implementing cross-app notification capture
        </Text>
        <View className="bg-yellow-100 p-2 rounded border border-yellow-300">
          <Text className="text-xs font-pregular text-yellow-800">
            📝 Focus: Implementing Android NotificationListenerService for system-wide capture
          </Text>
        </View>
      </View>

      {/* Success State */}
      {setupStep >= 3 && state.isCapturing && (
        <View className="bg-green-100 p-3 rounded-lg border border-green-300">
          <Text className="text-green-800 font-psemibold text-center">
            🎉 Setup Complete!
          </Text>
          <Text className="text-green-700 font-pregular text-center text-sm mt-1">
            NotiSync is now capturing your notifications
          </Text>
        </View>
      )}

      {/* Test Notification */}
      {state.isCapturing && (
        <View className="mt-4 p-3 bg-yellow-50 rounded-lg border border-yellow-200">
          <Text className="text-sm font-psemibold text-slate-700 mb-2">
            🧪 Test Capture
          </Text>
          <Text className="text-xs font-pregular text-slate-600 mb-3">
            Send a test notification to verify capture is working
          </Text>
          <TouchableOpacity
            onPress={actions.sendTestNotification}
            className="bg-yellow-600 px-3 py-2 rounded-lg"
          >
            <Text className="text-white font-pmedium text-center text-sm">
              Send Test Notification
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Quick Stats */}
      {state.isCapturing && (
        <View className="mt-4 p-3 bg-gray-50 rounded-lg">
          <Text className="text-sm font-psemibold text-slate-700 mb-2">
            📊 Quick Stats
          </Text>
          <View className="flex-row justify-between">
            <Text className="text-xs font-pregular text-slate-600">
              Captured: {state.stats.totalCaptured}
            </Text>
            <Text className="text-xs font-pregular text-slate-600">
              Synced: {state.stats.totalSynced}
            </Text>
            <Text className="text-xs font-pregular text-slate-600">
              Status: {state.isOnline ? '🟢 Online' : '🔴 Offline'}
            </Text>
          </View>
          <Text className="text-xs font-pregular text-slate-500 mt-1">
            Storage: {storageType} {!Storage.isAvailable() && '⚠️'}
          </Text>
          <Text className="text-xs font-pregular text-orange-600 mt-2">
            ⚠️ Note: Only captures notifications sent TO this app, not from other apps
          </Text>
        </View>
      )}
    </View>
  );
};