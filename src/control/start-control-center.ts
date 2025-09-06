#!/usr/bin/env node

import { ControlCenter } from './control-center.js';

async function main() {
  console.log('🏢 Starting MQTT Smart Home Control Center');
  console.log('=========================================');
  
  const controlCenter = new ControlCenter({
    enableAutomation: true,
    enableLogging: true,
    logLevel: 'info',
  });

  // Set up event listeners
  controlCenter.on('connected', () => {
    console.log('✅ Control Center successfully connected and ready');
    console.log('🤖 Automation rules are active');
    
    // Start periodic status updates
    controlCenter.startStatusUpdates(30000); // Every 30 seconds
  });

  controlCenter.on('disconnected', () => {
    console.log('❌ Control Center disconnected from broker');
  });

  controlCenter.on('error', (error) => {
    console.error('❌ Control Center error:', error.message);
  });

  controlCenter.on('notification', (notification) => {
    const severityIcon = {
      low: '💡',
      medium: '⚠️',
      high: '🚨',
    }[notification.severity];
    
    console.log(`${severityIcon} ${notification.message} [${notification.severity.toUpperCase()}]`);
  });

  controlCenter.on('deviceData', (deviceData) => {
    // Uncomment for detailed device data logging
    // console.log(`📊 Device data: ${deviceData.deviceId} -> ${JSON.stringify(deviceData.value)}`);
  });

  try {
    // Connect to MQTT broker
    console.log('🔌 Connecting to MQTT broker...');
    await controlCenter.connect();

    // Display rule engine statistics
    const ruleStats = controlCenter.getRuleEngine().getStats();
    console.log('\n📋 Automation Rules Status:');
    console.log(`   Total rules: ${ruleStats.totalRules}`);
    console.log(`   Enabled rules: ${ruleStats.enabledRules}`);
    console.log(`   Disabled rules: ${ruleStats.disabledRules}`);
    
    if (ruleStats.enabledRules > 0) {
      console.log('\n🎯 Active Automation Rules:');
      controlCenter.getRuleEngine().getAllRules()
        .filter(rule => rule.enabled)
        .forEach(rule => {
          console.log(`   • ${rule.name}: ${rule.description}`);
        });
    }

    console.log('\n🚀 Control Center is running!');
    console.log('💡 Features:');
    console.log('   • Automated device control based on rules');
    console.log('   • Real-time monitoring and notifications');
    console.log('   • Smart home automation (lights, security, energy)');
    console.log('   • Rule-based decision making');
    
    console.log('\n📡 MQTT Topics:');
    console.log('   • Subscribe to "home/control-center/+" to see all control center messages');
    console.log('   • Send commands to "home/control-center/command"');
    console.log('   • View notifications at "home/control-center/notification"');
    
    console.log('\n📝 Example Commands:');
    console.log('   • Get rule stats: {"command": "getRuleStats"}');
    console.log('   • Enable rule: {"command": "enableRule", "ruleId": "motion-lights-on"}');
    console.log('   • Send device command: {"command": "sendDeviceCommand", "deviceId": "device-id", "deviceCommand": {"command": "turnOn"}}');
    
    console.log('\n⏳ Running... Press Ctrl+C to stop');

    // Log periodic statistics
    setInterval(() => {
      const stats = controlCenter.getRuleEngine().getStats();
      const notifications = controlCenter.getUnacknowledgedNotifications();
      const timestamp = new Date().toISOString();
      
      console.log(`[${timestamp}] 📊 Stats: ${stats.onlineDevices}/${stats.totalDevices} devices, ${notifications.length} unack. notifications`);
      
      if (stats.recentExecutions.length > 0) {
        console.log(`   Recent rule executions: ${stats.recentExecutions.length} in last period`);
      }
    }, 60000); // Every minute

  } catch (error) {
    console.error('❌ Failed to start Control Center:', error);
    process.exit(1);
  }

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n🛑 Shutting down Control Center...');
    try {
      await controlCenter.disconnect();
      console.log('✅ Control Center stopped gracefully');
      process.exit(0);
    } catch (error) {
      console.error('❌ Error during shutdown:', error);
      process.exit(1);
    }
  });

  process.on('SIGTERM', async () => {
    console.log('🛑 Received SIGTERM, shutting down...');
    try {
      await controlCenter.disconnect();
      console.log('✅ Control Center stopped gracefully');
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