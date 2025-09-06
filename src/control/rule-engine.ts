export interface Rule {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  conditions: Condition[];
  actions: Action[];
  cooldownMs?: number; // Minimum time between rule executions
  priority: number; // Higher number = higher priority
}

export interface Condition {
  type: 'device_state' | 'time' | 'sensor_value' | 'device_offline' | 'composite';
  deviceId?: string;
  property?: string;
  operator: '=' | '!=' | '>' | '<' | '>=' | '<=' | 'contains' | 'between' | 'in';
  value: any;
  secondValue?: any; // For 'between' operator
  logicalOperator?: 'AND' | 'OR'; // How to combine with next condition
}

export interface Action {
  type: 'device_command' | 'notification' | 'log' | 'delay' | 'webhook';
  deviceId?: string;
  command?: any;
  message?: string;
  delayMs?: number;
  webhookUrl?: string;
  severity?: 'low' | 'medium' | 'high';
}

export interface DeviceData {
  deviceId: string;
  deviceType: string;
  room: string;
  name: string;
  topic: string;
  value: any;
  timestamp: Date;
  online: boolean;
}

export interface RuleExecutionContext {
  rule: Rule;
  triggerDevice: DeviceData;
  allDevices: Map<string, DeviceData>;
  timestamp: Date;
}

export class RuleEngine {
  private rules: Map<string, Rule> = new Map();
  private devices: Map<string, DeviceData> = new Map();
  private lastExecution: Map<string, Date> = new Map();
  private executionCallbacks: ((context: RuleExecutionContext, actions: Action[]) => void)[] = [];

  constructor() {
    this.loadDefaultRules();
  }

  public addRule(rule: Rule): void {
    this.rules.set(rule.id, rule);
  }

  public removeRule(ruleId: string): boolean {
    return this.rules.delete(ruleId);
  }

  public getRule(ruleId: string): Rule | undefined {
    return this.rules.get(ruleId);
  }

  public getAllRules(): Rule[] {
    return Array.from(this.rules.values()).sort((a, b) => b.priority - a.priority);
  }

  public updateRule(ruleId: string, updates: Partial<Rule>): boolean {
    const rule = this.rules.get(ruleId);
    if (!rule) return false;

    this.rules.set(ruleId, { ...rule, ...updates });
    return true;
  }

  public enableRule(ruleId: string): boolean {
    return this.updateRule(ruleId, { enabled: true });
  }

  public disableRule(ruleId: string): boolean {
    return this.updateRule(ruleId, { enabled: false });
  }

  public updateDeviceData(deviceData: DeviceData): void {
    this.devices.set(deviceData.deviceId, {
      ...deviceData,
      timestamp: new Date(),
    });

    // Evaluate rules when device data changes
    this.evaluateRules(deviceData);
  }

  public markDeviceOffline(deviceId: string): void {
    const device = this.devices.get(deviceId);
    if (device) {
      device.online = false;
      device.timestamp = new Date();
      this.evaluateRules(device);
    }
  }

  public onRuleExecution(callback: (context: RuleExecutionContext, actions: Action[]) => void): void {
    this.executionCallbacks.push(callback);
  }

  private evaluateRules(triggerDevice: DeviceData): void {
    const enabledRules = Array.from(this.rules.values())
      .filter(rule => rule.enabled)
      .sort((a, b) => b.priority - a.priority);

    for (const rule of enabledRules) {
      if (this.isInCooldown(rule.id)) {
        continue;
      }

      if (this.evaluateConditions(rule.conditions, triggerDevice)) {
        this.executeRule(rule, triggerDevice);
      }
    }
  }

  private evaluateConditions(conditions: Condition[], triggerDevice: DeviceData): boolean {
    if (conditions.length === 0) return false;

    let result = this.evaluateCondition(conditions[0], triggerDevice);

    for (let i = 1; i < conditions.length; i++) {
      const condition = conditions[i - 1]; // Get the previous condition for logical operator
      const currentResult = this.evaluateCondition(conditions[i], triggerDevice);

      if (condition.logicalOperator === 'OR') {
        result = result || currentResult;
      } else {
        // Default to AND
        result = result && currentResult;
      }
    }

    return result;
  }

  private evaluateCondition(condition: Condition, triggerDevice: DeviceData): boolean {
    switch (condition.type) {
      case 'device_state':
        return this.evaluateDeviceState(condition, triggerDevice);
      case 'sensor_value':
        return this.evaluateSensorValue(condition, triggerDevice);
      case 'time':
        return this.evaluateTime(condition);
      case 'device_offline':
        return this.evaluateDeviceOffline(condition);
      case 'composite':
        // For complex conditions that might involve multiple devices
        return this.evaluateComposite(condition, triggerDevice);
      default:
        return false;
    }
  }

