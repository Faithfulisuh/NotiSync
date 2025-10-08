import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  Alert,
  Platform,
} from 'react-native';
import { SyncedNotification, NotificationStats } from '../types/notification';
import { apiService } from '../services/api';

interface NotificationListProps {
  notifications: SyncedNotification[];
  onNotificationPress?: (notification: SyncedNotification) => void;
  onNotificationAction?: (notificationId: string, action: 'read' | 'dismiss' | 'click') => void;
  refreshing?: boolean;
  onRefresh?: () => void;
  showCategories?: boolean;
  selectedCategory?: 'Work' | 'Personal' | 'Junk' | 'All';
  onCategoryChange?: (category: 'Work' | 'Personal' | 'Junk' | 'All') => void;
}

export function NotificationList({
  notifications,
  onNotificationPress,
  onNotificationAction,
  refreshing = false,
  onRefresh,
  showCategories = true,
  selectedCategory = 'All',
  onCategoryChange,
}: NotificationListProps) {
  const [expandedNotifications, setExpandedNotifications] = useState<Set<string>>(new Set());

  // Filter notifications by category
  const filteredNotifications = notifications.filter(notification => {
    if (selectedCategory === 'All') return true;
    return notification.category === selectedCategory;
  });

  // Group notifications by category
  const groupedNotifications = filteredNotifications.reduce((groups, notification) => {
    const category = notification.category || 'Personal';
    if (!groups[category]) {
      groups[category] = [];
    }
    groups[category].push(notification);
    return groups;
  }, {} as Record<string, SyncedNotification[]>);

  const handleNotificationPress = (notification: SyncedNotification) => {
    if (onNotificationPress) {
      onNotificationPress(notification);
    } else {
      // Default behavior: expand/collapse notification
      const newExpanded = new Set(expandedNotifications);
      if (newExpanded.has(notification.id)) {
        newExpanded.delete(notification.id);
      } else {
        newExpanded.add(notification.id);
      }
      setExpandedNotifications(newExpanded);
    }

    // Mark as read if not already read
    if (!notification.isRead && onNotificationAction) {
      onNotificationAction(notification.id, 'read');
    }
  };

  const handleNotificationAction = async (
    notification: SyncedNotification,
    action: 'read' | 'dismiss' | 'click'
  ) => {
    try {
      if (onNotificationAction) {
        onNotificationAction(notification.id, action);
      }

      // Also sync to server if available
      if (apiService.isAuthenticated() && notification.serverId) {
        await apiService.updateNotificationStatus(notification.serverId, action);
      }
    } catch (error) {
      console.error('Failed to handle notification action:', error);
      Alert.alert('Error', 'Failed to update notification status');
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'Work': return '💼';
      case 'Personal': return '👤';
      case 'Junk': return '🗑️';
      default: return '📱';
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'Work': return 'bg-blue-100 border-blue-200';
      case 'Personal': return 'bg-green-100 border-green-200';
      case 'Junk': return 'bg-gray-100 border-gray-200';
      default: return 'bg-gray-100 border-gray-200';
    }
  };

  const getCategoryTextColor = (category: string) => {
    switch (category) {
      case 'Work': return 'text-blue-800';
      case 'Personal': return 'text-green-800';
      case 'Junk': return 'text-gray-600';
      default: return 'text-gray-800';
    }
  };

  if (notifications.length === 0) {
    return (
      <ScrollView
        className="flex-1"
        refreshControl={
          onRefresh ? (
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          ) : undefined
        }
      >
        <View className="flex-1 justify-center items-center p-8">
          <Text className="text-6xl mb-4">📭</Text>
          <Text className="text-xl font-semibold text-gray-800 mb-2">
            No Notifications
          </Text>
          <Text className="text-gray-600 text-center">
            You're all caught up! New notifications will appear here.
          </Text>
        </View>
      </ScrollView>
    );
  }

  return (
    <View className="flex-1">
      {/* Category Filter */}
      {showCategories && onCategoryChange && (
        <CategoryFilter
          selectedCategory={selectedCategory}
          onCategoryChange={onCategoryChange}
          notifications={notifications}
        />
      )}

      <ScrollView
        className="flex-1"
        refreshControl={
          onRefresh ? (
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          ) : undefined
        }
      >
        {selectedCategory === 'All' ? (
          // Show grouped by category
          Object.entries(groupedNotifications)
            .sort(([a], [b]) => {
              const order = { Work: 0, Personal: 1, Junk: 2 };
              return (order[a as keyof typeof order] || 3) - (order[b as keyof typeof order] || 3);
            })
            .map(([category, categoryNotifications]) => (
              <View key={category} className="mb-4">
                <View className="flex-row items-center px-4 py-2 bg-gray-50">
                  <Text className="text-lg">
                    {getCategoryIcon(category)}
                  </Text>
                  <Text className="text-lg font-semibold text-gray-800 ml-2">
                    {category}
                  </Text>
                  <Text className="text-sm text-gray-600 ml-2">
                    ({categoryNotifications.length})
                  </Text>
                </View>
                {categoryNotifications.map((notification) => (
                  <NotificationItem
                    key={notification.id}
                    notification={notification}
                    isExpanded={expandedNotifications.has(notification.id)}
                    onPress={() => handleNotificationPress(notification)}
                    onAction={(action) => handleNotificationAction(notification, action)}
                  />
                ))}
              </View>
            ))
        ) : (
          // Show flat list for specific category
          filteredNotifications.map((notification) => (
            <NotificationItem
              key={notification.id}
              notification={notification}
              isExpanded={expandedNotifications.has(notification.id)}
              onPress={() => handleNotificationPress(notification)}
              onAction={(action) => handleNotificationAction(notification, action)}
            />
          ))
        )}
      </ScrollView>
    </View>
  );
}

