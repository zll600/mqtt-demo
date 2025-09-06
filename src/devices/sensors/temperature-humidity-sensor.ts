import { BaseDevice } from '../base-device.js';
import { MqttConfig } from '../../config/mqtt-config.js';

interface TemperatureHumidityState {
  temperature: number;
  humidity: number;
  unit: 'C' | 'F';
}

export class TemperatureHumiditySensor extends BaseDevice {
  private currentTemp: number = 22; // Start at room temperature (Celsius)
  private currentHumidity: number = 45; // Start at comfortable humidity
  private tempUnit: 'C' | 'F' = 'C';

  constructor(room: string, name: string, config: MqttConfig, deviceId?: string) {
    super('temperature-humidity-sensor', room, name, config, deviceId);
    
    // Initialize with some random variation
    this.currentTemp += (Math.random() - 0.5) * 4; // ±2°C variation
    this.currentHumidity += (Math.random() - 0.5) * 20; // ±10% variation
  }

  protected async publishData(): Promise<void> {
    // Simulate realistic temperature and humidity changes
    this.simulateEnvironmentalChanges();

    const temperatureData = {
      value: parseFloat(this.currentTemp.toFixed(1)),
      unit: this.tempUnit,
      deviceType: this.deviceType,
      room: this.room,
    };

    const humidityData = {
      value: parseFloat(this.currentHumidity.toFixed(1)),
      unit: '%',
      deviceType: this.deviceType,
      room: this.room,
    };

    // Publish temperature and humidity with QoS 0 (fire and forget for sensor data)
    await this.publish('temperature', temperatureData, 0);
    await this.publish('humidity', humidityData, 0);

    // Occasionally publish combined reading with higher QoS for important data
    if (this.currentTemp > 30 || this.currentTemp < 10 || this.currentHumidity > 80 || this.currentHumidity < 20) {
      await this.publish('alert', {
        temperature: temperatureData,
        humidity: humidityData,
        alertType: this.getAlertType(),
        severity: this.getAlertSeverity(),
      }, 1, true); // QoS 1 with retain for alerts
    }
  }

  protected handleCommand(topic: string, payload: any): void {
    console.log(`Temperature sensor ${this.deviceId} received command:`, { topic, payload });

    if (payload.command) {
      switch (payload.command) {
        case 'setUnit':
          if (payload.unit === 'C' || payload.unit === 'F') {
            this.setTemperatureUnit(payload.unit);
          }
          break;
        case 'calibrate':
          this.calibrateSensor(payload.temperature, payload.humidity);
          break;
        case 'reset':
          this.resetSensor();
          break;
        default:
          console.log(`Unknown command: ${payload.command}`);
      }
    }
  }

  protected getDeviceInfo(): Record<string, any> {
    return {
      currentTemperature: this.currentTemp,
      currentHumidity: this.currentHumidity,
      temperatureUnit: this.tempUnit,
      alertThresholds: {
        temperature: { min: 10, max: 30 },
        humidity: { min: 20, max: 80 },
      },
    };
  }

  private simulateEnvironmentalChanges(): void {
    // Simulate slow temperature drift (±0.5°C)
    this.currentTemp += (Math.random() - 0.5) * 1.0;
    
    // Simulate humidity changes (±2%)
    this.currentHumidity += (Math.random() - 0.5) * 4.0;

    // Keep values within realistic bounds
    this.currentTemp = Math.max(5, Math.min(45, this.currentTemp));
    this.currentHumidity = Math.max(10, Math.min(95, this.currentHumidity));

    // Simulate time-of-day effects (simplified)
    const hour = new Date().getHours();
    if (hour >= 6 && hour <= 18) {
      // Daytime: slightly warmer, lower humidity
      this.currentTemp += 0.1;
      this.currentHumidity -= 0.1;
    } else {
      // Nighttime: slightly cooler, higher humidity
      this.currentTemp -= 0.1;
      this.currentHumidity += 0.1;
    }
  }

  private setTemperatureUnit(unit: 'C' | 'F'): void {
    if (unit !== this.tempUnit) {
      if (unit === 'F') {
        this.currentTemp = this.currentTemp * 9/5 + 32;
      } else {
        this.currentTemp = (this.currentTemp - 32) * 5/9;
      }
      this.tempUnit = unit;
      
      this.publish('config', {
        temperatureUnit: this.tempUnit,
        changed: new Date().toISOString(),
      }, 1, true);
    }
  }

  private calibrateSensor(targetTemp?: number, targetHumidity?: number): void {
    if (targetTemp !== undefined) {
      this.currentTemp = targetTemp;
    }
    if (targetHumidity !== undefined) {
      this.currentHumidity = targetHumidity;
    }

    this.publish('calibration', {
      calibrated: true,
      temperature: this.currentTemp,
      humidity: this.currentHumidity,
      timestamp: new Date().toISOString(),
    }, 1);
  }

  private resetSensor(): void {
    this.currentTemp = 22;
    this.currentHumidity = 45;
    this.tempUnit = 'C';

    this.publish('reset', {
      reset: true,
      timestamp: new Date().toISOString(),
    }, 1);
  }

  private getAlertType(): string {
    if (this.currentTemp > 30) return 'high_temperature';
    if (this.currentTemp < 10) return 'low_temperature';
    if (this.currentHumidity > 80) return 'high_humidity';
    if (this.currentHumidity < 20) return 'low_humidity';
    return 'normal';
  }

  private getAlertSeverity(): 'low' | 'medium' | 'high' {
    const tempOut = Math.max(0, this.currentTemp - 30, 10 - this.currentTemp);
    const humOut = Math.max(0, this.currentHumidity - 80, 20 - this.currentHumidity);
    
    const maxOut = Math.max(tempOut, humOut);
    if (maxOut > 10) return 'high';
    if (maxOut > 5) return 'medium';
    return 'low';
  }

  // Public methods for external control
  public getCurrentTemperature(): number {
    return this.currentTemp;
  }

  public getCurrentHumidity(): number {
    return this.currentHumidity;
  }

  public getTemperatureUnit(): 'C' | 'F' {
    return this.tempUnit;
  }
}