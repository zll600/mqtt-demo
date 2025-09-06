#!/usr/bin/env node

import { DeviceManager, createSmartHomeDevices } from './device-manager.js';

async function main() {
  console.log('🏠 Starting MQTT Smart Home Device Simulator');
  console.log('==========================================');
  
  const deviceManager = new DeviceManager();
  
  try {
    // Create all smart home devices
    const deviceConfigs = createSmartHomeDevices();
    console.log(`📋 Creating ${deviceConfigs.length} devices...`);
    
    const deviceIds = await deviceManager.createMultipleDevices(deviceConfigs);
    console.log(`✅ Successfully created ${deviceIds.length} devices`);
    
    // Start all devices
    await deviceManager.startAllDevices();
    
    // Print status
    const status = deviceManager.getDeviceStatus();
    console.log('\n📊 Device Status:');
    console.log(`   Total devices: ${status.totalDevices}`);
    console.log(`   Online devices: ${status.onlineDevices}`);
    console.log(`   Offline devices: ${status.offlineDevices}`);
    
    console.log('\n🏠 Devices by room:');
    Object.entries(status.devicesByRoom).forEach(([room, count]) => {
      console.log(`   ${room}: ${count} devices`);
    });
    
    console.log('\n🔧 Device types:');
    Object.entries(status.devicesByType).forEach(([type, count]) => {
      console.log(`   ${type}: ${count} devices`);
    });
    
    console.log('\n🚀 All devices are running! Publishing data to MQTT broker...');
    console.log('💡 Tips:');
    console.log('   - Use MQTTX or another MQTT client to subscribe to topics');
    console.log('   - Subscribe to "home/+/+/+" to see all device data');
    console.log('   - Subscribe to "home/status/+" to see device status');
    console.log('   - Subscribe to "home/command/+" to send commands');
    console.log('   - Press Ctrl+C to stop all devices gracefully');
    
    // Keep the process alive
    console.log('\n⏳ Running... Press Ctrl+C to stop');
    
    // Print periodic status updates
    setInterval(() => {
      const currentStatus = deviceManager.getDeviceStatus();
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] 📈 Status: ${currentStatus.onlineDevices}/${currentStatus.totalDevices} devices online`);
    }, 60000); // Every minute
    
  } catch (error) {
    console.error('❌ Failed to start devices:', error);
    process.exit(1);
  }
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