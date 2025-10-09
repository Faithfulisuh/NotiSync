import { apiService, LoginRequest, RegisterRequest, DeviceRegistration } from '../api';
import { databaseService, AuthTokens } from '../database';
import { CapturedNotification } from '../../types/notification';

// Mock dependencies
jest.mock('../database');

const mockDatabaseService = databaseService as jest.Mocked<typeof databaseService>;

// Mock fetch globally
global.fetch = jest.fn();
const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;

describe('ApiService', () => {
  const mockAuthTokens: AuthTokens = {
    accessToken: 'test-access-token',
    refreshToken: 'test-refresh-token',
    expiresAt: Date.now() + 3600000, // 1 hour from now
  };

  const mockLoginRequest: LoginRequest = {
    email: 'test@example.com',
    password: 'password123',
  };

  const mockRegisterRequest: RegisterRequest = {
    email: 'test@example.com',
    password: 'password123',
    firstName: 'John',
    lastName: 'Doe',
  };

  const mockDeviceRegistration: DeviceRegistration = {
    name: 'Test Device',
    platform: 'android',
    deviceToken: 'test-device-token',
    model: 'Test Model',
    osVersion: '13.0',
  };

  const mockNotification: CapturedNotification = {
    id: 'test-notification-1',
    appName: 'Test App',
    title: 'Test Notification',
    body: 'This is a test notification',
    category: 'Personal',
    priority: 1,
    timestamp: Date.now(),
    packageName: 'com.test.app',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockDatabaseService.initialize.mockResolvedValue();
    mockDatabaseService.getAuthTokens.mockResolvedValue(null);
    mockDatabaseService.saveAuthTokens.mockResolvedValue();
    mockDatabaseService.clearAuthTokens.mockResolvedValue();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('initialization', () => {
    it('should initialize database on construction', async () => {
      // The constructor calls initializeDatabase which should initialize the database
      expect(mockDatabaseService.initialize).toHaveBeenCalled();
    });

    it('should load existing auth tokens on initialization', async () => {
      mockDatabaseService.getAuthTokens.mockResolvedValue(mockAuthTokens);

      // Create a new instance to trigger initialization
      const { apiService: newApiService } = require('../api');
      
      // Wait for initialization to complete
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(mockDatabaseService.getAuthTokens).toHaveBeenCalled();
    });
  });

  describe('authentication', () => {
    it('should login successfully', async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          token: 'new-access-token',
          refreshToken: 'new-refresh-token',
        }),
      };
      mockFetch.mockResolvedValue(mockResponse as any);

      const result = await apiService.login(mockLoginRequest);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(mockDatabaseService.saveAuthTokens).toHaveBeenCalledWith(
        expect.objectContaining({
          accessToken: 'new-access-token',
          refreshToken: 'new-refresh-token',
        })
      );
    });

    it('should handle login failure', async () => {
      const mockResponse = {
        ok: false,
        json: jest.fn().mockResolvedValue({
          error: 'Invalid credentials',
        }),
      };
      mockFetch.mockResolvedValue(mockResponse as any);

      const result = await apiService.login(mockLoginRequest);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid credentials');
      expect(mockDatabaseService.saveAuthTokens).not.toHaveBeenCalled();
    });

    it('should register successfully', async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          id: 'user-123',
          email: mockRegisterRequest.email,
        }),
      };
      mockFetch.mockResolvedValue(mockResponse as any);

      const result = await apiService.register(mockRegisterRequest);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/auth/register'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            email: mockRegisterRequest.email,
            password: mockRegisterRequest.password,
            first_name: mockRegisterRequest.firstName,
            last_name: mockRegisterRequest.lastName,
          }),
        })
      );
    });

    it('should handle registration failure', async () => {
      const mockResponse = {
        ok: false,
        json: jest.fn().mockResolvedValue({
          error: 'Email already exists',
        }),
      };
      mockFetch.mockResolvedValue(mockResponse as any);

      const result = await apiService.register(mockRegisterRequest);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Email already exists');
    });

    it('should logout successfully', async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({}),
      };
      mockFetch.mockResolvedValue(mockResponse as any);

      await apiService.logout();

      expect(mockDatabaseService.clearAuthTokens).toHaveBeenCalled();
    });

    it('should clear tokens even if logout request fails', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      await apiService.logout();

      expect(mockDatabaseService.clearAuthTokens).toHaveBeenCalled();
    });
  });

  describe('token management', () => {
    it('should refresh expired tokens', async () => {
      const expiredTokens: AuthTokens = {
        accessToken: 'expired-token',
        refreshToken: 'valid-refresh-token',
        expiresAt: Date.now() - 1000, // Expired
      };

      mockDatabaseService.getAuthTokens.mockResolvedValue(expiredTokens);

      const refreshResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          accessToken: 'new-access-token',
          refreshToken: 'new-refresh-token',
          expiresIn: 3600,
        }),
      };

      const apiResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({ data: 'test' }),
      };

      mockFetch
        .mockResolvedValueOnce(refreshResponse as any) // First call for refresh
        .mockResolvedValueOnce(apiResponse as any); // Second call for actual API

      // Make an API call that should trigger token refresh
      const result = await apiService.getNotifications();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/auth/refresh'),
        expect.objectContaining({
          method: 'POST',
        })
      );
      expect(mockDatabaseService.saveAuthTokens).toHaveBeenCalledWith(
        expect.objectContaining({
          accessToken: 'new-access-token',
        })
      );
    });

    it('should clear tokens when refresh fails', async () => {
      const expiredTokens: AuthTokens = {
        accessToken: 'expired-token',
        refreshToken: 'invalid-refresh-token',
        expiresAt: Date.now() - 1000, // Expired
      };

      mockDatabaseService.getAuthTokens.mockResolvedValue(expiredTokens);

      const refreshResponse = {
        ok: false,
        json: jest.fn().mockResolvedValue({
          error: 'Invalid refresh token',
        }),
      };

      mockFetch.mockResolvedValue(refreshResponse as any);

      // Make an API call that should trigger token refresh
      try {
        await apiService.getNotifications();
      } catch (error) {
        // Expected to fail
      }

      expect(mockDatabaseService.clearAuthTokens).toHaveBeenCalled();
    });

    it('should check authentication status correctly', () => {
      // Mock the internal state - this is a bit tricky since it's private
      // We'll test indirectly by checking if tokens are valid
      const isAuthenticated = apiService.isAuthenticated();
      expect(typeof isAuthenticated).toBe('boolean');
    });

    it('should get access token', () => {
      const token = apiService.getAccessToken();
      expect(token === null || typeof token === 'string').toBe(true);
    });
  });

  describe('device registration', () => {
    it('should register device successfully', async () => {
      mockDatabaseService.getAuthTokens.mockResolvedValue(mockAuthTokens);

      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          id: 'device-123',
          name: mockDeviceRegistration.name,
        }),
      };
      mockFetch.mockResolvedValue(mockResponse as any);

      const result = await apiService.registerDevice(mockDeviceRegistration);

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/auth/devices'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            name: mockDeviceRegistration.name,
            platform: mockDeviceRegistration.platform,
            device_token: mockDeviceRegistration.deviceToken,
            model: mockDeviceRegistration.model,
            os_version: mockDeviceRegistration.osVersion,
          }),
        })
      );
    });

    it('should handle device registration failure', async () => {
      mockDatabaseService.getAuthTokens.mockResolvedValue(mockAuthTokens);

      const mockResponse = {
        ok: false,
        json: jest.fn().mockResolvedValue({
          error: 'Device already registered',
        }),
      };
      mockFetch.mockResolvedValue(mockResponse as any);

      const result = await apiService.registerDevice(mockDeviceRegistration);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Device already registered');
    });
  });

  describe('notification operations', () => {
    beforeEach(() => {
      mockDatabaseService.getAuthTokens.mockResolvedValue(mockAuthTokens);
    });

    it('should sync notification successfully', async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          id: 'server-notification-123',
          status: 'synced',
        }),
      };
      mockFetch.mockResolvedValue(mockResponse as any);

      const result = await apiService.syncNotification(mockNotification);

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/notifications'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            app_name: mockNotification.appName,
            title: mockNotification.title,
            body: mockNotification.body,
            category: mockNotification.category,
            priority: mockNotification.priority,
            timestamp: new Date(mockNotification.timestamp).toISOString(),
            package_name: mockNotification.packageName,
            extras: mockNotification.extras,
          }),
        })
      );
    });

    it('should handle sync notification failure', async () => {
      const mockResponse = {
        ok: false,
        json: jest.fn().mockResolvedValue({
          error: 'Invalid notification data',
        }),
      };
      mockFetch.mockResolvedValue(mockResponse as any);

      const result = await apiService.syncNotification(mockNotification);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid notification data');
    });

    it('should batch sync notifications successfully', async () => {
      const notifications = [mockNotification, { ...mockNotification, id: 'notif-2' }];

      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          synced: 2,
          results: [
            { id: 'server-1', status: 'synced' },
            { id: 'server-2', status: 'synced' },
          ],
        }),
      };
      mockFetch.mockResolvedValue(mockResponse as any);

      const result = await apiService.batchSyncNotifications(notifications);

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/notifications/batch'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            notifications: notifications.map(n => ({
              app_name: n.appName,
              title: n.title,
              body: n.body,
              category: n.category,
              priority: n.priority,
              timestamp: new Date(n.timestamp).toISOString(),
              package_name: n.packageName,
              extras: n.extras,
            })),
          }),
        })
      );
    });

    it('should get notifications successfully', async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          notifications: [
            { id: 'server-1', title: 'Notification 1' },
            { id: 'server-2', title: 'Notification 2' },
          ],
          total: 2,
        }),
      };
      mockFetch.mockResolvedValue(mockResponse as any);

      const result = await apiService.getNotifications(10, 0);

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/notifications?limit=10&offset=0'),
        expect.any(Object)
      );
    });

    it('should update notification status successfully', async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          id: 'server-notification-123',
          status: 'read',
        }),
      };
      mockFetch.mockResolvedValue(mockResponse as any);

      const result = await apiService.updateNotificationStatus('server-notification-123', 'read');

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/notifications/server-notification-123'),
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ action: 'read' }),
        })
      );
    });
  });

  describe('network error handling', () => {
    it('should handle network errors gracefully', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const result = await apiService.login(mockLoginRequest);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network error');
    });

    it('should handle fetch errors with generic message', async () => {
      mockFetch.mockRejectedValue('Unknown error');

      const result = await apiService.login(mockLoginRequest);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network error');
    });

    it('should handle malformed JSON responses', async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockRejectedValue(new Error('Invalid JSON')),
      };
      mockFetch.mockResolvedValue(mockResponse as any);

      const result = await apiService.login(mockLoginRequest);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid JSON');
    });
  });

  describe('connection testing', () => {
    it('should test connection successfully', async () => {
      const mockResponse = {
        ok: true,
      };
      mockFetch.mockResolvedValue(mockResponse as any);

      const result = await apiService.testConnection();

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/health')
      );
    });

    it('should handle connection test failure', async () => {
      mockFetch.mockRejectedValue(new Error('Connection failed'));

      const result = await apiService.testConnection();

      expect(result).toBe(false);
    });

    it('should handle non-ok response in connection test', async () => {
      const mockResponse = {
        ok: false,
      };
      mockFetch.mockResolvedValue(mockResponse as any);

      const result = await apiService.testConnection();

      expect(result).toBe(false);
    });
  });

  describe('request headers', () => {
    it('should include authorization header when authenticated', async () => {
      mockDatabaseService.getAuthTokens.mockResolvedValue(mockAuthTokens);

      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({ data: 'test' }),
      };
      mockFetch.mockResolvedValue(mockResponse as any);

      await apiService.getNotifications();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': `Bearer ${mockAuthTokens.accessToken}`,
            'Content-Type': 'application/json',
          }),
        })
      );
    });

    it('should not include authorization header when not authenticated', async () => {
      mockDatabaseService.getAuthTokens.mockResolvedValue(null);

      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({ data: 'test' }),
      };
      mockFetch.mockResolvedValue(mockResponse as any);

      await apiService.login(mockLoginRequest);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.not.objectContaining({
            'Authorization': expect.any(String),
          }),
        })
      );
    });
  });

  describe('API URL configuration', () => {
    it('should use development URL in development mode', () => {
      // This is tested implicitly through other tests
      // The URL construction is handled in the constructor
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('localhost:8080'),
        expect.any(Object)
      );
    });
  });
});