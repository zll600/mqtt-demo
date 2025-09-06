import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TemperatureHumiditySensor } from '../src/devices/sensors/temperature-humidity-sensor.js';
import { SmartLight } from '../src/devices/actuators/smart-light.js';
import { DeviceManager } from '../src/devices/device-manager.js';
import { authenticatedConfig } from '../src/config/mqtt-config.js';

// Mock MQTT client
vi.mock('mqtt', () => ({
  connect: vi.fn(() => ({
    on: vi.fn(),
    publish: vi.fn(),
    subscribe: vi.fn(),
    end: vi.fn((force, opts, cb) => cb && cb()),
    connected: true,
  })),
}));

describe('IoT Device Tests', () => {
  describe('TemperatureHumiditySensor', () => {
    let sensor: TemperatureHumiditySensor;

    beforeEach(() => {
      sensor = new TemperatureHumiditySensor(
        'living-room',
        'main-sensor',
        authenticatedConfig,
        'test-temp-sensor'
      );
    });

    afterEach(async () => {
      if (sensor.isOnline()) {
        await sensor.disconnect();
      }
    });

    it('should initialize with correct properties', () => {
      expect(sensor.getDeviceType()).toBe('temperature-humidity-sensor');
      expect(sensor.getRoom()).toBe('living-room');
      expect(sensor.getName()).toBe('main-sensor');
      expect(sensor.getDeviceId()).toBe('test-temp-sensor');
      expect(sensor.isOnline()).toBe(false);
    });

    it('should have valid initial temperature and humidity readings', () => {
      const temp = sensor.getCurrentTemperature();
      const humidity = sensor.getCurrentHumidity();
      const unit = sensor.getTemperatureUnit();

      expect(typeof temp).toBe('number');
      expect(typeof humidity).toBe('number');
      expect(temp).toBeGreaterThan(0);
      expect(temp).toBeLessThan(50);
      expect(humidity).toBeGreaterThan(0);
      expect(humidity).toBeLessThan(100);
      expect(['C', 'F']).toContain(unit);
    });

    it('should provide device info', () => {
      const deviceInfo = sensor.getDeviceInfo();
      
      expect(deviceInfo).toHaveProperty('currentTemperature');
      expect(deviceInfo).toHaveProperty('currentHumidity');
      expect(deviceInfo).toHaveProperty('temperatureUnit');
      expect(deviceInfo).toHaveProperty('alertThresholds');
    });
  });

  describe('SmartLight', () => {
    let light: SmartLight;

    beforeEach(() => {
      light = new SmartLight(
        'bedroom',
        'bedside-lamp',
        authenticatedConfig,
        true, // supports color
        'test-smart-light'
      );
    });

    afterEach(async () => {
      if (light.isOnline()) {
        await light.disconnect();
      }
    });

    it('should initialize with correct properties', () => {
      expect(light.getDeviceType()).toBe('smart-light');
      expect(light.getRoom()).toBe('bedroom');
      expect(light.getName()).toBe('bedside-lamp');
      expect(light.getDeviceId()).toBe('test-smart-light');
      expect(light.supportsColorChanges()).toBe(true);
      expect(light.isOn()).toBe(false);
    });

    it('should have valid initial state', () => {
      const brightness = light.getBrightness();
      const powerConsumption = light.getPowerConsumption();
      const lightState = light.getLightState();

      expect(brightness).toBeGreaterThanOrEqual(1);
      expect(brightness).toBeLessThanOrEqual(100);
      expect(powerConsumption).toBe(0); // Light starts off
      expect(lightState).toHaveProperty('on');
      expect(lightState).toHaveProperty('brightness');
      expect(lightState).toHaveProperty('powerConsumption');
    });

    it('should support color when enabled', () => {
      const color = light.getColor();
      expect(color).toBeDefined();
      expect(color).toHaveProperty('r');
      expect(color).toHaveProperty('g');
      expect(color).toHaveProperty('b');
    });

    it('should provide device info', () => {
      const deviceInfo = light.getDeviceInfo();
      
      expect(deviceInfo).toHaveProperty('on');
      expect(deviceInfo).toHaveProperty('brightness');
      expect(deviceInfo).toHaveProperty('supportsColor');
      expect(deviceInfo).toHaveProperty('maxWattage');
      expect(deviceInfo).toHaveProperty('efficiency');
    });
  });

  describe('DeviceManager', () => {
    let deviceManager: DeviceManager;

    beforeEach(() => {
      deviceManager = new DeviceManager();
    });

    afterEach(async () => {
      if (deviceManager.isManagerRunning()) {
        await deviceManager.stopAllDevices();
      }
    });

    it('should initialize with no devices', () => {
      expect(deviceManager.getAllDevices()).toHaveLength(0);
      expect(deviceManager.isManagerRunning()).toBe(false);
    });

    it('should create devices successfully', async () => {
      const deviceConfig = {
        type: 'temperature-humidity' as const,
        room: 'test-room',
        name: 'test-sensor',
      };

      const deviceId = await deviceManager.createDevice(deviceConfig);
      
      expect(typeof deviceId).toBe('string');
      expect(deviceId).toBeTruthy();
      expect(deviceManager.getAllDevices()).toHaveLength(1);
      
      const device = deviceManager.getDevice(deviceId);
      expect(device).toBeDefined();
      expect(device?.getRoom()).toBe('test-room');
      expect(device?.getName()).toBe('test-sensor');
    });

    it('should get device status', async () => {
      const deviceConfig = {
        type: 'smart-light' as const,
        room: 'test-room',
        name: 'test-light',
      };

      await deviceManager.createDevice(deviceConfig);
      
      const status = deviceManager.getDeviceStatus();
      
      expect(status.totalDevices).toBe(1);
      expect(status.devicesByType).toHaveProperty('smart-light', 1);
      expect(status.devicesByRoom).toHaveProperty('test-room', 1);
      expect(status.devices).toHaveLength(1);
    });

    it('should filter devices by room', async () => {
      await deviceManager.createDevice({
        type: 'temperature-humidity' as const,
        room: 'living-room',
        name: 'sensor1',
      });

      await deviceManager.createDevice({
        type: 'smart-light' as const,
        room: 'bedroom',
        name: 'light1',
      });

      await deviceManager.createDevice({
        type: 'motion' as const,
        room: 'living-room',
        name: 'motion1',
      });

      const livingRoomDevices = deviceManager.getDevicesByRoom('living-room');
      const bedroomDevices = deviceManager.getDevicesByRoom('bedroom');

      expect(livingRoomDevices).toHaveLength(2);
      expect(bedroomDevices).toHaveLength(1);
      
      expect(livingRoomDevices.every(d => d.getRoom() === 'living-room')).toBe(true);
      expect(bedroomDevices.every(d => d.getRoom() === 'bedroom')).toBe(true);
    });

    it('should filter devices by type', async () => {
      await deviceManager.createDevice({
        type: 'smart-light' as const,
        room: 'room1',
        name: 'light1',
      });

      await deviceManager.createDevice({
        type: 'smart-light' as const,
        room: 'room2',
        name: 'light2',
      });

      await deviceManager.createDevice({
        type: 'motion' as const,
        room: 'room1',
        name: 'motion1',
      });

      const lightDevices = deviceManager.getDevicesByType('smart-light');
      const motionDevices = deviceManager.getDevicesByType('motion-detector');

      expect(lightDevices).toHaveLength(2);
      expect(motionDevices).toHaveLength(1);
    });
  });
});