  private evaluateDeviceState(condition: Condition, triggerDevice: DeviceData): boolean {
    const deviceId = condition.deviceId || triggerDevice.deviceId;
    const device = this.devices.get(deviceId);
    
    if (!device) return false;

    const propertyValue = this.getPropertyValue(device, condition.property);
    return this.compareValues(propertyValue, condition.operator, condition.value, condition.secondValue);
  }

  private evaluateSensorValue(condition: Condition, triggerDevice: DeviceData): boolean {
    if (condition.deviceId && condition.deviceId !== triggerDevice.deviceId) {
      const device = this.devices.get(condition.deviceId);
      if (!device) return false;
      
      const propertyValue = this.getPropertyValue(device, condition.property);
      return this.compareValues(propertyValue, condition.operator, condition.value, condition.secondValue);
    }

    const propertyValue = this.getPropertyValue(triggerDevice, condition.property);
    return this.compareValues(propertyValue, condition.operator, condition.value, condition.secondValue);
  }

  private evaluateTime(condition: Condition): boolean {
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const currentTime = currentHour * 60 + currentMinute; // Minutes since midnight

    switch (condition.property) {
      case 'hour':
        return this.compareValues(currentHour, condition.operator, condition.value, condition.secondValue);
      case 'time':
        // Value should be in format "HH:MM"
        const [hour, minute] = condition.value.split(':').map(Number);
        const targetTime = hour * 60 + minute;
        return this.compareValues(currentTime, condition.operator, targetTime, condition.secondValue);
      case 'dayOfWeek':
        // 0 = Sunday, 1 = Monday, etc.
        return this.compareValues(now.getDay(), condition.operator, condition.value, condition.secondValue);
      default:
        return false;
    }
  }

  private evaluateDeviceOffline(condition: Condition): boolean {
    const device = this.devices.get(condition.deviceId!);
    if (!device) return true; // Consider unknown devices as offline
    
    return !device.online;
  }

  private evaluateComposite(condition: Condition, triggerDevice: DeviceData): boolean {
    // Implementation for complex conditions involving multiple devices
    // This could be extended based on specific needs
    return false;
  }

  private getPropertyValue(device: DeviceData, property?: string): any {
    if (!property) return device.value;

    // Handle nested properties like "value.temperature" or "color.r"
    const parts = property.split('.');
    let value = device.value;

    for (const part of parts) {
      if (value && typeof value === 'object' && part in value) {
        value = value[part];
      } else {
        return undefined;
      }
    }

    return value;
  }

  private compareValues(actual: any, operator: string, expected: any, secondExpected?: any): boolean {
    switch (operator) {
      case '=':
        return actual === expected;
      case '!=':
        return actual !== expected;
      case '>':
        return Number(actual) > Number(expected);
      case '<':
        return Number(actual) < Number(expected);
      case '>=':
        return Number(actual) >= Number(expected);
      case '<=':
        return Number(actual) <= Number(expected);
      case 'contains':
        return String(actual).includes(String(expected));
      case 'between':
        return Number(actual) >= Number(expected) && Number(actual) <= Number(secondExpected);
      case 'in':
        return Array.isArray(expected) && expected.includes(actual);
      default:
        return false;
    }
  }

  private isInCooldown(ruleId: string): boolean {
    const rule = this.rules.get(ruleId);
    if (!rule?.cooldownMs) return false;

    const lastExecution = this.lastExecution.get(ruleId);
    if (!lastExecution) return false;

    return Date.now() - lastExecution.getTime() < rule.cooldownMs;
  }

  private executeRule(rule: Rule, triggerDevice: DeviceData): void {
    this.lastExecution.set(rule.id, new Date());

    const context: RuleExecutionContext = {
      rule,
      triggerDevice,
      allDevices: new Map(this.devices),
      timestamp: new Date(),
    };

    console.log(`🎯 Executing rule: ${rule.name} (triggered by ${triggerDevice.deviceId})`);

    // Execute actions
    for (const callback of this.executionCallbacks) {
      try {
        callback(context, rule.actions);
      } catch (error) {
        console.error(`Error in rule execution callback:`, error);
      }
    }
  }

