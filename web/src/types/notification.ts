export interface Notification {
  id: string;
  title: string;
  body: string;
  appName: string;
  category: 'Work' | 'Personal' | 'Junk';
  timestamp: string;
  isRead: boolean;
  isDismissed: boolean;
  sourceDevice?: string;
  priority?: number;
  actions?: NotificationAction[];
}

export interface NotificationAction {
  id: string;
  label: string;
  type: 'button' | 'input';
  action: string;
}

export interface NotificationStats {
  total: number;
  unread: number;
  work: number;
  personal: number;
  junk: number;
}

export interface WebSocketMessage {
  type: 'notification_sync' | 'notification_action' | 'connection_status';
  data: any;
  timestamp: string;
}

export interface NotificationFilter {
  category?: 'all' | 'Work' | 'Personal' | 'Junk';
  status?: 'all' | 'unread' | 'read';
  search?: string;
  dateRange?: {
    start: Date;
    end: Date;
  };
}