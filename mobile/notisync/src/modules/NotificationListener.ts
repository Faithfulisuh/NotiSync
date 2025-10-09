import { NativeModulesProxy, EventEmitter, Subscription } from 'expo-modules-core';

// Import the native module. On web, it will be resolved to NotificationListener.web.ts
// and on native platforms to NotificationListener.ts
import NotificationListenerModule from './NotificationListenerModule';

export interface NotificationData {
  id: string;
  packageName: string;
  appName: string;
  title: string;
  text: string;
  body: string;
  subText?: string;
  timestamp: number;
  when: number;
  priority: number;
  category?: string;
  flags: number;
  actions?: Record<string, { title: string }>;
  extras?: Record<string, any>;
}

export interface NotificationEvent {
  eventName: 'onNotificationPosted' | 'onNotificationRemoved';
  data: NotificationData;
}

class NotificationListener {
  private eventEmitter = new EventEmitter(NotificationListenerModule);

  /**
   * Check if notification access permission is granted
   */
  async isNotificationAccessGranted(): Promise<boolean> {
    return await NotificationListenerModule.isNotificationAccessGranted();
  }

  /**
   * Request notification access permission (opens system settings)
   */
  async requestNotificationAccess(): Promise<boolean> {
    return await NotificationListenerModule.requestNotificationAccess();
  }

  /**
   * Start the notification listener service
   */
  async startNotificationListener(): Promise<boolean> {
    return await NotificationListenerModule.startNotificationListener();
  }

  /**
   * Stop the notification listener service
   */
  async stopNotificationListener(): Promise<boolean> {
    return await NotificationListenerModule.stopNotificationListener();
  }

  /**
   * Listen for notification posted events
   */
  onNotificationPosted(listener: (data: NotificationData) => void): Subscription {
    return this.eventEmitter.addListener('onNotificationPosted', listener);
  }

  /**
   * Listen for notification removed events
   */
  onNotificationRemoved(listener: (data: NotificationData) => void): Subscription {
    return this.eventEmitter.addListener('onNotificationRemoved', listener);
  }

  /**
   * Remove all listeners
   */
  removeAllListeners(): void {
    this.eventEmitter.removeAllListeners('onNotificationPosted');
    this.eventEmitter.removeAllListeners('onNotificationRemoved');
  }
}

export default new NotificationListener();