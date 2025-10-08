import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, TextInput, Modal, Alert } from 'react-native';

interface Rule {
  id: string;
  ruleName: string;
  ruleType: 'app_filter' | 'keyword_filter' | 'time_based';
  conditions: any;
  actions: any;
  isActive: boolean;
}

interface NotificationRulesProps {
  onBack: () => void;
}

export const NotificationRules: React.FC<NotificationRulesProps> = ({ onBack }) => {
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newRule, setNewRule] = useState({
    name: '',
    type: 'keyword_filter' as Rule['ruleType'],
    keyword: '',
    action: 'mute',
  });

  useEffect(() => {
    loadRules();
  }, []);

  const loadRules = async () => {
    try {
      // TODO: Replace with actual API call
      const mockRules: Rule[] = [
        {
          id: '1',
          ruleName: 'Always Show OTP',
          ruleType: 'keyword_filter',
          conditions: { keywords: ['OTP', 'verification', 'code'] },
          actions: { priority: 'high', mute: false },
          isActive: true,
        },
        {
          id: '2',
          ruleName: 'Mute Promotional',
          ruleType: 'keyword_filter',
          conditions: { keywords: ['sale', 'discount', 'offer', 'promotion'] },
          actions: { mute: true },
          isActive: true,
        },
        {
          id: '3',
          ruleName: 'Work Hours Only',
          ruleType: 'time_based',
          conditions: { startTime: '09:00', endTime: '18:00', days: ['mon', 'tue', 'wed', 'thu', 'fri'] },
          actions: { category: 'work', muteOutsideHours: true },
          isActive: false,
        },
      ];
      setRules(mockRules);
    } catch (error) {
      console.error('Failed to load rules:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleRule = async (ruleId: string) => {
    try {
      const rule = rules.find(r => r.id === ruleId);
      if (!rule) return;

      // TODO: Replace with actual API call
      const updatedRule = { ...rule, isActive: !rule.isActive };
      setRules(rules.map(r => r.id === ruleId ? updatedRule : r));
    } catch (error) {
      Alert.alert('Error', 'Failed to update rule');
    }
  };

  const deleteRule = async (ruleId: string) => {
    Alert.alert(
      'Delete Rule',
      'Are you sure you want to delete this rule?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              // TODO: Replace with actual API call
              setRules(rules.filter(r => r.id !== ruleId));
            } catch (error) {
              Alert.alert('Error', 'Failed to delete rule');
            }
          },
        },
      ]
    );
  };

  const createRule = async () => {
    if (!newRule.name.trim() || !newRule.keyword.trim()) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    try {
      // TODO: Replace with actual API call
      const rule: Rule = {
        id: Date.now().toString(),
        ruleName: newRule.name,
        ruleType: newRule.type,
        conditions: { keywords: [newRule.keyword] },
        actions: { mute: newRule.action === 'mute' },
        isActive: true,
      };

      setRules([...rules, rule]);
      setShowCreateModal(false);
      setNewRule({ name: '', type: 'keyword_filter', keyword: '', action: 'mute' });
    } catch (error) {
      Alert.alert('Error', 'Failed to create rule');
    }
  };

  const getRuleDescription = (rule: Rule) => {
    if (rule.ruleType === 'keyword_filter') {
      const keywords = rule.conditions.keywords?.join(', ') || '';
      const action = rule.actions.mute ? 'Mute' : 'Prioritize';
      return `${action} notifications containing: ${keywords}`;
    }
    if (rule.ruleType === 'time_based') {
      return `Active ${rule.conditions.startTime} - ${rule.conditions.endTime}`;
    }
    return 'Custom rule';
  };

  const renderRule = ({ item }: { item: Rule }) => (
    <View className="bg-white p-4 mb-3 rounded-lg border border-gray-200">
      <View className="flex-row items-center justify-between mb-2">
        <Text className="text-base font-pmedium text-slate-800 flex-1">{item.ruleName}</Text>
        <TouchableOpacity
          onPress={() => toggleRule(item.id)}
          className={`px-3 py-1 rounded-full ${item.isActive ? 'bg-green-100' : 'bg-gray-100'}`}
        >
          <Text className={`text-xs font-pmedium ${item.isActive ? 'text-green-700' : 'text-gray-600'}`}>
            {item.isActive ? 'Active' : 'Inactive'}
          </Text>
        </TouchableOpacity>
      </View>
      
      <Text className="text-sm text-gray-600 font-pregular mb-3">
        {getRuleDescription(item)}
      </Text>
      
      <View className="flex-row justify-end">
        <TouchableOpacity
          onPress={() => deleteRule(item.id)}
          className="bg-red-100 px-3 py-2 rounded-lg"
        >
          <Text className="text-red-600 font-pmedium text-sm">Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  if (loading) {
    return (
      <View className="flex-1 justify-center items-center bg-gray-50">
        <Text className="text-gray-600 font-pregular">Loading rules...</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-gray-50">
      <View className="bg-white p-4 border-b border-gray-200">
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center">
            <TouchableOpacity onPress={onBack} className="mr-4">
              <Text className="text-blue-600 font-pmedium text-base">← Back</Text>
            </TouchableOpacity>
            <Text className="text-lg font-pbold text-slate-800">Notification Rules</Text>
          </View>
          <TouchableOpacity
            onPress={() => setShowCreateModal(true)}
            className="bg-blue-600 px-3 py-2 rounded-lg"
          >
            <Text className="text-white font-pmedium text-sm">+ Add Rule</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View className="flex-1 p-4">
        <Text className="text-sm text-gray-600 font-pregular mb-4">
          Create custom rules to automatically handle specific types of notifications.
        </Text>

        <FlatList
          data={rules}
          renderItem={renderRule}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View className="bg-white p-6 rounded-lg border border-gray-200 items-center">
              <Text className="text-gray-500 font-pregular text-center mb-4">
                No rules created yet. Add your first rule to get started.
              </Text>
              <TouchableOpacity
                onPress={() => setShowCreateModal(true)}
                className="bg-blue-600 px-4 py-2 rounded-lg"
              >
                <Text className="text-white font-pmedium">Create Rule</Text>
              </TouchableOpacity>
            </View>
          }
        />
      </View>

      {/* Create Rule Modal */}
      <Modal
        visible={showCreateModal}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <View className="flex-1 bg-white">
          <View className="p-4 border-b border-gray-200">
            <View className="flex-row items-center justify-between">
              <TouchableOpacity onPress={() => setShowCreateModal(false)}>
                <Text className="text-blue-600 font-pmedium">Cancel</Text>
              </TouchableOpacity>
              <Text className="text-lg font-pbold text-slate-800">New Rule</Text>
              <TouchableOpacity onPress={createRule}>
                <Text className="text-blue-600 font-pmedium">Save</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View className="p-4">
            <View className="mb-4">
              <Text className="text-sm font-pmedium mb-2 text-slate-700">Rule Name</Text>
              <TextInput
                className="border border-gray-300 rounded-lg p-3 text-base"
                value={newRule.name}
                onChangeText={(text) => setNewRule({ ...newRule, name: text })}
                placeholder="Enter rule name"
              />
            </View>

            <View className="mb-4">
              <Text className="text-sm font-pmedium mb-2 text-slate-700">Keyword to Match</Text>
              <TextInput
                className="border border-gray-300 rounded-lg p-3 text-base"
                value={newRule.keyword}
                onChangeText={(text) => setNewRule({ ...newRule, keyword: text })}
                placeholder="e.g., OTP, sale, urgent"
              />
            </View>

            <View className="mb-4">
              <Text className="text-sm font-pmedium mb-2 text-slate-700">Action</Text>
              <View className="flex-row space-x-3">
                <TouchableOpacity
                  onPress={() => setNewRule({ ...newRule, action: 'mute' })}
                  className={`flex-1 py-3 px-4 rounded-lg border ${newRule.action === 'mute' ? 'bg-blue-50 border-blue-500' : 'border-gray-300'}`}
                >
                  <Text className={`text-center font-pmedium ${newRule.action === 'mute' ? 'text-blue-700' : 'text-gray-700'}`}>
                    Mute
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setNewRule({ ...newRule, action: 'prioritize' })}
                  className={`flex-1 py-3 px-4 rounded-lg border ${newRule.action === 'prioritize' ? 'bg-blue-50 border-blue-500' : 'border-gray-300'}`}
                >
                  <Text className={`text-center font-pmedium ${newRule.action === 'prioritize' ? 'text-blue-700' : 'text-gray-700'}`}>
                    Prioritize
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};