  private loadDefaultRules(): void {
    const defaultRules: Rule[] = [
      {
        id: 'motion-lights-on',
        name: 'Turn on lights when motion detected',
        description: 'Automatically turn on lights in a room when motion is detected',
        enabled: true,
        priority: 100,
        cooldownMs: 5000,
        conditions: [
          {
            type: 'sensor_value',
            property: 'detected',
            operator: '=',
            value: true,
          },
        ],
        actions: [
          {
            type: 'device_command',
            command: { command: 'turnOn' },
          },
        ],
      },
      {
        id: 'motion-lights-off',
        name: 'Turn off lights when no motion',
        description: 'Turn off lights after motion clears and some time has passed',
        enabled: true,
        priority: 90,
        cooldownMs: 30000,
        conditions: [
          {
            type: 'sensor_value',
            property: 'detected',
            operator: '=',
            value: false,
          },
        ],
        actions: [
          {
            type: 'delay',
            delayMs: 60000, // Wait 1 minute
          },
          {
            type: 'device_command',
            command: { command: 'turnOff' },
          },
        ],
      },
      {
        id: 'temperature-alert-high',
        name: 'High temperature alert',
        description: 'Alert when temperature exceeds threshold',
        enabled: true,
        priority: 200,
        cooldownMs: 300000, // 5 minutes
        conditions: [
          {
            type: 'sensor_value',
            property: 'value.value',
            operator: '>',
            value: 30,
          },
        ],
        actions: [
          {
            type: 'notification',
            message: 'High temperature detected',
            severity: 'high',
          },
        ],
      },
      {
        id: 'door-open-night-alert',
        name: 'Door opened at night alert',
        description: 'Alert when doors are opened during night hours',
        enabled: true,
        priority: 300,
        cooldownMs: 60000,
        conditions: [
          {
            type: 'sensor_value',
            property: 'state',
            operator: '=',
            value: 'open',
            logicalOperator: 'AND',
          },
          {
            type: 'time',
            property: 'hour',
            operator: 'between',
            value: 22,
            secondValue: 6,
          },
        ],
        actions: [
          {
            type: 'notification',
            message: 'Door opened during night hours',
            severity: 'high',
          },
          {
            type: 'log',
            message: 'Security alert: Night door opening',
          },
        ],
      },
      {
        id: 'energy-saving-lights',
        name: 'Energy saving mode',
        description: 'Dim lights when energy consumption is high',
        enabled: true,
        priority: 50,
        cooldownMs: 120000, // 2 minutes
        conditions: [
          {
            type: 'sensor_value',
            property: 'instantPower',
            operator: '>',
            value: 3000,
          },
        ],
        actions: [
          {
            type: 'device_command',
            command: { command: 'setBrightness', brightness: 50 },
          },
          {
            type: 'notification',
            message: 'Energy saving mode activated - lights dimmed',
            severity: 'low',
          },
        ],
      },
      {
        id: 'welcome-home',
        name: 'Welcome home automation',
        description: 'Turn on lights when front door opens during evening',
        enabled: true,
        priority: 150,
        cooldownMs: 300000, // 5 minutes
        conditions: [
          {
            type: 'device_state',
            property: 'state',
            operator: '=',
            value: 'open',
            logicalOperator: 'AND',
          },
          {
            type: 'time',
            property: 'hour',
            operator: 'between',
            value: 17,
            secondValue: 22,
          },
        ],
        actions: [
          {
            type: 'device_command',
            command: { command: 'turnOn' },
          },
          {
            type: 'device_command',
            command: { command: 'preset', preset: 'bright' },
          },
          {
            type: 'notification',
            message: 'Welcome home! Lights turned on.',
            severity: 'low',
          },
        ],
      },
    ];

    defaultRules.forEach(rule => this.addRule(rule));
    console.log(`📋 Loaded ${defaultRules.length} default automation rules`);
  }

  public getStats(): {
    totalRules: number;
    enabledRules: number;
    disabledRules: number;
    totalDevices: number;
    onlineDevices: number;
    recentExecutions: Array<{ ruleId: string; timestamp: Date }>;
  } {
    const enabledRules = Array.from(this.rules.values()).filter(r => r.enabled);
    const onlineDevices = Array.from(this.devices.values()).filter(d => d.online);
    
    const recentExecutions = Array.from(this.lastExecution.entries())
      .map(([ruleId, timestamp]) => ({ ruleId, timestamp }))
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, 10);

    return {
      totalRules: this.rules.size,
      enabledRules: enabledRules.length,
      disabledRules: this.rules.size - enabledRules.length,
      totalDevices: this.devices.size,
      onlineDevices: onlineDevices.length,
      recentExecutions,
    };
  }
}