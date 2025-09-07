import { ControlCenter } from "./control/control-center.js";
import DashboardServer from "./dashboard/server.js";
import {
	createSmartHomeDevices,
	DeviceManager,
} from "./devices/device-manager.js";
import logger from "./utils/logger.js";

interface AppConfig {
	startDevices: boolean;
	startControlCenter: boolean;
	startDashboard: boolean;
	dashboardPort: number;
}

class MQTTSmartHomeApp {
	private deviceManager: DeviceManager | null = null;
	private controlCenter: ControlCenter | null = null;
	private dashboardServer: DashboardServer | null = null;
	private config: AppConfig;

	constructor(config?: Partial<AppConfig>) {
		this.config = {
			startDevices: true,
			startControlCenter: true,
			startDashboard: true,
			dashboardPort: 3000,
			...config,
		};
	}

	public async start(): Promise<void> {
		logger.info("Starting MQTT Smart Home Demo");
		logger.info("================================");
		logger.info("This demo showcases a complete MQTT-based IoT system with:");
		logger.info("   • Multiple device simulators (sensors & actuators)");
		logger.info("   • Intelligent control center with automation rules");
		logger.info("   • Real-time web dashboard");
		logger.info("   • Advanced MQTT features (QoS, retained messages, LWT)");
		logger.info("");

		try {
			if (this.config.startDevices) {
				await this.startDeviceSimulators();
			}

			if (this.config.startControlCenter) {
				await this.startControlCenter();
			}

			if (this.config.startDashboard) {
				await this.startDashboard();
			}

			logger.info("MQTT Smart Home Demo is fully operational!");
			this.printUsageInstructions();
		} catch (error: unknown) {
			logger.error(error, "Failed to start MQTT Smart Home Demo:");
			throw error;
		}
	}

	private async startDeviceSimulators(): Promise<void> {
		logger.info("Starting IoT Device Simulators...");

		this.deviceManager = new DeviceManager();
		const deviceConfigs = createSmartHomeDevices();

		logger.info(`   Creating ${deviceConfigs.length} smart home devices...`);
		const deviceIds =
			await this.deviceManager.createMultipleDevices(deviceConfigs);

		await this.deviceManager.startAllDevices();

		const status = this.deviceManager.getDeviceStatus();
		logger.info(
			`   Started ${status.onlineDevices}/${status.totalDevices} devices across ${Object.keys(status.devicesByRoom).length} rooms`,
		);
	}

	private async startControlCenter(): Promise<void> {
		logger.info("Starting Control Center with Automation Rules...");

		this.controlCenter = new ControlCenter({
			enableAutomation: true,
			enableLogging: true,
			logLevel: "info",
		});

		await this.controlCenter.connect();
		this.controlCenter.startStatusUpdates(30000);

		const ruleStats = this.controlCenter.getRuleEngine().getStats();
		logger.info(
			`   Control Center active with ${ruleStats.enabledRules} automation rules`,
		);
	}

	private async startDashboard(): Promise<void> {
		logger.info("Starting Web Dashboard...");

		this.dashboardServer = new DashboardServer(this.config.dashboardPort);

		await this.dashboardServer.start();
		await this.dashboardServer.connectToMqtt();

		logger.info(
			`   Web dashboard available at http://localhost:${this.config.dashboardPort}`,
		);
	}

