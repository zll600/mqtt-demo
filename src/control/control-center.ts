import { EventEmitter } from "node:events";
import mqtt from "mqtt";
import {
	buildTopic,
	controlCenterConfig,
	topicStructure,
} from "../config/mqtt-config.js";
import { logger } from "../utils/logger.js";
import {
	type Action,
	type DeviceData,
	RuleEngine,
	type RuleExecutionContext,
} from "./rule-engine.js";

export interface ControlCenterConfig {
	mqttConfig: typeof controlCenterConfig;
	enableAutomation: boolean;
	enableLogging: boolean;
	logLevel: "debug" | "info" | "warn" | "error";
}

interface NotificationMessage {
	id: string;
	timestamp: Date;
	message: string;
	severity: "low" | "medium" | "high";
	deviceId?: string;
	ruleId?: string;
	acknowledged: boolean;
}

export class ControlCenter extends EventEmitter {
	private client: mqtt.MqttClient | null = null;
	private ruleEngine: RuleEngine;
	private config: ControlCenterConfig;
	private isConnected: boolean = false;
	private notifications: NotificationMessage[] = [];
	private deviceCommands: Map<string, any[]> = new Map();

	constructor(config?: Partial<ControlCenterConfig>) {
		super();

		this.config = {
			mqttConfig: controlCenterConfig,
			enableAutomation: true,
			enableLogging: true,
			logLevel: "info",
			...config,
		};

		this.ruleEngine = new RuleEngine();
		this.setupRuleEngineCallbacks();
	}

	public async connect(): Promise<void> {
		return new Promise((resolve, reject) => {
			try {
				this.client = mqtt.connect(this.config.mqttConfig.brokerUrl, {
					clientId: "control-center",
					username: this.config.mqttConfig.username,
					password: this.config.mqttConfig.password,
					keepalive: this.config.mqttConfig.keepalive,
					clean: this.config.mqttConfig.clean,
					reconnectPeriod: this.config.mqttConfig.reconnectPeriod,
					connectTimeout: this.config.mqttConfig.connectTimeout,
					will: {
						topic: buildTopic(topicStructure.home, "control-center", "status"),
						payload: JSON.stringify({
							online: false,
							timestamp: new Date().toISOString(),
						}),
						qos: 1,
						retain: true,
					},
				});

				this.client.on("connect", () => {
					logger.info("Control Center connected to MQTT broker");
					this.isConnected = true;
					this.subscribeToTopics();
					this.publishStatus();
					this.emit("connected");
					resolve();
				});

				this.client.on("error", (error) => {
					logger.error(error, "Control Center MQTT error:");
					this.emit("error", error);
					reject(error);
				});

				this.client.on("close", () => {
					logger.info("Control Center disconnected from MQTT broker");
					this.isConnected = false;
					this.emit("disconnected");
				});

				this.client.on("reconnect", () => {
					logger.info("Control Center reconnecting to MQTT broker");
					this.emit("reconnecting");
				});

				this.client.on("message", (topic, message) => {
					try {
						this.handleMessage(topic, message);
					} catch (error) {
						logger.error(error, "Error handling message:");
					}
				});
			} catch (error) {
				reject(error);
			}
		});
	}

	public async disconnect(): Promise<void> {
		this.isConnected = false;

		if (this.client) {
			const offlineStatus = {
				online: false,
				timestamp: new Date().toISOString(),
			};

			this.client.publish(
				buildTopic(topicStructure.home, "control-center", "status"),
				JSON.stringify(offlineStatus),
				{ qos: 1, retain: true },
			);

			return new Promise((resolve) => {
				this.client!.end(false, {}, () => {
					logger.info("Control Center disconnected");
					resolve();
				});
			});
		}
	}