interface CategoryFilterProps {
  selectedCategory: 'Work' | 'Personal' | 'Junk' | 'All';
  onCategoryChange: (category: 'Work' | 'Personal' | 'Junk' | 'All') => void;
  notifications: SyncedNotification[];
}

function CategoryFilter({ selectedCategory, onCategoryChange, notifications }: CategoryFilterProps) {
  const categories = ['All', 'Work', 'Personal', 'Junk'] as const;
  
  const getCategoryCount = (category: string) => {
    if (category === 'All') return notifications.length;
    return notifications.filter(n => n.category === category).length;
  };

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      className="bg-white border-b border-gray-200"
      contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12 }}
    >
      {categories.map((category) => {
        const isSelected = selectedCategory === category;
        const count = getCategoryCount(category);
        
        return (
          <TouchableOpacity
            key={category}
            onPress={() => onCategoryChange(category)}
            className={`
              px-4 py-2 rounded-full mr-3 border
              ${isSelected 
                ? 'bg-blue-600 border-blue-600' 
                : 'bg-white border-gray-300'
              }
            `}
          >
            <View className="flex-row items-center">
              <Text className="text-lg mr-1">
                {category === 'All' ? '📱' : 
                 category === 'Work' ? '💼' :
                 category === 'Personal' ? '👤' : '🗑️'}
              </Text>
              <Text className={`
                font-medium
                ${isSelected ? 'text-white' : 'text-gray-700'}
              `}>
                {category}
              </Text>
              {count > 0 && (
                <Text className={`
                  text-sm ml-1
                  ${isSelected ? 'text-blue-200' : 'text-gray-500'}
                `}>
                  ({count})
                </Text>
              )}
            </View>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

interface NotificationItemProps {
  notification: SyncedNotification;
  isExpanded: boolean;
  onPress: () => void;
  onAction: (action: 'read' | 'dismiss' | 'click') => void;
}

function NotificationItem({ notification, isExpanded, onPress, onAction }: NotificationItemProps) {
  const getCategoryColor = (category?: string) => {
    switch (category) {
      case 'Work': return 'border-l-blue-500';
      case 'Personal': return 'border-l-green-500';
      case 'Junk': return 'border-l-gray-400';
      default: return 'border-l-gray-400';
    }
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <TouchableOpacity
      onPress={onPress}
      className={`
        bg-white border-l-4 ${getCategoryColor(notification.category)}
        ${notification.isRead ? 'opacity-75' : ''}
        ${notification.isDismissed ? 'opacity-50' : ''}
      `}
    >
      <View className="p-4 border-b border-gray-100">
        {/* Header */}
        <View className="flex-row justify-between items-start mb-2">
          <View className="flex-1 mr-3">
            <View className="flex-row items-center mb-1">
              <Text className="font-semibold text-gray-800 flex-1" numberOfLines={1}>
                {notification.appName}
              </Text>
              <View className="flex-row items-center space-x-2">
                {!notification.isRead && (
                  <View className="w-2 h-2 bg-blue-500 rounded-full" />
                )}
                {notification.priority > 1 && (
                  <Text className="text-orange-500 text-xs">
                    {'⚡'.repeat(notification.priority)}
                  </Text>
                )}
                {notification.synced && (
                  <Text className="text-green-500 text-xs">✓</Text>
                )}
              </View>
            </View>
            <Text className="text-xs text-gray-500">
              {formatTime(notification.timestamp)}
            </Text>
          </View>
        </View>

        {/* Content */}
        <View className="mb-3">
          <Text className="font-medium text-gray-900 mb-1" numberOfLines={isExpanded ? undefined : 2}>
            {notification.title}
          </Text>
          {notification.body && (
            <Text 
              className="text-gray-700 text-sm" 
              numberOfLines={isExpanded ? undefined : 3}
            >
              {notification.body}
            </Text>
          )}
        </View>

        {/* Actions */}
        <View className="flex-row justify-between items-center">
          <View className="flex-row space-x-3">
            {!notification.isRead && (
              <TouchableOpacity
                onPress={(e) => {
                  e.stopPropagation();
                  onAction('read');
                }}
                className="bg-blue-100 px-3 py-1 rounded-full"
              >
                <Text className="text-blue-800 text-xs font-medium">Mark Read</Text>
              </TouchableOpacity>
            )}
            
            {!notification.isDismissed && (
              <TouchableOpacity
                onPress={(e) => {
                  e.stopPropagation();
                  onAction('dismiss');
                }}
                className="bg-gray-100 px-3 py-1 rounded-full"
              >
                <Text className="text-gray-700 text-xs font-medium">Dismiss</Text>
              </TouchableOpacity>
            )}
          </View>

          <View className="flex-row items-center space-x-2">
            {notification.category && (
              <View className={`px-2 py-1 rounded ${
                notification.category === 'Work' ? 'bg-blue-100' :
                notification.category === 'Personal' ? 'bg-green-100' : 'bg-gray-100'
              }`}>
                <Text className={`text-xs font-medium ${
                  notification.category === 'Work' ? 'text-blue-800' :
                  notification.category === 'Personal' ? 'text-green-800' : 'text-gray-600'
                }`}>
                  {notification.category}
                </Text>
              </View>
            )}
            
            <Text className="text-gray-400 text-xs">
              {isExpanded ? '▼' : '▶'}
            </Text>
          </View>
        </View>

        {/* Expanded content */}
        {isExpanded && notification.extras && Object.keys(notification.extras).length > 0 && (
          <View className="mt-3 pt-3 border-t border-gray-100">
            <Text className="text-xs font-medium text-gray-600 mb-2">Additional Info:</Text>
            {Object.entries(notification.extras).map(([key, value]) => (
              <Text key={key} className="text-xs text-gray-500 mb-1">
                {key}: {String(value)}
              </Text>
            ))}
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}