	private printUsageInstructions(): void {
		logger.info("\nHow to Use This Demo:");
		logger.info("========================");

		if (this.config.startDashboard) {
			logger.info(
				`Open Web Dashboard: http://localhost:${this.config.dashboardPort}`,
			);
			logger.info("   • View real-time device data");
			logger.info("   • Control lights, monitor sensors");
			logger.info("   • See automation rules in action");
			logger.info("   • Watch energy consumption charts");
		}

		logger.info("\nMQTT Client Testing:");
		logger.info("   • Broker: mqtt://localhost:11883");
		logger.info("   • WebSocket: ws://localhost:19001");
		logger.info("   • Username: demo_user, Password: demo123");

		logger.info("\nKey MQTT Topics to Subscribe To:");
		logger.info("   • home/+/+/+                    - All device data");
		logger.info("   • home/status/+                 - Device status");
		logger.info("   • home/control-center/+         - Control center messages");
		logger.info("   • home/+/+/temperature          - Temperature readings");
		logger.info("   • home/+/+/motion               - Motion detection");
		logger.info("   • home/+/+/state                - Device states");

		logger.info("\nSend Commands To:");
		logger.info("   • home/command/{device-id}      - Device commands");
		logger.info("   • home/control-center/command   - Control center commands");

		logger.info("\nExample Commands:");
		logger.info('   • Turn on light: {"command": "turnOn"}');
		logger.info(
			'   • Set brightness: {"command": "setBrightness", "brightness": 75}',
		);
		logger.info(
			'   • Light preset: {"command": "preset", "preset": "reading"}',
		);
		logger.info('   • Test motion: {"command": "test"}');
		logger.info(
			'   • Get rule stats: {"command": "getRuleStats"} (to control-center)',
		);

		logger.info("\nAutomation Features:");
		logger.info("   • Motion-activated lighting");
		logger.info("   • Temperature alerts");
		logger.info("   • Night security monitoring");
		logger.info("   • Energy-saving automation");
		logger.info("   • Welcome home sequences");

		logger.info("\n⚡ MQTT Features Demonstrated:");
		logger.info("   • QoS Levels (0, 1, 2)");
		logger.info("   • Retained Messages");
		logger.info("   • Last Will Testament");
		logger.info("   • Topic Wildcards");
		logger.info("   • Authentication");
		logger.info("   • WebSocket Support");

		logger.info(
			"\n⏳ The demo is now running... Press Ctrl+C to stop all components",
		);
	}

	public async stop(): Promise<void> {
		logger.info("\nStopping MQTT Smart Home Demo...");

		const stopPromises: Promise<void>[] = [];

		if (this.deviceManager) {
			stopPromises.push(this.deviceManager.stopAllDevices());
		}

		if (this.controlCenter) {
			stopPromises.push(this.controlCenter.disconnect());
		}

		if (this.dashboardServer) {
			stopPromises.push(this.dashboardServer.stop());
		}

		await Promise.all(stopPromises);
		logger.info("All components stopped gracefully");
	}

	public getStatus(): {
		devices?: any;
		controlCenter?: boolean;
		dashboard?: boolean;
	} {
		return {
			devices: this.deviceManager?.getDeviceStatus(),
			controlCenter: this.controlCenter?.isConnectedToBroker(),
			dashboard: this.dashboardServer ? true : false,
		};
	}
}

async function main() {
	const args = process.argv.slice(2);
	const config: Partial<AppConfig> = {};

	args.forEach((arg) => {
		if (arg === "--no-devices") config.startDevices = false;
		if (arg === "--no-control-center") config.startControlCenter = false;
		if (arg === "--no-dashboard") config.startDashboard = false;
		if (arg.startsWith("--port="))
			config.dashboardPort = parseInt(arg.split("=")[1]);
	});

	const app = new MQTTSmartHomeApp(config);

	process.on("SIGINT", async () => {
		logger.info("\nReceived SIGINT (Ctrl+C), shutting down gracefully...");
		try {
			await app.stop();
			process.exitCode = 0;
		} catch (error) {
			logger.error(error, "Error during shutdown:");
			process.exitCode = 1;
		}
	});

	process.on("SIGTERM", async () => {
		logger.info("Received SIGTERM, shutting down gracefully...");
		try {
			await app.stop();
			process.exitCode = 0;
		} catch (error) {
			logger.error(error, "Error during shutdown:");
			process.exitCode = 1;
		}
	});

	process.on("unhandledRejection", (reason, promise) => {
		logger.error(reason, "Unhandled Rejection");
		app.stop().then(() => process.exitCode = 1);
	});

	process.on("uncaughtException", (error) => {
		logger.error(error, "Uncaught Exception");
		app.stop().then(() => process.exitCode = 1);
	});

	try {
		await app.start();
	} catch (error) {
		logger.error(error, "Failed to start application:");
		process.exitCode = 1;
	}
}

export { MQTTSmartHomeApp };

await main();
