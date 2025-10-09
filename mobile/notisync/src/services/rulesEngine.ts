import { CapturedNotification, SyncedNotification } from '../types/notification';
import { storageService } from './storage';

export interface NotificationRule {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  priority: number; // Higher number = higher priority
  conditions: RuleCondition[];
  actions: RuleAction[];
  createdAt: number;
  updatedAt: number;
  lastTriggered?: number;
  triggerCount: number;
}

export interface RuleCondition {
  field: 'appName' | 'packageName' | 'title' | 'body' | 'category' | 'priority' | 'timestamp' | 'extras';
  operator: 'equals' | 'notEquals' | 'contains' | 'notContains' | 'startsWith' | 'endsWith' | 
           'regex' | 'greaterThan' | 'lessThan' | 'greaterThanOrEqual' | 'lessThanOrEqual' |
           'in' | 'notIn' | 'exists' | 'notExists';
  value: any;
  caseSensitive?: boolean;
  negate?: boolean;
}

export interface RuleAction {
  type: 'setCategory' | 'setPriority' | 'addTag' | 'removeTag' | 'setRead' | 'setDismissed' |
        'block' | 'allow' | 'forward' | 'delay' | 'schedule' | 'transform';
  value?: any;
  parameters?: Record<string, any>;
}

export interface RuleEvaluationResult {
  ruleId: string;
  ruleName: string;
  matched: boolean;
  actionsApplied: RuleAction[];
  executionTime: number;
  error?: string;
}

export interface NotificationRuleResult {
  notification: SyncedNotification;
  modified: boolean;
  blocked: boolean;
  rulesApplied: RuleEvaluationResult[];
  totalExecutionTime: number;
}

export interface RuleEngineStats {
  totalEvaluations: number;
  totalRulesTriggered: number;
  totalNotificationsModified: number;
  totalNotificationsBlocked: number;
  averageEvaluationTime: number;
  rulePerformance: Record<string, {
    triggerCount: number;
    averageExecutionTime: number;
    lastTriggered: number;
  }>;
  lastEvaluationTime?: number;
}

class RulesEngine {
  private static instance: RulesEngine;
  private rules: NotificationRule[] = [];
  private stats: RuleEngineStats;
  private isInitialized = false;

  private constructor() {
    this.stats = {
      totalEvaluations: 0,
      totalRulesTriggered: 0,
      totalNotificationsModified: 0,
      totalNotificationsBlocked: 0,
      averageEvaluationTime: 0,
      rulePerformance: {},
    };
  }

