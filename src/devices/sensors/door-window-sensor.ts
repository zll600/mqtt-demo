import { BaseDevice } from '../base-device.js';
import { MqttConfig } from '../../config/mqtt-config.js';

type SensorType = 'door' | 'window';
type SensorState = 'open' | 'closed' | 'unknown';

interface SensorEvent {
  state: SensorState;
  previousState: SensorState;
  confidence: number;
  batteryLevel?: number;
}

export class DoorWindowSensor extends BaseDevice {
  private currentState: SensorState = 'closed';
  private previousState: SensorState = 'unknown';
  private sensorType: SensorType;
  private batteryLevel: number = 100;
  private lastStateChange: Date = new Date();
  private openDuration: number = 0; // in milliseconds

  constructor(
    room: string, 
    name: string, 
    config: MqttConfig, 
    sensorType: SensorType = 'door',
    deviceId?: string
  ) {
    super(`${sensorType}-sensor`, room, name, config, deviceId);
    this.sensorType = sensorType;
  }

  protected async publishData(): Promise<void> {
    // Simulate random state changes based on realistic patterns
    const shouldChangeState = this.simulateStateChange();
    
    if (shouldChangeState) {
      await this.changeState();
    }

    // Always publish current state
    await this.publishCurrentState();

    // Simulate battery drain
    this.simulateBatteryDrain();

    // Publish battery level occasionally
    if (Math.random() < 0.1) { // 10% chance
      await this.publishBatteryLevel();
    }
  }

  protected handleCommand(topic: string, payload: any): void {
    console.log(`${this.sensorType} sensor ${this.deviceId} received command:`, { topic, payload });

    if (payload.command) {
      switch (payload.command) {
        case 'setState':
          if (['open', 'closed'].includes(payload.state)) {
            this.forceState(payload.state as SensorState);
          }
          break;
        case 'getBatteryLevel':
          this.publishBatteryLevel();
          break;
        case 'reset':
          this.resetSensor();
          break;
        case 'test':
          this.performTest();
          break;
        default:
          console.log(`Unknown command: ${payload.command}`);
      }
    }
  }

  protected getDeviceInfo(): Record<string, any> {
    return {
      sensorType: this.sensorType,
      currentState: this.currentState,
      previousState: this.previousState,
      lastStateChange: this.lastStateChange.toISOString(),
      batteryLevel: this.batteryLevel,
      openDuration: this.openDuration,
      timeSinceLastChange: Date.now() - this.lastStateChange.getTime(),
    };
  }

  private simulateStateChange(): boolean {
    const now = new Date();
    const hour = now.getHours();
    const timeSinceLastChange = Date.now() - this.lastStateChange.getTime();
    
    // Don't change state too frequently
    if (timeSinceLastChange < 10000) { // Less than 10 seconds
      return false;
    }

    // Base probability of state change
    let baseProbability = 0.01; // 1% chance per check

    // Adjust probability based on time of day
    if (hour >= 6 && hour <= 22) {
      baseProbability *= 4; // More activity during day
    } else {
      baseProbability *= 0.5; // Less activity at night
    }

    // Different behavior for doors vs windows
    if (this.sensorType === 'door') {
      // Doors change state more frequently
      baseProbability *= 2;
      
      // Entry doors are used more during commute times
      if ((hour >= 7 && hour <= 9) || (hour >= 17 && hour <= 19)) {
        baseProbability *= 3;
      }
    } else {
      // Windows change less frequently and mainly during day
      if (hour >= 8 && hour <= 18) {
        baseProbability *= 1.5;
      } else {
        baseProbability *= 0.2;
      }
    }

    // If currently open, higher chance to close (especially for doors)
    if (this.currentState === 'open') {
      baseProbability *= this.sensorType === 'door' ? 8 : 3;
    }

    return Math.random() < baseProbability;
  }

  private async changeState(): Promise<void> {
    this.previousState = this.currentState;
    
    if (this.currentState === 'open') {
      // Calculate how long it was open
      this.openDuration = Date.now() - this.lastStateChange.getTime();
      this.currentState = 'closed';
    } else {
      this.currentState = 'open';
      this.openDuration = 0;
    }

    this.lastStateChange = new Date();

    // Publish state change with high QoS (important for security)
    const sensorEvent: SensorEvent = {
      state: this.currentState,
      previousState: this.previousState,
      confidence: 0.95 + Math.random() * 0.05, // 95-100% confidence
      batteryLevel: this.batteryLevel,
    };

    await this.publish('state', sensorEvent, 1, true); // QoS 1 with retain
    await this.publish('event', {
      type: `${this.sensorType}_${this.currentState}`,
      previousState: this.previousState,
      duration: this.currentState === 'closed' ? this.openDuration : 0,
      timestamp: this.lastStateChange.toISOString(),
    }, 1);

    console.log(`${this.sensorType} ${this.deviceId} changed from ${this.previousState} to ${this.currentState}`);

    // Trigger security alert if opened during night hours
    if (this.currentState === 'open' && this.isNightTime()) {
      await this.publishSecurityAlert();
    }
  }

