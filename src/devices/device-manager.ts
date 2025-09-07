import { authenticatedConfig, type MqttConfig } from "../config/mqtt-config.js";
import logger from "../utils/logger.js";
import { EnergyMeter } from "./actuators/energy-meter.js";
import { SmartLight } from "./actuators/smart-light.js";
import type { BaseDevice } from "./base-device.js";
import { DoorWindowSensor } from "./sensors/door-window-sensor.js";
import { MotionDetector } from "./sensors/motion-detector.js";
import { TemperatureHumiditySensor } from "./sensors/temperature-humidity-sensor.js";

export interface DeviceConfig {
	type:
		| "temperature-humidity"
		| "motion"
		| "door"
		| "window"
		| "smart-light"
		| "smart-light-color"
		| "energy-meter";
	room: string;
	name: string;
	publishInterval?: number;
	config?: Partial<MqttConfig>;
}

export class DeviceManager {
	private devices: Map<string, BaseDevice> = new Map();
	private isRunning: boolean = false;

	constructor() {
		// FIXME: register signal handlers multiple time with the main function
		process.on("SIGINT", () => {
			logger.info("\nReceived SIGINT, shutting down gracefully...");
			this.stopAllDevices().then(() => {
				process.exit(0);
			});
		});

		process.on("SIGTERM", () => {
			logger.info("Received SIGTERM, shutting down gracefully...");
			this.stopAllDevices().then(() => {
				process.exit(0);
			});
		});
	}

	public async createDevice(deviceConfig: DeviceConfig): Promise<string> {
		const config = { ...authenticatedConfig, ...deviceConfig.config };
		let device: BaseDevice;

		switch (deviceConfig.type) {
			case "temperature-humidity":
				device = new TemperatureHumiditySensor(
					deviceConfig.room,
					deviceConfig.name,
					config,
				);
				break;

			case "motion":
				device = new MotionDetector(
					deviceConfig.room,
					deviceConfig.name,
					config,
				);
				break;

			case "door":
				device = new DoorWindowSensor(
					deviceConfig.room,
					deviceConfig.name,
					config,
					"door",
				);
				break;

			case "window":
				device = new DoorWindowSensor(
					deviceConfig.room,
					deviceConfig.name,
					config,
					"window",
				);
				break;

			case "smart-light":
				device = new SmartLight(
					deviceConfig.room,
					deviceConfig.name,
					config,
					false, // No color support
				);
				break;

			case "smart-light-color":
				device = new SmartLight(
					deviceConfig.room,
					deviceConfig.name,
					config,
					true, // Color support
				);
				break;

			case "energy-meter":
				device = new EnergyMeter(deviceConfig.room, deviceConfig.name, config);
				break;

			default:
				throw new Error(`Unknown device type: ${deviceConfig.type}`);
		}

		const deviceId = device.getDeviceId();
		this.devices.set(deviceId, device);

		device.on("connected", () => {
			logger.info(`Device ${deviceId} connected`);
		});

		device.on("disconnected", () => {
			logger.info(`Device ${deviceId} disconnected`);
		});

		device.on("error", (error) => {
			logger.error(error, `Device ${deviceId} error:`);
		});

		device.on("published", (_message) => {
			// Uncomment for detailed logging
			// logger.info(`📡 ${deviceId} published to ${message.topic}`);
		});

		// Connect the device
		await device.connect();

		// Start publishing data
		const publishInterval =
			deviceConfig.publishInterval ||
			this.getDefaultPublishInterval(deviceConfig.type);
		device.startPublishing(publishInterval);

		logger.info(
			`Created and started ${deviceConfig.type} in ${deviceConfig.room}: ${deviceConfig.name} (${deviceId})`,
		);

		return deviceId;
	}

	public async createMultipleDevices(
		deviceConfigs: DeviceConfig[],
	): Promise<string[]> {
		const deviceIds: string[] = [];

		for (const config of deviceConfigs) {
			try {
				const deviceId = await this.createDevice(config);
				deviceIds.push(deviceId);

				// Small delay between device creations to avoid overwhelming the broker
				// FIXME: is this a good approach?
				await this.sleep(100);
			} catch (error) {
				logger.error(
					error,
					`Failed to create device ${config.type} in ${config.room}:`,
				);
			}
		}

		return deviceIds;
	}

	public async startAllDevices(): Promise<void> {
		if (this.isRunning) {
			logger.info("Device manager is already running");
			return;
		}

		this.isRunning = true;
		logger.info(`Started device manager with ${this.devices.size} devices`);

		for (const device of this.devices.values()) {
			if (!device.isOnline()) {
				try {
					await device.connect();
					device.startPublishing();
				} catch (error) {
					logger.error(
						error,
						`Failed to start device ${device.getDeviceId()}:`,
					);
				}
			}
		}
	}

