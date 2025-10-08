import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, TextInput, Modal } from 'react-native';
import { Notification } from '../types/notification';

interface NotificationHistoryProps {
  onBack: () => void;
}

interface HistoryNotification extends Notification {
  appName: string;
  isRead: boolean;
  isDismissed: boolean;
}

export const NotificationHistory: React.FC<NotificationHistoryProps> = ({ onBack }) => {
  const [notifications, setNotifications] = useState<HistoryNotification[]>([]);
  const [filteredNotifications, setFilteredNotifications] = useState<HistoryNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedNotification, setSelectedNotification] = useState<HistoryNotification | null>(null);

  const categories = ['all', 'Work', 'Personal', 'Junk'];

  useEffect(() => {
    loadNotificationHistory();
  }, []);

  useEffect(() => {
    filterNotifications();
  }, [notifications, searchQuery, selectedCategory]);

  const loadNotificationHistory = async () => {
    try {
      // TODO: Replace with actual API call
      const mockNotifications: HistoryNotification[] = [
        {
          id: '1',
          title: 'Your OTP code is 123456',
          body: 'Use this code to verify your account',
          appName: 'Banking App',
          category: 'Personal',
          timestamp: new Date(Date.now() - 1000 * 60 * 30).toISOString(), // 30 min ago
          isRead: true,
          isDismissed: false,
        },
        {
          id: '2',
          title: 'Meeting reminder',
          body: 'Team standup in 15 minutes',
          appName: 'Slack',
          category: 'Work',
          timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(), // 2 hours ago
          isRead: false,
          isDismissed: false,
        },
        {
          id: '3',
          title: '50% off sale!',
          body: 'Limited time offer on all items',
          appName: 'Shopping App',
          category: 'Junk',
          timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(), // 1 day ago
          isRead: true,
          isDismissed: true,
        },
        {
          id: '4',
          title: 'New message from John',
          body: 'Hey, are we still on for lunch?',
          appName: 'WhatsApp',
          category: 'Personal',
          timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(), // 2 days ago
          isRead: true,
          isDismissed: false,
        },
      ];
      setNotifications(mockNotifications);
    } catch (error) {
      console.error('Failed to load notification history:', error);
    } finally {
      setLoading(false);
    }
  };

  const filterNotifications = () => {
    let filtered = notifications;

    // Filter by category
    if (selectedCategory !== 'all') {
      filtered = filtered.filter(n => n.category === selectedCategory);
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(n => 
        n.title.toLowerCase().includes(query) ||
        n.body.toLowerCase().includes(query) ||
        n.appName.toLowerCase().includes(query)
      );
    }

    setFilteredNotifications(filtered);
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    return `${Math.floor(diffMins / 1440)}d ago`;
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'Work': return 'bg-blue-100 text-blue-700';
      case 'Personal': return 'bg-green-100 text-green-700';
      case 'Junk': return 'bg-red-100 text-red-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const renderNotification = ({ item }: { item: HistoryNotification }) => (
    <TouchableOpacity
      onPress={() => setSelectedNotification(item)}
      className={`bg-white p-4 mb-3 rounded-lg border ${item.isRead ? 'border-gray-200' : 'border-blue-300 bg-blue-50'}`}
    >
      <View className="flex-row items-start justify-between mb-2">
        <View className="flex-1 mr-3">
          <Text className={`text-base font-pmedium text-slate-800 ${!item.isRead ? 'font-pbold' : ''}`}>
            {item.title}
          </Text>
          <Text className="text-sm text-gray-600 font-pregular mt-1" numberOfLines={2}>
            {item.body}
          </Text>
        </View>
        <View className="items-end">
          <Text className={`text-xs px-2 py-1 rounded-full font-pmedium ${getCategoryColor(item.category)}`}>
            {item.category}
          </Text>
        </View>
      </View>
      
      <View className="flex-row items-center justify-between">
        <Text className="text-xs text-gray-500 font-pregular">{item.appName}</Text>
        <View className="flex-row items-center">
          <Text className="text-xs text-gray-500 font-pregular mr-2">
            {formatTimestamp(item.timestamp)}
          </Text>
          {item.isDismissed && (
            <Text className="text-xs text-red-500 font-pmedium">Dismissed</Text>
          )}
          {!item.isRead && (
            <View className="w-2 h-2 bg-blue-500 rounded-full ml-2" />
          )}
        </View>
      </View>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View className="flex-1 justify-center items-center bg-gray-50">
        <Text className="text-gray-600 font-pregular">Loading history...</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-gray-50">
      <View className="bg-white p-4 border-b border-gray-200">
        <View className="flex-row items-center mb-4">
          <TouchableOpacity onPress={onBack} className="mr-4">
            <Text className="text-blue-600 font-pmedium text-base">← Back</Text>
          </TouchableOpacity>
          <Text className="text-lg font-pbold text-slate-800">Notification History</Text>
        </View>

        {/* Search Bar */}
        <TextInput
          className="border border-gray-300 rounded-lg p-3 text-base mb-3"
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search notifications..."
        />

        {/* Category Filter */}
        <View className="flex-row space-x-2">
          {categories.map((category) => (
            <TouchableOpacity
              key={category}
              onPress={() => setSelectedCategory(category)}
              className={`px-3 py-2 rounded-lg ${selectedCategory === category ? 'bg-blue-600' : 'bg-gray-200'}`}
            >
              <Text className={`text-sm font-pmedium ${selectedCategory === category ? 'text-white' : 'text-gray-700'}`}>
                {category === 'all' ? 'All' : category}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View className="flex-1 p-4">
        <Text className="text-sm text-gray-600 font-pregular mb-4">
          {filteredNotifications.length} notification{filteredNotifications.length !== 1 ? 's' : ''} found
        </Text>

        <FlatList
          data={filteredNotifications}
          renderItem={renderNotification}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View className="bg-white p-6 rounded-lg border border-gray-200 items-center">
              <Text className="text-gray-500 font-pregular text-center">
                {searchQuery || selectedCategory !== 'all' 
                  ? 'No notifications match your search criteria.'
                  : 'No notification history available.'
                }
              </Text>
            </View>
          }
        />
      </View>

      {/* Notification Detail Modal */}
      <Modal
        visible={selectedNotification !== null}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        {selectedNotification && (
          <View className="flex-1 bg-white">
            <View className="p-4 border-b border-gray-200">
              <View className="flex-row items-center justify-between">
                <TouchableOpacity onPress={() => setSelectedNotification(null)}>
                  <Text className="text-blue-600 font-pmedium">Close</Text>
                </TouchableOpacity>
                <Text className="text-lg font-pbold text-slate-800">Notification Details</Text>
                <View style={{ width: 50 }} />
              </View>
            </View>

            <View className="p-4">
              <View className="bg-gray-50 p-4 rounded-lg mb-4">
                <Text className="text-lg font-pbold text-slate-800 mb-2">
                  {selectedNotification.title}
                </Text>
                <Text className="text-base text-gray-700 font-pregular mb-3">
                  {selectedNotification.body}
                </Text>
                
                <View className="flex-row items-center justify-between">
                  <Text className="text-sm text-gray-600 font-pregular">
                    From: {selectedNotification.appName}
                  </Text>
                  <Text className={`text-xs px-2 py-1 rounded-full font-pmedium ${getCategoryColor(selectedNotification.category)}`}>
                    {selectedNotification.category}
                  </Text>
                </View>
              </View>

              <View className="bg-white border border-gray-200 rounded-lg p-4">
                <Text className="text-sm font-pmedium text-slate-800 mb-2">Notification Info</Text>
                <Text className="text-sm text-gray-600 font-pregular mb-1">
                  Received: {new Date(selectedNotification.timestamp).toLocaleString()}
                </Text>
                <Text className="text-sm text-gray-600 font-pregular mb-1">
                  Status: {selectedNotification.isRead ? 'Read' : 'Unread'}
                  {selectedNotification.isDismissed && ' • Dismissed'}
                </Text>
              </View>
            </View>
          </View>
        )}
      </Modal>
    </View>
  );
};