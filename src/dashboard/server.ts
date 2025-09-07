import { createServer } from "node:http";
import { join } from "node:path";
import cors from "cors";
import express from "express";
import mqtt from "mqtt";
import { Server as SocketIOServer } from "socket.io";
import {
	buildTopic,
	topicStructure,
	webSocketConfig,
} from "../config/mqtt-config.js";
import logger from "../utils/logger.js";

// Get current directory using ESM utility

interface DashboardData {
	devices: Map<string, any>;
	notifications: any[];
	controlCenterStatus: any;
	ruleStats: any;
}

class DashboardServer {
	private app: express.Application;
	private server: any;
	private io: SocketIOServer;
	private mqttClient: mqtt.MqttClient | null = null;
	private dashboardData: DashboardData;
	private port: number = 3000;

	constructor(port?: number) {
		if (port) this.port = port;

		this.app = express();
		this.server = createServer(this.app);
		this.io = new SocketIOServer(this.server, {
			cors: {
				origin: "*",
				methods: ["GET", "POST"],
			},
		});

		this.dashboardData = {
			devices: new Map(),
			notifications: [],
			controlCenterStatus: null,
			ruleStats: null,
		};

		this.setupExpress();
		this.setupSocketIO();
	}

	private setupExpress(): void {
		this.app.use(cors());
		this.app.use(express.json());
		this.app.use(express.static(join(__dirname, "public")));

		this.app.get("/", (req, res) => {
			res.sendFile(join(__dirname, "public", "index.html"));
		});

		this.app.get("/api/devices", (req, res) => {
			const devices = Array.from(this.dashboardData.devices.entries()).map(
				([id, data]) => ({
					id,
					...data,
				}),
			);
			res.json(devices);
		});

		this.app.get("/api/notifications", (req, res) => {
			res.json(this.dashboardData.notifications.slice(0, 20));
		});

		this.app.get("/api/control-center/status", (req, res) => {
			res.json(this.dashboardData.controlCenterStatus);
		});

		this.app.get("/api/rules/stats", (req, res) => {
			res.json(this.dashboardData.ruleStats);
		});

		this.app.post("/api/devices/:deviceId/command", (req, res) => {
			const { deviceId } = req.params;
			const command = req.body;

			if (this.mqttClient) {
				const commandTopic = buildTopic(
					topicStructure.home,
					topicStructure.command,
					deviceId,
				);
				this.mqttClient.publish(
					commandTopic,
					JSON.stringify({
						...command,
						timestamp: new Date().toISOString(),
						source: "dashboard",
					}),
					{ qos: 1 },
				);

				res.json({ success: true, message: "Command sent" });
			} else {
				res
					.status(500)
					.json({ success: false, message: "MQTT client not connected" });
			}
		});

		this.app.post("/api/control-center/command", (req, res) => {
			const command = req.body;

			if (this.mqttClient) {
				const commandTopic = buildTopic(
					topicStructure.home,
					"control-center",
					"command",
				);
				this.mqttClient.publish(
					commandTopic,
					JSON.stringify({
						...command,
						timestamp: new Date().toISOString(),
						source: "dashboard",
					}),
					{ qos: 1 },
				);

				res.json({ success: true, message: "Command sent to control center" });
			} else {
				res
					.status(500)
					.json({ success: false, message: "MQTT client not connected" });
			}
		});

		this.app.get("/api/health", (req, res) => {
			res.json({
				status: "ok",
				timestamp: new Date().toISOString(),
				mqttConnected: this.mqttClient?.connected || false,
				connectedClients: this.io.sockets.sockets.size,
				deviceCount: this.dashboardData.devices.size,
			});
		});
	}

	private setupSocketIO(): void {
		this.io.on("connection", (socket) => {
			logger.info(`Dashboard client connected: ${socket.id}`);

			// Send initial data to the newly connected client
			socket.emit("initial-data", {
				devices: Array.from(this.dashboardData.devices.entries()).map(
					([id, data]) => ({ id, ...data }),
				),
				notifications: this.dashboardData.notifications.slice(0, 20),
				controlCenterStatus: this.dashboardData.controlCenterStatus,
				ruleStats: this.dashboardData.ruleStats,
			});

			// Handle device command from client
			socket.on("device-command", (data) => {
				const { deviceId, command } = data;
				if (this.mqttClient && deviceId && command) {
					const commandTopic = buildTopic(
						topicStructure.home,
						topicStructure.command,
						deviceId,
					);
					this.mqttClient.publish(
						commandTopic,
						JSON.stringify({
							...command,
							timestamp: new Date().toISOString(),
							source: "dashboard-websocket",
						}),
						{ qos: 1 },
					);
				}
			});

			socket.on("control-center-command", (command) => {
				if (this.mqttClient && command) {
					const commandTopic = buildTopic(
						topicStructure.home,
						"control-center",
						"command",
					);
					this.mqttClient.publish(
						commandTopic,
						JSON.stringify({
							...command,
							timestamp: new Date().toISOString(),
							source: "dashboard-websocket",
						}),
						{ qos: 1 },
					);
				}
			});

			socket.on("disconnect", () => {
				logger.info(`Dashboard client disconnected: ${socket.id}`);
			});
		});
	}

