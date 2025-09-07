import logger from "../utils/logger.js";
import { createSmartHomeDevices, DeviceManager } from "./device-manager.js";

async function main() {
	logger.info("🏠 Starting MQTT Smart Home Device Simulator");
	logger.info("==========================================");

	const deviceManager = new DeviceManager();

	try {
		// Create all smart home devices
		const deviceConfigs = createSmartHomeDevices();
		logger.info(`📋 Creating ${deviceConfigs.length} devices...`);

		const deviceIds = await deviceManager.createMultipleDevices(deviceConfigs);
		logger.info(`✅ Successfully created ${deviceIds.length} devices`);

		// Start all devices
		await deviceManager.startAllDevices();

		// Print status
		const status = deviceManager.getDeviceStatus();
		logger.info("\n📊 Device Status:");
		logger.info(`   Total devices: ${status.totalDevices}`);
		logger.info(`   Online devices: ${status.onlineDevices}`);
		logger.info(`   Offline devices: ${status.offlineDevices}`);

		logger.info("\n🏠 Devices by room:");
		Object.entries(status.devicesByRoom).forEach(([room, count]) => {
			logger.info(`   ${room}: ${count} devices`);
		});

		logger.info("\n🔧 Device types:");
		Object.entries(status.devicesByType).forEach(([type, count]) => {
			logger.info(`   ${type}: ${count} devices`);
		});

		logger.info(
			"\n🚀 All devices are running! Publishing data to MQTT broker...",
		);
		logger.info("💡 Tips:");
		logger.info("   - Use MQTTX or another MQTT client to subscribe to topics");
		logger.info('   - Subscribe to "home/+/+/+" to see all device data');
		logger.info('   - Subscribe to "home/status/+" to see device status');
		logger.info('   - Subscribe to "home/command/+" to send commands');
		logger.info("   - Press Ctrl+C to stop all devices gracefully");

		// Keep the process alive
		logger.info("\n⏳ Running... Press Ctrl+C to stop");

		// Print periodic status updates
		setInterval(() => {
			const currentStatus = deviceManager.getDeviceStatus();
			const timestamp = new Date().toISOString();
			logger.info(
				`[${timestamp}] 📈 Status: ${currentStatus.onlineDevices}/${currentStatus.totalDevices} devices online`,
			);
		}, 60000); // Every minute
	} catch (error) {
		logger.error(error, "Failed to start devices:");
		process.exit(1);
	}
}

// Handle unhandled promise rejections
process.on("unhandledRejection", (reason, _promise) => {
	logger.error(reason, "Unhandled Rejection");
	process.exit(1);
});

// Handle uncaught exceptions
process.on("uncaughtException", (error) => {
	logger.error(error, "Uncaught Exception:");
	process.exit(1);
});

if (import.meta.url === `file://${process.argv[1]}`) {
	main();
}
