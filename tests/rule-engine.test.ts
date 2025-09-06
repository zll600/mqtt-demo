import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RuleEngine, Rule, DeviceData } from '../src/control/rule-engine.js';

describe('Rule Engine Tests', () => {
  let ruleEngine: RuleEngine;

  beforeEach(() => {
    ruleEngine = new RuleEngine();
  });

  describe('Rule Management', () => {
    it('should start with default rules loaded', () => {
      const rules = ruleEngine.getAllRules();
      expect(rules.length).toBeGreaterThan(0);
      
      const enabledRules = rules.filter(r => r.enabled);
      expect(enabledRules.length).toBeGreaterThan(0);
    });

    it('should add and retrieve rules', () => {
      const testRule: Rule = {
        id: 'test-rule',
        name: 'Test Rule',
        description: 'A test rule',
        enabled: true,
        priority: 100,
        conditions: [{
          type: 'sensor_value',
          property: 'temperature',
          operator: '>',
          value: 25
        }],
        actions: [{
          type: 'log',
          message: 'High temperature detected'
        }]
      };

      ruleEngine.addRule(testRule);
      
      const retrievedRule = ruleEngine.getRule('test-rule');
      expect(retrievedRule).toEqual(testRule);
    });

    it('should update rules', () => {
      const testRule: Rule = {
        id: 'update-test',
        name: 'Update Test',
        description: 'Test updating',
        enabled: true,
        priority: 50,
        conditions: [],
        actions: []
      };

      ruleEngine.addRule(testRule);
      
      const updated = ruleEngine.updateRule('update-test', {
        name: 'Updated Name',
        priority: 75
      });

      expect(updated).toBe(true);
      
      const retrievedRule = ruleEngine.getRule('update-test');
      expect(retrievedRule?.name).toBe('Updated Name');
      expect(retrievedRule?.priority).toBe(75);
      expect(retrievedRule?.description).toBe('Test updating'); // Should remain unchanged
    });

    it('should enable and disable rules', () => {
      const testRule: Rule = {
        id: 'toggle-test',
        name: 'Toggle Test',
        description: 'Test toggling',
        enabled: true,
        priority: 50,
        conditions: [],
        actions: []
      };

      ruleEngine.addRule(testRule);
      
      // Disable rule
      const disabled = ruleEngine.disableRule('toggle-test');
      expect(disabled).toBe(true);
      expect(ruleEngine.getRule('toggle-test')?.enabled).toBe(false);

      // Enable rule
      const enabled = ruleEngine.enableRule('toggle-test');
      expect(enabled).toBe(true);
      expect(ruleEngine.getRule('toggle-test')?.enabled).toBe(true);
    });

    it('should remove rules', () => {
      const testRule: Rule = {
        id: 'remove-test',
        name: 'Remove Test',
        description: 'Test removing',
        enabled: true,
        priority: 50,
        conditions: [],
        actions: []
      };

      ruleEngine.addRule(testRule);
      expect(ruleEngine.getRule('remove-test')).toBeDefined();

      const removed = ruleEngine.removeRule('remove-test');
      expect(removed).toBe(true);
      expect(ruleEngine.getRule('remove-test')).toBeUndefined();
    });
  });

  describe('Device Data Handling', () => {
    it('should update device data', () => {
      const deviceData: DeviceData = {
        deviceId: 'temp-sensor-1',
        deviceType: 'temperature-sensor',
        room: 'living-room',
        name: 'Main Temperature Sensor',
        topic: 'home/living-room/temp-sensor-1/temperature',
        value: { temperature: 22.5, humidity: 45 },
        timestamp: new Date(),
        online: true
      };

      ruleEngine.updateDeviceData(deviceData);
      
      const stats = ruleEngine.getStats();
      expect(stats.totalDevices).toBe(1);
      expect(stats.onlineDevices).toBe(1);
    });

    it('should mark devices as offline', () => {
      const deviceData: DeviceData = {
        deviceId: 'test-device',
        deviceType: 'sensor',
        room: 'test-room',
        name: 'Test Device',
        topic: 'home/test-room/test-device/data',
        value: {},
        timestamp: new Date(),
        online: true
      };

      ruleEngine.updateDeviceData(deviceData);
      expect(ruleEngine.getStats().onlineDevices).toBe(1);

      ruleEngine.markDeviceOffline('test-device');
      expect(ruleEngine.getStats().onlineDevices).toBe(0);
    });
  });

  describe('Rule Execution', () => {
    it('should execute callback when rule conditions are met', async () => {
      const mockCallback = vi.fn();
      ruleEngine.onRuleExecution(mockCallback);

      // Add a simple test rule
      const testRule: Rule = {
        id: 'callback-test',
        name: 'Callback Test',
        description: 'Test callback execution',
        enabled: true,
        priority: 100,
        conditions: [{
          type: 'sensor_value',
          property: 'value.temperature',
          operator: '>',
          value: 30
        }],
        actions: [{
          type: 'log',
          message: 'Temperature too high'
        }]
      };

      ruleEngine.addRule(testRule);

      // Trigger the rule with high temperature data
      const deviceData: DeviceData = {
        deviceId: 'temp-test',
        deviceType: 'temperature-sensor',
        room: 'test-room',
        name: 'Test Temp Sensor',
        topic: 'home/test-room/temp-test/temperature',
        value: { temperature: 35 }, // Above threshold
        timestamp: new Date(),
        online: true
      };

      ruleEngine.updateDeviceData(deviceData);

      // Give some time for async processing
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockCallback).toHaveBeenCalled();
    });

    it('should respect rule priority order', () => {
      const executionOrder: string[] = [];
      
      ruleEngine.onRuleExecution((context) => {
        executionOrder.push(context.rule.id);
      });

      // Add rules with different priorities
      const lowPriorityRule: Rule = {
        id: 'low-priority',
        name: 'Low Priority',
        description: 'Low priority rule',
        enabled: true,
        priority: 10,
        conditions: [{
          type: 'sensor_value',
          property: 'value.trigger',
          operator: '=',
          value: true
        }],
        actions: [{ type: 'log', message: 'Low priority' }]
      };

      const highPriorityRule: Rule = {
        id: 'high-priority',
        name: 'High Priority',
        description: 'High priority rule',
        enabled: true,
        priority: 100,
        conditions: [{
          type: 'sensor_value',
          property: 'value.trigger',
          operator: '=',
          value: true
        }],
        actions: [{ type: 'log', message: 'High priority' }]
      };

      ruleEngine.addRule(lowPriorityRule);
      ruleEngine.addRule(highPriorityRule);

      // Trigger both rules
      const deviceData: DeviceData = {
        deviceId: 'trigger-test',
        deviceType: 'test-device',
        room: 'test-room',
        name: 'Trigger Device',
        topic: 'home/test-room/trigger-test/data',
        value: { trigger: true },
        timestamp: new Date(),
        online: true
      };

      ruleEngine.updateDeviceData(deviceData);

      // High priority rule should execute first
      expect(executionOrder[0]).toBe('high-priority');
      expect(executionOrder[1]).toBe('low-priority');
    });

    it('should respect cooldown periods', async () => {
      const mockCallback = vi.fn();
      ruleEngine.onRuleExecution(mockCallback);

      // Add rule with cooldown
      const cooldownRule: Rule = {
        id: 'cooldown-test',
        name: 'Cooldown Test',
        description: 'Test cooldown functionality',
        enabled: true,
        priority: 100,
        cooldownMs: 1000, // 1 second cooldown
        conditions: [{
          type: 'sensor_value',
          property: 'value.trigger',
          operator: '=',
          value: true
        }],
        actions: [{ type: 'log', message: 'Cooldown test' }]
      };

      ruleEngine.addRule(cooldownRule);

      const deviceData: DeviceData = {
        deviceId: 'cooldown-device',
        deviceType: 'test-device',
        room: 'test-room',
        name: 'Cooldown Device',
        topic: 'home/test-room/cooldown-device/data',
        value: { trigger: true },
        timestamp: new Date(),
        online: true
      };

      // First execution should work
      ruleEngine.updateDeviceData(deviceData);
      expect(mockCallback).toHaveBeenCalledTimes(1);

      // Second execution should be blocked by cooldown
      ruleEngine.updateDeviceData(deviceData);
      expect(mockCallback).toHaveBeenCalledTimes(1);

      // Wait for cooldown to expire
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Third execution should work again
      ruleEngine.updateDeviceData(deviceData);
      expect(mockCallback).toHaveBeenCalledTimes(2);
    }, 2000);
  });

  describe('Statistics', () => {
    it('should provide accurate statistics', () => {
      // Add some test rules
      const enabledRule: Rule = {
        id: 'enabled-rule',
        name: 'Enabled Rule',
        description: 'An enabled rule',
        enabled: true,
        priority: 100,
        conditions: [],
        actions: []
      };

      const disabledRule: Rule = {
        id: 'disabled-rule',
        name: 'Disabled Rule',
        description: 'A disabled rule',
        enabled: false,
        priority: 50,
        conditions: [],
        actions: []
      };

      ruleEngine.addRule(enabledRule);
      ruleEngine.addRule(disabledRule);

      // Add some devices
      const deviceData1: DeviceData = {
        deviceId: 'device-1',
        deviceType: 'sensor',
        room: 'room-1',
        name: 'Device 1',
        topic: 'home/room-1/device-1/data',
        value: {},
        timestamp: new Date(),
        online: true
      };

      const deviceData2: DeviceData = {
        deviceId: 'device-2',
        deviceType: 'actuator',
        room: 'room-2',
        name: 'Device 2',
        topic: 'home/room-2/device-2/data',
        value: {},
        timestamp: new Date(),
        online: false
      };

      ruleEngine.updateDeviceData(deviceData1);
      ruleEngine.updateDeviceData(deviceData2);

      const stats = ruleEngine.getStats();

      expect(stats.totalRules).toBeGreaterThanOrEqual(2); // At least our test rules
      expect(stats.enabledRules).toBeGreaterThanOrEqual(1);
      expect(stats.disabledRules).toBeGreaterThanOrEqual(1);
      expect(stats.totalDevices).toBe(2);
      expect(stats.onlineDevices).toBe(1);
      expect(Array.isArray(stats.recentExecutions)).toBe(true);
    });
  });
});