	private subscribeToTopics(): void {
		if (!this.client) return;

		const deviceDataTopic = buildTopic(topicStructure.home, "+", "+", "+");
		this.client.subscribe(deviceDataTopic, { qos: 0 }, (error) => {
			if (error) {
				logger.error(error, "Failed to subscribe to device data:");
			} else {
				logger.info(`Subscribed to device data: ${deviceDataTopic}`);
			}
		});

		const statusTopic = buildTopic(
			topicStructure.home,
			topicStructure.status,
			"+",
		);
		this.client.subscribe(statusTopic, { qos: 1 }, (error) => {
			if (error) {
				logger.error(error, "Failed to subscribe to device status:");
			} else {
				logger.info(`📊 Subscribed to device status: ${statusTopic}`);
			}
		});

		// Subscribe to control center commands
		const commandTopic = buildTopic(
			topicStructure.home,
			"control-center",
			"command",
		);
		this.client.subscribe(commandTopic, { qos: 1 }, (error) => {
			if (error) {
				logger.error(error, "Failed to subscribe to control center commands:");
			} else {
				logger.info(`🎛️ Subscribed to control commands: ${commandTopic}`);
			}
		});
	}

	private handleMessage(topic: string, message: Buffer): void {
		try {
			const payload = JSON.parse(message.toString());
			const topicParts = topic.split("/");

			if (topicParts[0] === topicStructure.home) {
				if (topicParts[1] === topicStructure.status) {
					// Device status message
					this.handleDeviceStatus(topicParts[2], payload);
				} else if (
					topicParts[1] === "control-center" &&
					topicParts[2] === "command"
				) {
					// Control center command
					this.handleControlCenterCommand(payload);
				} else if (topicParts.length >= 4) {
					// Regular device data: home/room/device/metric
					const deviceData: DeviceData = {
						deviceId: payload.deviceId || topicParts[2],
						deviceType: payload.deviceType || "unknown",
						room: topicParts[1],
						name: payload.name || topicParts[2],
						topic,
						value: payload.value || payload,
						timestamp: new Date(payload.timestamp || Date.now()),
						online: true,
					};

					// Update rule engine with new data
					if (this.config.enableAutomation) {
						this.ruleEngine.updateDeviceData(deviceData);
					}

					this.emit("deviceData", deviceData);
				}
			}
		} catch (error) {
			if (this.config.logLevel === "debug") {
				logger.error(error, `Error parsing message from ${topic}:`);
			}
		}
	}

	private handleDeviceStatus(deviceId: string, payload: any): void {
		if (payload.online === false) {
			this.ruleEngine.markDeviceOffline(deviceId);
			this.addNotification({
				message: `Device ${deviceId} went offline`,
				severity: "medium",
				deviceId,
			});
		}
	}

	private handleControlCenterCommand(payload: any): void {
		logger.info("🎛️ Control Center received command:", payload);

		switch (payload.command) {
			case "getRuleStats":
				this.publishRuleStats();
				break;
			case "enableRule":
				if (payload.ruleId) {
					this.ruleEngine.enableRule(payload.ruleId);
					this.publishRuleStatus(payload.ruleId, "enabled");
				}
				break;
			case "disableRule":
				if (payload.ruleId) {
					this.ruleEngine.disableRule(payload.ruleId);
					this.publishRuleStatus(payload.ruleId, "disabled");
				}
				break;
			case "getNotifications":
				this.publishNotifications();
				break;
			case "acknowledgeNotification":
				if (payload.notificationId) {
					this.acknowledgeNotification(payload.notificationId);
				}
				break;
			case "sendDeviceCommand":
				if (payload.deviceId && payload.deviceCommand) {
					this.sendDeviceCommand(payload.deviceId, payload.deviceCommand);
				}
				break;
			default:
				logger.info(`Unknown control center command: ${payload.command}`);
		}
	}

	private setupRuleEngineCallbacks(): void {
		this.ruleEngine.onRuleExecution(
			(context: RuleExecutionContext, actions: Action[]) => {
				this.executeRuleActions(context, actions);
			},
		);
	}

	private async executeRuleActions(
		context: RuleExecutionContext,
		actions: Action[],
	): Promise<void> {
		for (const action of actions) {
			try {
				await this.executeAction(action, context);
			} catch (error) {
				logger.error(error, `Error executing action:`);
			}
		}
	}

