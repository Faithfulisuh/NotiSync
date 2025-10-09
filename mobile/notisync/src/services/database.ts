import * as SQLite from 'expo-sqlite';
import { CapturedNotification, SyncedNotification, NotificationStats } from '../types/notification';
import { migrationService } from './migrations';

export interface DatabaseUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  createdAt: number;
  updatedAt: number;
}

export interface SyncQueueItem {
  id: string;
  notificationId: string;
  action: 'create' | 'update' | 'delete';
  data: string; // JSON stringified data
  attempts: number;
  createdAt: number;
  lastAttempt?: number;
  error?: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

class DatabaseService {
  private static instance: DatabaseService;
  private db: SQLite.SQLiteDatabase | null = null;
  private isInitialized = false;

  private constructor() {}

  static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService();
    }
    return DatabaseService.instance;
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      this.db = await SQLite.openDatabaseAsync('notisync.db');
      await migrationService.runMigrations(this.db);
      this.isInitialized = true;
      console.log('Database initialized successfully');
    } catch (error) {
      console.error('Failed to initialize database:', error);
      throw error;
    }
  }



  // Auth token methods
  async saveAuthTokens(tokens: AuthTokens): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    await this.db.runAsync(
      'DELETE FROM auth_tokens', // Clear existing tokens
    );

    await this.db.runAsync(
      `INSERT INTO auth_tokens (access_token, refresh_token, expires_at, created_at) 
       VALUES (?, ?, ?, ?)`,
      [tokens.accessToken, tokens.refreshToken, tokens.expiresAt, Date.now()]
    );
  }

  async getAuthTokens(): Promise<AuthTokens | null> {
    if (!this.db) throw new Error('Database not initialized');

    const result = await this.db.getFirstAsync<{
      access_token: string;
      refresh_token: string;
      expires_at: number;
    }>('SELECT access_token, refresh_token, expires_at FROM auth_tokens ORDER BY created_at DESC LIMIT 1');

    if (!result) return null;

    return {
      accessToken: result.access_token,
      refreshToken: result.refresh_token,
      expiresAt: result.expires_at,
    };
  }

  async clearAuthTokens(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    await this.db.runAsync('DELETE FROM auth_tokens');
  }

  // User methods
  async saveUser(user: DatabaseUser): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    await this.db.runAsync(
      `INSERT OR REPLACE INTO users (id, email, first_name, last_name, created_at, updated_at) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [user.id, user.email, user.firstName, user.lastName, user.createdAt, user.updatedAt]
    );
  }

  async getUser(): Promise<DatabaseUser | null> {
    if (!this.db) throw new Error('Database not initialized');

    const result = await this.db.getFirstAsync<{
      id: string;
      email: string;
      first_name: string;
      last_name: string;
      created_at: number;
      updated_at: number;
    }>('SELECT * FROM users LIMIT 1');

    if (!result) return null;

    return {
      id: result.id,
      email: result.email,
      firstName: result.first_name,
      lastName: result.last_name,
      createdAt: result.created_at,
      updatedAt: result.updated_at,
    };
  }

  async clearUser(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    await this.db.runAsync('DELETE FROM users');
  }

  // Notification methods
  async saveNotification(notification: SyncedNotification): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const now = Date.now();
    await this.db.runAsync(
      `INSERT OR REPLACE INTO notifications 
       (id, server_id, app_name, title, body, category, priority, timestamp, package_name, 
        icon, actions, extras, synced, sync_attempts, last_sync_attempt, is_read, is_dismissed, 
        created_at, updated_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        notification.id,
        notification.serverId || null,
        notification.appName,
        notification.title,
        notification.body,
        notification.category || 'Personal',
        notification.priority,
        notification.timestamp,
        notification.packageName || null,
        notification.icon || null,
        notification.actions ? JSON.stringify(notification.actions) : null,
        notification.extras ? JSON.stringify(notification.extras) : null,
        notification.synced ? 1 : 0,
        notification.syncAttempts,
        notification.lastSyncAttempt || null,
        notification.isRead ? 1 : 0,
        notification.isDismissed ? 1 : 0,
        now,
        now,
      ]
    );
  }

  async getNotifications(limit = 50, offset = 0): Promise<SyncedNotification[]> {
    if (!this.db) throw new Error('Database not initialized');

    const results = await this.db.getAllAsync<any>(
      `SELECT * FROM notifications 
       ORDER BY timestamp DESC 
       LIMIT ? OFFSET ?`,
      [limit, offset]
    );

    return results.map(this.mapRowToNotification);
  }

  async getNotificationById(id: string): Promise<SyncedNotification | null> {
    if (!this.db) throw new Error('Database not initialized');

    const result = await this.db.getFirstAsync<any>(
      'SELECT * FROM notifications WHERE id = ?',
      [id]
    );

    return result ? this.mapRowToNotification(result) : null;
  }

  async getUnsyncedNotifications(): Promise<SyncedNotification[]> {
    if (!this.db) throw new Error('Database not initialized');

    const results = await this.db.getAllAsync<any>(
      'SELECT * FROM notifications WHERE synced = 0 ORDER BY timestamp ASC'
    );

    return results.map(this.mapRowToNotification);
  }

  async updateNotificationSyncStatus(
    id: string, 
    synced: boolean, 
    serverId?: string, 
    syncAttempts?: number
  ): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const updates: string[] = [];
    const values: any[] = [];

    updates.push('synced = ?');
    values.push(synced ? 1 : 0);

    if (serverId !== undefined) {
      updates.push('server_id = ?');
      values.push(serverId);
    }

    if (syncAttempts !== undefined) {
      updates.push('sync_attempts = ?');
      values.push(syncAttempts);
    }

    updates.push('last_sync_attempt = ?');
    values.push(Date.now());

    updates.push('updated_at = ?');
    values.push(Date.now());

    values.push(id);

    await this.db.runAsync(
      `UPDATE notifications SET ${updates.join(', ')} WHERE id = ?`,
      values
    );
  }

  async updateNotificationStatus(
    id: string, 
    isRead?: boolean, 
    isDismissed?: boolean
  ): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const updates: string[] = [];
    const values: any[] = [];

    if (isRead !== undefined) {
      updates.push('is_read = ?');
      values.push(isRead ? 1 : 0);
    }

    if (isDismissed !== undefined) {
      updates.push('is_dismissed = ?');
      values.push(isDismissed ? 1 : 0);
    }

    if (updates.length === 0) return;

    updates.push('updated_at = ?');
    values.push(Date.now());

    values.push(id);

    await this.db.runAsync(
      `UPDATE notifications SET ${updates.join(', ')} WHERE id = ?`,
      values
    );
  }

  async deleteNotification(id: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    await this.db.runAsync('DELETE FROM notifications WHERE id = ?', [id]);
  }

  async deleteExpiredNotifications(olderThanDays = 7): Promise<number> {
    if (!this.db) throw new Error('Database not initialized');

    const cutoffTime = Date.now() - (olderThanDays * 24 * 60 * 60 * 1000);
    const result = await this.db.runAsync(
      'DELETE FROM notifications WHERE timestamp < ?',
      [cutoffTime]
    );

    return result.changes;
  }

  private mapRowToNotification(row: any): SyncedNotification {
    return {
      id: row.id,
      serverId: row.server_id,
      appName: row.app_name,
      title: row.title,
      body: row.body,
      category: row.category,
      priority: row.priority,
      timestamp: row.timestamp,
      packageName: row.package_name,
      icon: row.icon,
      actions: row.actions ? JSON.parse(row.actions) : undefined,
      extras: row.extras ? JSON.parse(row.extras) : undefined,
      synced: row.synced === 1,
      syncAttempts: row.sync_attempts,
      lastSyncAttempt: row.last_sync_attempt,
      isRead: row.is_read === 1,
      isDismissed: row.is_dismissed === 1,
    };
  }

  // Sync queue methods
  async addToSyncQueue(item: Omit<SyncQueueItem, 'id' | 'createdAt'>): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const id = `sync_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    await this.db.runAsync(
      `INSERT INTO sync_queue (id, notification_id, action, data, attempts, created_at, last_attempt, error) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        item.notificationId,
        item.action,
        item.data,
        item.attempts,
        Date.now(),
        item.lastAttempt || null,
        item.error || null,
      ]
    );
  }

  async getSyncQueue(limit = 50): Promise<SyncQueueItem[]> {
    if (!this.db) throw new Error('Database not initialized');

    const results = await this.db.getAllAsync<{
      id: string;
      notification_id: string;
      action: string;
      data: string;
      attempts: number;
      created_at: number;
      last_attempt: number | null;
      error: string | null;
    }>(`SELECT * FROM sync_queue ORDER BY created_at ASC LIMIT ?`, [limit]);

    return results.map(row => ({
      id: row.id,
      notificationId: row.notification_id,
      action: row.action as 'create' | 'update' | 'delete',
      data: row.data,
      attempts: row.attempts,
      createdAt: row.created_at,
      lastAttempt: row.last_attempt || undefined,
      error: row.error || undefined,
    }));
  }

  async updateSyncQueueItem(id: string, attempts: number, error?: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    await this.db.runAsync(
      'UPDATE sync_queue SET attempts = ?, last_attempt = ?, error = ? WHERE id = ?',
      [attempts, Date.now(), error || null, id]
    );
  }

  async removeSyncQueueItem(id: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    await this.db.runAsync('DELETE FROM sync_queue WHERE id = ?', [id]);
  }

  async clearSyncQueue(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    await this.db.runAsync('DELETE FROM sync_queue');
  }

  // Statistics methods
  async getNotificationStats(): Promise<NotificationStats> {
    if (!this.db) throw new Error('Database not initialized');

    const totalResult = await this.db.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) as count FROM notifications'
    );

    const syncedResult = await this.db.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) as count FROM notifications WHERE synced = 1'
    );

    const pendingResult = await this.db.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) as count FROM notifications WHERE synced = 0'
    );

    const lastSyncResult = await this.db.getFirstAsync<{ last_sync: number | null }>(
      'SELECT MAX(last_sync_attempt) as last_sync FROM notifications WHERE synced = 1'
    );

    const totalCaptured = totalResult?.count || 0;
    const totalSynced = syncedResult?.count || 0;
    const pendingSync = pendingResult?.count || 0;

    return {
      totalCaptured,
      totalSynced,
      pendingSync,
      lastSyncTime: lastSyncResult?.last_sync || undefined,
      captureRate: 100, // Assuming 100% capture rate for local storage
      syncSuccessRate: totalCaptured > 0 ? (totalSynced / totalCaptured) * 100 : 0,
    };
  }

  // Settings methods
  async setSetting(key: string, value: any): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    await this.db.runAsync(
      'INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)',
      [key, JSON.stringify(value), Date.now()]
    );
  }

  async getSetting<T>(key: string, defaultValue?: T): Promise<T | undefined> {
    if (!this.db) throw new Error('Database not initialized');

    const result = await this.db.getFirstAsync<{ value: string }>(
      'SELECT value FROM app_settings WHERE key = ?',
      [key]
    );

    if (!result) return defaultValue;

    try {
      return JSON.parse(result.value);
    } catch {
      return defaultValue;
    }
  }

  async deleteSetting(key: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    await this.db.runAsync('DELETE FROM app_settings WHERE key = ?', [key]);
  }

  // Utility methods
  async clearAllData(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    await this.db.execAsync(`
      DELETE FROM notifications;
      DELETE FROM sync_queue;
      DELETE FROM users;
      DELETE FROM auth_tokens;
      DELETE FROM app_settings;
    `);
  }

  async getDatabaseInfo(): Promise<{
    notificationCount: number;
    syncQueueCount: number;
    databaseSize: string;
  }> {
    if (!this.db) throw new Error('Database not initialized');

    const notificationResult = await this.db.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) as count FROM notifications'
    );

    const syncQueueResult = await this.db.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) as count FROM sync_queue'
    );

    return {
      notificationCount: notificationResult?.count || 0,
      syncQueueCount: syncQueueResult?.count || 0,
      databaseSize: 'Unknown', // SQLite doesn't provide easy size info
    };
  }
}

export const databaseService = DatabaseService.getInstance();