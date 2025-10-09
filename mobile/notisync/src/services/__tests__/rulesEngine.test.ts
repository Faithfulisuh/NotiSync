import { rulesEngine, NotificationRule, RuleCondition, RuleAction } from '../rulesEngine';
import { storageService } from '../storage';
import { CapturedNotification } from '../../types/notification';

// Mock storage service
jest.mock('../storage');

const mockStorageService = storageService as jest.Mocked<typeof storageService>;

describe('RulesEngine', () => {
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
    mockStorageService.getSetting.mockResolvedValue(undefined);
    mockStorageService.setSetting.mockResolvedValue();
  });

  describe('initialization', () => {
    it('should initialize successfully', async () => {
      await rulesEngine.initialize();
      
      expect(mockStorageService.getSetting).toHaveBeenCalledWith('notification_rules', []);
      expect(mockStorageService.getSetting).toHaveBeenCalledWith('rules_engine_stats');
    });

    it('should load existing rules', async () => {
      const existingRules: NotificationRule[] = [
        {
          id: 'rule-1',
          name: 'Test Rule',
          enabled: true,
          priority: 100,
          conditions: [],
          actions: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
          triggerCount: 0,
        },
      ];

      mockStorageService.getSetting.mockResolvedValueOnce(existingRules);

      await rulesEngine.initialize();
      
      const rules = rulesEngine.getRules();
      expect(rules).toHaveLength(1);
      expect(rules[0].name).toBe('Test Rule');
    });

    it('should create default rules when none exist', async () => {
      mockStorageService.getSetting.mockResolvedValue(undefined);

      await rulesEngine.initialize();
      
      const rules = rulesEngine.getRules();
      expect(rules.length).toBeGreaterThan(0);
      
      // Check for some expected default rules
      const otpRule = rules.find(rule => rule.name.includes('OTP'));
      const workRule = rules.find(rule => rule.name.includes('Work'));
      
      expect(otpRule).toBeDefined();
      expect(workRule).toBeDefined();
    });
  });

  describe('rule evaluation', () => {
    beforeEach(async () => {
      await rulesEngine.initialize();
    });

    it('should evaluate notification against rules', async () => {
      const result = await rulesEngine.evaluateNotification(mockNotification);
      
      expect(result).toHaveProperty('notification');
      expect(result).toHaveProperty('modified');
      expect(result).toHaveProperty('blocked');
      expect(result).toHaveProperty('rulesApplied');
      expect(result).toHaveProperty('totalExecutionTime');
    });

    it('should apply matching rules', async () => {
      // Add a test rule that matches our notification
      const ruleId = await rulesEngine.addRule({
        name: 'Test Match Rule',
        enabled: true,
        priority: 100,
        conditions: [
          {
            field: 'appName',
            operator: 'equals',
            value: 'Test App',
          },
        ],
        actions: [
          {
            type: 'setPriority',
            value: 3,
          },
          {
            type: 'addTag',
            value: 'test-tag',
          },
        ],
      });

      const result = await rulesEngine.evaluateNotification(mockNotification);
      
      expect(result.modified).toBe(true);
      expect(result.notification.priority).toBe(3);
      expect(result.notification.extras?.tags).toContain('test-tag');
      expect(result.rulesApplied).toHaveLength(1);
      expect(result.rulesApplied[0].ruleId).toBe(ruleId);
    });

    it('should not apply non-matching rules', async () => {
      await rulesEngine.addRule({
        name: 'Non-matching Rule',
        enabled: true,
        priority: 100,
        conditions: [
          {
            field: 'appName',
            operator: 'equals',
            value: 'Different App',
          },
        ],
        actions: [
          {
            type: 'setPriority',
            value: 3,
          },
        ],
      });

      const result = await rulesEngine.evaluateNotification(mockNotification);
      
      expect(result.modified).toBe(false);
      expect(result.notification.priority).toBe(1); // Original priority
    });

    it('should block notifications when rule has block action', async () => {
      await rulesEngine.addRule({
        name: 'Block Rule',
        enabled: true,
        priority: 100,
        conditions: [
          {
            field: 'appName',
            operator: 'equals',
            value: 'Test App',
          },
        ],
        actions: [
          {
            type: 'block',
          },
        ],
      });

      const result = await rulesEngine.evaluateNotification(mockNotification);
      
      expect(result.blocked).toBe(true);
    });

    it('should apply rules in priority order', async () => {
      // Add two rules with different priorities
      await rulesEngine.addRule({
        name: 'Low Priority Rule',
        enabled: true,
        priority: 50,
        conditions: [
          {
            field: 'appName',
            operator: 'equals',
            value: 'Test App',
          },
        ],
        actions: [
          {
            type: 'setPriority',
            value: 1,
          },
        ],
      });

      await rulesEngine.addRule({
        name: 'High Priority Rule',
        enabled: true,
        priority: 100,
        conditions: [
          {
            field: 'appName',
            operator: 'equals',
            value: 'Test App',
          },
        ],
        actions: [
          {
            type: 'setPriority',
            value: 3,
          },
        ],
      });

      const result = await rulesEngine.evaluateNotification(mockNotification);
      
      // High priority rule should be applied first, then low priority
      expect(result.notification.priority).toBe(1); // Last rule wins
      expect(result.rulesApplied).toHaveLength(2);
    });
  });

  describe('condition evaluation', () => {
    beforeEach(async () => {
      await rulesEngine.initialize();
    });

    it('should evaluate equals condition correctly', async () => {
      const ruleId = await rulesEngine.addRule({
        name: 'Equals Test',
        enabled: true,
        priority: 100,
        conditions: [
          {
            field: 'appName',
            operator: 'equals',
            value: 'Test App',
          },
        ],
        actions: [{ type: 'addTag', value: 'matched' }],
      });

      const result = await rulesEngine.testRule(ruleId, mockNotification);
      expect(result.matched).toBe(true);
    });

    it('should evaluate contains condition correctly', async () => {
      const ruleId = await rulesEngine.addRule({
        name: 'Contains Test',
        enabled: true,
        priority: 100,
        conditions: [
          {
            field: 'body',
            operator: 'contains',
            value: 'test',
            caseSensitive: false,
          },
        ],
        actions: [{ type: 'addTag', value: 'matched' }],
      });

      const result = await rulesEngine.testRule(ruleId, mockNotification);
      expect(result.matched).toBe(true);
    });

    it('should evaluate regex condition correctly', async () => {
      const otpNotification: CapturedNotification = {
        ...mockNotification,
        body: 'Your OTP is 123456',
      };

      const ruleId = await rulesEngine.addRule({
        name: 'Regex Test',
        enabled: true,
        priority: 100,
        conditions: [
          {
            field: 'body',
            operator: 'regex',
            value: '\\b\\d{6}\\b',
          },
        ],
        actions: [{ type: 'addTag', value: 'otp' }],
      });

      const result = await rulesEngine.testRule(ruleId, otpNotification);
      expect(result.matched).toBe(true);
    });

    it('should evaluate numeric conditions correctly', async () => {
      const ruleId = await rulesEngine.addRule({
        name: 'Numeric Test',
        enabled: true,
        priority: 100,
        conditions: [
          {
            field: 'priority',
            operator: 'greaterThan',
            value: 0,
          },
        ],
        actions: [{ type: 'addTag', value: 'priority-match' }],
      });

      const result = await rulesEngine.testRule(ruleId, mockNotification);
      expect(result.matched).toBe(true);
    });

    it('should evaluate in condition correctly', async () => {
      const ruleId = await rulesEngine.addRule({
        name: 'In Test',
        enabled: true,
        priority: 100,
        conditions: [
          {
            field: 'packageName',
            operator: 'in',
            value: ['com.test.app', 'com.other.app'],
          },
        ],
        actions: [{ type: 'addTag', value: 'in-list' }],
      });

      const result = await rulesEngine.testRule(ruleId, mockNotification);
      expect(result.matched).toBe(true);
    });

    it('should handle negated conditions', async () => {
      const ruleId = await rulesEngine.addRule({
        name: 'Negated Test',
        enabled: true,
        priority: 100,
        conditions: [
          {
            field: 'appName',
            operator: 'equals',
            value: 'Different App',
            negate: true,
          },
        ],
        actions: [{ type: 'addTag', value: 'not-different' }],
      });

      const result = await rulesEngine.testRule(ruleId, mockNotification);
      expect(result.matched).toBe(true);
    });
  });

  describe('action execution', () => {
    beforeEach(async () => {
      await rulesEngine.initialize();
    });

    it('should set category action', async () => {
      const ruleId = await rulesEngine.addRule({
        name: 'Category Test',
        enabled: true,
        priority: 100,
        conditions: [
          {
            field: 'appName',
            operator: 'equals',
            value: 'Test App',
          },
        ],
        actions: [
          {
            type: 'setCategory',
            value: 'Work',
          },
        ],
      });

      const result = await rulesEngine.evaluateNotification(mockNotification);
      expect(result.notification.category).toBe('Work');
    });

    it('should set priority action', async () => {
      const ruleId = await rulesEngine.addRule({
        name: 'Priority Test',
        enabled: true,
        priority: 100,
        conditions: [
          {
            field: 'appName',
            operator: 'equals',
            value: 'Test App',
          },
        ],
        actions: [
          {
            type: 'setPriority',
            value: 3,
          },
        ],
      });

      const result = await rulesEngine.evaluateNotification(mockNotification);
      expect(result.notification.priority).toBe(3);
    });

    it('should add tag action', async () => {
      const ruleId = await rulesEngine.addRule({
        name: 'Tag Test',
        enabled: true,
        priority: 100,
        conditions: [
          {
            field: 'appName',
            operator: 'equals',
            value: 'Test App',
          },
        ],
        actions: [
          {
            type: 'addTag',
            value: 'test-tag',
          },
        ],
      });

      const result = await rulesEngine.evaluateNotification(mockNotification);
      expect(result.notification.extras?.tags).toContain('test-tag');
    });

    it('should remove tag action', async () => {
      const notificationWithTag: CapturedNotification = {
        ...mockNotification,
        extras: {
          tags: ['existing-tag', 'remove-me'],
        },
      };

      const ruleId = await rulesEngine.addRule({
        name: 'Remove Tag Test',
        enabled: true,
        priority: 100,
        conditions: [
          {
            field: 'appName',
            operator: 'equals',
            value: 'Test App',
          },
        ],
        actions: [
          {
            type: 'removeTag',
            value: 'remove-me',
          },
        ],
      });

      const result = await rulesEngine.evaluateNotification(notificationWithTag);
      expect(result.notification.extras?.tags).toContain('existing-tag');
      expect(result.notification.extras?.tags).not.toContain('remove-me');
    });

    it('should set read status action', async () => {
      const ruleId = await rulesEngine.addRule({
        name: 'Read Test',
        enabled: true,
        priority: 100,
        conditions: [
          {
            field: 'appName',
            operator: 'equals',
            value: 'Test App',
          },
        ],
        actions: [
          {
            type: 'setRead',
            value: true,
          },
        ],
      });

      const result = await rulesEngine.evaluateNotification(mockNotification);
      expect(result.notification.isRead).toBe(true);
    });

    it('should transform notification content', async () => {
      const ruleId = await rulesEngine.addRule({
        name: 'Transform Test',
        enabled: true,
        priority: 100,
        conditions: [
          {
            field: 'appName',
            operator: 'equals',
            value: 'Test App',
          },
        ],
        actions: [
          {
            type: 'transform',
            parameters: {
              title: 'Modified Title',
              body: 'Modified Body',
            },
          },
        ],
      });

      const result = await rulesEngine.evaluateNotification(mockNotification);
      expect(result.notification.title).toBe('Modified Title');
      expect(result.notification.body).toBe('Modified Body');
    });
  });

  describe('rule management', () => {
    beforeEach(async () => {
      await rulesEngine.initialize();
    });

    it('should add new rule', async () => {
      const ruleData = {
        name: 'New Rule',
        enabled: true,
        priority: 100,
        conditions: [],
        actions: [],
      };

      const ruleId = await rulesEngine.addRule(ruleData);
      
      expect(ruleId).toBeDefined();
      
      const rule = rulesEngine.getRule(ruleId);
      expect(rule).toBeDefined();
      expect(rule?.name).toBe('New Rule');
    });

    it('should update existing rule', async () => {
      const ruleId = await rulesEngine.addRule({
        name: 'Original Rule',
        enabled: true,
        priority: 100,
        conditions: [],
        actions: [],
      });

      const updated = await rulesEngine.updateRule(ruleId, {
        name: 'Updated Rule',
        enabled: false,
      });

      expect(updated).toBe(true);
      
      const rule = rulesEngine.getRule(ruleId);
      expect(rule?.name).toBe('Updated Rule');
      expect(rule?.enabled).toBe(false);
    });

    it('should delete rule', async () => {
      const ruleId = await rulesEngine.addRule({
        name: 'Rule to Delete',
        enabled: true,
        priority: 100,
        conditions: [],
        actions: [],
      });

      const deleted = await rulesEngine.deleteRule(ruleId);
      expect(deleted).toBe(true);
      
      const rule = rulesEngine.getRule(ruleId);
      expect(rule).toBeNull();
    });

    it('should get all rules', () => {
      const rules = rulesEngine.getRules();
      expect(Array.isArray(rules)).toBe(true);
    });
  });

  describe('statistics', () => {
    beforeEach(async () => {
      await rulesEngine.initialize();
    });

    it('should track evaluation statistics', async () => {
      await rulesEngine.addRule({
        name: 'Stats Test Rule',
        enabled: true,
        priority: 100,
        conditions: [
          {
            field: 'appName',
            operator: 'equals',
            value: 'Test App',
          },
        ],
        actions: [
          {
            type: 'setPriority',
            value: 3,
          },
        ],
      });

      await rulesEngine.evaluateNotification(mockNotification);
      
      const stats = rulesEngine.getStats();
      expect(stats.totalEvaluations).toBe(1);
      expect(stats.totalRulesTriggered).toBe(1);
      expect(stats.totalNotificationsModified).toBe(1);
    });

    it('should reset statistics', async () => {
      await rulesEngine.addRule({
        name: 'Stats Test Rule',
        enabled: true,
        priority: 100,
        conditions: [
          {
            field: 'appName',
            operator: 'equals',
            value: 'Test App',
          },
        ],
        actions: [
          {
            type: 'setPriority',
            value: 3,
          },
        ],
      });

      await rulesEngine.evaluateNotification(mockNotification);
      
      let stats = rulesEngine.getStats();
      expect(stats.totalEvaluations).toBe(1);

      await rulesEngine.resetStats();
      
      stats = rulesEngine.getStats();
      expect(stats.totalEvaluations).toBe(0);
      expect(stats.totalRulesTriggered).toBe(0);
    });
  });

  describe('import/export', () => {
    beforeEach(async () => {
      await rulesEngine.initialize();
    });

    it('should export rules', async () => {
      await rulesEngine.addRule({
        name: 'Export Test Rule',
        enabled: true,
        priority: 100,
        conditions: [],
        actions: [],
      });

      const exportedRules = await rulesEngine.exportRules();
      
      expect(Array.isArray(exportedRules)).toBe(true);
      expect(exportedRules.length).toBeGreaterThan(0);
      
      const testRule = exportedRules.find(rule => rule.name === 'Export Test Rule');
      expect(testRule).toBeDefined();
    });

    it('should import rules', async () => {
      const rulesToImport: NotificationRule[] = [
        {
          id: 'import-rule-1',
          name: 'Imported Rule 1',
          enabled: true,
          priority: 100,
          conditions: [],
          actions: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
          triggerCount: 0,
        },
        {
          id: 'import-rule-2',
          name: 'Imported Rule 2',
          enabled: false,
          priority: 50,
          conditions: [],
          actions: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
          triggerCount: 0,
        },
      ];

      await rulesEngine.importRules(rulesToImport, false);
      
      const rules = rulesEngine.getRules();
      const importedRule1 = rules.find(rule => rule.name === 'Imported Rule 1');
      const importedRule2 = rules.find(rule => rule.name === 'Imported Rule 2');
      
      expect(importedRule1).toBeDefined();
      expect(importedRule2).toBeDefined();
    });

    it('should replace existing rules when importing with replace flag', async () => {
      // Add initial rule
      await rulesEngine.addRule({
        name: 'Initial Rule',
        enabled: true,
        priority: 100,
        conditions: [],
        actions: [],
      });

      const rulesToImport: NotificationRule[] = [
        {
          id: 'replace-rule-1',
          name: 'Replacement Rule',
          enabled: true,
          priority: 100,
          conditions: [],
          actions: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
          triggerCount: 0,
        },
      ];

      await rulesEngine.importRules(rulesToImport, true);
      
      const rules = rulesEngine.getRules();
      const initialRule = rules.find(rule => rule.name === 'Initial Rule');
      const replacementRule = rules.find(rule => rule.name === 'Replacement Rule');
      
      expect(initialRule).toBeUndefined();
      expect(replacementRule).toBeDefined();
    });
  });
});