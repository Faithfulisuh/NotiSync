import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Alert, Platform } from 'react-native';
import { NotificationList } from './NotificationList';
import { NotificationDetail } from './NotificationDetail';
import { NotificationCaptureStatus } from './NotificationCaptureStatus';
import { useNotificationDisplay } from '../hooks/useNotificationDisplay';
import { SyncedNotification } from '../types/notification';

export function NotificationDashboard() {
  const [state, actions] = useNotificationDisplay();
  const [selectedNotification, setSelectedNotification] = useState<SyncedNotification | null>(null);

  const handleNotificationPress = (notification: SyncedNotification) => {
    setSelectedNotification(notification);
  };

  const handleNotificationAction = async (notificationId: string, action: 'read' | 'dismiss' | 'click') => {
    try {
      switch (action) {
        case 'read':
          await actions.markAsRead(notificationId);
          break;
        case 'dismiss':
          await actions.markAsDismissed(notificationId);
          break;
        case 'click':
          await actions.handleNotificationClick(notificationId);
          break;
      }
    } catch (error) {
      console.error('Failed to handle notification action:', error);
      Alert.alert('Error', 'Failed to update notification');
    }
  };

  const handleRefresh = async () => {
    await actions.refreshNotifications();
  };

  const handleWebSocketToggle = async () => {
    if (state.isWebSocketConnected) {
      actions.disconnectWebSocket();
      Alert.alert('Disconnected', 'Real-time sync has been disabled');
    } else {
      const connected = await actions.connectWebSocket();
      if (connected) {
        Alert.alert('Connected', 'Real-time sync is now active');
      } else {
        Alert.alert('Connection Failed', 'Could not connect to real-time sync');
      }
    }
  };

  if (selectedNotification) {
    return (
      <NotificationDetail
        notification={selectedNotification}
        onClose={() => setSelectedNotification(null)}
        onAction={handleNotificationAction}
      />
    );
  }

  return (
    <View className="flex-1 bg-gray-50">
      {/* Header */}
      <View className="bg-white border-b border-gray-200 px-4 py-3">
        <View className="flex-row justify-between items-center">
          <View>
            <Text className="text-2xl font-bold text-gray-900">Notifications</Text>
            <View className="flex-row items-center mt-1">
              <Text className="text-sm text-gray-600">
                {state.unreadCount} unread • {state.totalCount} total
              </Text>
              {state.lastSyncTime && (
                <Text className="text-sm text-gray-500 ml-2">
                  • Last sync: {new Date(state.lastSyncTime).toLocaleTimeString()}
                </Text>
              )}
            </View>
            {/* Capture Status */}
            <View className="flex-row items-center mt-1">
              <View className="w-2 h-2 rounded-full bg-green-500 mr-2" />
              <Text className="text-xs text-green-700 font-medium">
                📱 Capturing notifications
              </Text>
              <Text className="text-xs text-gray-500 ml-2">
                • {Platform.OS === 'android' ? 'Android Service Active' : 'iOS Listener Active'}
              </Text>
            </View>
          </View>

          <View className="flex-row items-center space-x-2">
            {/* WebSocket Status */}
            <TouchableOpacity
              onPress={handleWebSocketToggle}
              className={`px-3 py-1 rounded-full ${
                state.isWebSocketConnected 
                  ? 'bg-green-100 border border-green-300' 
                  : 'bg-gray-100 border border-gray-300'
              }`}
            >
              <View className="flex-row items-center">
                <View className={`w-2 h-2 rounded-full mr-2 ${
                  state.isWebSocketConnected ? 'bg-green-500' : 'bg-gray-400'
                }`} />
                <Text className={`text-xs font-medium ${
                  state.isWebSocketConnected ? 'text-green-800' : 'text-gray-600'
                }`}>
                  {state.isWebSocketConnected ? 'Live' : 'Offline'}
                </Text>
              </View>
            </TouchableOpacity>

            {/* Refresh Button */}
            <TouchableOpacity
              onPress={handleRefresh}
              disabled={state.isRefreshing}
              className="p-2 rounded-full bg-blue-100"
            >
              <Text className="text-blue-600 text-lg">
                {state.isRefreshing ? '⟳' : '↻'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Notification Capture Status */}
      <NotificationCaptureStatus />

      {/* Error Display */}
      {state.error && (
        <View className="bg-red-50 border-l-4 border-red-500 p-4 mx-4 mt-2 rounded">
          <View className="flex-row justify-between items-start">
            <View className="flex-1">
              <Text className="text-red-800 font-medium">Error</Text>
              <Text className="text-red-700 text-sm mt-1">{state.error}</Text>
            </View>
            <TouchableOpacity
              onPress={actions.clearError}
              className="ml-3 p-1"
            >
              <Text className="text-red-600 text-lg">×</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Loading State */}
      {state.isLoading && (
        <View className="flex-1 justify-center items-center">
          <Text className="text-lg text-gray-600">Loading notifications...</Text>
        </View>
      )}

      {/* Notification List */}
      {!state.isLoading && (
        <NotificationList
          notifications={state.notifications}
          onNotificationPress={handleNotificationPress}
          onNotificationAction={handleNotificationAction}
          refreshing={state.isRefreshing}
          onRefresh={handleRefresh}
          showCategories={true}
          selectedCategory={state.selectedCategory}
          onCategoryChange={actions.setSelectedCategory}
        />
      )}

      {/* Quick Stats */}
      {!state.isLoading && state.notifications.length > 0 && (
        <View className="bg-white border-t border-gray-200 p-4">
          <QuickStats notifications={state.notifications} />
        </View>
      )}
    </View>
  );
}

interface QuickStatsProps {
  notifications: SyncedNotification[];
}

function QuickStats({ notifications }: QuickStatsProps) {
  const stats = {
    total: notifications.length,
    unread: notifications.filter(n => !n.isRead).length,
    work: notifications.filter(n => n.category === 'Work').length,
    personal: notifications.filter(n => n.category === 'Personal').length,
    junk: notifications.filter(n => n.category === 'Junk').length,
    synced: notifications.filter(n => n.synced).length,
    local: notifications.filter(n => !n.synced).length,
  };

  const syncRate = stats.total > 0 ? (stats.synced / stats.total * 100).toFixed(1) : '0';
  const storageInfo = `${stats.local} Local, ${stats.synced} Cloud`;

  return (
    <View>
      <Text className="text-sm font-semibold text-gray-800 mb-2">Quick Stats</Text>
      <View className="flex-row justify-between">
        <StatItem label="Unread" value={stats.unread} color="text-blue-600" />
        <StatItem label="Work" value={stats.work} color="text-blue-600" />
        <StatItem label="Personal" value={stats.personal} color="text-green-600" />
        <StatItem label="Storage" value={storageInfo} color="text-purple-600" />
        <StatItem label="Sync Rate" value={`${syncRate}%`} color="text-orange-600" />
      </View>
    </View>
  );
}

interface StatItemProps {
  label: string;
  value: string | number;
  color: string;
}

function StatItem({ label, value, color }: StatItemProps) {
  return (
    <View className="items-center">
      <Text className={`text-lg font-bold ${color}`}>{value}</Text>
      <Text className="text-xs text-gray-600">{label}</Text>
    </View>
  );
}