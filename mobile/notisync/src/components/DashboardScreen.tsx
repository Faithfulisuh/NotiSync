import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { useNotificationCapture } from '../hooks/useNotificationCapture';

interface DashboardScreenProps {
  onNavigateToNotifications: () => void;
  onNavigateToSettings: () => void;
}

export const DashboardScreen: React.FC<DashboardScreenProps> = ({ 
  onNavigateToNotifications, 
  onNavigateToSettings 
}) => {
  const [state, actions] = useNotificationCapture();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await actions.refreshStats();
    await actions.refreshNotifications();
    setRefreshing(false);
  };

  // Mock data for demonstration
  const todayStats = {
    total: 24,
    work: 8,
    personal: 12,
    junk: 4,
    increase: '+12%'
  };

  const weeklyTrend = [
    { day: 'Mon', count: 18 },
    { day: 'Tue', count: 22 },
    { day: 'Wed', count: 15 },
    { day: 'Thu', count: 28 },
    { day: 'Fri', count: 24 },
    { day: 'Sat', count: 8 },
    { day: 'Sun', count: 12 },
  ];

  const topApps = [
    { name: 'WhatsApp', count: 8, icon: '💬' },
    { name: 'Gmail', count: 6, icon: '📧' },
    { name: 'Slack', count: 4, icon: '💼' },
    { name: 'Instagram', count: 3, icon: '📷' },
  ];

  return (
    <ScrollView 
      className="flex-1 bg-gray-50"
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      {/* Header */}
      <View className="bg-white px-6 pt-12 pb-6">
        <View className="flex-row justify-between items-center mb-4">
          <View>
            <Text className="text-2xl font-bold text-gray-900">Today</Text>
            <Text className="text-gray-500">
              {new Date().toLocaleDateString('en-US', { 
                weekday: 'long', 
                month: 'long', 
                day: 'numeric' 
              })}
            </Text>
          </View>
          <TouchableOpacity 
            onPress={onNavigateToSettings}
            className="w-10 h-10 bg-gray-100 rounded-full items-center justify-center"
          >
            <Text className="text-gray-600">⚙️</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Today's Overview Card */}
      <View className="mx-6 mb-6">
        <View className="bg-blue-600 rounded-2xl p-6">
          <View className="flex-row justify-between items-start mb-4">
            <View>
              <Text className="text-white text-lg font-medium">Today's Notifications</Text>
              <Text className="text-blue-100 text-sm">
                {state.isCapturing ? 'Capturing active' : 'Capture inactive'}
              </Text>
            </View>
            <TouchableOpacity 
              onPress={onNavigateToNotifications}
              className="bg-white bg-opacity-20 rounded-lg px-3 py-2"
            >
              <Text className="text-white font-medium">View all</Text>
            </TouchableOpacity>
          </View>
          
          <Text className="text-white text-4xl font-bold mb-2">{todayStats.total}</Text>
          <Text className="text-blue-100">
            ▲ {todayStats.increase} from yesterday
          </Text>
        </View>
      </View>

      {/* Categories Grid */}
      <View className="mx-6 mb-6">
        <Text className="text-lg font-semibold text-gray-900 mb-4">Categories</Text>
        <View className="flex-row space-x-3">
          <View className="flex-1 bg-white rounded-xl p-4">
            <Text className="text-2xl mb-1">💼</Text>
            <Text className="text-gray-500 text-sm">Work</Text>
            <Text className="text-xl font-bold text-gray-900">{todayStats.work}</Text>
          </View>
          <View className="flex-1 bg-white rounded-xl p-4">
            <Text className="text-2xl mb-1">👤</Text>
            <Text className="text-gray-500 text-sm">Personal</Text>
            <Text className="text-xl font-bold text-gray-900">{todayStats.personal}</Text>
          </View>
          <View className="flex-1 bg-white rounded-xl p-4">
            <Text className="text-2xl mb-1">🗑️</Text>
            <Text className="text-gray-500 text-sm">Junk</Text>
            <Text className="text-xl font-bold text-gray-900">{todayStats.junk}</Text>
          </View>
        </View>
      </View>

      {/* Weekly Trend */}
      <View className="mx-6 mb-6">
        <Text className="text-lg font-semibold text-gray-900 mb-4">This Week</Text>
        <View className="bg-white rounded-xl p-4">
          <View className="flex-row justify-between items-end h-24">
            {weeklyTrend.map((day, index) => (
              <View key={day.day} className="items-center">
                <View 
                  className="bg-blue-200 rounded-t-sm mb-2"
                  style={{ 
                    height: (day.count / 30) * 60, 
                    width: 20,
                    backgroundColor: index === 4 ? '#3B82F6' : '#DBEAFE' // Highlight today
                  }}
                />
                <Text className="text-xs text-gray-500">{day.day}</Text>
              </View>
            ))}
          </View>
        </View>
      </View>

      {/* Top Apps */}
      <View className="mx-6 mb-6">
        <Text className="text-lg font-semibold text-gray-900 mb-4">Top Apps Today</Text>
        <View className="bg-white rounded-xl">
          {topApps.map((app, index) => (
            <View 
              key={app.name} 
              className={`flex-row items-center justify-between p-4 ${
                index < topApps.length - 1 ? 'border-b border-gray-100' : ''
              }`}
            >
              <View className="flex-row items-center">
                <Text className="text-2xl mr-3">{app.icon}</Text>
                <Text className="text-gray-900 font-medium">{app.name}</Text>
              </View>
              <View className="bg-gray-100 rounded-full px-3 py-1">
                <Text className="text-gray-600 font-medium">{app.count}</Text>
              </View>
            </View>
          ))}
        </View>
      </View>

      {/* Capture Status */}
      <View className="mx-6 mb-8">
        <View className={`rounded-xl p-4 ${
          state.isCapturing ? 'bg-green-50 border border-green-200' : 'bg-orange-50 border border-orange-200'
        }`}>
          <View className="flex-row items-center">
            <Text className="text-2xl mr-3">
              {state.isCapturing ? '✅' : '⚠️'}
            </Text>
            <View className="flex-1">
              <Text className={`font-medium ${
                state.isCapturing ? 'text-green-800' : 'text-orange-800'
              }`}>
                {state.isCapturing ? 'Notification capture active' : 'Notification capture inactive'}
              </Text>
              <Text className={`text-sm ${
                state.isCapturing ? 'text-green-600' : 'text-orange-600'
              }`}>
                {state.isCapturing 
                  ? 'All notifications are being captured and synced'
                  : 'Enable notification capture to start monitoring'
                }
              </Text>
            </View>
          </View>
        </View>
      </View>

      {/* Development Note */}
      <View className="mx-6 mb-8">
        <View className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
          <Text className="text-yellow-800 font-medium mb-2">🚧 Development Mode</Text>
          <Text className="text-yellow-700 text-sm">
            Currently showing placeholder data. Cross-app notification capture is in development.
          </Text>
        </View>
      </View>
    </ScrollView>
  );
};