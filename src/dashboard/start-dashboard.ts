#!/usr/bin/env node

import DashboardServer from './server.js';

async function main() {
  console.log('🌐 Starting MQTT Smart Home Dashboard');
  console.log('====================================');

  const port = process.env.PORT ? parseInt(process.env.PORT) : 3000;
  const dashboardServer = new DashboardServer(port);

  try {
    // Start the web server
    console.log('🚀 Starting web server...');
    await dashboardServer.start();

    // Connect to MQTT broker
    console.log('📡 Connecting to MQTT broker...');
    await dashboardServer.connectToMqtt();

    console.log('\n✅ Dashboard successfully started!');
    console.log('🌟 Features:');
    console.log('   • Real-time device monitoring');
    console.log('   • Interactive device controls');
    console.log('   • Live notifications');
    console.log('   • Energy consumption charts');
    console.log('   • Room-based device organization');
    
    console.log('\n🔗 Access URLs:');
    console.log(`   • Web Dashboard: http://localhost:${port}`);
    console.log(`   • API Health Check: http://localhost:${port}/api/health`);
    console.log(`   • Device List: http://localhost:${port}/api/devices`);
    console.log(`   • Notifications: http://localhost:${port}/api/notifications`);

    console.log('\n📱 Usage:');
    console.log('   • Open the web dashboard in your browser');
    console.log('   • View real-time device data and status');
    console.log('   • Click on devices to control them');
    console.log('   • Monitor notifications and alerts');
    console.log('   • View energy consumption charts');

    console.log('\n⏳ Dashboard running... Press Ctrl+C to stop');

    // Log periodic statistics
    setInterval(() => {
      const connectedClients = dashboardServer.getConnectedClients();
      const deviceCount = dashboardServer.getDeviceCount();
      const timestamp = new Date().toISOString();
      
      console.log(`[${timestamp}] 📊 Dashboard Stats: ${connectedClients} clients, ${deviceCount} devices`);
    }, 60000); // Every minute

  } catch (error) {
    console.error('❌ Failed to start dashboard server:', error);
    process.exit(1);
  }

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n🛑 Shutting down dashboard server...');
    try {
      await dashboardServer.stop();
      console.log('✅ Dashboard server stopped gracefully');
      process.exit(0);
    } catch (error) {
      console.error('❌ Error during shutdown:', error);
      process.exit(1);
    }
  });

  process.on('SIGTERM', async () => {
    console.log('🛑 Received SIGTERM, shutting down...');
    try {
      await dashboardServer.stop();
      console.log('✅ Dashboard server stopped gracefully');
      process.exit(0);
    } catch (error) {
      console.error('❌ Error during shutdown:', error);
      process.exit(1);
    }
  });
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}