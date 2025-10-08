import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { AuthScreen } from './AuthScreen';
import { DeviceManagement } from './DeviceManagement';
import { NotificationRules } from './NotificationRules';
import { NotificationHistory } from './NotificationHistory';

type SettingsView = 'main' | 'auth' | 'devices' | 'rules' | 'history';

interface SettingsScreenProps {
  onBack: () => void;
}

export const SettingsScreen: React.FC<SettingsScreenProps> = ({ onBack }) => {
  const [currentView, setCurrentView] = useState<SettingsView>('main');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userEmail, setUserEmail] = useState('');

  const handleAuthSuccess = (token: string) => {
    setIsAuthenticated(true);
    setUserEmail('user@example.com'); // TODO: Get from token/API
    setCurrentView('main');
  };

  const handleLogout = () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout? You will stop receiving synced notifications.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: () => {
            setIsAuthenticated(false);
            setUserEmail('');
            // TODO: Clear stored tokens and disconnect WebSocket
          },
        },
      ]
    );
  };

  const navigateToView = (view: SettingsView) => {
    if (!isAuthenticated && view !== 'auth') {
      setCurrentView('auth');
      return;
    }
    setCurrentView(view);
  };

  // Render different views based on current state
  if (currentView === 'auth') {
    return <AuthScreen onAuthSuccess={handleAuthSuccess} />;
  }

  if (currentView === 'devices') {
    return <DeviceManagement onBack={() => setCurrentView('main')} />;
  }

  if (currentView === 'rules') {
    return <NotificationRules onBack={() => setCurrentView('main')} />;
  }

  if (currentView === 'history') {
    return <NotificationHistory onBack={() => setCurrentView('main')} />;
  }

  // Main settings view
  return (
    <View className="flex-1 bg-gray-50">
      <View className="bg-white p-4 border-b border-gray-200">
        <View className="flex-row items-center">
          <TouchableOpacity onPress={onBack} className="mr-4">
            <Text className="text-blue-600 font-pmedium text-base">← Back</Text>
          </TouchableOpacity>
          <Text className="text-lg font-pbold text-slate-800">Settings</Text>
        </View>
      </View>

      <ScrollView className="flex-1">
        {/* User Account Section */}
        <View className="bg-white mt-4 mx-4 rounded-lg border border-gray-200">
          <View className="p-4 border-b border-gray-100">
            <Text className="text-base font-pmedium text-slate-800 mb-1">Account</Text>
            {isAuthenticated ? (
              <Text className="text-sm text-gray-600 font-pregular">{userEmail}</Text>
            ) : (
              <Text className="text-sm text-gray-600 font-pregular">Not signed in</Text>
            )}
          </View>
          
          {!isAuthenticated ? (
            <TouchableOpacity
              onPress={() => navigateToView('auth')}
              className="p-4 flex-row items-center justify-between"
            >
              <View className="flex-row items-center">
                <Text className="text-2xl mr-3">🔐</Text>
                <View>
                  <Text className="text-base font-pmedium text-slate-800">Sign In</Text>
                  <Text className="text-sm text-gray-600 font-pregular">Connect your devices</Text>
                </View>
              </View>
              <Text className="text-gray-400 text-lg">›</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              onPress={handleLogout}
              className="p-4 flex-row items-center justify-between"
            >
              <View className="flex-row items-center">
                <Text className="text-2xl mr-3">🚪</Text>
                <View>
                  <Text className="text-base font-pmedium text-red-600">Sign Out</Text>
                  <Text className="text-sm text-gray-600 font-pregular">Disconnect from sync</Text>
                </View>
              </View>
            </TouchableOpacity>
          )}
        </View>

        {/* Notification Management Section */}
        <View className="bg-white mt-4 mx-4 rounded-lg border border-gray-200">
          <View className="p-4 border-b border-gray-100">
            <Text className="text-base font-pmedium text-slate-800">Notification Management</Text>
          </View>
          
          <TouchableOpacity
            onPress={() => navigateToView('rules')}
            className="p-4 flex-row items-center justify-between border-b border-gray-100"
          >
            <View className="flex-row items-center">
              <Text className="text-2xl mr-3">⚙️</Text>
              <View>
                <Text className="text-base font-pmedium text-slate-800">Notification Rules</Text>
                <Text className="text-sm text-gray-600 font-pregular">Customize how notifications are handled</Text>
              </View>
            </View>
            <Text className="text-gray-400 text-lg">›</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => navigateToView('history')}
            className="p-4 flex-row items-center justify-between"
          >
            <View className="flex-row items-center">
              <Text className="text-2xl mr-3">📋</Text>
              <View>
                <Text className="text-base font-pmedium text-slate-800">Notification History</Text>
                <Text className="text-sm text-gray-600 font-pregular">View past 7 days of notifications</Text>
              </View>
            </View>
            <Text className="text-gray-400 text-lg">›</Text>
          </TouchableOpacity>
        </View>

        {/* Device Management Section */}
        <View className="bg-white mt-4 mx-4 rounded-lg border border-gray-200">
          <View className="p-4 border-b border-gray-100">
            <Text className="text-base font-pmedium text-slate-800">Device Sync</Text>
          </View>
          
          <TouchableOpacity
            onPress={() => navigateToView('devices')}
            className="p-4 flex-row items-center justify-between"
          >
            <View className="flex-row items-center">
              <Text className="text-2xl mr-3">📱</Text>
              <View>
                <Text className="text-base font-pmedium text-slate-800">Manage Devices</Text>
                <Text className="text-sm text-gray-600 font-pregular">View and remove connected devices</Text>
              </View>
            </View>
            <Text className="text-gray-400 text-lg">›</Text>
          </TouchableOpacity>
        </View>

        {/* App Information Section */}
        <View className="bg-white mt-4 mx-4 mb-4 rounded-lg border border-gray-200">
          <View className="p-4 border-b border-gray-100">
            <Text className="text-base font-pmedium text-slate-800">About</Text>
          </View>
          
          <View className="p-4">
            <Text className="text-sm text-gray-600 font-pregular mb-2">
              NotiSync MVP v1.0.0
            </Text>
            <Text className="text-sm text-gray-600 font-pregular">
              Smart notification hub for cross-device synchronization with intelligent categorization and custom rules.
            </Text>
          </View>
        </View>

        {/* Status Information */}
        {isAuthenticated && (
          <View className="bg-green-50 mx-4 mb-6 p-4 rounded-lg border-l-4 border-green-500">
            <Text className="text-sm font-pmedium text-slate-800 mb-1">✅ Connected</Text>
            <Text className="text-sm text-slate-600 font-pregular">
              Your notifications are syncing across all connected devices.
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
};