import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, Alert, Linking, Platform } from 'react-native';
import { androidBackgroundService, AndroidNotificationAccessStatus } from '../services/androidBackgroundService';

interface NotificationAccessSetupProps {
  onSetupComplete: (hasAccess: boolean) => void;
  onSkip?: () => void;
}

export const NotificationAccessSetup: React.FC<NotificationAccessSetupProps> = ({
  onSetupComplete,
  onSkip,
}) => {
  const [accessStatus, setAccessStatus] = useState<AndroidNotificationAccessStatus>({
    hasAccess: false,
    canRequestAccess: false,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isChecking, setIsChecking] = useState(false);

  useEffect(() => {
    checkInitialStatus();
  }, []);

  const checkInitialStatus = async () => {
    try {
      setIsLoading(true);
      const status = await androidBackgroundService.checkNotificationAccessPermission();
      setAccessStatus(status);
      
      if (status.hasAccess) {
        onSetupComplete(true);
      }
    } catch (error) {
      console.error('Failed to check notification access status:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRequestAccess = async () => {
    if (Platform.OS !== 'android') {
      Alert.alert(
        'Not Supported',
        'Notification access is only available on Android devices.',
        [{ text: 'OK' }]
      );
      return;
    }

    try {
      Alert.alert(
        'Notification Access Required',
        'NotiSync needs access to your notifications to sync them across devices. You will be taken to Android settings where you need to:\n\n1. Find "NotiSync" in the list\n2. Toggle the switch to enable access\n3. Return to the app',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Open Settings',
            onPress: async () => {
              try {
                await Linking.openSettings();
                // Give user time to enable the permission
                setTimeout(() => {
                  checkAccessAfterSettings();
                }, 2000);
              } catch (error) {
                console.error('Failed to open settings:', error);
                Alert.alert('Error', 'Could not open settings. Please enable notification access manually.');
              }
            },
          },
        ]
      );
    } catch (error) {
      console.error('Failed to request notification access:', error);
      Alert.alert('Error', 'Failed to request notification access.');
    }
  };

  const checkAccessAfterSettings = async () => {
    setIsChecking(true);
    try {
      const status = await androidBackgroundService.checkNotificationAccessPermission();
      setAccessStatus(status);
      
      if (status.hasAccess) {
        Alert.alert(
          'Success!',
          'Notification access has been granted. NotiSync can now capture your notifications.',
          [{ text: 'Continue', onPress: () => onSetupComplete(true) }]
        );
      } else {
        Alert.alert(
          'Access Not Granted',
          'Notification access was not enabled. You can try again or skip this step.',
          [
            { text: 'Try Again', onPress: handleRequestAccess },
            { text: 'Skip', onPress: () => onSkip?.() },
          ]
        );
      }
    } catch (error) {
      console.error('Failed to check access after settings:', error);
    } finally {
      setIsChecking(false);
    }
  };

  const handleManualCheck = async () => {
    setIsChecking(true);
    await checkInitialStatus();
    setIsChecking(false);
  };

  const handleSkip = () => {
    Alert.alert(
      'Skip Notification Access?',
      'Without notification access, NotiSync cannot capture notifications from other apps. You can enable this later in settings.',
      [
        { text: 'Go Back', style: 'cancel' },
        { text: 'Skip', onPress: () => onSkip?.() },
      ]
    );
  };

  if (isLoading) {
    return (
      <View className="flex-1 justify-center items-center p-6 bg-white">
        <Text className="text-lg text-gray-600">Checking notification access...</Text>
      </View>
    );
  }

  if (accessStatus.hasAccess) {
    return (
      <View className="flex-1 justify-center items-center p-6 bg-white">
        <View className="w-16 h-16 bg-green-100 rounded-full items-center justify-center mb-4">
          <Text className="text-2xl">✓</Text>
        </View>
        <Text className="text-xl font-semibold text-gray-800 mb-2">Access Granted!</Text>
        <Text className="text-gray-600 text-center mb-6">
          NotiSync has permission to access your notifications.
        </Text>
        <TouchableOpacity
          className="bg-blue-500 px-6 py-3 rounded-lg"
          onPress={() => onSetupComplete(true)}
        >
          <Text className="text-white font-semibold">Continue</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View className="flex-1 p-6 bg-white">
      <View className="flex-1 justify-center">
        <View className="w-16 h-16 bg-blue-100 rounded-full items-center justify-center mb-6 self-center">
          <Text className="text-2xl">🔔</Text>
        </View>
        
        <Text className="text-2xl font-bold text-gray-800 mb-4 text-center">
          Enable Notification Access
        </Text>
        
        <Text className="text-gray-600 text-center mb-6 leading-6">
          To sync your notifications across devices, NotiSync needs permission to access notifications from other apps on your device.
        </Text>

        <View className="bg-gray-50 p-4 rounded-lg mb-6">
          <Text className="font-semibold text-gray-800 mb-2">What this enables:</Text>
          <Text className="text-gray-600 mb-1">• Capture notifications from all apps</Text>
          <Text className="text-gray-600 mb-1">• Sync notifications to your other devices</Text>
          <Text className="text-gray-600 mb-1">• Smart categorization and filtering</Text>
          <Text className="text-gray-600">• Notification history and search</Text>
        </View>

        <View className="bg-yellow-50 p-4 rounded-lg mb-6">
          <Text className="font-semibold text-yellow-800 mb-2">Privacy Note:</Text>
          <Text className="text-yellow-700 text-sm">
            NotiSync only reads notification content to sync across your devices. 
            Your notification data is encrypted and never shared with third parties.
          </Text>
        </View>

        {Platform.OS === 'android' ? (
          <TouchableOpacity
            className="bg-blue-500 px-6 py-4 rounded-lg mb-4"
            onPress={handleRequestAccess}
            disabled={isChecking}
          >
            <Text className="text-white font-semibold text-center">
              {isChecking ? 'Checking...' : 'Grant Notification Access'}
            </Text>
          </TouchableOpacity>
        ) : (
          <View className="bg-gray-100 px-6 py-4 rounded-lg mb-4">
            <Text className="text-gray-600 text-center">
              Notification access is only available on Android devices.
            </Text>
          </View>
        )}

        <TouchableOpacity
          className="border border-gray-300 px-6 py-3 rounded-lg mb-4"
          onPress={handleManualCheck}
          disabled={isChecking}
        >
          <Text className="text-gray-700 font-semibold text-center">
            {isChecking ? 'Checking...' : 'Check Access Status'}
          </Text>
        </TouchableOpacity>

        {onSkip && (
          <TouchableOpacity
            className="px-6 py-3"
            onPress={handleSkip}
          >
            <Text className="text-gray-500 text-center">Skip for now</Text>
          </TouchableOpacity>
        )}
      </View>

      <View className="mt-6">
        <Text className="text-xs text-gray-400 text-center">
          You can enable notification access later in the app settings.
        </Text>
      </View>
    </View>
  );
};

export default NotificationAccessSetup;