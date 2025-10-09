import * as TaskManager from 'expo-task-manager';
import * as BackgroundFetch from 'expo-background-fetch';
import * as Network from 'expo-network';
import { storageService } from './storage';
import { apiService } from './api';
import { webSocketService } from './websocket';
import { SyncedNotification } from '../types/notification';
import { SyncQueueItem } from './database';

const BACKGROUND_SYNC_TASK = 'BACKGROUND_SYNC_TASK';
const RETRY_SYNC_TASK = 'RETRY_SYNC_TASK';

export interface BackgroundSyncConfig {
  enabled: boolean;
  syncInterval: number; // seconds
  retryInterval: number; // seconds
  maxRetryAttempts: number;
  batchSize: number;
  maxBatchSize: number;
  exponentialBackoffBase: number;
  maxBackoffDelay: number; // milliseconds
  conflictResolutionStrategy: 'client-wins' | 'server-wins' | 'timestamp-based' | 'merge';
  enableBatchOptimization: boolean;
  enableConflictResolution: boolean;
  networkRequiredForSync: boolean;
}

export interface SyncOperation {
  id: string;
  type: 'create' | 'update' | 'delete' | 'batch';
  notificationId?: string;
  data: any;
  attempts: number;
  lastAttempt?: number;
  nextRetry?: number;
  priority: number;
  createdAt: number;
}

export interface SyncResult {
  success: boolean;
  operation: SyncOperation;
  serverResponse?: any;
  error?: string;
  conflictResolved?: boolean;
  retryAfter?: number;
}

export interface SyncBatch {
  id: string;
  operations: SyncOperation[];
  totalSize: number;
  createdAt: number;
  priority: number;
}

export interface SyncStats {
  totalSyncAttempts: number;
  successfulSyncs: number;
  failedSyncs: number;
  conflictsResolved: number;
  batchesSynced: number;
  averageSyncTime: number;
  lastSyncTime?: number;
  lastSuccessfulSync?: number;
  currentRetryCount: number;
  networkErrors: number;
  serverErrors: number;
  syncErrors: string[];
}

export interface ConflictResolution {
  notificationId: string;
  clientVersion: SyncedNotification;
  serverVersion: any;
  resolution: 'client' | 'server' | 'merged';
  resolvedVersion: SyncedNotification;
  timestamp: number;
}

class BackgroundSyncService {
  private static instance: BackgroundSyncService;
  private isRunning = false;
  private isSyncing = false;
  private config: BackgroundSyncConfig;
  private stats: SyncStats;
  private syncQueue: SyncOperation[] = [];
  private conflictResolutions: ConflictResolution[] = [];
  private networkState: Network.NetworkState | null = null;

  private constructor() {
    this.config = {
      enabled: true,
      syncInterval: 30, // 30 seconds
      retryInterval: 60, // 1 minute
      maxRetryAttempts: 5,
      batchSize: 20,
      maxBatchSize: 100,
      exponentialBackoffBase: 2,
      maxBackoffDelay: 300000, // 5 minutes
      conflictResolutionStrategy: 'timestamp-based',
      enableBatchOptimization: true,
      enableConflictResolution: true,
      networkRequiredForSync: true,
    };

    this.stats = {
      totalSyncAttempts: 0,
      successfulSyncs: 0,
      failedSyncs: 0,
      conflictsResolved: 0,
      batchesSynced: 0,
      averageSyncTime: 0,
      currentRetryCount: 0,
      networkErrors: 0,
      serverErrors: 0,
      syncErrors: [],
    };

    this.setupTaskManager();
    this.loadConfiguration();
    this.setupNetworkListener();
  }

  static getInstance(): BackgroundSyncService {
    if (!BackgroundSyncService.instance) {
      BackgroundSyncService.instance = new BackgroundSyncService();
    }
    return BackgroundSyncService.instance;
  }

  private async loadConfiguration(): Promise<void> {
    try {
      const config = await storageService.getSetting<BackgroundSyncConfig>('background_sync_config');
      if (config) {
        this.config = { ...this.config, ...config };
      }

      const stats = await storageService.getSetting<SyncStats>('background_sync_stats');
      if (stats) {
        this.stats = { ...this.stats, ...stats };
      }

      const queue = await storageService.getSetting<SyncOperation[]>('sync_operations_queue', []);
      this.syncQueue = queue;
    } catch (error) {
      console.error('Failed to load background sync configuration:', error);
    }
  }