	public async stopAllDevices(): Promise<void> {
		if (!this.isRunning) {
			logger.info("Device manager is not running");
			return;
		}

		this.isRunning = false;
		logger.info("Stopping all devices...");

		const disconnectPromises = Array.from(this.devices.values()).map(
			async (device) => {
				try {
					device.stopPublishing();
					await device.disconnect();
					logger.info(`Stopped device ${device.getDeviceId()}`);
				} catch (error) {
					logger.error(error, `Error stopping device ${device.getDeviceId()}:`);
				}
			},
		);

		await Promise.all(disconnectPromises);
		logger.info("All devices stopped");
	}

	public getDevice(deviceId: string): BaseDevice | undefined {
		return this.devices.get(deviceId);
	}

	public getAllDevices(): BaseDevice[] {
		return Array.from(this.devices.values());
	}

	public getDevicesByRoom(room: string): BaseDevice[] {
		return Array.from(this.devices.values()).filter(
			(device) => device.getRoom() === room,
		);
	}

	public getDevicesByType(type: string): BaseDevice[] {
		return Array.from(this.devices.values()).filter(
			(device) => device.getDeviceType() === type,
		);
	}

	public getDeviceStatus(): Record<string, any> {
		const status: Record<string, any> = {
			totalDevices: this.devices.size,
			onlineDevices: 0,
			offlineDevices: 0,
			devicesByType: {} as Record<string, number>,
			devicesByRoom: {} as Record<string, number>,
			devices: [] as any[],
		};

		for (const device of this.devices.values()) {
			const isOnline = device.isOnline();

			if (isOnline) {
				status.onlineDevices++;
			} else {
				status.offlineDevices++;
			}

			const deviceType = device.getDeviceType();
			const room = device.getRoom();

			status.devicesByType[deviceType] =
				(status.devicesByType[deviceType] || 0) + 1;
			status.devicesByRoom[room] = (status.devicesByRoom[room] || 0) + 1;

			status.devices.push({
				id: device.getDeviceId(),
				type: deviceType,
				room: room,
				name: device.getName(),
				online: isOnline,
				lastSeen: device.getState().lastSeen,
			});
		}

		return status;
	}

	public async removeDevice(deviceId: string): Promise<boolean> {
		const device = this.devices.get(deviceId);
		if (!device) {
			return false;
		}

		try {
			device.stopPublishing();
			await device.disconnect();
			this.devices.delete(deviceId);
			logger.info(`✓ Removed device ${deviceId}`);
			return true;
		} catch (error) {
			logger.error(error, `Error removing device ${deviceId}:`);
			return false;
		}
	}

	private getDefaultPublishInterval(deviceType: string): number {
		switch (deviceType) {
			case "temperature-humidity":
				return 5000; // 5 seconds
			case "motion":
				return 2000; // 2 seconds (more frequent for security)
			case "door":
			case "window":
				return 3000; // 3 seconds
			case "smart-light":
			case "smart-light-color":
				return 10000; // 10 seconds (less frequent for state)
			case "energy-meter":
				return 5000; // 5 seconds
			default:
				return 5000;
		}
	}

	private sleep(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}

	public isManagerRunning(): boolean {
		return this.isRunning;
	}
}

export function createSmartHomeDevices(): DeviceConfig[] {
	return [
		// Living Room
		{ type: "temperature-humidity", room: "living-room", name: "main-sensor" },
		{ type: "motion", room: "living-room", name: "motion-detector" },
		{ type: "smart-light-color", room: "living-room", name: "ceiling-light" },
		{ type: "smart-light", room: "living-room", name: "table-lamp" },

		// Kitchen
		{ type: "temperature-humidity", room: "kitchen", name: "kitchen-sensor" },
		{ type: "motion", room: "kitchen", name: "motion-detector" },
		{ type: "smart-light", room: "kitchen", name: "under-cabinet" },
		{ type: "door", room: "kitchen", name: "back-door" },

		// Bedroom
		{ type: "temperature-humidity", room: "bedroom", name: "bedside-sensor" },
		{ type: "motion", room: "bedroom", name: "motion-detector" },
		{ type: "smart-light-color", room: "bedroom", name: "bedside-lamp" },
		{ type: "window", room: "bedroom", name: "main-window" },

		// Bathroom
		{ type: "motion", room: "bathroom", name: "motion-detector" },
		{ type: "smart-light", room: "bathroom", name: "vanity-light" },
		{ type: "window", room: "bathroom", name: "ventilation-window" },

		// Front Door
		{ type: "door", room: "entrance", name: "front-door" },
		{ type: "motion", room: "entrance", name: "doorbell-camera" },
		{ type: "smart-light", room: "entrance", name: "porch-light" },

		// Utility
		{ type: "energy-meter", room: "utility", name: "main-meter" },
	];
}
