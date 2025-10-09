import { CapturedNotification } from '../types/notification';
import { storageService } from './storage';

export interface FilterRule {
  id: string;
  name: string;
  type: 'include' | 'exclude' | 'priority' | 'category';
  conditions: FilterCondition[];
  actions: FilterAction[];
  enabled: boolean;
  priority: number;
  createdAt: number;
  updatedAt: number;
}

export interface FilterCondition {
  field: 'appName' | 'packageName' | 'title' | 'body' | 'category' | 'priority';
  operator: 'equals' | 'contains' | 'startsWith' | 'endsWith' | 'regex' | 'greaterThan' | 'lessThan';
  value: string | number;
  caseSensitive?: boolean;
}

export interface FilterAction {
  type: 'block' | 'allow' | 'setPriority' | 'setCategory' | 'addTag';
  value?: string | number;
}

export interface DeduplicationConfig {
  enabled: boolean;
  windowMs: number; // Time window for deduplication
  fields: ('appName' | 'title' | 'body' | 'packageName')[];
  fuzzyMatching: boolean;
  similarityThreshold: number; // 0-1, for fuzzy matching
}

export interface NotificationFilterStats {
  totalProcessed: number;
  totalBlocked: number;
  totalAllowed: number;
  totalDeduplicated: number;
  ruleApplications: Record<string, number>;
  lastProcessedAt?: number;
}

class NotificationFilterService {
  private static instance: NotificationFilterService;
  private filterRules: FilterRule[] = [];
  private deduplicationConfig: DeduplicationConfig;
  private recentNotifications: Map<string, { notification: CapturedNotification; timestamp: number }> = new Map();
  private stats: NotificationFilterStats;

  private constructor() {
    this.deduplicationConfig = {
      enabled: true,
      windowMs: 5000, // 5 seconds
      fields: ['appName', 'title', 'body'],
      fuzzyMatching: false,
      similarityThreshold: 0.8,
    };

    this.stats = {
      totalProcessed: 0,
      totalBlocked: 0,
      totalAllowed: 0,
      totalDeduplicated: 0,
      ruleApplications: {},
    };

    this.loadConfiguration();
  }

  static getInstance(): NotificationFilterService {
    if (!NotificationFilterService.instance) {
      NotificationFilterService.instance = new NotificationFilterService();
    }
    return NotificationFilterService.instance;
  }

  private async loadConfiguration(): Promise<void> {
    try {
      // Load filter rules from storage
      const rules = await storageService.getSetting<FilterRule[]>('notification_filter_rules', []);
      this.filterRules = rules;

      // Load deduplication config
      const dedupConfig = await storageService.getSetting<DeduplicationConfig>('deduplication_config');
      if (dedupConfig) {
        this.deduplicationConfig = dedupConfig;
      }

      // Load stats
      const stats = await storageService.getSetting<NotificationFilterStats>('filter_stats');
      if (stats) {
        this.stats = stats;
      }
    } catch (error) {
      console.error('Failed to load filter configuration:', error);
    }
  }

  private async saveConfiguration(): Promise<void> {
    try {
      await storageService.setSetting('notification_filter_rules', this.filterRules);
      await storageService.setSetting('deduplication_config', this.deduplicationConfig);
      await storageService.setSetting('filter_stats', this.stats);
    } catch (error) {
      console.error('Failed to save filter configuration:', error);
    }
  }

  async processNotification(notification: CapturedNotification): Promise<{
    shouldCapture: boolean;
    modifiedNotification?: CapturedNotification;
    appliedRules: string[];
    reason?: string;
  }> {
    this.stats.totalProcessed++;
    this.stats.lastProcessedAt = Date.now();

    const appliedRules: string[] = [];
    let modifiedNotification = { ...notification };
    let shouldCapture = true;
    let reason: string | undefined;

    try {
      // Step 1: Check for duplicates
      if (this.deduplicationConfig.enabled) {
        const isDuplicate = this.checkForDuplicate(notification);
        if (isDuplicate) {
          this.stats.totalDeduplicated++;
          await this.saveConfiguration();
          return {
            shouldCapture: false,
            appliedRules: ['deduplication'],
            reason: 'Duplicate notification within deduplication window',
          };
        }
      }

      // Step 2: Apply filter rules in priority order
      const sortedRules = this.filterRules
        .filter(rule => rule.enabled)
        .sort((a, b) => b.priority - a.priority);

      for (const rule of sortedRules) {
        const ruleResult = this.applyRule(rule, modifiedNotification);
        
        if (ruleResult.applied) {
          appliedRules.push(rule.id);
          this.stats.ruleApplications[rule.id] = (this.stats.ruleApplications[rule.id] || 0) + 1;

          if (ruleResult.shouldBlock) {
            shouldCapture = false;
            reason = `Blocked by rule: ${rule.name}`;
            break;
          }

          if (ruleResult.modifiedNotification) {
            modifiedNotification = ruleResult.modifiedNotification;
          }
        }
      }

      // Step 3: Update stats and store recent notification for deduplication
      if (shouldCapture) {
        this.stats.totalAllowed++;
        this.addToRecentNotifications(modifiedNotification);
      } else {
        this.stats.totalBlocked++;
      }

      await this.saveConfiguration();

      return {
        shouldCapture,
        modifiedNotification: shouldCapture ? modifiedNotification : undefined,
        appliedRules,
        reason,
      };
    } catch (error) {
      console.error('Error processing notification filter:', error);
      // On error, allow the notification through
      return {
        shouldCapture: true,
        modifiedNotification: notification,
        appliedRules: [],
        reason: 'Filter processing error - notification allowed',
      };
    }
  }

