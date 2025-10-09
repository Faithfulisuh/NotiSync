import { androidBackgroundService, BackgroundServiceConfig } from '../androidBackgroundService';
import { storageService } from '../storage';
import NotificationListener, { NotificationData } from '../../modules/NotificationListener';
import { CapturedNotification, SyncedNotification } from '../../types/notification';

// Mock dependencies
jest.mock('../storage');
jest.mock('../../modules/NotificationListener');
jest.mock('expo-task-manager');
jest.mock('expo-background-fetch');
jest.mock('expo-notifications');

const mockStorageService = storageService as jest.Mocked<typeof storageService>;
const mockNotificationListener = NotificationListener as jest.Mocked<typeof NotificationListener>;

// Mock Expo modules
const mockTaskManager = require('expo-task-manager');
const mockBackgroundFetch = require('expo-background-fetch');
const mockNotifications = require('expo-notifications');

describe('AndroidBackgroundService', () => {
    const mockNotificationData: NotificationData = {
        id: 'test-notification-1',
        packageName: 'com.whatsapp',
        appName: 'WhatsApp',
        title: 'New Message',
        text: 'Hello there!',
        body: 'Hello there!',
        timestamp: Date.now(),
        when: Date.now(),
        priority: 1,
        flags: 0,
    };

    const mockCapturedNotification: CapturedNotification = {
        id: 'test-notification-1',
        appName: 'WhatsApp',
        title: 'New Message',
        body: 'Hello there!',
        category: 'Personal',
        priority: 1,
        timestamp: Date.now(),
        packageName: 'com.whatsapp',
    };

    const mockSyncedNotification: SyncedNotification = {
        ...mockCapturedNotification,
        synced: false,
        syncAttempts: 0,
        isRead: false,
        isDismissed: false,
    };

    beforeEach(() => {
        jest.clearAllMocks();

        // Mock storage service
        mockStorageService.initialize.mockResolvedValue();
        mockStorageService.saveNotification.mockResolvedValue(mockSyncedNotification);
        mockStorageService.markAsDismissed.mockResolvedValue();

        // Mock notification listener
        mockNotificationListener.isNotificationAccessGranted.mockResolvedValue(true);
        mockNotificationListener.requestNotificationAccess.mockResolvedValue(true);
        mockNotificationListener.startNotificationListener.mockResolvedValue(true);
        mockNotificationListener.stopNotificationListener.mockResolvedValue(true);
        mockNotificationListener.onNotificationPosted.mockReturnValue({ remove: jest.fn() });
        mockNotificationListener.onNotificationRemoved.mockReturnValue({ remove: jest.fn() });
        mockNotificationListener.removeAllListeners.mockImplementation(() => { });

        // Mock Expo modules
        mockTaskManager.defineTask.mockImplementation(() => { });
        mockBackgroundFetch.registerTaskAsync.mockResolvedValue();
        mockBackgroundFetch.unregisterTaskAsync.mockResolvedValue();
        mockNotifications.setNotificationChannelAsync.mockResolvedValue();
        mockNotifications.scheduleNotificationAsync.mockResolvedValue();
        mockNotifications.dismissNotificationAsync.mockResolvedValue();
        mockNotifications.addNotificationReceivedListener.mockReturnValue({ remove: jest.fn() });
        mockNotifications.removeNotificationSubscription.mockImplementation(() => { });
    });

    describe('initialization', () => {
        it('should create instance successfully', () => {
            expect(androidBackgroundService).toBeDefined();
            expect(typeof androidBackgroundService.checkNotificationAccessPermission).toBe('function');
            expect(typeof androidBackgroundService.startBackgroundService).toBe('function');
        });

        it('should have default configuration', () => {
            const config = androidBackgroundService.getConfig();
            expect(config).toBeDefined();
            expect(config.enabled).toBe(true);
            expect(config.foregroundServiceEnabled).toBe(true);
            expect(typeof config.captureInterval).toBe('number');
            expect(typeof config.maxNotificationsPerBatch).toBe('number');
        });
    });

    describe('notification access permission', () => {
        it('should check notification access permission', async () => {
            mockNotificationListener.isNotificationAccessGranted.mockResolvedValue(true);

            const status = await androidBackgroundService.checkNotificationAccessPermission();

            expect(status.hasAccess).toBe(true);
            expect(status.canRequestAccess).toBe(false);
            expect(mockNotificationListener.isNotificationAccessGranted).toHaveBeenCalled();
        });

        it('should return false for non-Android platforms', async () => {
            // Mock Platform.OS to be iOS
            const originalPlatform = require('react-native').Platform.OS;
            require('react-native').Platform.OS = 'ios';

            const status = await androidBackgroundService.checkNotificationAccessPermission();

            expect(status.hasAccess).toBe(false);
            expect(status.canRequestAccess).toBe(false);

            // Restore original platform
            require('react-native').Platform.OS = originalPlatform;
        });

        it('should handle permission check errors', async () => {
            mockNotificationListener.isNotificationAccessGranted.mockRejectedValue(new Error('Permission check failed'));

            const status = await androidBackgroundService.checkNotificationAccessPermission();

            expect(status.hasAccess).toBe(false);
            expect(status.canRequestAccess).toBe(true);
        });

        it('should request notification access', async () => {
            mockNotificationListener.requestNotificationAccess.mockResolvedValue(true);
            mockNotificationListener.isNotificationAccessGranted.mockResolvedValue(true);

            const result = await androidBackgroundService.requestNotificationAccess();

            expect(result).toBe(true);
            expect(mockNotificationListener.requestNotificationAccess).toHaveBeenCalled();
        });

        it('should handle request access failure', async () => {
            mockNotificationListener.requestNotificationAccess.mockRejectedValue(new Error('Request failed'));

            const result = await androidBackgroundService.requestNotificationAccess();

            expect(result).toBe(false);
        });
    });

    describe('background service lifecycle', () => {
        it('should start background service successfully', async () => {
            const result = await androidBackgroundService.startBackgroundService();

            expect(result).toBe(true);
            expect(mockStorageService.initialize).toHaveBeenCalled();
            expect(mockNotifications.setNotificationChannelAsync).toHaveBeenCalled();
            expect(mockBackgroundFetch.registerTaskAsync).toHaveBeenCalled();
            expect(mockNotificationListener.startNotificationListener).toHaveBeenCalled();
        });

        it('should not start if already running', async () => {
            // Start service first
            await androidBackgroundService.startBackgroundService();

            // Try to start again
            const result = await androidBackgroundService.startBackgroundService();

            expect(result).toBe(true);
            // Should not call initialization methods again
        });

        it('should fail to start without notification access', async () => {
            mockNotificationListener.isNotificationAccessGranted.mockResolvedValue(false);

            const result = await androidBackgroundService.startBackgroundService();

            expect(result).toBe(false);
        });

        it('should stop background service successfully', async () => {
            // Start service first
            await androidBackgroundService.startBackgroundService();

            // Stop service
            await androidBackgroundService.stopBackgroundService();

            expect(mockBackgroundFetch.unregisterTaskAsync).toHaveBeenCalled();
            expect(mockNotifications.dismissNotificationAsync).toHaveBeenCalled();
            expect(mockNotificationListener.removeAllListeners).toHaveBeenCalled();
        });

        it('should handle stop when not running', async () => {
            // Should not throw error when stopping non-running service
            await expect(androidBackgroundService.stopBackgroundService()).resolves.not.toThrow();
        });

        it('should return correct running status', async () => {
            expect(androidBackgroundService.isRunning()).toBe(false);

            await androidBackgroundService.startBackgroundService();
            expect(androidBackgroundService.isRunning()).toBe(true);

            await androidBackgroundService.stopBackgroundService();
            expect(androidBackgroundService.isRunning()).toBe(false);
        });
    });

    describe('notification processing', () => {
        beforeEach(async () => {
            await androidBackgroundService.startBackgroundService();
        });

        afterEach(async () => {
            await androidBackgroundService.stopBackgroundService();
        });

        it('should process native notification data correctly', async () => {
            // Simulate native notification posted
            const onNotificationPostedCallback = mockNotificationListener.onNotificationPosted.mock.calls[0][0];

            await onNotificationPostedCallback(mockNotificationData);

            expect(mockStorageService.saveNotification).toHaveBeenCalledWith(
                expect.objectContaining({
                    appName: 'WhatsApp',
                    title: 'New Message',
                    body: 'Hello there!',
                    packageName: 'com.whatsapp',
                })
            );
        });

        it('should handle notification removal', async () => {
            const onNotificationRemovedCallback = mockNotificationListener.onNotificationRemoved.mock.calls[0][0];

            await onNotificationRemovedCallback(mockNotificationData);

            expect(mockStorageService.markAsDismissed).toHaveBeenCalledWith('test-notification-1');
        });

        it('should categorize work notifications correctly', async () => {
            const workNotificationData: NotificationData = {
                ...mockNotificationData,
                packageName: 'com.slack.android',
                appName: 'Slack',
                title: 'Meeting reminder',
                body: 'Team meeting in 15 minutes',
            };

            const onNotificationPostedCallback = mockNotificationListener.onNotificationPosted.mock.calls[0][0];
            await onNotificationPostedCallback(workNotificationData);

            expect(mockStorageService.saveNotification).toHaveBeenCalledWith(
                expect.objectContaining({
                    category: 'Work',
                })
            );
        });

        it('should categorize junk notifications correctly', async () => {
            const junkNotificationData: NotificationData = {
                ...mockNotificationData,
                title: 'Special Offer!',
                body: 'Limited time discount - 50% off everything!',
            };

            const onNotificationPostedCallback = mockNotificationListener.onNotificationPosted.mock.calls[0][0];
            await onNotificationPostedCallback(junkNotificationData);

            expect(mockStorageService.saveNotification).toHaveBeenCalledWith(
                expect.objectContaining({
                    category: 'Junk',
                })
            );
        });

        it('should skip own service notifications', async () => {
            const serviceNotificationData: NotificationData = {
                ...mockNotificationData,
                packageName: 'host.exp.exponent',
                extras: { serviceNotification: true },
            };

            const onNotificationPostedCallback = mockNotificationListener.onNotificationPosted.mock.calls[0][0];
            await onNotificationPostedCallback(serviceNotificationData);

            expect(mockStorageService.saveNotification).not.toHaveBeenCalled();
        });

        it('should handle deduplication correctly', async () => {
            const onNotificationPostedCallback = mockNotificationListener.onNotificationPosted.mock.calls[0][0];

            // Send same notification twice quickly
            await onNotificationPostedCallback(mockNotificationData);
            await onNotificationPostedCallback(mockNotificationData);

            // Should only save once due to deduplication
            expect(mockStorageService.saveNotification).toHaveBeenCalledTimes(1);
        });

        it('should map Android priority correctly', async () => {
            const highPriorityData: NotificationData = {
                ...mockNotificationData,
                priority: 2, // Android max priority
            };

            const onNotificationPostedCallback = mockNotificationListener.onNotificationPosted.mock.calls[0][0];
            await onNotificationPostedCallback(highPriorityData);

            expect(mockStorageService.saveNotification).toHaveBeenCalledWith(
                expect.objectContaining({
                    priority: 3, // Our max priority
                })
            );
        });

        it('should extract notification actions correctly', async () => {
            const notificationWithActions: NotificationData = {
                ...mockNotificationData,
                actions: {
                    '0': { title: 'Reply' },
                    '1': { title: 'Mark as Read' },
                },
            };

            const onNotificationPostedCallback = mockNotificationListener.onNotificationPosted.mock.calls[0][0];
            await onNotificationPostedCallback(notificationWithActions);

            expect(mockStorageService.saveNotification).toHaveBeenCalledWith(
                expect.objectContaining({
                    actions: [
                        { id: '0', title: 'Reply', type: 'button' },
                        { id: '1', title: 'Mark as Read', type: 'button' },
                    ],
                })
            );
        });
    });

    describe('configuration management', () => {
        it('should update configuration', () => {
            const newConfig: Partial<BackgroundServiceConfig> = {
                captureInterval: 2000,
                maxNotificationsPerBatch: 20,
                deduplicationWindow: 10000,
            };

            androidBackgroundService.updateConfig(newConfig);

            const config = androidBackgroundService.getConfig();
            expect(config.captureInterval).toBe(2000);
            expect(config.maxNotificationsPerBatch).toBe(20);
            expect(config.deduplicationWindow).toBe(10000);
        });

        it('should get current configuration', () => {
            const config = androidBackgroundService.getConfig();

            expect(config).toHaveProperty('enabled');
            expect(config).toHaveProperty('foregroundServiceEnabled');
            expect(config).toHaveProperty('captureInterval');
            expect(config).toHaveProperty('maxNotificationsPerBatch');
            expect(config).toHaveProperty('deduplicationWindow');
        });
    });

    describe('service status', () => {
        it('should get service status when not running', async () => {
            const status = await androidBackgroundService.getServiceStatus();

            expect(status.isRunning).toBe(false);
            expect(status.hasNotificationAccess).toBe(true);
            expect(typeof status.backgroundFetchStatus).toBe('string');
        });

        it('should get service status when running', async () => {
            await androidBackgroundService.startBackgroundService();

            const status = await androidBackgroundService.getServiceStatus();

            expect(status.isRunning).toBe(true);
            expect(status.hasNotificationAccess).toBe(true);

            await androidBackgroundService.stopBackgroundService();
        });

        it('should handle background fetch status correctly', async () => {
            mockBackgroundFetch.getStatusAsync.mockResolvedValue(1); // Available

            const status = await androidBackgroundService.getServiceStatus();

            expect(status.backgroundFetchStatus).toBe('Available');
        });
    });

    describe('test notification', () => {
        it('should send test notification', async () => {
            await androidBackgroundService.testNotificationCapture();

            expect(mockNotifications.scheduleNotificationAsync).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: expect.objectContaining({
                        title: 'NotiSync Test',
                        body: 'This is a test notification to verify capture is working',
                    }),
                })
            );
        });
    });

    describe('error handling', () => {
        it('should handle storage errors gracefully', async () => {
            mockStorageService.saveNotification.mockRejectedValue(new Error('Storage error'));

            await androidBackgroundService.startBackgroundService();

            const onNotificationPostedCallback = mockNotificationListener.onNotificationPosted.mock.calls[0][0];

            // Should not throw error even if storage fails
            await expect(onNotificationPostedCallback(mockNotificationData)).resolves.not.toThrow();

            await androidBackgroundService.stopBackgroundService();
        });

        it('should handle native module errors gracefully', async () => {
            mockNotificationListener.startNotificationListener.mockRejectedValue(new Error('Native module error'));

            const result = await androidBackgroundService.startBackgroundService();

            expect(result).toBe(false);
        });

        it('should handle notification listener setup errors', async () => {
            mockNotificationListener.onNotificationPosted.mockImplementation(() => {
                throw new Error('Listener setup error');
            });

            // Should not throw error during service start
            await expect(androidBackgroundService.startBackgroundService()).resolves.not.toThrow();
        });
    });

    describe('platform-specific behavior', () => {
        it('should warn on non-Android platforms', async () => {
            const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
            const originalPlatform = require('react-native').Platform.OS;
            require('react-native').Platform.OS = 'ios';

            const result = await androidBackgroundService.startBackgroundService();

            expect(result).toBe(false);
            expect(consoleSpy).toHaveBeenCalledWith('Background service is only supported on Android');

            // Restore
            require('react-native').Platform.OS = originalPlatform;
            consoleSpy.mockRestore();
        });

        it('should handle Android-specific features correctly', async () => {
            // Ensure we're testing on Android
            require('react-native').Platform.OS = 'android';

            await androidBackgroundService.startBackgroundService();

            expect(mockNotificationListener.startNotificationListener).toHaveBeenCalled();
            expect(mockNotificationListener.onNotificationPosted).toHaveBeenCalled();
            expect(mockNotificationListener.onNotificationRemoved).toHaveBeenCalled();

            await androidBackgroundService.stopBackgroundService();
        });
    });

    describe('foreground service', () => {
        it('should start foreground service when enabled', async () => {
            androidBackgroundService.updateConfig({ foregroundServiceEnabled: true });

            await androidBackgroundService.startBackgroundService();

            expect(mockNotifications.scheduleNotificationAsync).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: expect.objectContaining({
                        title: 'NotiSync is running',
                        body: 'Capturing notifications in the background',
                    }),
                    identifier: 'notisync_foreground_service',
                })
            );

            await androidBackgroundService.stopBackgroundService();
        });

        it('should not start foreground service when disabled', async () => {
            androidBackgroundService.updateConfig({ foregroundServiceEnabled: false });

            await androidBackgroundService.startBackgroundService();

            expect(mockNotifications.scheduleNotificationAsync).not.toHaveBeenCalledWith(
                expect.objectContaining({
                    identifier: 'notisync_foreground_service',
                })
            );

            await androidBackgroundService.stopBackgroundService();
        });
    });
});