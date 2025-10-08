export interface CapturedNotification {
  id: string;
  appName: string;
  title: string;
  body: string;
  category?: 'Work' | 'Personal' | 'Junk';
  priority: number;
  timestamp: number;
  packageName?: string;
  icon?: string;
  actions?: NotificationAction[];
  extras?: Record<string, any>;
}

export interface NotificationAction {
  id: string;
  title: string;
  type: 'button' | 'input';
}

export interface NotificationPermissionStatus {
  granted: boolean;
  canAskAgain: boolean;
  status: 'granted' | 'denied' | 'undetermined';
}

export interface NotificationCaptureConfig {
  enabled: boolean;
  captureSystemNotifications: boolean;
  captureAppNotifications: boolean;
  excludedApps: string[];
  includedApps: string[];
  filterKeywords: string[];
}

export interface SyncedNotification extends CapturedNotification {
  serverId?: string;
  synced: boolean;
  syncAttempts: number;
  lastSyncAttempt?: number;
  isRead: boolean;
  isDismissed: boolean;
}

export interface NotificationStats {
  totalCaptured: number;
  totalSynced: number;
  pendingSync: number;
  lastSyncTime?: number;
  captureRate: number;
  syncSuccessRate: number;
}