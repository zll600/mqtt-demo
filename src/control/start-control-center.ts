import logger from "../utils/logger.js";
import { ControlCenter } from "./control-center.js";

async function main() {
	logger.info("Starting MQTT Smart Home Control Center");
	logger.info("=========================================");

	const controlCenter = new ControlCenter({
		enableAutomation: true,
		enableLogging: true,
		logLevel: "info",
	});

	controlCenter.on("connected", () => {
		logger.info("Control Center successfully connected and ready");
		logger.info("Automation rules are active");

		controlCenter.startStatusUpdates(30000); // Every 30 seconds
	});

	controlCenter.on("disconnected", () => {
		logger.info("Control Center disconnected from broker");
	});

	controlCenter.on("error", (error) => {
		logger.error(error, "Control Center error:");
	});

	controlCenter.on("notification", (notification) => {
		const severityIcons = {
			low: "💡",
			medium: "⚠️",
			high: "🚨",
		} as const;
		const severityIcon =
			severityIcons[notification.severity as keyof typeof severityIcons] || "ℹ️";

		logger.info(
			`${severityIcon} ${notification.message} [${notification.severity.toUpperCase()}]`,
		);
	});

	controlCenter.on("deviceData", (_deviceData) => {
		// Uncomment for detailed device data logging
		// logger.info(`📊 Device data: ${deviceData.deviceId} -> ${JSON.stringify(deviceData.value)}`);
	});

	try {
		logger.info("Connecting to MQTT broker...");
		await controlCenter.connect();

		// Display rule engine statistics
		const ruleStats = controlCenter.getRuleEngine().getStats();
		logger.info("\nAutomation Rules Status:");
		logger.info(`   Total rules: ${ruleStats.totalRules}`);
		logger.info(`   Enabled rules: ${ruleStats.enabledRules}`);
		logger.info(`   Disabled rules: ${ruleStats.disabledRules}`);

		if (ruleStats.enabledRules > 0) {
			logger.info("\nActive Automation Rules:");
			controlCenter
				.getRuleEngine()
				.getAllRules()
				.filter((rule) => rule.enabled)
				.forEach((rule) => {
					logger.info(`   • ${rule.name}: ${rule.description}`);
				});
		}

		logger.info("\nControl Center is running!");
		logger.info("Features:");
		logger.info("   • Automated device control based on rules");
		logger.info("   • Real-time monitoring and notifications");
		logger.info("   • Smart home automation (lights, security, energy)");
		logger.info("   • Rule-based decision making");

		logger.info("\nMQTT Topics:");
		logger.info(
			'   • Subscribe to "home/control-center/+" to see all control center messages',
		);
		logger.info('   • Send commands to "home/control-center/command"');
		logger.info(
			'   • View notifications at "home/control-center/notification"',
		);

		logger.info("\nExample Commands:");
		logger.info('   • Get rule stats: {"command": "getRuleStats"}');
		logger.info(
			'   • Enable rule: {"command": "enableRule", "ruleId": "motion-lights-on"}',
		);
		logger.info(
			'   • Send device command: {"command": "sendDeviceCommand", "deviceId": "device-id", "deviceCommand": {"command": "turnOn"}}',
		);

		logger.info("\nRunning... Press Ctrl+C to stop");

		setInterval(() => {
			const stats = controlCenter.getRuleEngine().getStats();
			const notifications = controlCenter.getUnacknowledgedNotifications();
			const timestamp = new Date().toISOString();

			logger.info(
				`[${timestamp}] Stats: ${stats.onlineDevices}/${stats.totalDevices} devices, ${notifications.length} unack. notifications`,
			);

			if (stats.recentExecutions.length > 0) {
				logger.info(
					`   Recent rule executions: ${stats.recentExecutions.length} in last period`,
				);
			}
		}, 60000); // Every minute
	} catch (error: unknown) {
		logger.error(error, "Failed to start Control Center:");
		process.exitCode = 1;
	}

	// Graceful shutdown
	process.on("SIGINT", async () => {
		logger.info("\nShutting down Control Center...");
		try {
			await controlCenter.disconnect();
			logger.info("Control Center stopped gracefully");
			process.exitCode = 0;
		} catch (error) {
			logger.error(error, "Error during shutdown:");
			process.exitCode = 1;
		}
	});

	process.on("SIGTERM", async () => {
		logger.info("Received SIGTERM, shutting down...");
		try {
			await controlCenter.disconnect();
			logger.info("Control Center stopped gracefully");
			process.exitCode = 0;
		} catch (error) {
			logger.error(error, "Error during shutdown:");
			process.exitCode = 1;;
		}
	});
}

// Handle unhandled promise rejections
process.on("unhandledRejection", (reason, _promise) => {
	logger.error(reason, "Unhandled Rejection");
	process.exitCode = 1;
});

// Handle uncaught exceptions
process.on("uncaughtException", (error) => {
	logger.error(error, "Uncaught Exception");
	process.exitCode = 1;
});

if (import.meta.url === `file://${process.argv[1]}`) {
	main();
}
