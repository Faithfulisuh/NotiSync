import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Alert,
  Share,
  Platform,
} from 'react-native';
import { SyncedNotification } from '../types/notification';
import { apiService } from '../services/api';

interface NotificationDetailProps {
  notification: SyncedNotification;
  onClose: () => void;
  onAction?: (notificationId: string, action: 'read' | 'dismiss' | 'click') => void;
}

export function NotificationDetail({ notification, onClose, onAction }: NotificationDetailProps) {
  const handleAction = async (action: 'read' | 'dismiss' | 'click') => {
    try {
      if (onAction) {
        onAction(notification.id, action);
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

  const handleShare = async () => {
    try {
      const message = `${notification.title}\n\n${notification.body}\n\nFrom: ${notification.appName}`;
      
      if (Platform.OS === 'web') {
        // Web share API or fallback to clipboard
        if (navigator.share) {
          await navigator.share({
            title: notification.title,
            text: notification.body,
          });
        } else {
          await navigator.clipboard.writeText(message);
          Alert.alert('Copied', 'Notification content copied to clipboard');
        }
      } else {
        // Native share
        await Share.share({
          message,
          title: notification.title,
        });
      }
    } catch (error) {
      console.error('Failed to share notification:', error);
      Alert.alert('Error', 'Failed to share notification');
    }
  };

  const formatFullDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  const getCategoryIcon = (category?: string) => {
    switch (category) {
      case 'Work': return '💼';
      case 'Personal': return '👤';
      case 'Junk': return '🗑️';
      default: return '📱';
    }
  };

  const getCategoryColor = (category?: string) => {
    switch (category) {
      case 'Work': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'Personal': return 'bg-green-100 text-green-800 border-green-200';
      case 'Junk': return 'bg-gray-100 text-gray-600 border-gray-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getPriorityText = (priority: number) => {
    switch (priority) {
      case 0: return 'Low';
      case 1: return 'Normal';
      case 2: return 'High';
      case 3: return 'Urgent';
      default: return 'Normal';
    }
  };

  const getPriorityColor = (priority: number) => {
    switch (priority) {
      case 0: return 'bg-gray-100 text-gray-600';
      case 1: return 'bg-blue-100 text-blue-600';
      case 2: return 'bg-orange-100 text-orange-600';
      case 3: return 'bg-red-100 text-red-600';
      default: return 'bg-blue-100 text-blue-600';
    }
  };

  return (
    <View className="flex-1 bg-white">
      {/* Header */}
      <View className="flex-row justify-between items-center p-4 border-b border-gray-200 bg-gray-50">
        <TouchableOpacity onPress={onClose} className="p-2 -ml-2">
          <Text className="text-blue-600 text-lg">← Back</Text>
        </TouchableOpacity>
        
        <Text className="text-lg font-semibold text-gray-800">Notification</Text>
        
        <TouchableOpacity onPress={handleShare} className="p-2 -mr-2">
          <Text className="text-blue-600 text-lg">Share</Text>
        </TouchableOpacity>
      </View>

      <ScrollView className="flex-1">
        {/* App Info */}
        <View className="p-4 border-b border-gray-100">
          <View className="flex-row items-center justify-between mb-3">
            <View className="flex-row items-center flex-1">
              <View className="w-12 h-12 bg-gray-200 rounded-lg items-center justify-center mr-3">
                <Text className="text-xl">📱</Text>
              </View>
              <View className="flex-1">
                <Text className="text-lg font-semibold text-gray-900">
                  {notification.appName}
                </Text>
                <Text className="text-sm text-gray-600">
                  {formatFullDate(notification.timestamp)}
                </Text>
              </View>
            </View>
            
            {/* Status indicators */}
            <View className="flex-row items-center space-x-2">
              {!notification.isRead && (
                <View className="w-3 h-3 bg-blue-500 rounded-full" />
              )}
              {notification.synced && (
                <View className="bg-green-100 px-2 py-1 rounded">
                  <Text className="text-green-800 text-xs font-medium">Synced</Text>
                </View>
              )}
            </View>
          </View>

          {/* Tags */}
          <View className="flex-row flex-wrap gap-2">
            {notification.category && (
              <View className={`px-3 py-1 rounded-full border ${getCategoryColor(notification.category)}`}>
                <Text className="text-sm font-medium">
                  {getCategoryIcon(notification.category)} {notification.category}
                </Text>
              </View>
            )}
            
            <View className={`px-3 py-1 rounded-full ${getPriorityColor(notification.priority)}`}>
              <Text className="text-sm font-medium">
                {getPriorityText(notification.priority)} Priority
              </Text>
            </View>

            {notification.isDismissed && (
              <View className="bg-gray-100 px-3 py-1 rounded-full">
                <Text className="text-gray-600 text-sm font-medium">Dismissed</Text>
              </View>
            )}
          </View>
        </View>

        {/* Content */}
        <View className="p-4">
          <Text className="text-xl font-bold text-gray-900 mb-4">
            {notification.title}
          </Text>
          
          {notification.body && (
            <Text className="text-gray-700 text-base leading-6 mb-6">
              {notification.body}
            </Text>
          )}

          {/* Technical Details */}
          <View className="bg-gray-50 rounded-lg p-4 mb-4">
            <Text className="text-lg font-semibold text-gray-800 mb-3">Details</Text>
            
            <DetailRow label="Notification ID" value={notification.id} />
            {notification.serverId && (
              <DetailRow label="Server ID" value={notification.serverId} />
            )}
            <DetailRow label="Package Name" value={notification.packageName || 'Unknown'} />
            <DetailRow label="Priority Level" value={notification.priority.toString()} />
            <DetailRow 
              label="Sync Status" 
              value={notification.synced ? 'Synced' : 'Pending'} 
            />
            <DetailRow 
              label="Sync Attempts" 
              value={notification.syncAttempts.toString()} 
            />
            {notification.lastSyncAttempt && (
              <DetailRow 
                label="Last Sync Attempt" 
                value={formatFullDate(notification.lastSyncAttempt)} 
              />
            )}
          </View>

          {/* Additional Data */}
          {notification.extras && Object.keys(notification.extras).length > 0 && (
            <View className="bg-gray-50 rounded-lg p-4 mb-4">
              <Text className="text-lg font-semibold text-gray-800 mb-3">Additional Data</Text>
              {Object.entries(notification.extras).map(([key, value]) => (
                <DetailRow 
                  key={key} 
                  label={key} 
                  value={typeof value === 'object' ? JSON.stringify(value) : String(value)} 
                />
              ))}
            </View>
          )}

          {/* Actions */}
          {notification.actions && notification.actions.length > 0 && (
            <View className="bg-gray-50 rounded-lg p-4 mb-4">
              <Text className="text-lg font-semibold text-gray-800 mb-3">Available Actions</Text>
              {notification.actions.map((action, index) => (
                <View key={index} className="mb-2">
                  <Text className="font-medium text-gray-700">{action.title}</Text>
                  <Text className="text-sm text-gray-600">Type: {action.type}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      {/* Action Buttons */}
      <View className="p-4 border-t border-gray-200 bg-gray-50">
        <View className="flex-row space-x-3">
          {!notification.isRead && (
            <TouchableOpacity
              onPress={() => handleAction('read')}
              className="flex-1 bg-blue-600 py-3 rounded-lg"
            >
              <Text className="text-white text-center font-semibold">Mark as Read</Text>
            </TouchableOpacity>
          )}
          
          {!notification.isDismissed && (
            <TouchableOpacity
              onPress={() => handleAction('dismiss')}
              className="flex-1 bg-gray-600 py-3 rounded-lg"
            >
              <Text className="text-white text-center font-semibold">Dismiss</Text>
            </TouchableOpacity>
          )}
          
          <TouchableOpacity
            onPress={() => handleAction('click')}
            className="flex-1 bg-green-600 py-3 rounded-lg"
          >
            <Text className="text-white text-center font-semibold">Open</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

interface DetailRowProps {
  label: string;
  value: string;
}

function DetailRow({ label, value }: DetailRowProps) {
  return (
    <View className="flex-row justify-between items-start py-2 border-b border-gray-200 last:border-b-0">
      <Text className="text-sm font-medium text-gray-600 flex-1 mr-3">
        {label}:
      </Text>
      <Text className="text-sm text-gray-800 flex-2 text-right" numberOfLines={3}>
        {value}
      </Text>
    </View>
  );
}