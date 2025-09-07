import logger from "../utils/logger.js";
import DashboardServer from "./server.js";

async function main() {
	logger.info("🌐 Starting MQTT Smart Home Dashboard");
	logger.info("====================================");

	const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
	const dashboardServer = new DashboardServer(port);

	try {
		// Start the web server
		logger.info("🚀 Starting web server...");
		await dashboardServer.start();

		// Connect to MQTT broker
		logger.info("📡 Connecting to MQTT broker...");
		await dashboardServer.connectToMqtt();

		logger.info("\n✅ Dashboard successfully started!");
		logger.info("🌟 Features:");
		logger.info("   • Real-time device monitoring");
		logger.info("   • Interactive device controls");
		logger.info("   • Live notifications");
		logger.info("   • Energy consumption charts");
		logger.info("   • Room-based device organization");

		logger.info("\n🔗 Access URLs:");
		logger.info(`   • Web Dashboard: http://localhost:${port}`);
		logger.info(`   • API Health Check: http://localhost:${port}/api/health`);
		logger.info(`   • Device List: http://localhost:${port}/api/devices`);
		logger.info(
			`   • Notifications: http://localhost:${port}/api/notifications`,
		);

		logger.info("\n📱 Usage:");
		logger.info("   • Open the web dashboard in your browser");
		logger.info("   • View real-time device data and status");
		logger.info("   • Click on devices to control them");
		logger.info("   • Monitor notifications and alerts");
		logger.info("   • View energy consumption charts");

		logger.info("\n⏳ Dashboard running... Press Ctrl+C to stop");

		// Log periodic statistics
		setInterval(() => {
			const connectedClients = dashboardServer.getConnectedClients();
			const deviceCount = dashboardServer.getDeviceCount();
			const timestamp = new Date().toISOString();

			logger.info(
				`[${timestamp}] 📊 Dashboard Stats: ${connectedClients} clients, ${deviceCount} devices`,
			);
		}, 60000); // Every minute
	} catch (error) {
		logger.error(error, "Failed to start dashboard server:");
		process.exitCode = 1;
	}

	process.on("SIGINT", async () => {
		logger.info("\nShutting down dashboard server...");
		try {
			await dashboardServer.stop();
			logger.info("Dashboard server stopped gracefully");
			process.exitCode = 0;
		} catch (error) {
			logger.error(error, "Error during shutdown:");
			process.exitCode = 1;
		}
	});

	process.on("SIGTERM", async () => {
		logger.info("🛑 Received SIGTERM, shutting down...");
		try {
			await dashboardServer.stop();
			logger.info("✅ Dashboard server stopped gracefully");
			process.exitCode = 0;
		} catch (error) {
			logger.error(error, "❌ Error during shutdown:");
			process.exitCode = 1;
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
	logger.error(error, "Uncaught Exception:");
	process.exitCode = 1;
});

if (import.meta.url === `file://${process.argv[1]}`) {
	main();
}