  static getInstance(): RulesEngine {
    if (!RulesEngine.instance) {
      RulesEngine.instance = new RulesEngine();
    }
    return RulesEngine.instance;
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      await this.loadRules();
      await this.loadStats();
      await this.createDefaultRules();
      this.isInitialized = true;
      console.log('Rules engine initialized successfully');
    } catch (error) {
      console.error('Failed to initialize rules engine:', error);
      throw error;
    }
  }

  private async loadRules(): Promise<void> {
    try {
      const rules = await storageService.getSetting<NotificationRule[]>('notification_rules', []);
      this.rules = rules;
    } catch (error) {
      console.error('Failed to load rules:', error);
      this.rules = [];
    }
  }

  private async saveRules(): Promise<void> {
    try {
      await storageService.setSetting('notification_rules', this.rules);
    } catch (error) {
      console.error('Failed to save rules:', error);
    }
  }

  private async loadStats(): Promise<void> {
    try {
      const stats = await storageService.getSetting<RuleEngineStats>('rules_engine_stats');
      if (stats) {
        this.stats = { ...this.stats, ...stats };
      }
    } catch (error) {
      console.error('Failed to load rules engine stats:', error);
    }
  }

  private async saveStats(): Promise<void> {
    try {
      await storageService.setSetting('rules_engine_stats', this.stats);
    } catch (error) {
      console.error('Failed to save rules engine stats:', error);
    }
  }

  private async createDefaultRules(): Promise<void> {
    // Only create default rules if no rules exist
    if (this.rules.length > 0) return;

    const defaultRules: Omit<NotificationRule, 'id' | 'createdAt' | 'updatedAt' | 'triggerCount'>[] = [
      {
        name: 'OTP High Priority',
        description: 'Set high priority for OTP and verification codes',
        enabled: true,
        priority: 100,
        conditions: [
          {
            field: 'body',
            operator: 'regex',
            value: '\\b(otp|code|verification|authenticate)\\b.*\\b\\d{4,8}\\b',
            caseSensitive: false,
          },
        ],
        actions: [
          { type: 'setPriority', value: 3 },
          { type: 'addTag', value: 'otp' },
          { type: 'setCategory', value: 'Personal' },
        ],
      },
      {
        name: 'Work Apps Categorization',
        description: 'Categorize notifications from work-related apps',
        enabled: true,
        priority: 90,
        conditions: [
          {
            field: 'packageName',
            operator: 'in',
            value: [
              'com.slack.android',
              'com.microsoft.teams',
              'us.zoom.videomeetings',
              'com.google.android.gm',
              'com.microsoft.office.outlook',
              'com.trello',
              'com.asana.app',
            ],
          },
        ],
        actions: [
          { type: 'setCategory', value: 'Work' },
          { type: 'addTag', value: 'work-app' },
        ],
      },
      {
        name: 'Promotional Content Filter',
        description: 'Categorize promotional notifications as Junk',
        enabled: true,
        priority: 80,
        conditions: [
          {
            field: 'body',
            operator: 'regex',
            value: '\\b(offer|discount|sale|deal|free|win|prize|limited time|exclusive)\\b',
            caseSensitive: false,
          },
        ],
        actions: [
          { type: 'setCategory', value: 'Junk' },
          { type: 'setPriority', value: 0 },
          { type: 'addTag', value: 'promotional' },
        ],
      },
      {
        name: 'Banking Security Alerts',
        description: 'High priority for banking and security notifications',
        enabled: true,
        priority: 95,
        conditions: [
          {
            field: 'appName',
            operator: 'regex',
            value: '\\b(bank|banking|security|authenticator|wallet)\\b',
            caseSensitive: false,
          },
          {
            field: 'body',
            operator: 'regex',
            value: '\\b(login|transaction|security|alert|suspicious)\\b',
            caseSensitive: false,
          },
        ],
        actions: [
          { type: 'setPriority', value: 3 },
          { type: 'setCategory', value: 'Personal' },
          { type: 'addTag', value: 'security' },
        ],
      },
      {
        name: 'Night Mode Priority Reduction',
        description: 'Reduce priority of non-critical notifications during night hours',
        enabled: true,
        priority: 70,
        conditions: [
          {
            field: 'timestamp',
            operator: 'greaterThan',
            value: 'nightHours', // Special value handled in evaluation
          },
          {
            field: 'priority',
            operator: 'lessThan',
            value: 3,
          },
        ],
        actions: [
          { type: 'setPriority', value: 0 },
          { type: 'addTag', value: 'night-mode' },
        ],
      },
      {
        name: 'System Notifications Block',
        description: 'Block system UI and low-level system notifications',
        enabled: true,
        priority: 110,
        conditions: [
          {
            field: 'packageName',
            operator: 'in',
            value: [
              'com.android.systemui',
              'android',
              'com.android.system',
              'com.google.android.gms',
            ],
          },
        ],
        actions: [
          { type: 'block' },
        ],
      },
    ];

    for (const ruleData of defaultRules) {
      await this.addRule(ruleData);
    }

    console.log(`Created ${defaultRules.length} default notification rules`);
  }

  async evaluateNotification(notification: CapturedNotification | SyncedNotification): Promise<NotificationRuleResult> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const startTime = Date.now();
    this.stats.totalEvaluations++;

    let workingNotification: SyncedNotification = {
      ...notification,
      synced: 'synced' in notification ? notification.synced : false,
      syncAttempts: 'syncAttempts' in notification ? notification.syncAttempts : 0,
      isRead: 'isRead' in notification ? notification.isRead : false,
      isDismissed: 'isDismissed' in notification ? notification.isDismissed : false,
    };

    const rulesApplied: RuleEvaluationResult[] = [];
    let modified = false;
    let blocked = false;

    // Get enabled rules sorted by priority (highest first)
    const enabledRules = this.rules
      .filter(rule => rule.enabled)
      .sort((a, b) => b.priority - a.priority);

    for (const rule of enabledRules) {
      const ruleStartTime = Date.now();
      
      try {
        const conditionsMatch = await this.evaluateConditions(rule.conditions, workingNotification);
        
        if (conditionsMatch) {
          const actionsResult = await this.applyActions(rule.actions, workingNotification);
          
          if (actionsResult.modified) {
            workingNotification = actionsResult.notification;
            modified = true;
          }

          if (actionsResult.blocked) {
            blocked = true;
          }

          // Update rule statistics
          rule.triggerCount++;
          rule.lastTriggered = Date.now();
          this.stats.totalRulesTriggered++;

          const executionTime = Date.now() - ruleStartTime;
          
          // Update performance stats
          if (!this.stats.rulePerformance[rule.id]) {
            this.stats.rulePerformance[rule.id] = {
              triggerCount: 0,
              averageExecutionTime: 0,
              lastTriggered: 0,
            };
          }

          const perf = this.stats.rulePerformance[rule.id];
          perf.triggerCount++;
          perf.averageExecutionTime = (perf.averageExecutionTime + executionTime) / 2;
          perf.lastTriggered = Date.now();

          rulesApplied.push({
            ruleId: rule.id,
            ruleName: rule.name,
            matched: true,
            actionsApplied: rule.actions,
            executionTime,
          });

          // If notification is blocked, stop processing further rules
          if (blocked) {
            break;
          }
        }
      } catch (error) {
        console.error(`Error evaluating rule ${rule.name}:`, error);
        rulesApplied.push({
          ruleId: rule.id,
          ruleName: rule.name,
          matched: false,
          actionsApplied: [],
          executionTime: Date.now() - ruleStartTime,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const totalExecutionTime = Date.now() - startTime;

    // Update global statistics
    if (modified) {
      this.stats.totalNotificationsModified++;
    }
    if (blocked) {
      this.stats.totalNotificationsBlocked++;
    }

    this.stats.averageEvaluationTime = 
      (this.stats.averageEvaluationTime + totalExecutionTime) / 2;
    this.stats.lastEvaluationTime = Date.now();

    // Save updated rules and stats
    await this.saveRules();
    await this.saveStats();

    return {
      notification: workingNotification,
      modified,
      blocked,
      rulesApplied,
      totalExecutionTime,
    };
  }

  private async evaluateConditions(conditions: RuleCondition[], notification: SyncedNotification): Promise<boolean> {
    for (const condition of conditions) {
      const result = await this.evaluateCondition(condition, notification);
      if (!result) {
        return false; // All conditions must match (AND logic)
      }
    }
    return true;
  }

  private async evaluateCondition(condition: RuleCondition, notification: SyncedNotification): Promise<boolean> {
    let fieldValue: any;

    // Get field value
    switch (condition.field) {
      case 'appName':
        fieldValue = notification.appName;
        break;
      case 'packageName':
        fieldValue = notification.packageName;
        break;
      case 'title':
        fieldValue = notification.title;
        break;
      case 'body':
        fieldValue = notification.body;
        break;
      case 'category':
        fieldValue = notification.category;
        break;
      case 'priority':
        fieldValue = notification.priority;
        break;
      case 'timestamp':
        fieldValue = notification.timestamp;
        break;
      case 'extras':
        fieldValue = notification.extras;
        break;
      default:
        return false;
    }

    let result = false;

    // Handle special values
    if (condition.value === 'nightHours' && condition.field === 'timestamp') {
      const hour = new Date(fieldValue).getHours();
      result = hour >= 22 || hour <= 6;
    } else {
      result = this.evaluateOperator(condition.operator, fieldValue, condition.value, condition.caseSensitive);
    }

    // Apply negation if specified
    return condition.negate ? !result : result;
  }

  private evaluateOperator(operator: string, fieldValue: any, conditionValue: any, caseSensitive = true): boolean {
    if (fieldValue === null || fieldValue === undefined) {
      return operator === 'notExists';
    }

    const stringFieldValue = String(fieldValue);
    const stringConditionValue = String(conditionValue);

    const actualFieldValue = caseSensitive ? stringFieldValue : stringFieldValue.toLowerCase();
    const actualConditionValue = caseSensitive ? stringConditionValue : stringConditionValue.toLowerCase();

    switch (operator) {
      case 'equals':
        return actualFieldValue === actualConditionValue;
      case 'notEquals':
        return actualFieldValue !== actualConditionValue;
      case 'contains':
        return actualFieldValue.includes(actualConditionValue);
      case 'notContains':
        return !actualFieldValue.includes(actualConditionValue);
      case 'startsWith':
        return actualFieldValue.startsWith(actualConditionValue);
      case 'endsWith':
        return actualFieldValue.endsWith(actualConditionValue);
      case 'regex':
        try {
          const regex = new RegExp(actualConditionValue, caseSensitive ? '' : 'i');
          return regex.test(actualFieldValue);
        } catch {
          return false;
        }
      case 'greaterThan':
        return Number(fieldValue) > Number(conditionValue);
      case 'lessThan':
        return Number(fieldValue) < Number(conditionValue);
      case 'greaterThanOrEqual':
        return Number(fieldValue) >= Number(conditionValue);
      case 'lessThanOrEqual':
        return Number(fieldValue) <= Number(conditionValue);
      case 'in':
        return Array.isArray(conditionValue) && conditionValue.includes(fieldValue);
      case 'notIn':
        return Array.isArray(conditionValue) && !conditionValue.includes(fieldValue);
      case 'exists':
        return fieldValue !== null && fieldValue !== undefined;
      case 'notExists':
        return fieldValue === null || fieldValue === undefined;
      default:
        return false;
    }
  }

  private async applyActions(actions: RuleAction[], notification: SyncedNotification): Promise<{
    notification: SyncedNotification;
    modified: boolean;
    blocked: boolean;
  }> {
    let workingNotification = { ...notification };
    let modified = false;
    let blocked = false;

    for (const action of actions) {
      switch (action.type) {
        case 'setCategory':
          if (['Work', 'Personal', 'Junk'].includes(action.value)) {
            workingNotification.category = action.value;
            modified = true;
          }
          break;

        case 'setPriority':
          if (typeof action.value === 'number' && action.value >= 0 && action.value <= 3) {
            workingNotification.priority = action.value;
            modified = true;
          }
          break;

        case 'addTag':
          if (typeof action.value === 'string') {
            workingNotification.extras = workingNotification.extras || {};
            workingNotification.extras.tags = workingNotification.extras.tags || [];
            if (!workingNotification.extras.tags.includes(action.value)) {
              workingNotification.extras.tags.push(action.value);
              modified = true;
            }
          }
          break;

        case 'removeTag':
          if (typeof action.value === 'string' && workingNotification.extras?.tags) {
            const tagIndex = workingNotification.extras.tags.indexOf(action.value);
            if (tagIndex > -1) {
              workingNotification.extras.tags.splice(tagIndex, 1);
              modified = true;
            }
          }
          break;

        case 'setRead':
          workingNotification.isRead = Boolean(action.value);
          modified = true;
          break;

        case 'setDismissed':
          workingNotification.isDismissed = Boolean(action.value);
          modified = true;
          break;

        case 'block':
          blocked = true;
          break;

        case 'allow':
          // Explicit allow (useful for override rules)
          break;

        case 'transform':
          if (action.parameters) {
            if (action.parameters.title) {
              workingNotification.title = String(action.parameters.title);
              modified = true;
            }
            if (action.parameters.body) {
              workingNotification.body = String(action.parameters.body);
              modified = true;
            }
          }
          break;

        default:
          console.warn(`Unknown action type: ${action.type}`);
      }
    }

    return {
      notification: workingNotification,
      modified,
      blocked,
    };
  }

  // Public API methods
  async addRule(ruleData: Omit<NotificationRule, 'id' | 'createdAt' | 'updatedAt' | 'triggerCount'>): Promise<string> {
    const rule: NotificationRule = {
      ...ruleData,
      id: `rule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      triggerCount: 0,
    };

    this.rules.push(rule);
    await this.saveRules();
    return rule.id;
  }

  async updateRule(id: string, updates: Partial<NotificationRule>): Promise<boolean> {
    const ruleIndex = this.rules.findIndex(rule => rule.id === id);
    if (ruleIndex === -1) return false;

    this.rules[ruleIndex] = {
      ...this.rules[ruleIndex],
      ...updates,
      updatedAt: Date.now(),
    };

    await this.saveRules();
    return true;
  }

  async deleteRule(id: string): Promise<boolean> {
    const ruleIndex = this.rules.findIndex(rule => rule.id === id);
    if (ruleIndex === -1) return false;

    this.rules.splice(ruleIndex, 1);
    delete this.stats.rulePerformance[id];
    await this.saveRules();
    await this.saveStats();
    return true;
  }

  getRules(): NotificationRule[] {
    return [...this.rules];
  }

  getRule(id: string): NotificationRule | null {
    return this.rules.find(rule => rule.id === id) || null;
  }

  getStats(): RuleEngineStats {
    return { ...this.stats };
  }

  async resetStats(): Promise<void> {
    this.stats = {
      totalEvaluations: 0,
      totalRulesTriggered: 0,
      totalNotificationsModified: 0,
      totalNotificationsBlocked: 0,
      averageEvaluationTime: 0,
      rulePerformance: {},
    };

    // Reset rule trigger counts
    this.rules.forEach(rule => {
      rule.triggerCount = 0;
      delete rule.lastTriggered;
    });

    await this.saveRules();
    await this.saveStats();
  }

  async testRule(ruleId: string, notification: CapturedNotification): Promise<RuleEvaluationResult> {
    const rule = this.getRule(ruleId);
    if (!rule) {
      throw new Error(`Rule with id ${ruleId} not found`);
    }

    const startTime = Date.now();
    
    try {
      const syncedNotification: SyncedNotification = {
        ...notification,
        synced: false,
        syncAttempts: 0,
        isRead: false,
        isDismissed: false,
      };

      const conditionsMatch = await this.evaluateConditions(rule.conditions, syncedNotification);
      
      if (conditionsMatch) {
        const actionsResult = await this.applyActions(rule.actions, syncedNotification);
        
        return {
          ruleId: rule.id,
          ruleName: rule.name,
          matched: true,
          actionsApplied: rule.actions,
          executionTime: Date.now() - startTime,
        };
      } else {
        return {
          ruleId: rule.id,
          ruleName: rule.name,
          matched: false,
          actionsApplied: [],
          executionTime: Date.now() - startTime,
        };
      }
    } catch (error) {
      return {
        ruleId: rule.id,
        ruleName: rule.name,
        matched: false,
        actionsApplied: [],
        executionTime: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async exportRules(): Promise<NotificationRule[]> {
    return [...this.rules];
  }

  async importRules(rules: NotificationRule[], replaceExisting = false): Promise<void> {
    if (replaceExisting) {
      this.rules = [];
    }

    for (const rule of rules) {
      // Generate new ID to avoid conflicts
      const newRule: NotificationRule = {
        ...rule,
        id: `rule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        triggerCount: 0,
      };
      this.rules.push(newRule);
    }

    await this.saveRules();
  }
}

export const rulesEngine = RulesEngine.getInstance();