	private async executeAction(
		action: Action,
		context: RuleExecutionContext,
	): Promise<void> {
		switch (action.type) {
			case "device_command":
				await this.executeDeviceCommand(action, context);
				break;
			case "notification":
				this.createNotification(action, context);
				break;
			case "log":
				this.logMessage(action, context);
				break;
			case "delay":
				if (action.delayMs) {
					await new Promise((resolve) => setTimeout(resolve, action.delayMs));
				}
				break;
			case "webhook":
				await this.executeWebhook(action, context);
				break;
			default:
				logger.info(`Unknown action type: ${action.type}`);
		}
	}

	private async executeDeviceCommand(
		action: Action,
		context: RuleExecutionContext,
	): Promise<void> {
		if (!action.command) return;

		let targetDeviceId = action.deviceId;

		// If no specific device ID, try to find related devices
		if (!targetDeviceId) {
			targetDeviceId = this.findRelatedDevice(context.triggerDevice, action);
		}

		if (targetDeviceId) {
			await this.sendDeviceCommand(targetDeviceId, action.command);
		}
	}

	private findRelatedDevice(
		triggerDevice: DeviceData,
		action: Action,
	): string | undefined {
		// Find devices in the same room as the trigger device
		const allDevices = Array.from(this.ruleEngine.getDevices().entries());
		const roomDevices = allDevices.filter(
			([_, device]) => device.room === triggerDevice.room,
		);

		// For motion sensors, find lights in the same room
		if (triggerDevice.deviceType.includes("motion")) {
			const light = roomDevices.find(([_, device]) =>
				device.deviceType.includes("light"),
			);
			return light ? light[0] : undefined;
		}

		// For door/window sensors, find lights or motion sensors
		if (
			triggerDevice.deviceType.includes("door") ||
			triggerDevice.deviceType.includes("window")
		) {
			const light = roomDevices.find(([_, device]) =>
				device.deviceType.includes("light"),
			);
			return light ? light[0] : undefined;
		}

		return undefined;
	}

	private async sendDeviceCommand(
		deviceId: string,
		command: any,
	): Promise<void> {
		if (!this.client) return;

		const commandTopic = buildTopic(
			topicStructure.home,
			topicStructure.command,
			deviceId,
		);
		const commandMessage = {
			command: command.command || command,
			...command,
			timestamp: new Date().toISOString(),
			source: "control-center",
		};

		// Store command for tracking
		const deviceCommands = this.deviceCommands.get(deviceId) || [];
		deviceCommands.push({ ...commandMessage, sent: new Date() });
		this.deviceCommands.set(deviceId, deviceCommands.slice(-10)); // Keep last 10 commands

		this.client.publish(
			commandTopic,
			JSON.stringify(commandMessage),
			{ qos: 1 },
			(error) => {
				if (error) {
					logger.error(error, `Failed to send command to device ${deviceId}:`);
				} else {
					logger.info(`📤 Sent command to ${deviceId}:`, command);
				}
			},
		);
	}

	private createNotification(
		action: Action,
		context: RuleExecutionContext,
	): void {
		if (!action.message) return;

		this.addNotification({
			message: action.message,
			severity: action.severity || "medium",
			deviceId: context.triggerDevice.deviceId,
			ruleId: context.rule.id,
		});
	}

	private logMessage(action: Action, context: RuleExecutionContext): void {
		const message = action.message || `Rule ${context.rule.name} executed`;
		const logData = {
			timestamp: context.timestamp.toISOString(),
			ruleId: context.rule.id,
			ruleName: context.rule.name,
			triggerDevice: context.triggerDevice.deviceId,
			message,
		};

		if (this.config.enableLogging) {
			logger.info(logData, "📝 Rule Log:");
		}

		// Publish log message to MQTT
		if (this.client) {
			this.client.publish(
				buildTopic(topicStructure.home, "control-center", "log"),
				JSON.stringify(logData),
				{ qos: 0 },
			);
		}
	}

	private async executeWebhook(
		action: Action,
		context: RuleExecutionContext,
	): Promise<void> {
		if (!action.webhookUrl) return;

		const webhookData = {
			rule: context.rule,
			triggerDevice: context.triggerDevice,
			timestamp: context.timestamp.toISOString(),
		};

		try {
			// In a real implementation, you would use fetch or axios here
			logger.info(
				webhookData,
				`🔗 Webhook would be called: ${action.webhookUrl}`,
			);
		} catch (error) {
			logger.error(error, "Webhook execution failed");
		}
	}

