import { Platform, NativeModules, DeviceEventEmitter } from 'react-native';
import * as TaskManager from 'expo-task-manager';
import * as BackgroundFetch from 'expo-background-fetch';
import * as Notifications from 'expo-notifications';
import { storageService } from './storage';
import { CapturedNotification } from '../types/notification';
import NotificationListener, { NotificationData } from '../modules/NotificationListener';

const BACKGROUND_NOTIFICATION_TASK = 'BACKGROUND_NOTIFICATION_CAPTURE';
const FOREGROUND_SERVICE_TASK = 'FOREGROUND_NOTIFICATION_SERVICE';

export interface AndroidNotificationAccessStatus {
  hasAccess: boolean;
  canRequestAccess: boolean;
  settingsUrl?: string;
}

export interface BackgroundServiceConfig {
  enabled: boolean;
  foregroundServiceEnabled: boolean;
  notificationChannelId: string;
  notificationChannelName: string;
  serviceNotificationTitle: string;
  serviceNotificationBody: string;
  captureInterval: number; // milliseconds
  maxNotificationsPerBatch: number;
  deduplicationWindow: number; // milliseconds
}

class AndroidBackgroundService {
  private static instance: AndroidBackgroundService;
  private isServiceRunning = false;
  private config: BackgroundServiceConfig;
  private notificationListener: any;
  private lastCapturedNotifications: Map<string, number> = new Map();

  private constructor() {
    this.config = {
      enabled: true,
      foregroundServiceEnabled: true,
      notificationChannelId: 'notisync_background_service',
      notificationChannelName: 'NotiSync Background Service',
      serviceNotificationTitle: 'NotiSync is running',
      serviceNotificationBody: 'Capturing notifications in the background',
      captureInterval: 1000, // 1 second
      maxNotificationsPerBatch: 10,
      deduplicationWindow: 5000, // 5 seconds
    };

    this.setupTaskManager();
  }

  static getInstance(): AndroidBackgroundService {
    if (!AndroidBackgroundService.instance) {
      AndroidBackgroundService.instance = new AndroidBackgroundService();
    }
    return AndroidBackgroundService.instance;
  }

  private setupTaskManager(): void {
    // Define background fetch task for notification capture
    TaskManager.defineTask(BACKGROUND_NOTIFICATION_TASK, async () => {
      try {
        if (!this.config.enabled) {
          return BackgroundFetch.BackgroundFetchResult.NoData;
        }

        await this.captureNotificationsInBackground();
        return BackgroundFetch.BackgroundFetchResult.NewData;
      } catch (error) {
        console.error('Background notification capture failed:', error);
        return BackgroundFetch.BackgroundFetchResult.Failed;
      }
    });

    // Define foreground service task
    TaskManager.defineTask(FOREGROUND_SERVICE_TASK, async ({ data, error }) => {
      if (error) {
        console.error('Foreground service error:', error);
        return;
      }

      // Handle foreground service notifications
      if (data) {
        await this.handleForegroundServiceData(data);
      }
    });
  }

  async checkNotificationAccessPermission(): Promise<AndroidNotificationAccessStatus> {
    if (Platform.OS !== 'android') {
      return {
        hasAccess: false,
        canRequestAccess: false,
      };
    }

    try {
      const hasAccess = await NotificationListener.isNotificationAccessGranted();
      
      return {
        hasAccess,
        canRequestAccess: !hasAccess,
        settingsUrl: 'android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS',
      };
    } catch (error) {
      console.error('Failed to check notification access:', error);
      return {
        hasAccess: false,
        canRequestAccess: true,
      };
    }
  }

  async requestNotificationAccess(): Promise<boolean> {
    if (Platform.OS !== 'android') {
      return false;
    }

    try {
      await NotificationListener.requestNotificationAccess();
      
      // After user returns from settings, check again
      const status = await this.checkNotificationAccessPermission();
      return status.hasAccess;
    } catch (error) {
      console.error('Failed to request notification access:', error);
      return false;
    }
  }