  private async saveConfiguration(): Promise<void> {
    try {
      await storageService.setSetting('background_sync_config', this.config);
      await storageService.setSetting('background_sync_stats', this.stats);
      await storageService.setSetting('sync_operations_queue', this.syncQueue);
    } catch (error) {
      console.error('Failed to save background sync configuration:', error);
    }
  }

  private setupNetworkListener(): void {
    // Monitor network state changes
    Network.getNetworkStateAsync().then(state => {
      this.networkState = state;
      if (state.isConnected && this.isRunning) {
        // Trigger sync when network becomes available
        this.performSync();
      }
    });
  }

  private setupTaskManager(): void {
    // Main background sync task
    TaskManager.defineTask(BACKGROUND_SYNC_TASK, async () => {
      try {
        if (!this.config.enabled || this.isSyncing) {
          return BackgroundFetch.BackgroundFetchResult.NoData;
        }

        const result = await this.performSync();
        return result ? BackgroundFetch.BackgroundFetchResult.NewData : BackgroundFetch.BackgroundFetchResult.NoData;
      } catch (error) {
        console.error('Background sync task failed:', error);
        this.addSyncError(`Background sync failed: ${error}`);
        return BackgroundFetch.BackgroundFetchResult.Failed;
      }
    });

    // Retry sync task for failed operations
    TaskManager.defineTask(RETRY_SYNC_TASK, async () => {
      try {
        if (!this.config.enabled) {
          return BackgroundFetch.BackgroundFetchResult.NoData;
        }

        const result = await this.retryFailedOperations();
        return result ? BackgroundFetch.BackgroundFetchResult.NewData : BackgroundFetch.BackgroundFetchResult.NoData;
      } catch (error) {
        console.error('Retry sync task failed:', error);
        return BackgroundFetch.BackgroundFetchResult.Failed;
      }
    });
  }

  async startBackgroundSync(): Promise<boolean> {
    if (this.isRunning) {
      console.log('Background sync is already running');
      return true;
    }

    try {
      await storageService.initialize();

      // Register background tasks
      await BackgroundFetch.registerTaskAsync(BACKGROUND_SYNC_TASK, {
        minimumInterval: this.config.syncInterval,
        stopOnTerminate: false,
        startOnBoot: true,
      });

      await BackgroundFetch.registerTaskAsync(RETRY_SYNC_TASK, {
        minimumInterval: this.config.retryInterval,
        stopOnTerminate: false,
        startOnBoot: true,
      });

      this.isRunning = true;
      console.log('Background sync started successfully');

      // Perform initial sync if network is available
      if (await this.isNetworkAvailable()) {
        this.performSync();
      }

      return true;
    } catch (error) {
      console.error('Failed to start background sync:', error);
      return false;
    }
  }

  async stopBackgroundSync(): Promise<void> {
    if (!this.isRunning) {
      console.log('Background sync is not running');
      return;
    }

    try {
      await BackgroundFetch.unregisterTaskAsync(BACKGROUND_SYNC_TASK);
      await BackgroundFetch.unregisterTaskAsync(RETRY_SYNC_TASK);

      this.isRunning = false;
      console.log('Background sync stopped successfully');
    } catch (error) {
      console.error('Failed to stop background sync:', error);
    }
  }

  private async isNetworkAvailable(): Promise<boolean> {
    if (!this.config.networkRequiredForSync) {
      return true;
    }

    try {
      const networkState = await Network.getNetworkStateAsync();
      this.networkState = networkState;
      return networkState.isConnected === true;
    } catch (error) {
      console.error('Failed to check network state:', error);
      return false;
    }
  }

