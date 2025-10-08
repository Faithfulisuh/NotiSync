import { useState, useEffect, useCallback } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { SyncedNotification } from '../types/notification';
import { apiService } from '../services/api';
import { webSocketService, WebSocketMessage, NotificationUpdate } from '../services/websocket';
import { notificationCaptureService } from '../services/notificationCapture';

export interface NotificationDisplayState {
  notifications: SyncedNotification[];
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
  selectedCategory: 'Work' | 'Personal' | 'Junk' | 'All';
  isWebSocketConnected: boolean;
  lastSyncTime: number | null;
  unreadCount: number;
  totalCount: number;
}

export interface NotificationDisplayActions {
  refreshNotifications: () => Promise<void>;
  loadMoreNotifications: () => Promise<void>;
  markAsRead: (notificationId: string) => Promise<void>;
  markAsDismissed: (notificationId: string) => Promise<void>;
  handleNotificationClick: (notificationId: string) => Promise<void>;
  setSelectedCategory: (category: 'Work' | 'Personal' | 'Junk' | 'All') => void;
  connectWebSocket: () => Promise<boolean>;
  disconnectWebSocket: () => void;
  clearError: () => void;
}

export function useNotificationDisplay(): [NotificationDisplayState, NotificationDisplayActions] {
  const [state, setState] = useState<NotificationDisplayState>({
    notifications: [],
    isLoading: true,
    isRefreshing: false,
    error: null,
    selectedCategory: 'All',
    isWebSocketConnected: false,
    lastSyncTime: null,
    unreadCount: 0,
    totalCount: 0,
  });

  const [hasMore, setHasMore] = useState(true);
  const [currentOffset, setCurrentOffset] = useState(0);
  const NOTIFICATIONS_PER_PAGE = 50;

  // Load notifications from local storage and server
  const loadNotifications = useCallback(async (offset = 0, append = false) => {
    try {
      setState(prev => ({ 
        ...prev, 
        isLoading: offset === 0 && !append,
        isRefreshing: offset === 0 && append,
        error: null 
      }));

      // Get local notifications first
      const localNotifications = await notificationCaptureService.getRecentNotifications(1000);
      
      // Get server notifications if authenticated
      let serverNotifications: any[] = [];
      if (apiService.isAuthenticated()) {
        try {
          const response = await apiService.getNotifications(NOTIFICATIONS_PER_PAGE, offset);
          if (response.success && response.data) {
            serverNotifications = response.data.notifications || [];
          }
        } catch (error) {
          console.warn('Failed to load server notifications:', error);
        }
      }

      // Merge and deduplicate notifications
      const allNotifications = mergeNotifications(localNotifications, serverNotifications);
      
      // Sort by timestamp (newest first)
      allNotifications.sort((a, b) => b.timestamp - a.timestamp);

      const newNotifications = append 
        ? [...state.notifications, ...allNotifications]
        : allNotifications;

      // Remove duplicates
      const uniqueNotifications = removeDuplicateNotifications(newNotifications);

      // Calculate stats
      const unreadCount = uniqueNotifications.filter(n => !n.isRead).length;
      const totalCount = uniqueNotifications.length;

      setState(prev => ({
        ...prev,
        notifications: uniqueNotifications,
        isLoading: false,
        isRefreshing: false,
        lastSyncTime: Date.now(),
        unreadCount,
        totalCount,
      }));

      setHasMore(serverNotifications.length === NOTIFICATIONS_PER_PAGE);
      setCurrentOffset(append ? offset + NOTIFICATIONS_PER_PAGE : NOTIFICATIONS_PER_PAGE);

    } catch (error) {
      console.error('Failed to load notifications:', error);
      setState(prev => ({
        ...prev,
        isLoading: false,
        isRefreshing: false,
        error: error instanceof Error ? error.message : 'Failed to load notifications',
      }));
    }
  }, [state.notifications]);

  // Merge local and server notifications
  const mergeNotifications = (
    local: SyncedNotification[], 
    server: any[]
  ): SyncedNotification[] => {
    const merged: SyncedNotification[] = [...local];

    server.forEach(serverNotification => {
      // Try to find matching local notification
      const existingIndex = merged.findIndex(
        local => local.serverId === serverNotification.id ||
                 (local.title === serverNotification.title && 
                  local.appName === serverNotification.app_name &&
                  Math.abs(local.timestamp - new Date(serverNotification.created_at).getTime()) < 60000)
      );

      if (existingIndex >= 0) {
        // Update existing notification with server data
        merged[existingIndex] = {
          ...merged[existingIndex],
          serverId: serverNotification.id,
          isRead: serverNotification.is_read,
          isDismissed: serverNotification.is_dismissed,
          category: serverNotification.category as 'Work' | 'Personal' | 'Junk',
          synced: true,
        };
      } else {
        // Add new server notification
        merged.push({
          id: `server_${serverNotification.id}`,
          serverId: serverNotification.id,
          appName: serverNotification.app_name,
          title: serverNotification.title,
          body: serverNotification.body,
          category: serverNotification.category as 'Work' | 'Personal' | 'Junk',
          priority: serverNotification.priority,
          timestamp: new Date(serverNotification.created_at).getTime(),
          packageName: serverNotification.package_name,
          synced: true,
          syncAttempts: 0,
          isRead: serverNotification.is_read,
          isDismissed: serverNotification.is_dismissed,
          extras: serverNotification.extras || {},
        });
      }
    });

    return merged;
  };

  // Remove duplicate notifications
  const removeDuplicateNotifications = (notifications: SyncedNotification[]): SyncedNotification[] => {
    const seen = new Set<string>();
    return notifications.filter(notification => {
      const key = notification.serverId || 
                  `${notification.appName}_${notification.title}_${notification.timestamp}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  };

  // Handle notification actions
  const handleNotificationAction = useCallback(async (
    notificationId: string, 
    action: 'read' | 'dismiss' | 'click'
  ) => {
    try {
      // Update local state immediately for better UX
      setState(prev => ({
        ...prev,
        notifications: prev.notifications.map(notification => {
          if (notification.id === notificationId) {
            const updated = { ...notification };
            if (action === 'read') {
              updated.isRead = true;
            } else if (action === 'dismiss') {
              updated.isDismissed = true;
              updated.isRead = true;
            }
            return updated;
          }
          return notification;
        }),
      }));

      // Find the notification
      const notification = state.notifications.find(n => n.id === notificationId);
      if (!notification) return;

      // Update local storage
      if (notification.serverId) {
        // Server notification - update via API
        if (apiService.isAuthenticated()) {
          await apiService.updateNotificationStatus(notification.serverId, action);
        }
      } else {
        // Local notification - update via capture service
        // This would need to be implemented in the capture service
      }

      // Send WebSocket update for real-time sync
      if (webSocketService.isWebSocketConnected()) {
        webSocketService.sendNotificationUpdate({
          notificationId: notification.serverId || notification.id,
          action,
          deviceId: 'current_device', // This should come from device registration
          timestamp: Date.now(),
        });
      }

      // Recalculate stats
      const updatedNotifications = state.notifications.map(n => 
        n.id === notificationId 
          ? { ...n, isRead: action === 'read' || action === 'dismiss', isDismissed: action === 'dismiss' }
          : n
      );
      const unreadCount = updatedNotifications.filter(n => !n.isRead).length;

      setState(prev => ({ ...prev, unreadCount }));

    } catch (error) {
      console.error('Failed to handle notification action:', error);
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to update notification',
      }));
    }
  }, [state.notifications]);

  // WebSocket event handlers
  const handleWebSocketMessage = useCallback((message: WebSocketMessage) => {
    switch (message.type) {
      case 'notification_new':
        // New notification received
        if (message.data) {
          const newNotification: SyncedNotification = {
            id: `ws_${message.data.id}`,
            serverId: message.data.id,
            appName: message.data.app_name,
            title: message.data.title,
            body: message.data.body,
            category: message.data.category,
            priority: message.data.priority,
            timestamp: new Date(message.data.created_at).getTime(),
            packageName: message.data.package_name,
            synced: true,
            syncAttempts: 0,
            isRead: false,
            isDismissed: false,
            extras: message.data.extras || {},
          };

          setState(prev => ({
            ...prev,
            notifications: [newNotification, ...prev.notifications],
            unreadCount: prev.unreadCount + 1,
            totalCount: prev.totalCount + 1,
          }));
        }
        break;

      case 'notification_update':
        // Notification status updated from another device
        if (message.data) {
          const update: NotificationUpdate = message.data;
          setState(prev => ({
            ...prev,
            notifications: prev.notifications.map(notification => {
              if (notification.serverId === update.notificationId || 
                  notification.id === update.notificationId) {
                const updated = { ...notification };
                if (update.action === 'read') {
                  updated.isRead = true;
                } else if (update.action === 'dismiss') {
                  updated.isDismissed = true;
                  updated.isRead = true;
                }
                return updated;
              }
              return notification;
            }),
          }));

          // Recalculate unread count
          const updatedNotifications = state.notifications.map(n => 
            (n.serverId === update.notificationId || n.id === update.notificationId)
              ? { ...n, isRead: update.action === 'read' || update.action === 'dismiss', isDismissed: update.action === 'dismiss' }
              : n
          );
          const unreadCount = updatedNotifications.filter(n => !n.isRead).length;
          setState(prev => ({ ...prev, unreadCount }));
        }
        break;
    }
  }, [state.notifications]);

  const handleConnectionChange = useCallback((connected: boolean) => {
    setState(prev => ({ ...prev, isWebSocketConnected: connected }));
  }, []);

  // App state change handler
  const handleAppStateChange = useCallback(async (nextAppState: AppStateStatus) => {
    if (nextAppState === 'active') {
      // App became active, refresh notifications
      await loadNotifications(0, false);
      
      // Reconnect WebSocket if needed
      if (apiService.isAuthenticated() && !webSocketService.isWebSocketConnected()) {
        await webSocketService.connect();
      }
    }
  }, [loadNotifications]);

  // Initialize
  useEffect(() => {
    loadNotifications(0, false);

    // Set up WebSocket
    if (apiService.isAuthenticated()) {
      webSocketService.connect();
    }

    // Set up event listeners
    webSocketService.on('*', handleWebSocketMessage);
    webSocketService.onConnection(handleConnectionChange);

    // Listen for app state changes
    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      webSocketService.off('*', handleWebSocketMessage);
      webSocketService.offConnection(handleConnectionChange);
      subscription?.remove();
    };
  }, [handleWebSocketMessage, handleConnectionChange, handleAppStateChange, loadNotifications]);

  // Actions
  const actions: NotificationDisplayActions = {
    refreshNotifications: () => loadNotifications(0, false),
    loadMoreNotifications: () => hasMore ? loadNotifications(currentOffset, true) : Promise.resolve(),
    markAsRead: (notificationId: string) => handleNotificationAction(notificationId, 'read'),
    markAsDismissed: (notificationId: string) => handleNotificationAction(notificationId, 'dismiss'),
    handleNotificationClick: (notificationId: string) => handleNotificationAction(notificationId, 'click'),
    setSelectedCategory: (category: 'Work' | 'Personal' | 'Junk' | 'All') => {
      setState(prev => ({ ...prev, selectedCategory: category }));
    },
    connectWebSocket: () => webSocketService.connect(),
    disconnectWebSocket: () => webSocketService.disconnect(),
    clearError: () => setState(prev => ({ ...prev, error: null })),
  };

  return [state, actions];
}