  async startBackgroundService(): Promise<boolean> {
    if (Platform.OS !== 'android') {
      console.warn('Background service is only supported on Android');
      return false;
    }

    if (this.isServiceRunning) {
      console.log('Background service is already running');
      return true;
    }

    try {
      // Check permissions first
      const accessStatus = await this.checkNotificationAccessPermission();
      if (!accessStatus.hasAccess) {
        throw new Error('Notification access permission not granted');
      }

      // Initialize storage service
      await storageService.initialize();

      // Set up notification channel for foreground service
      await this.setupNotificationChannel();

      // Start foreground service if enabled
      if (this.config.foregroundServiceEnabled) {
        await this.startForegroundService();
      }

      // Register background fetch task
      await BackgroundFetch.registerTaskAsync(BACKGROUND_NOTIFICATION_TASK, {
        minimumInterval: this.config.captureInterval / 1000, // Convert to seconds
        stopOnTerminate: false,
        startOnBoot: true,
      });

      // Set up notification listeners
      await this.setupNotificationListeners();

      // Start native notification listener
      await NotificationListener.startNotificationListener();

      this.isServiceRunning = true;
      console.log('Android background service started successfully');
      return true;
    } catch (error) {
      console.error('Failed to start background service:', error);
      return false;
    }
  }

  async stopBackgroundService(): Promise<void> {
    if (!this.isServiceRunning) {
      console.log('Background service is not running');
      return;
    }

    try {
      // Unregister background fetch task
      await BackgroundFetch.unregisterTaskAsync(BACKGROUND_NOTIFICATION_TASK);

      // Stop foreground service
      if (this.config.foregroundServiceEnabled) {
        await this.stopForegroundService();
      }

      // Remove notification listeners
      this.removeNotificationListeners();

      this.isServiceRunning = false;
      console.log('Android background service stopped successfully');
    } catch (error) {
      console.error('Failed to stop background service:', error);
    }
  }

  private async setupNotificationChannel(): Promise<void> {
    await Notifications.setNotificationChannelAsync(this.config.notificationChannelId, {
      name: this.config.notificationChannelName,
      importance: Notifications.AndroidImportance.LOW,
      vibrationPattern: [0],
      lightColor: '#FF231F7C',
      sound: null, // Silent notification for background service
      showBadge: false,
    });
  }

  private async startForegroundService(): Promise<void> {
    try {
      // Schedule a persistent notification for the foreground service
      await Notifications.scheduleNotificationAsync({
        content: {
          title: this.config.serviceNotificationTitle,
          body: this.config.serviceNotificationBody,
          data: { persistent: true, serviceNotification: true },
          priority: Notifications.AndroidNotificationPriority.LOW,
          sticky: true,
        },
        trigger: null, // Show immediately
        identifier: 'notisync_foreground_service',
      });

      console.log('Foreground service notification scheduled');
    } catch (error) {
      console.error('Failed to start foreground service:', error);
    }
  }

  private async stopForegroundService(): Promise<void> {
    try {
      await Notifications.dismissNotificationAsync('notisync_foreground_service');
      console.log('Foreground service notification dismissed');
    } catch (error) {
      console.error('Failed to stop foreground service:', error);
    }
  }

  private async setupNotificationListeners(): Promise<void> {
    // Set up notification received listener
    this.notificationListener = Notifications.addNotificationReceivedListener(
      this.handleNotificationReceived.bind(this)
    );

    // Set up native Android notification listeners
    if (Platform.OS === 'android') {
      NotificationListener.onNotificationPosted(this.handleNativeNotificationPosted.bind(this));
      NotificationListener.onNotificationRemoved(this.handleNativeNotificationRemoved.bind(this));
    }
  }

  private removeNotificationListeners(): void {
    if (this.notificationListener) {
      Notifications.removeNotificationSubscription(this.notificationListener);
      this.notificationListener = null;
    }

    if (Platform.OS === 'android') {
      NotificationListener.removeAllListeners();
    }
  }

  private async handleNotificationReceived(notification: any): Promise<void> {
    try {
      const capturedNotification = this.extractNotificationData(notification);
      
      if (this.shouldCaptureNotification(capturedNotification)) {
        await this.processAndStoreNotification(capturedNotification);
      }
    } catch (error) {
      console.error('Failed to handle received notification:', error);
    }
  }

  private async handleNativeNotificationPosted(data: NotificationData): Promise<void> {
    try {
      // Handle native Android notification posted event
      const capturedNotification = this.extractNativeNotificationData(data);
      
      if (this.shouldCaptureNotification(capturedNotification)) {
        await this.processAndStoreNotification(capturedNotification);
      }
    } catch (error) {
      console.error('Failed to handle native notification posted:', error);
    }
  }

