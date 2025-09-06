import mqtt from 'mqtt';
import { v4 as uuidv4 } from 'uuid';
import { EventEmitter } from 'node:events';
import { MqttConfig, buildHomeTopic, buildStatusTopic, buildCommandTopic } from '../config/mqtt-config.js';

export interface DeviceState {
  online: boolean;
  lastSeen: Date;
  [key: string]: any;
}

export interface DeviceMessage {
  deviceId: string;
  timestamp: Date;
  value: any;
  topic: string;
  qos: 0 | 1 | 2;
}

export abstract class BaseDevice extends EventEmitter {
  protected client: mqtt.MqttClient | null = null;
  protected deviceId: string;
  protected deviceType: string;
  protected room: string;
  protected name: string;
  protected state: DeviceState;
  protected config: MqttConfig;
  private publishInterval: NodeJS.Timeout | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;

  constructor(
    deviceType: string,
    room: string,
    name: string,
    config: MqttConfig,
    deviceId?: string
  ) {
    super();
    this.deviceId = deviceId || `${deviceType}_${room}_${name}_${uuidv4().slice(0, 8)}`;
    this.deviceType = deviceType;
    this.room = room;
    this.name = name;
    this.config = { ...config, clientId: this.deviceId };
    this.state = {
      online: false,
      lastSeen: new Date(),
    };
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.client = mqtt.connect(this.config.brokerUrl, {
          clientId: this.config.clientId,
          username: this.config.username,
          password: this.config.password,
          keepalive: this.config.keepalive,
          clean: this.config.clean,
          reconnectPeriod: this.config.reconnectPeriod,
          connectTimeout: this.config.connectTimeout,
          will: {
            topic: buildStatusTopic(this.deviceId),
            payload: JSON.stringify({
              deviceId: this.deviceId,
              online: false,
              timestamp: new Date().toISOString(),
            }),
            qos: 1,
            retain: true,
          },
        });

        this.client.on('connect', () => {
          console.log(`Device ${this.deviceId} connected to MQTT broker`);
          this.state.online = true;
          this.state.lastSeen = new Date();
          
          this.publishStatus();
          this.subscribeToCommands();
          this.startHeartbeat();
          
          this.emit('connected');
          resolve();
        });

        this.client.on('error', (error) => {
          console.error(`MQTT error for device ${this.deviceId}:`, error);
          this.emit('error', error);
          reject(error);
        });

        this.client.on('close', () => {
          console.log(`Device ${this.deviceId} disconnected from MQTT broker`);
          this.state.online = false;
          this.emit('disconnected');
        });

        this.client.on('reconnect', () => {
          console.log(`Device ${this.deviceId} reconnecting to MQTT broker`);
          this.emit('reconnecting');
        });

        this.client.on('message', (topic, message) => {
          try {
            const payload = JSON.parse(message.toString());
            this.handleCommand(topic, payload);
          } catch (error) {
            console.error(`Failed to parse message for device ${this.deviceId}:`, error);
          }
        });

      } catch (error) {
        reject(error);
      }
    });
  }

  protected async publish(metric: string, value: any, qos: 0 | 1 | 2 = 0, retain: boolean = false): Promise<void> {
    if (!this.client || !this.state.online) {
      throw new Error(`Device ${this.deviceId} is not connected`);
    }

    const topic = buildHomeTopic(this.room, this.deviceId, metric);
    const message: DeviceMessage = {
      deviceId: this.deviceId,
      timestamp: new Date(),
      value,
      topic,
      qos,
    };

    return new Promise((resolve, reject) => {
      this.client!.publish(topic, JSON.stringify(message), { qos, retain }, (error) => {
        if (error) {
          console.error(`Failed to publish message for device ${this.deviceId}:`, error);
          reject(error);
        } else {
          this.state.lastSeen = new Date();
          this.emit('published', message);
          resolve();
        }
      });
    });
  }

  protected async publishStatus(): Promise<void> {
    if (!this.client) return;

    const statusTopic = buildStatusTopic(this.deviceId);
    const statusMessage = {
      deviceId: this.deviceId,
      deviceType: this.deviceType,
      room: this.room,
      name: this.name,
      online: this.state.online,
      timestamp: new Date().toISOString(),
      ...this.getDeviceInfo(),
    };

    this.client.publish(statusTopic, JSON.stringify(statusMessage), { qos: 1, retain: true });
  }

  private subscribeToCommands(): void {
    if (!this.client) return;

    const commandTopic = buildCommandTopic(this.deviceId);
    this.client.subscribe(commandTopic, { qos: 1 }, (error) => {
      if (error) {
        console.error(`Failed to subscribe to commands for device ${this.deviceId}:`, error);
      } else {
        console.log(`Device ${this.deviceId} subscribed to commands: ${commandTopic}`);
      }
    });
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      this.publishStatus();
    }, 30000); // Every 30 seconds
  }

  public async disconnect(): Promise<void> {
    if (this.publishInterval) {
      clearInterval(this.publishInterval);
      this.publishInterval = null;
    }

    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    this.state.online = false;
    await this.publishStatus();

    return new Promise((resolve) => {
      if (this.client) {
        this.client.end(false, {}, () => {
          console.log(`Device ${this.deviceId} disconnected`);
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  public startPublishing(intervalMs: number = 5000): void {
    if (this.publishInterval) {
      clearInterval(this.publishInterval);
    }

    this.publishInterval = setInterval(async () => {
      try {
        await this.publishData();
      } catch (error) {
        console.error(`Error publishing data for device ${this.deviceId}:`, error);
      }
    }, intervalMs);

    console.log(`Device ${this.deviceId} started publishing every ${intervalMs}ms`);
  }

  public stopPublishing(): void {
    if (this.publishInterval) {
      clearInterval(this.publishInterval);
      this.publishInterval = null;
      console.log(`Device ${this.deviceId} stopped publishing`);
    }
  }

  // Abstract methods to be implemented by concrete device classes
  protected abstract publishData(): Promise<void>;
  protected abstract handleCommand(topic: string, payload: any): void;
  protected abstract getDeviceInfo(): Record<string, any>;

  // Getters
  public getDeviceId(): string {
    return this.deviceId;
  }

  public getDeviceType(): string {
    return this.deviceType;
  }

  public getRoom(): string {
    return this.room;
  }

  public getName(): string {
    return this.name;
  }

  public getState(): DeviceState {
    return { ...this.state };
  }

  public isOnline(): boolean {
    return this.state.online;
  }
}