  async performSync(): Promise<boolean> {
    if (this.isSyncing) {
      console.log('Sync already in progress');
      return false;
    }

    if (!await this.isNetworkAvailable()) {
      console.log('Network not available, skipping sync');
      return false;
    }

    this.isSyncing = true;
    const startTime = Date.now();
    let syncedOperations = 0;

    try {
      this.stats.totalSyncAttempts++;

      // Get pending operations from storage
      await this.loadPendingOperations();

      if (this.syncQueue.length === 0) {
        console.log('No operations to sync');
        return false;
      }

      console.log(`Starting sync of ${this.syncQueue.length} operations`);

      // Optimize operations into batches if enabled
      const batches = this.config.enableBatchOptimization 
        ? this.optimizeIntoBatches(this.syncQueue)
        : this.syncQueue.map(op => ({ id: `batch_${op.id}`, operations: [op], totalSize: 1, createdAt: Date.now(), priority: op.priority }));

      // Process batches in priority order
      batches.sort((a, b) => b.priority - a.priority);

      for (const batch of batches) {
        try {
          const batchResult = await this.processBatch(batch);
          if (batchResult.success) {
            syncedOperations += batch.operations.length;
            this.stats.batchesSynced++;
            
            // Remove successful operations from queue
            this.syncQueue = this.syncQueue.filter(op => 
              !batch.operations.some(batchOp => batchOp.id === op.id)
            );
          } else {
            // Handle batch failure - update retry info for operations
            this.handleBatchFailure(batch, batchResult.error);
          }
        } catch (error) {
          console.error('Batch processing failed:', error);
          this.handleBatchFailure(batch, error instanceof Error ? error.message : String(error));
        }
      }

      // Update statistics
      const syncTime = Date.now() - startTime;
      this.stats.averageSyncTime = (this.stats.averageSyncTime + syncTime) / 2;
      this.stats.lastSyncTime = Date.now();

      if (syncedOperations > 0) {
        this.stats.successfulSyncs += syncedOperations;
        this.stats.lastSuccessfulSync = Date.now();
        console.log(`Sync completed: ${syncedOperations} operations synced in ${syncTime}ms`);
      }

      await this.saveConfiguration();
      return syncedOperations > 0;

    } catch (error) {
      console.error('Sync failed:', error);
      this.stats.failedSyncs++;
      this.addSyncError(`Sync failed: ${error}`);
      return false;
    } finally {
      this.isSyncing = false;
    }
  }

  private async loadPendingOperations(): Promise<void> {
    try {
      // Load from storage service sync queue
      const storageQueue = await storageService.getSyncQueue(1000);
      
      // Convert storage queue items to sync operations
      const operations: SyncOperation[] = storageQueue.map(item => ({
        id: item.id,
        type: item.action as 'create' | 'update' | 'delete',
        notificationId: item.notificationId,
        data: JSON.parse(item.data),
        attempts: item.attempts,
        lastAttempt: item.lastAttempt,
        nextRetry: this.calculateNextRetry(item.attempts, item.lastAttempt),
        priority: this.calculateOperationPriority(item),
        createdAt: item.createdAt,
      }));

      // Merge with existing queue, avoiding duplicates
      for (const operation of operations) {
        if (!this.syncQueue.some(existing => existing.id === operation.id)) {
          this.syncQueue.push(operation);
        }
      }

      // Sort by priority and creation time
      this.syncQueue.sort((a, b) => {
        if (a.priority !== b.priority) {
          return b.priority - a.priority;
        }
        return a.createdAt - b.createdAt;
      });

    } catch (error) {
      console.error('Failed to load pending operations:', error);
    }
  }

  private calculateOperationPriority(item: SyncQueueItem): number {
    let priority = 1;

    // Higher priority for newer operations
    const age = Date.now() - item.createdAt;
    if (age < 60000) priority += 2; // Less than 1 minute
    else if (age < 300000) priority += 1; // Less than 5 minutes

    // Higher priority for create operations
    if (item.action === 'create') priority += 1;

    // Lower priority for operations with many failed attempts
    priority -= Math.min(item.attempts, 3);

    return Math.max(0, priority);
  }

  private calculateNextRetry(attempts: number, lastAttempt?: number): number {
    if (!lastAttempt) return Date.now();

    const backoffDelay = Math.min(
      Math.pow(this.config.exponentialBackoffBase, attempts) * 1000,
      this.config.maxBackoffDelay
    );

    return lastAttempt + backoffDelay;
  }