  private async publishCurrentState(): Promise<void> {
    const timeSinceChange = Date.now() - this.lastStateChange.getTime();
    
    await this.publish('status', {
      state: this.currentState,
      sensorType: this.sensorType,
      timeSinceLastChange: timeSinceChange,
      isSecure: this.currentState === 'closed',
    }, 0);
  }

  private simulateBatteryDrain(): void {
    // Simulate realistic battery drain (very slow)
    // State changes consume more battery
    const baseConsumption = 0.0001; // 0.01% per reading
    const stateChangeConsumption = this.lastStateChange.getTime() > (Date.now() - 60000) ? 0.001 : 0;
    
    this.batteryLevel = Math.max(0, this.batteryLevel - baseConsumption - stateChangeConsumption);
  }

  private async publishBatteryLevel(): Promise<void> {
    await this.publish('battery', {
      level: Math.round(this.batteryLevel),
      status: this.getBatteryStatus(),
      estimatedLifeDays: this.estimateBatteryLife(),
    }, 0, true); // Retained for latest battery status

    // Alert if battery is low
    if (this.batteryLevel < 20) {
      await this.publish('alert', {
        type: 'low_battery',
        batteryLevel: this.batteryLevel,
        severity: this.batteryLevel < 10 ? 'high' : 'medium',
        timestamp: new Date().toISOString(),
      }, 1);
    }
  }

  private async publishSecurityAlert(): Promise<void> {
    const hour = new Date().getHours();
    
    await this.publish('security', {
      type: 'night_opening',
      sensorType: this.sensorType,
      state: this.currentState,
      time: hour,
      severity: 'medium',
      timestamp: new Date().toISOString(),
    }, 2); // QoS 2 for critical security alerts
  }

  private forceState(state: SensorState): void {
    if (state !== this.currentState) {
      this.previousState = this.currentState;
      this.currentState = state;
      this.lastStateChange = new Date();

      this.publish('forced_state', {
        state: this.currentState,
        previousState: this.previousState,
        forced: true,
        timestamp: this.lastStateChange.toISOString(),
      }, 1);
    }
  }

  private async performTest(): Promise<void> {
    console.log(`Performing test for ${this.sensorType} sensor ${this.deviceId}`);
    
    await this.publish('test', {
      testStarted: true,
      timestamp: new Date().toISOString(),
    }, 1);

    const originalState = this.currentState;
    
    // Simulate opening and closing
    await this.forceState('open');
    
    setTimeout(async () => {
      await this.forceState('closed');
      
      await this.publish('test', {
        testCompleted: true,
        originalState,
        timestamp: new Date().toISOString(),
      }, 1);
    }, 2000);
  }

  private resetSensor(): void {
    this.currentState = 'closed';
    this.previousState = 'unknown';
    this.batteryLevel = 100;
    this.lastStateChange = new Date();
    this.openDuration = 0;

    this.publish('reset', {
      reset: true,
      timestamp: new Date().toISOString(),
    }, 1);
  }

  private isNightTime(): boolean {
    const hour = new Date().getHours();
    return hour >= 22 || hour <= 6;
  }

  private getBatteryStatus(): string {
    if (this.batteryLevel > 80) return 'excellent';
    if (this.batteryLevel > 50) return 'good';
    if (this.batteryLevel > 20) return 'low';
    if (this.batteryLevel > 10) return 'very_low';
    return 'critical';
  }

  private estimateBatteryLife(): number {
    if (this.batteryLevel <= 0) return 0;
    
    const dailyConsumption = 0.0001 * 24 * 12; // Assuming 12 readings per hour
    return Math.round(this.batteryLevel / dailyConsumption);
  }

  // Public getters
  public getCurrentState(): SensorState {
    return this.currentState;
  }

  public getSensorType(): SensorType {
    return this.sensorType;
  }

  public getBatteryLevel(): number {
    return Math.round(this.batteryLevel);
  }

  public getLastStateChange(): Date {
    return new Date(this.lastStateChange);
  }

  public isOpen(): boolean {
    return this.currentState === 'open';
  }

  public isClosed(): boolean {
    return this.currentState === 'closed';
  }
}