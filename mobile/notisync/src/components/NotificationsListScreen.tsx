import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl, TextInput } from 'react-native';
import { useNotificationCapture } from '../hooks/useNotificationCapture';

interface NotificationsListScreenProps {
  onBack: () => void;
}

export const NotificationsListScreen: React.FC<NotificationsListScreenProps> = ({ onBack }) => {
  const [state, actions] = useNotificationCapture();
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'work' | 'personal' | 'junk'>('all');

  const onRefresh = async () => {
    setRefreshing(true);
    await actions.refreshNotifications();
    setRefreshing(false);
  };

  // Mock notifications data for demonstration
  const mockNotifications = [
    {
      id: '1',
      appName: 'WhatsApp',
      title: 'John Doe',
      body: 'Hey, are we still on for the meeting tomorrow?',
      timestamp: Date.now() - 300000, // 5 minutes ago
      category: 'personal',
      icon: '💬',
      isRead: false,
    },
    {
      id: '2',
      appName: 'Gmail',
      title: 'Project Update Required',
      body: 'Please review and update the Q4 project proposal by EOD.',
      timestamp: Date.now() - 900000, // 15 minutes ago
      category: 'work',
      icon: '📧',
      isRead: false,
    },
    {
      id: '3',
      appName: 'Slack',
      title: 'Design Team',
      body: 'New mockups are ready for review in Figma',
      timestamp: Date.now() - 1800000, // 30 minutes ago
      category: 'work',
      icon: '💼',
      isRead: true,
    },
    {
      id: '4',
      appName: 'Instagram',
      title: 'sarah_designs liked your photo',
      body: 'Your photo from yesterday got a new like',
      timestamp: Date.now() - 3600000, // 1 hour ago
      category: 'personal',
      icon: '📷',
      isRead: true,
    },
    {
      id: '5',
      appName: 'Amazon',
      title: 'Your order has been shipped',
      body: 'Track your package: Wireless headphones will arrive tomorrow',
      timestamp: Date.now() - 7200000, // 2 hours ago
      category: 'personal',
      icon: '📦',
      isRead: false,
    },
    {
      id: '6',
      appName: 'Promotional App',
      title: '50% OFF Everything!',
      body: 'Limited time offer - shop now and save big on all items',
      timestamp: Date.now() - 10800000, // 3 hours ago
      category: 'junk',
      icon: '🛍️',
      isRead: true,
    },
  ];

  const filteredNotifications = mockNotifications.filter(notification => {
    const matchesSearch = notification.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         notification.body.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         notification.appName.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesFilter = selectedFilter === 'all' || notification.category === selectedFilter;
    
    return matchesSearch && matchesFilter;
  });

  const formatTime = (timestamp: number) => {
    const now = Date.now();
    const diff = now - timestamp;
    
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return new Date(timestamp).toLocaleDateString();
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'work': return 'bg-blue-100 text-blue-800';
      case 'personal': return 'bg-green-100 text-green-800';
      case 'junk': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const filters = [
    { key: 'all', label: 'All', count: mockNotifications.length },
    { key: 'work', label: 'Work', count: mockNotifications.filter(n => n.category === 'work').length },
    { key: 'personal', label: 'Personal', count: mockNotifications.filter(n => n.category === 'personal').length },
    { key: 'junk', label: 'Junk', count: mockNotifications.filter(n => n.category === 'junk').length },
  ];

  return (
    <View className="flex-1 bg-gray-50">
      {/* Header */}
      <View className="bg-white px-6 pt-12 pb-4">
        <View className="flex-row items-center mb-4">
          <TouchableOpacity 
            onPress={onBack}
            className="w-10 h-10 bg-gray-100 rounded-full items-center justify-center mr-4"
          >
            <Text className="text-gray-600">←</Text>
          </TouchableOpacity>
          <Text className="text-2xl font-bold text-gray-900">Notifications</Text>
        </View>

        {/* Search Bar */}
        <View className="bg-gray-50 rounded-xl px-4 py-3 mb-4">
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search notifications..."
            className="text-gray-900"
          />
        </View>

        {/* Filter Tabs */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-2">
          <View className="flex-row space-x-3">
            {filters.map((filter) => (
              <TouchableOpacity
                key={filter.key}
                onPress={() => setSelectedFilter(filter.key as any)}
                className={`px-4 py-2 rounded-full ${
                  selectedFilter === filter.key
                    ? 'bg-blue-600'
                    : 'bg-gray-100'
                }`}
              >
                <Text className={`font-medium ${
                  selectedFilter === filter.key
                    ? 'text-white'
                    : 'text-gray-600'
                }`}>
                  {filter.label} ({filter.count})
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </View>

      {/* Notifications List */}
      <ScrollView
        className="flex-1"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {filteredNotifications.length === 0 ? (
          <View className="flex-1 items-center justify-center py-20">
            <Text className="text-6xl mb-4">📭</Text>
            <Text className="text-xl font-semibold text-gray-900 mb-2">No notifications</Text>
            <Text className="text-gray-500 text-center">
              {searchQuery ? 'No notifications match your search' : 'You\'re all caught up!'}
            </Text>
          </View>
        ) : (
          <View className="px-6 pb-6">
            {filteredNotifications.map((notification, index) => (
              <TouchableOpacity
                key={notification.id}
                className={`bg-white rounded-xl p-4 mb-3 ${
                  !notification.isRead ? 'border-l-4 border-blue-500' : ''
                }`}
              >
                <View className="flex-row items-start">
                  <Text className="text-2xl mr-3">{notification.icon}</Text>
                  <View className="flex-1">
                    <View className="flex-row items-center justify-between mb-1">
                      <Text className="font-medium text-gray-900">{notification.appName}</Text>
                      <Text className="text-xs text-gray-500">{formatTime(notification.timestamp)}</Text>
                    </View>
                    <Text className={`font-semibold mb-1 ${
                      !notification.isRead ? 'text-gray-900' : 'text-gray-600'
                    }`}>
                      {notification.title}
                    </Text>
                    <Text className={`text-sm mb-2 ${
                      !notification.isRead ? 'text-gray-700' : 'text-gray-500'
                    }`}>
                      {notification.body}
                    </Text>
                    <View className="flex-row items-center justify-between">
                      <View className={`px-2 py-1 rounded-full ${getCategoryColor(notification.category)}`}>
                        <Text className="text-xs font-medium capitalize">{notification.category}</Text>
                      </View>
                      {!notification.isRead && (
                        <View className="w-2 h-2 bg-blue-500 rounded-full" />
                      )}
                    </View>
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Development Note */}
        <View className="mx-6 mb-6">
          <View className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
            <Text className="text-yellow-800 font-medium mb-2">🚧 Development Mode</Text>
            <Text className="text-yellow-700 text-sm">
              Showing mock notifications. Real notifications will appear here once cross-app capture is implemented.
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
};