	public async connectToMqtt(): Promise<void> {
		return new Promise((resolve, reject) => {
			try {
				this.mqttClient = mqtt.connect(webSocketConfig.brokerUrl, {
					clientId: "dashboard-server",
					keepalive: webSocketConfig.keepalive,
					clean: webSocketConfig.clean,
					reconnectPeriod: webSocketConfig.reconnectPeriod,
					connectTimeout: webSocketConfig.connectTimeout,
				});

				this.mqttClient.on("connect", () => {
					logger.info("Dashboard connected to MQTT broker");
					this.subscribeToTopics();
					resolve();
				});

				this.mqttClient.on("error", (error) => {
					logger.error(error, "Dashboard MQTT error:");
					reject(error);
				});

				this.mqttClient.on("close", () => {
					logger.info("Dashboard disconnected from MQTT broker");
				});

				this.mqttClient.on("message", (topic, message) => {
					try {
						this.handleMqttMessage(topic, message);
					} catch (error) {
						logger.error(error, "Error handling MQTT message:");
					}
				});
			} catch (error: unknown) {
				reject(error);
			}
		});
	}

	private subscribeToTopics(): void {
		if (!this.mqttClient) return;

		// Subscribe to all device data
		const deviceDataTopic = buildTopic(topicStructure.home, "+", "+", "+");
		this.mqttClient.subscribe(deviceDataTopic, { qos: 0 });

		// Subscribe to device status
		const statusTopic = buildTopic(
			topicStructure.home,
			topicStructure.status,
			"+",
		);
		this.mqttClient.subscribe(statusTopic, { qos: 1 });

		// Subscribe to control center messages
		const controlCenterTopic = buildTopic(
			topicStructure.home,
			"control-center",
			"+",
		);
		this.mqttClient.subscribe(controlCenterTopic, { qos: 1 });

		logger.info("Dashboard subscribed to MQTT topics");
	}

	private handleMqttMessage(topic: string, message: Buffer): void {
		try {
			const payload = JSON.parse(message.toString());
			const topicParts = topic.split("/");

			if (topicParts[0] === topicStructure.home) {
				if (topicParts[1] === topicStructure.status) {
					// Device status
					this.handleDeviceStatus(topicParts[2], payload);
				} else if (topicParts[1] === "control-center") {
					// Control center messages
					this.handleControlCenterMessage(topicParts[2], payload);
				} else if (topicParts.length >= 4) {
					// Device data
					this.handleDeviceData(topicParts, payload);
				}
			}
		} catch (error: unknown) {
			logger.error(error, `Error parsing MQTT message from ${topic}`);
		}
	}

	private handleDeviceStatus(deviceId: string, payload: any): void {
		const existingDevice = this.dashboardData.devices.get(deviceId) || {};
		const deviceData = {
			...existingDevice,
			id: deviceId,
			deviceId,
			deviceType: payload.deviceType || existingDevice.deviceType || "unknown",
			room: payload.room || existingDevice.room || "unknown",
			name: payload.name || existingDevice.name || deviceId,
			online: payload.online !== undefined ? payload.online : true,
			lastSeen: payload.timestamp ? new Date(payload.timestamp) : new Date(),
			status: payload,
		};

		this.dashboardData.devices.set(deviceId, deviceData);

		// Emit to connected clients
		this.io.emit("device-status", deviceData);
	}

	private handleDeviceData(topicParts: string[], payload: any): void {
		const room = topicParts[1];
		const deviceId = topicParts[2];
		const metric = topicParts[3];

		const existingDevice = this.dashboardData.devices.get(deviceId) || {};
		const deviceData = {
			...existingDevice,
			id: deviceId,
			deviceId,
			room,
			name: payload.name || existingDevice.name || deviceId,
			deviceType: payload.deviceType || existingDevice.deviceType || "unknown",
			online: true,
			lastSeen: payload.timestamp ? new Date(payload.timestamp) : new Date(),
			data: {
				...existingDevice.data,
				[metric]: {
					value: payload.value || payload,
					timestamp: payload.timestamp
						? new Date(payload.timestamp)
						: new Date(),
				},
			},
		};

		this.dashboardData.devices.set(deviceId, deviceData);

		// Emit real-time data to connected clients
		this.io.emit("device-data", {
			deviceId,
			metric,
			value: payload.value || payload,
			timestamp: payload.timestamp ? new Date(payload.timestamp) : new Date(),
		});
	}

	private handleControlCenterMessage(messageType: string, payload: any): void {
		switch (messageType) {
			case "status":
				this.dashboardData.controlCenterStatus = payload;
				this.io.emit("control-center-status", payload);
				break;
			case "notification":
				this.dashboardData.notifications.unshift(payload);
				if (this.dashboardData.notifications.length > 100) {
					this.dashboardData.notifications =
						this.dashboardData.notifications.slice(0, 100);
				}
				this.io.emit("notification", payload);
				break;
			case "rule-stats":
				this.dashboardData.ruleStats = payload;
				this.io.emit("rule-stats", payload);
				break;
			case "log":
				this.io.emit("control-center-log", payload);
				break;
			default:
				// Forward other control center messages
				this.io.emit("control-center-message", {
					type: messageType,
					data: payload,
				});
		}
	}

	public start(): Promise<void> {
		return new Promise((resolve) => {
			this.server.listen(this.port, () => {
				logger.info(
					`Dashboard server running on http://localhost:${this.port}`,
				);
				resolve();
			});
		});
	}

	public async stop(): Promise<void> {
		return new Promise((resolve) => {
			if (this.mqttClient) {
				this.mqttClient.end();
			}

			this.server.close(() => {
				logger.info("Dashboard server stopped");
				resolve();
			});
		});
	}

	public getConnectedClients(): number {
		return this.io.sockets.sockets.size;
	}

	public getDeviceCount(): number {
		return this.dashboardData.devices.size;
	}
}

export default DashboardServer;