  private checkForDuplicate(notification: CapturedNotification): boolean {
    const now = Date.now();
    const cutoff = now - this.deduplicationConfig.windowMs;

    // Clean up old entries
    for (const [key, entry] of this.recentNotifications.entries()) {
      if (entry.timestamp < cutoff) {
        this.recentNotifications.delete(key);
      }
    }

    // Generate deduplication key
    const dedupKey = this.generateDeduplicationKey(notification);

    // Check for exact match
    if (this.recentNotifications.has(dedupKey)) {
      return true;
    }

    // Check for fuzzy match if enabled
    if (this.deduplicationConfig.fuzzyMatching) {
      for (const [key, entry] of this.recentNotifications.entries()) {
        if (entry.timestamp >= cutoff) {
          const similarity = this.calculateSimilarity(notification, entry.notification);
          if (similarity >= this.deduplicationConfig.similarityThreshold) {
            return true;
          }
        }
      }
    }

    return false;
  }

  private generateDeduplicationKey(notification: CapturedNotification): string {
    const keyParts = this.deduplicationConfig.fields.map(field => {
      const value = notification[field];
      return typeof value === 'string' ? value.toLowerCase().trim() : String(value);
    });
    
    return keyParts.join('|');
  }

  private addToRecentNotifications(notification: CapturedNotification): void {
    const key = this.generateDeduplicationKey(notification);
    this.recentNotifications.set(key, {
      notification,
      timestamp: Date.now(),
    });
  }

  private calculateSimilarity(notif1: CapturedNotification, notif2: CapturedNotification): number {
    let totalSimilarity = 0;
    let fieldCount = 0;

    for (const field of this.deduplicationConfig.fields) {
      const value1 = String(notif1[field] || '').toLowerCase();
      const value2 = String(notif2[field] || '').toLowerCase();
      
      if (value1 || value2) {
        const similarity = this.stringSimilarity(value1, value2);
        totalSimilarity += similarity;
        fieldCount++;
      }
    }

    return fieldCount > 0 ? totalSimilarity / fieldCount : 0;
  }

  private stringSimilarity(str1: string, str2: string): number {
    // Simple Levenshtein distance-based similarity
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    
    if (longer.length === 0) return 1.0;
    
    const distance = this.levenshteinDistance(longer, shorter);
    return (longer.length - distance) / longer.length;
  }