  private async handleNativeNotificationRemoved(data: NotificationData): Promise<void> {
    try {
      // Handle notification removal/dismissal
      if (data.id) {
        await storageService.markAsDismissed(data.id);
      }
    } catch (error) {
      console.error('Failed to handle native notification removed:', error);
    }
  }

  private async handleAndroidNotificationPosted(event: any): Promise<void> {
    try {
      // Handle Android-specific notification posted event
      const capturedNotification = this.extractAndroidNotificationData(event);
      
      if (this.shouldCaptureNotification(capturedNotification)) {
        await this.processAndStoreNotification(capturedNotification);
      }
    } catch (error) {
      console.error('Failed to handle Android notification posted:', error);
    }
  }

  private async handleAndroidNotificationRemoved(event: any): Promise<void> {
    try {
      // Handle notification removal/dismissal
      const notificationId = event.id || event.key;
      if (notificationId) {
        await storageService.markAsDismissed(notificationId);
      }
    } catch (error) {
      console.error('Failed to handle Android notification removed:', error);
    }
  }

  private async handleForegroundServiceData(data: any): Promise<void> {
    // Handle data from foreground service
    console.log('Foreground service data:', data);
  }

  private extractNotificationData(notification: any): CapturedNotification {
    const request = notification.request;
    const content = request.content;
    
    return {
      id: request.identifier || `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      appName: this.extractAppName(notification),
      title: content.title || 'No Title',
      body: content.body || '',
      category: this.categorizeNotification(content),
      priority: this.mapPriority(content),
      timestamp: Date.now(),
      packageName: this.extractPackageName(notification),
      icon: content.data?.icon as string,
      actions: this.extractActions(content),
      extras: content.data || {},
    };
  }

  private extractNativeNotificationData(data: NotificationData): CapturedNotification {
    return {
      id: data.id || `native_notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      appName: data.appName || 'Unknown App',
      title: data.title || 'No Title',
      body: data.body || data.text || '',
      category: this.categorizeNotification(data),
      priority: this.mapAndroidPriority(data.priority || 0),
      timestamp: data.timestamp || Date.now(),
      packageName: data.packageName,
      icon: undefined, // Native module doesn't extract icon yet
      actions: data.actions ? Object.values(data.actions).map((action, index) => ({
        id: index.toString(),
        title: action.title,
        type: 'button' as const,
      })) : [],
      extras: data.extras || {},
    };
  }

