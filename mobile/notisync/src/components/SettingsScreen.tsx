import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Switch, Alert } from 'react-native';
import { apiService } from '../services/api';
import { useNotificationCapture } from '../hooks/useNotificationCapture';

interface SettingsScreenProps {
  onBack: () => void;
  onSignOut: () => void;
}

export const SettingsScreen: React.FC<SettingsScreenProps> = ({ onBack, onSignOut }) => {
  const [state, actions] = useNotificationCapture();
  const [notificationsEnabled, setNotificationsEnabled] = useState(state.config.enabled);
  const [systemNotifications, setSystemNotifications] = useState(state.config.captureSystemNotifications);
  const [appNotifications, setAppNotifications] = useState(state.config.captureAppNotifications);

  const handleSignOut = async () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            try {
              await apiService.logout();
              onSignOut();
            } catch (error) {
              console.error('Sign out error:', error);
            }
          },
        },
      ]
    );
  };

  const handleClearData = () => {
    Alert.alert(
      'Clear All Data',
      'This will delete all captured notifications and reset the app. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear Data',
          style: 'destructive',
          onPress: async () => {
            try {
              await actions.clearAllData();
              Alert.alert('Success', 'All data has been cleared');
            } catch (error) {
              Alert.alert('Error', 'Failed to clear data');
            }
          },
        },
      ]
    );
  };

  const toggleNotifications = async (enabled: boolean) => {
    setNotificationsEnabled(enabled);
    await actions.updateConfig({ enabled });
  };

  const toggleSystemNotifications = async (enabled: boolean) => {
    setSystemNotifications(enabled);
    await actions.updateConfig({ captureSystemNotifications: enabled });
  };

  const toggleAppNotifications = async (enabled: boolean) => {
    setAppNotifications(enabled);
    await actions.updateConfig({ captureAppNotifications: enabled });
  };

  const SettingItem = ({ 
    title, 
    subtitle, 
    onPress, 
    rightElement, 
    showArrow = false 
  }: {
    title: string;
    subtitle?: string;
    onPress?: () => void;
    rightElement?: React.ReactNode;
    showArrow?: boolean;
  }) => (
    <TouchableOpacity
      onPress={onPress}
      className="bg-white px-6 py-4 flex-row items-center justify-between"
      disabled={!onPress}
    >
      <View className="flex-1">
        <Text className="text-gray-900 font-medium">{title}</Text>
        {subtitle && (
          <Text className="text-gray-500 text-sm mt-1">{subtitle}</Text>
        )}
      </View>
      {rightElement}
      {showArrow && (
        <Text className="text-gray-400 ml-2">→</Text>
      )}
    </TouchableOpacity>
  );

  const SectionHeader = ({ title }: { title: string }) => (
    <Text className="text-gray-500 font-medium text-sm px-6 py-3 bg-gray-50">
      {title.toUpperCase()}
    </Text>
  );

  return (
    <View className="flex-1 bg-gray-50">
      {/* Header */}
      <View className="bg-white px-6 pt-12 pb-4">
        <View className="flex-row items-center">
          <TouchableOpacity 
            onPress={onBack}
            className="w-10 h-10 bg-gray-100 rounded-full items-center justify-center mr-4"
          >
            <Text className="text-gray-600">←</Text>
          </TouchableOpacity>
          <Text className="text-2xl font-bold text-gray-900">Settings</Text>
        </View>
      </View>

      <ScrollView className="flex-1">
        {/* Notification Capture Settings */}
        <SectionHeader title="Notification Capture" />
        <View className="bg-white mb-6">
          <SettingItem
            title="Enable Notifications"
            subtitle="Capture and sync notifications from other apps"
            rightElement={
              <Switch
                value={notificationsEnabled}
                onValueChange={toggleNotifications}
                trackColor={{ false: '#E5E7EB', true: '#3B82F6' }}
                thumbColor={notificationsEnabled ? '#FFFFFF' : '#FFFFFF'}
              />
            }
          />
          <View className="h-px bg-gray-100 ml-6" />
          <SettingItem
            title="System Notifications"
            subtitle="Include system and OS notifications"
            rightElement={
              <Switch
                value={systemNotifications}
                onValueChange={toggleSystemNotifications}
                trackColor={{ false: '#E5E7EB', true: '#3B82F6' }}
                thumbColor={systemNotifications ? '#FFFFFF' : '#FFFFFF'}
                disabled={!notificationsEnabled}
              />
            }
          />
          <View className="h-px bg-gray-100 ml-6" />
          <SettingItem
            title="App Notifications"
            subtitle="Capture notifications from installed apps"
            rightElement={
              <Switch
                value={appNotifications}
                onValueChange={toggleAppNotifications}
                trackColor={{ false: '#E5E7EB', true: '#3B82F6' }}
                thumbColor={appNotifications ? '#FFFFFF' : '#FFFFFF'}
                disabled={!notificationsEnabled}
              />
            }
          />
        </View>

        {/* App Management */}
        <SectionHeader title="App Management" />
        <View className="bg-white mb-6">
          <SettingItem
            title="Blocked Apps"
            subtitle="Manage apps excluded from capture"
            showArrow
            onPress={() => Alert.alert('Coming Soon', 'App blocking feature will be available soon')}
          />
          <View className="h-px bg-gray-100 ml-6" />
          <SettingItem
            title="Priority Apps"
            subtitle="Set high-priority apps for important notifications"
            showArrow
            onPress={() => Alert.alert('Coming Soon', 'Priority apps feature will be available soon')}
          />
        </View>

        {/* Sync & Storage */}
        <SectionHeader title="Sync & Storage" />
        <View className="bg-white mb-6">
          <SettingItem
            title="Auto Sync"
            subtitle="Automatically sync notifications to cloud"
            rightElement={
              <Switch
                value={true}
                onValueChange={() => {}}
                trackColor={{ false: '#E5E7EB', true: '#3B82F6' }}
                thumbColor="#FFFFFF"
                disabled
              />
            }
          />
          <View className="h-px bg-gray-100 ml-6" />
          <SettingItem
            title="Storage Usage"
            subtitle={`${state.stats.totalCaptured} notifications stored locally`}
            showArrow
            onPress={() => Alert.alert('Storage Info', `Total captured: ${state.stats.totalCaptured}\nSynced: ${state.stats.totalSynced}\nPending: ${state.stats.pendingSync}`)}
          />
          <View className="h-px bg-gray-100 ml-6" />
          <SettingItem
            title="Clear All Data"
            subtitle="Delete all captured notifications"
            onPress={handleClearData}
            rightElement={<Text className="text-red-500">Clear</Text>}
          />
        </View>

        {/* Privacy & Security */}
        <SectionHeader title="Privacy & Security" />
        <View className="bg-white mb-6">
          <SettingItem
            title="Data Encryption"
            subtitle="All data is encrypted locally and in transit"
            rightElement={<Text className="text-green-600">✓ Enabled</Text>}
          />
          <View className="h-px bg-gray-100 ml-6" />
          <SettingItem
            title="Privacy Policy"
            subtitle="Learn how we protect your data"
            showArrow
            onPress={() => Alert.alert('Privacy Policy', 'Privacy policy will be available soon')}
          />
        </View>

        {/* Development */}
        <SectionHeader title="Development" />
        <View className="bg-white mb-6">
          <SettingItem
            title="Test Notification"
            subtitle="Send a test notification to verify capture"
            onPress={actions.sendTestNotification}
            rightElement={<Text className="text-blue-600">Test</Text>}
          />
          <View className="h-px bg-gray-100 ml-6" />
          <SettingItem
            title="Connection Status"
            subtitle={state.isOnline ? 'Connected to server' : 'Offline mode'}
            rightElement={
              <View className={`w-3 h-3 rounded-full ${state.isOnline ? 'bg-green-500' : 'bg-red-500'}`} />
            }
          />
        </View>

        {/* Account */}
        <SectionHeader title="Account" />
        <View className="bg-white mb-6">
          <SettingItem
            title="Account Info"
            subtitle={apiService.getCurrentUser()?.email || 'Not signed in'}
            showArrow
            onPress={() => Alert.alert('Account Info', `Email: ${apiService.getCurrentUser()?.email || 'Not available'}`)}
          />
          <View className="h-px bg-gray-100 ml-6" />
          <SettingItem
            title="Sign Out"
            subtitle="Sign out of your account"
            onPress={handleSignOut}
            rightElement={<Text className="text-red-500">Sign Out</Text>}
          />
        </View>

        {/* App Info */}
        <SectionHeader title="About" />
        <View className="bg-white mb-8">
          <SettingItem
            title="Version"
            subtitle="1.0.0 (Development)"
            rightElement={<Text className="text-gray-500">1.0.0</Text>}
          />
          <View className="h-px bg-gray-100 ml-6" />
          <SettingItem
            title="Help & Support"
            subtitle="Get help with NotiSync"
            showArrow
            onPress={() => Alert.alert('Help & Support', 'Support will be available soon')}
          />
        </View>

        {/* Development Note */}
        <View className="mx-6 mb-8">
          <View className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
            <Text className="text-yellow-800 font-medium mb-2">🚧 Development Mode</Text>
            <Text className="text-yellow-700 text-sm">
              Some settings are placeholders and will be functional once cross-app notification capture is implemented.
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
};