  private optimizeIntoBatches(operations: SyncOperation[]): SyncBatch[] {
    const batches: SyncBatch[] = [];
    let currentBatch: SyncOperation[] = [];
    let currentBatchSize = 0;

    // Group operations by type and priority for better batching
    const groupedOps = operations.reduce((groups, op) => {
      const key = `${op.type}_${op.priority}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(op);
      return groups;
    }, {} as Record<string, SyncOperation[]>);

    for (const [key, ops] of Object.entries(groupedOps)) {
      for (const op of ops) {
        if (currentBatchSize >= this.config.batchSize || 
            (currentBatch.length > 0 && this.shouldStartNewBatch(currentBatch[0], op))) {
          
          // Finalize current batch
          if (currentBatch.length > 0) {
            batches.push({
              id: `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              operations: [...currentBatch],
              totalSize: currentBatchSize,
              createdAt: Date.now(),
              priority: Math.max(...currentBatch.map(o => o.priority)),
            });
          }

          currentBatch = [];
          currentBatchSize = 0;
        }

        currentBatch.push(op);
        currentBatchSize++;

        if (currentBatchSize >= this.config.maxBatchSize) {
          batches.push({
            id: `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            operations: [...currentBatch],
            totalSize: currentBatchSize,
            createdAt: Date.now(),
            priority: Math.max(...currentBatch.map(o => o.priority)),
          });

          currentBatch = [];
          currentBatchSize = 0;
        }
      }
    }

    // Add remaining operations as final batch
    if (currentBatch.length > 0) {
      batches.push({
        id: `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        operations: currentBatch,
        totalSize: currentBatchSize,
        createdAt: Date.now(),
        priority: Math.max(...currentBatch.map(o => o.priority)),
      });
    }

    return batches;
  }

  private shouldStartNewBatch(currentOp: SyncOperation, newOp: SyncOperation): boolean {
    // Start new batch if operation types are different
    if (currentOp.type !== newOp.type) return true;
    
    // Start new batch if priorities are significantly different
    if (Math.abs(currentOp.priority - newOp.priority) > 1) return true;

    return false;
  }

  private async processBatch(batch: SyncBatch): Promise<{ success: boolean; error?: string }> {
    try {
      if (batch.operations.length === 1) {
        // Single operation
        const result = await this.processSingleOperation(batch.operations[0]);
        return { success: result.success, error: result.error };
      } else {
        // Batch operation
        const result = await this.processBatchOperation(batch);
        return { success: result.success, error: result.error };
      }
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : String(error) 
      };
    }
  }

  private async processSingleOperation(operation: SyncOperation): Promise<SyncResult> {
    const startTime = Date.now();

    try {
      let result: any;

      switch (operation.type) {
        case 'create':
          result = await this.syncCreateNotification(operation);
          break;
        case 'update':
          result = await this.syncUpdateNotification(operation);
          break;
        case 'delete':
          result = await this.syncDeleteNotification(operation);
          break;
        default:
          throw new Error(`Unknown operation type: ${operation.type}`);
      }

      // Handle potential conflicts
      if (this.config.enableConflictResolution && result.conflict) {
        const resolution = await this.resolveConflict(operation, result);
        if (resolution) {
          this.stats.conflictsResolved++;
          return {
            success: true,
            operation,
            serverResponse: result,
            conflictResolved: true,
          };
        }
      }

      // Remove from storage queue on success
      if (result.success !== false) {
        await storageService.removeSyncQueueItem(operation.id);
      }

      return {
        success: result.success !== false,
        operation,
        serverResponse: result,
      };

    } catch (error) {
      console.error(`Operation ${operation.id} failed:`, error);
      
      // Update retry information
      operation.attempts++;
      operation.lastAttempt = Date.now();
      operation.nextRetry = this.calculateNextRetry(operation.attempts, operation.lastAttempt);

      // Update in storage
      await storageService.updateSyncQueueItem(
        operation.id, 
        operation.attempts, 
        error instanceof Error ? error.message : String(error)
      );

      return {
        success: false,
        operation,
        error: error instanceof Error ? error.message : String(error),
        retryAfter: operation.nextRetry,
      };
    }
  }

  private async processBatchOperation(batch: SyncBatch): Promise<{ success: boolean; error?: string }> {
    try {
      // Group operations by type for batch API calls
      const createOps = batch.operations.filter(op => op.type === 'create');
      const updateOps = batch.operations.filter(op => op.type === 'update');
      const deleteOps = batch.operations.filter(op => op.type === 'delete');

      let allSuccessful = true;
      let errors: string[] = [];

      // Process creates in batch
      if (createOps.length > 0) {
        try {
          const notifications = createOps.map(op => op.data);
          const result = await apiService.batchSyncNotifications(notifications);
          
          if (result.success) {
            // Remove successful operations from storage
            for (const op of createOps) {
              await storageService.removeSyncQueueItem(op.id);
            }
          } else {
            allSuccessful = false;
            errors.push(`Batch create failed: ${result.error}`);
          }
        } catch (error) {
          allSuccessful = false;
          errors.push(`Batch create error: ${error}`);
        }
      }

      // Process updates individually (usually need individual handling)
      for (const op of updateOps) {
        const result = await this.processSingleOperation(op);
        if (!result.success) {
          allSuccessful = false;
          if (result.error) errors.push(result.error);
        }
      }

      // Process deletes individually
      for (const op of deleteOps) {
        const result = await this.processSingleOperation(op);
        if (!result.success) {
          allSuccessful = false;
          if (result.error) errors.push(result.error);
        }
      }

      return {
        success: allSuccessful,
        error: errors.length > 0 ? errors.join('; ') : undefined,
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async syncCreateNotification(operation: SyncOperation): Promise<any> {
    const notification = operation.data;
    const result = await apiService.syncNotification(notification);
    
    if (result.success && result.data?.id) {
      // Update local notification with server ID
      await storageService.markAsSynced(operation.notificationId!, result.data.id);
    }
    
    return result;
  }

  private async syncUpdateNotification(operation: SyncOperation): Promise<any> {
    const { notificationId, ...updateData } = operation.data;
    
    if (!notificationId) {
      throw new Error('Notification ID required for update operation');
    }

    const result = await apiService.updateNotificationStatus(notificationId, updateData.action || 'update');
    return result;
  }

  private async syncDeleteNotification(operation: SyncOperation): Promise<any> {
    const { notificationId } = operation.data;
    
    if (!notificationId) {
      throw new Error('Notification ID required for delete operation');
    }

    // For delete, we might not have a specific API endpoint, so we mark as dismissed
    const result = await apiService.updateNotificationStatus(notificationId, 'dismiss');
    return result;
  }

  private async resolveConflict(operation: SyncOperation, serverResult: any): Promise<ConflictResolution | null> {
    if (!operation.notificationId) return null;

    try {
      const localNotification = await storageService.getNotificationById(operation.notificationId);
      if (!localNotification) return null;

      const serverNotification = serverResult.data;
      let resolvedVersion: SyncedNotification;
      let resolutionType: 'client' | 'server' | 'merged';

      switch (this.config.conflictResolutionStrategy) {
        case 'client-wins':
          resolvedVersion = localNotification;
          resolutionType = 'client';
          break;

        case 'server-wins':
          resolvedVersion = { ...localNotification, ...serverNotification };
          resolutionType = 'server';
          break;

        case 'timestamp-based':
          const localTime = localNotification.timestamp;
          const serverTime = new Date(serverNotification.timestamp || 0).getTime();
          
          if (localTime > serverTime) {
            resolvedVersion = localNotification;
            resolutionType = 'client';
          } else {
            resolvedVersion = { ...localNotification, ...serverNotification };
            resolutionType = 'server';
          }
          break;

        case 'merge':
          resolvedVersion = this.mergeNotifications(localNotification, serverNotification);
          resolutionType = 'merged';
          break;

        default:
          resolvedVersion = localNotification;
          resolutionType = 'client';
      }

      // Apply resolution
      await storageService.updateNotification(operation.notificationId, resolvedVersion);

      const resolution: ConflictResolution = {
        notificationId: operation.notificationId,
        clientVersion: localNotification,
        serverVersion: serverNotification,
        resolution: resolutionType,
        resolvedVersion,
        timestamp: Date.now(),
      };

      this.conflictResolutions.push(resolution);
      
      // Keep only last 100 conflict resolutions
      if (this.conflictResolutions.length > 100) {
        this.conflictResolutions = this.conflictResolutions.slice(-100);
      }

      return resolution;

    } catch (error) {
      console.error('Conflict resolution failed:', error);
      return null;
    }
  }

  private mergeNotifications(local: SyncedNotification, server: any): SyncedNotification {
    // Smart merge logic - prefer server for content, client for user actions
    return {
      ...local,
      title: server.title || local.title,
      body: server.body || local.body,
      category: server.category || local.category,
      priority: server.priority !== undefined ? server.priority : local.priority,
      // Keep client's read/dismissed status (user actions)
      isRead: local.isRead,
      isDismissed: local.isDismissed,
      // Update sync info
      serverId: server.id || local.serverId,
      synced: true,
      syncAttempts: local.syncAttempts,
    };
  }

  private handleBatchFailure(batch: SyncBatch, error: string): void {
    // Update retry information for all operations in the failed batch
    for (const operation of batch.operations) {
      operation.attempts++;
      operation.lastAttempt = Date.now();
      operation.nextRetry = this.calculateNextRetry(operation.attempts, operation.lastAttempt);

      // Update in storage
      storageService.updateSyncQueueItem(operation.id, operation.attempts, error);
    }

    this.stats.failedSyncs += batch.operations.length;
    this.addSyncError(`Batch failed: ${error}`);
  }

  private async retryFailedOperations(): Promise<boolean> {
    const now = Date.now();
    const retryableOps = this.syncQueue.filter(op => 
      op.attempts < this.config.maxRetryAttempts &&
      (!op.nextRetry || op.nextRetry <= now)
    );

    if (retryableOps.length === 0) {
      return false;
    }

    console.log(`Retrying ${retryableOps.length} failed operations`);

    let retriedCount = 0;
    for (const operation of retryableOps) {
      try {
        const result = await this.processSingleOperation(operation);
        if (result.success) {
          retriedCount++;
          // Remove from queue
          this.syncQueue = this.syncQueue.filter(op => op.id !== operation.id);
        }
      } catch (error) {
        console.error(`Retry failed for operation ${operation.id}:`, error);
      }
    }

    if (retriedCount > 0) {
      this.stats.currentRetryCount = Math.max(0, this.stats.currentRetryCount - retriedCount);
      await this.saveConfiguration();
    }

    return retriedCount > 0;
  }

  private addSyncError(error: string): void {
    this.stats.syncErrors.push(`${new Date().toISOString()}: ${error}`);
    
    // Keep only last 50 errors
    if (this.stats.syncErrors.length > 50) {
      this.stats.syncErrors = this.stats.syncErrors.slice(-50);
    }
  }

  // Public API methods
  isRunning(): boolean {
    return this.isRunning;
  }

  isSyncInProgress(): boolean {
    return this.isSyncing;
  }

  getStats(): SyncStats {
    return { ...this.stats };
  }

  getConfig(): BackgroundSyncConfig {
    return { ...this.config };
  }

  async updateConfig(newConfig: Partial<BackgroundSyncConfig>): Promise<void> {
    this.config = { ...this.config, ...newConfig };
    await this.saveConfiguration();

    // Restart sync if running to apply new config
    if (this.isRunning) {
      await this.stopBackgroundSync();
      await this.startBackgroundSync();
    }
  }

  async resetStats(): Promise<void> {
    this.stats = {
      totalSyncAttempts: 0,
      successfulSyncs: 0,
      failedSyncs: 0,
      conflictsResolved: 0,
      batchesSynced: 0,
      averageSyncTime: 0,
      currentRetryCount: 0,
      networkErrors: 0,
      serverErrors: 0,
      syncErrors: [],
    };
    await this.saveConfiguration();
  }

  getConflictResolutions(): ConflictResolution[] {
    return [...this.conflictResolutions];
  }

  getPendingOperationsCount(): number {
    return this.syncQueue.length;
  }

  async forceSyncNow(): Promise<boolean> {
    if (!this.isRunning) {
      throw new Error('Background sync is not running');
    }

    return await this.performSync();
  }

  async clearSyncQueue(): Promise<void> {
    this.syncQueue = [];
    await storageService.clearSyncQueue();
    await this.saveConfiguration();
  }

  getSyncStatus(): {
    isRunning: boolean;
    isSyncing: boolean;
    pendingOperations: number;
    lastSync?: Date;
    lastSuccessfulSync?: Date;
    networkAvailable: boolean;
  } {
    return {
      isRunning: this.isRunning,
      isSyncing: this.isSyncing,
      pendingOperations: this.syncQueue.length,
      lastSync: this.stats.lastSyncTime ? new Date(this.stats.lastSyncTime) : undefined,
      lastSuccessfulSync: this.stats.lastSuccessfulSync ? new Date(this.stats.lastSuccessfulSync) : undefined,
      networkAvailable: this.networkState?.isConnected === true,
    };
  }
}

export const backgroundSyncService = BackgroundSyncService.getInstance();