  private extractAndroidNotificationData(event: any): CapturedNotification {
    return {
      id: event.id || event.key || `android_notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      appName: event.packageName || event.appName || 'Unknown App',
      title: event.title || 'No Title',
      body: event.text || event.body || '',
      category: this.categorizeNotification(event),
      priority: this.mapAndroidPriority(event.priority),
      timestamp: event.when || Date.now(),
      packageName: event.packageName,
      icon: event.icon,
      actions: event.actions || [],
      extras: event.extras || {},
    };
  }

  private extractAppName(notification: any): string {
    const data = notification.request.content.data;
    
    if (data?.appName) return data.appName as string;
    if (data?.app) return data.app as string;
    if (data?.source) return data.source as string;
    
    return this.extractPackageName(notification) || 'Unknown App';
  }

  private extractPackageName(notification: any): string {
    const data = notification.request.content.data;
    return (data?.packageName as string) || (data?.package as string) || 'unknown';
  }

  private categorizeNotification(content: any): 'Work' | 'Personal' | 'Junk' {
    const text = `${content.title || ''} ${content.body || content.text || ''}`.toLowerCase();
    const packageName = content.packageName || '';

    // Work-related keywords and apps
    const workKeywords = ['meeting', 'calendar', 'email', 'slack', 'teams', 'zoom', 'work', 'office'];
    const workApps = ['com.slack.android', 'com.microsoft.teams', 'com.google.android.gm', 'com.microsoft.office'];

    // Junk/promotional keywords
    const junkKeywords = ['offer', 'discount', 'sale', 'promotion', 'deal', 'free', 'win', 'prize'];

    if (workApps.includes(packageName) || workKeywords.some(keyword => text.includes(keyword))) {
      return 'Work';
    }

    if (junkKeywords.some(keyword => text.includes(keyword))) {
      return 'Junk';
    }

    return 'Personal';
  }

  private mapPriority(content: any): number {
    const priority = content.data?.priority || content.priority;
    
    if (priority === 'max' || priority === 'high' || priority === 2) return 3;
    if (priority === 'default' || priority === 1) return 2;
    if (priority === 'low' || priority === 0) return 1;
    if (priority === 'min' || priority === -1) return 0;
    
    return 1; // Default priority
  }

  private mapAndroidPriority(priority: number): number {
    // Android priority: -2 (min) to 2 (max)
    // Our scale: 0 to 3
    return Math.max(0, Math.min(3, priority + 2));
  }

  private extractActions(content: any): any[] {
    return content.actions || [];
  }

  private shouldCaptureNotification(notification: CapturedNotification): boolean {
    // Skip our own service notifications
    if (notification.packageName === 'host.exp.exponent' && 
        notification.extras?.serviceNotification) {
      return false;
    }

    // Deduplication check
    const deduplicationKey = `${notification.packageName}_${notification.title}_${notification.body}`;
    const lastCaptured = this.lastCapturedNotifications.get(deduplicationKey);
    const now = Date.now();

    if (lastCaptured && (now - lastCaptured) < this.config.deduplicationWindow) {
      return false; // Skip duplicate within deduplication window
    }

    this.lastCapturedNotifications.set(deduplicationKey, now);

    // Clean up old deduplication entries
    this.cleanupDeduplicationMap();

    return true;
  }

  private cleanupDeduplicationMap(): void {
    const now = Date.now();
    const cutoff = now - (this.config.deduplicationWindow * 2);

    for (const [key, timestamp] of this.lastCapturedNotifications.entries()) {
      if (timestamp < cutoff) {
        this.lastCapturedNotifications.delete(key);
      }
    }
  }

  private async processAndStoreNotification(notification: CapturedNotification): Promise<void> {
    try {
      // Store notification using the storage service
      await storageService.saveNotification(notification);
      
      console.log(`Captured notification from ${notification.appName}: ${notification.title}`);
    } catch (error) {
      console.error('Failed to process and store notification:', error);
    }
  }

  private async captureNotificationsInBackground(): Promise<void> {
    try {
      // This method runs during background fetch
      // Perform any periodic tasks like cleanup, sync, etc.
      
      // Sync pending notifications if online
      const unsyncedNotifications = await storageService.getUnsyncedNotifications();
      if (unsyncedNotifications.length > 0) {
        console.log(`Background sync: ${unsyncedNotifications.length} notifications pending`);
        // Sync logic would go here
      }

      // Cleanup old notifications
      await storageService.cleanupExpiredNotifications();
      
    } catch (error) {
      console.error('Background capture task failed:', error);
    }
  }

  // Public methods
  isRunning(): boolean {
    return this.isServiceRunning;
  }

  updateConfig(newConfig: Partial<BackgroundServiceConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  getConfig(): BackgroundServiceConfig {
    return { ...this.config };
  }

  async getServiceStatus(): Promise<{
    isRunning: boolean;
    hasNotificationAccess: boolean;
    backgroundFetchStatus: string;
    lastBackgroundFetch?: Date;
  }> {
    const accessStatus = await this.checkNotificationAccessPermission();
    const backgroundFetchStatus = await BackgroundFetch.getStatusAsync();
    
    return {
      isRunning: this.isServiceRunning,
      hasNotificationAccess: accessStatus.hasAccess,
      backgroundFetchStatus: this.getBackgroundFetchStatusString(backgroundFetchStatus),
    };
  }

  private getBackgroundFetchStatusString(status: BackgroundFetch.BackgroundFetchStatus): string {
    switch (status) {
      case BackgroundFetch.BackgroundFetchStatus.Available:
        return 'Available';
      case BackgroundFetch.BackgroundFetchStatus.Denied:
        return 'Denied';
      case BackgroundFetch.BackgroundFetchStatus.Restricted:
        return 'Restricted';
      default:
        return 'Unknown';
    }
  }

  async testNotificationCapture(): Promise<void> {
    // Send a test notification to verify capture is working
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'NotiSync Test',
        body: 'This is a test notification to verify capture is working',
        data: { test: true, appName: 'NotiSync Test' },
      },
      trigger: { seconds: 1 },
    });
  }
}

export const androidBackgroundService = AndroidBackgroundService.getInstance();