	private addNotification(
		notification: Omit<
			NotificationMessage,
			"id" | "timestamp" | "acknowledged"
		>,
	): void {
		const fullNotification: NotificationMessage = {
			id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
			timestamp: new Date(),
			acknowledged: false,
			...notification,
		};

		this.notifications.unshift(fullNotification);

		// Keep only last 100 notifications
		if (this.notifications.length > 100) {
			this.notifications = this.notifications.slice(0, 100);
		}

		logger.info(`🔔 Notification: ${fullNotification.message}`);
		this.emit("notification", fullNotification);

		// Publish notification to MQTT
		if (this.client) {
			this.client.publish(
				buildTopic(topicStructure.home, "control-center", "notification"),
				JSON.stringify(fullNotification),
				{ qos: 1 },
			);
		}
	}

	private acknowledgeNotification(notificationId: string): void {
		const notification = this.notifications.find(
			(n) => n.id === notificationId,
		);
		if (notification) {
			notification.acknowledged = true;
			logger.info(`✅ Acknowledged notification: ${notification.message}`);
		}
	}

	private publishStatus(): void {
		if (!this.client) return;

		const status = {
			online: this.isConnected,
			timestamp: new Date().toISOString(),
			automationEnabled: this.config.enableAutomation,
			ruleStats: this.ruleEngine.getStats(),
			notifications: {
				total: this.notifications.length,
				unacknowledged: this.notifications.filter((n) => !n.acknowledged)
					.length,
			},
		};

		this.client.publish(
			buildTopic(topicStructure.home, "control-center", "status"),
			JSON.stringify(status),
			{ qos: 1, retain: true },
		);
	}

	private publishRuleStats(): void {
		if (!this.client) return;

		const stats = this.ruleEngine.getStats();
		this.client.publish(
			buildTopic(topicStructure.home, "control-center", "rule-stats"),
			JSON.stringify(stats),
			{ qos: 0 },
		);
	}

	private publishRuleStatus(ruleId: string, status: string): void {
		if (!this.client) return;

		const rule = this.ruleEngine.getRule(ruleId);
		const statusMessage = {
			ruleId,
			status,
			rule: rule
				? { id: rule.id, name: rule.name, enabled: rule.enabled }
				: null,
			timestamp: new Date().toISOString(),
		};

		this.client.publish(
			buildTopic(topicStructure.home, "control-center", "rule-status"),
			JSON.stringify(statusMessage),
			{ qos: 1 },
		);
	}

	private publishNotifications(): void {
		if (!this.client) return;

		const recentNotifications = this.notifications.slice(0, 20); // Last 20 notifications
		this.client.publish(
			buildTopic(topicStructure.home, "control-center", "notifications"),
			JSON.stringify({
				notifications: recentNotifications,
				total: this.notifications.length,
				unacknowledged: this.notifications.filter((n) => !n.acknowledged)
					.length,
			}),
			{ qos: 1 },
		);
	}

	// Public API methods
	public getRuleEngine(): RuleEngine {
		return this.ruleEngine;
	}

	public getNotifications(): NotificationMessage[] {
		return [...this.notifications];
	}

	public getUnacknowledgedNotifications(): NotificationMessage[] {
		return this.notifications.filter((n) => !n.acknowledged);
	}

	public getDeviceCommands(deviceId?: string): Map<string, any[]> {
		if (deviceId) {
			const commands = this.deviceCommands.get(deviceId);
			return new Map(commands ? [[deviceId, commands]] : []);
		}
		return new Map(this.deviceCommands);
	}

	public isConnectedToBroker(): boolean {
		return this.isConnected;
	}

	public enableAutomation(): void {
		this.config.enableAutomation = true;
		this.publishStatus();
	}

	public disableAutomation(): void {
		this.config.enableAutomation = false;
		this.publishStatus();
	}

	// Start periodic status updates
	public startStatusUpdates(intervalMs: number = 30000): void {
		setInterval(() => {
			if (this.isConnected) {
				this.publishStatus();
			}
		}, intervalMs);
	}
}