  private levenshteinDistance(str1: string, str2: string): number {
    const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));
    
    for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;
    
    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1,
          matrix[j - 1][i] + 1,
          matrix[j - 1][i - 1] + indicator
        );
      }
    }
    
    return matrix[str2.length][str1.length];
  }

  private applyRule(rule: FilterRule, notification: CapturedNotification): {
    applied: boolean;
    shouldBlock: boolean;
    modifiedNotification?: CapturedNotification;
  } {
    // Check if all conditions match
    const conditionsMatch = rule.conditions.every(condition => 
      this.evaluateCondition(condition, notification)
    );

    if (!conditionsMatch) {
      return { applied: false, shouldBlock: false };
    }

    // Apply actions
    let shouldBlock = false;
    let modifiedNotification = { ...notification };

    for (const action of rule.actions) {
      switch (action.type) {
        case 'block':
          shouldBlock = true;
          break;
        case 'allow':
          // Explicitly allow (useful for override rules)
          break;
        case 'setPriority':
          if (typeof action.value === 'number') {
            modifiedNotification.priority = action.value;
          }
          break;
        case 'setCategory':
          if (typeof action.value === 'string' && 
              ['Work', 'Personal', 'Junk'].includes(action.value)) {
            modifiedNotification.category = action.value as 'Work' | 'Personal' | 'Junk';
          }
          break;
        case 'addTag':
          if (typeof action.value === 'string') {
            modifiedNotification.extras = {
              ...modifiedNotification.extras,
              tags: [...(modifiedNotification.extras?.tags || []), action.value],
            };
          }
          break;
      }
    }

    return {
      applied: true,
      shouldBlock,
      modifiedNotification: shouldBlock ? undefined : modifiedNotification,
    };
  }

  private evaluateCondition(condition: FilterCondition, notification: CapturedNotification): boolean {
    const fieldValue = notification[condition.field];
    const conditionValue = condition.value;

    if (fieldValue === undefined || fieldValue === null) {
      return false;
    }

    const stringValue = String(fieldValue);
    const stringConditionValue = String(conditionValue);

    const actualStringValue = condition.caseSensitive !== false ? 
      stringValue : stringValue.toLowerCase();
    const actualConditionValue = condition.caseSensitive !== false ? 
      stringConditionValue : stringConditionValue.toLowerCase();

    switch (condition.operator) {
      case 'equals':
        return actualStringValue === actualConditionValue;
      case 'contains':
        return actualStringValue.includes(actualConditionValue);
      case 'startsWith':
        return actualStringValue.startsWith(actualConditionValue);
      case 'endsWith':
        return actualStringValue.endsWith(actualConditionValue);
      case 'regex':
        try {
          const regex = new RegExp(actualConditionValue, condition.caseSensitive !== false ? '' : 'i');
          return regex.test(actualStringValue);
        } catch {
          return false;
        }
      case 'greaterThan':
        return typeof fieldValue === 'number' && typeof conditionValue === 'number' && 
               fieldValue > conditionValue;
      case 'lessThan':
        return typeof fieldValue === 'number' && typeof conditionValue === 'number' && 
               fieldValue < conditionValue;
      default:
        return false;
    }
  }

  // Public API methods
  async addFilterRule(rule: Omit<FilterRule, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    const newRule: FilterRule = {
      ...rule,
      id: `rule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.filterRules.push(newRule);
    await this.saveConfiguration();
    return newRule.id;
  }

  async updateFilterRule(id: string, updates: Partial<FilterRule>): Promise<boolean> {
    const ruleIndex = this.filterRules.findIndex(rule => rule.id === id);
    if (ruleIndex === -1) return false;

    this.filterRules[ruleIndex] = {
      ...this.filterRules[ruleIndex],
      ...updates,
      updatedAt: Date.now(),
    };

    await this.saveConfiguration();
    return true;
  }

  async deleteFilterRule(id: string): Promise<boolean> {
    const ruleIndex = this.filterRules.findIndex(rule => rule.id === id);
    if (ruleIndex === -1) return false;

    this.filterRules.splice(ruleIndex, 1);
    delete this.stats.ruleApplications[id];
    await this.saveConfiguration();
    return true;
  }

  getFilterRules(): FilterRule[] {
    return [...this.filterRules];
  }

  async updateDeduplicationConfig(config: Partial<DeduplicationConfig>): Promise<void> {
    this.deduplicationConfig = { ...this.deduplicationConfig, ...config };
    await this.saveConfiguration();
  }

  getDeduplicationConfig(): DeduplicationConfig {
    return { ...this.deduplicationConfig };
  }

  getStats(): NotificationFilterStats {
    return { ...this.stats };
  }

  async resetStats(): Promise<void> {
    this.stats = {
      totalProcessed: 0,
      totalBlocked: 0,
      totalAllowed: 0,
      totalDeduplicated: 0,
      ruleApplications: {},
    };
    await this.saveConfiguration();
  }

  // Predefined rule templates
  async addCommonFilterRules(): Promise<void> {
    const commonRules: Omit<FilterRule, 'id' | 'createdAt' | 'updatedAt'>[] = [
      {
        name: 'Block System UI Notifications',
        type: 'exclude',
        conditions: [
          { field: 'packageName', operator: 'equals', value: 'com.android.systemui' },
        ],
        actions: [{ type: 'block' }],
        enabled: true,
        priority: 100,
      },
      {
        name: 'High Priority for OTP',
        type: 'priority',
        conditions: [
          { field: 'body', operator: 'regex', value: '\\b\\d{4,6}\\b', caseSensitive: false },
          { field: 'body', operator: 'contains', value: 'otp', caseSensitive: false },
        ],
        actions: [{ type: 'setPriority', value: 3 }, { type: 'setCategory', value: 'Personal' }],
        enabled: true,
        priority: 90,
      },
      {
        name: 'Work Apps Category',
        type: 'category',
        conditions: [
          { field: 'packageName', operator: 'contains', value: 'slack' },
        ],
        actions: [{ type: 'setCategory', value: 'Work' }],
        enabled: true,
        priority: 80,
      },
      {
        name: 'Block Promotional Notifications',
        type: 'exclude',
        conditions: [
          { field: 'body', operator: 'regex', value: '(offer|discount|sale|deal|free|win)', caseSensitive: false },
        ],
        actions: [{ type: 'setCategory', value: 'Junk' }],
        enabled: false, // Disabled by default, user can enable
        priority: 70,
      },
    ];

    for (const rule of commonRules) {
      await this.addFilterRule(rule);
    }
  }

  async testRule(rule: FilterRule, testNotification: CapturedNotification): Promise<{
    applied: boolean;
    shouldBlock: boolean;
    modifiedNotification?: CapturedNotification;
  }> {
    return this.applyRule(rule, testNotification);
  }
}

export const notificationFilterService = NotificationFilterService.getInstance();