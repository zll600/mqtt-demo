#!/usr/bin/env node

import { DeviceManager, createSmartHomeDevices } from './devices/device-manager.js';
import { ControlCenter } from './control/control-center.js';
import DashboardServer from './dashboard/server.js';
import { isMainModule } from './utils/esm-utils.js';

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
    console.log('🏠 Starting MQTT Smart Home Demo');
    console.log('================================');
    console.log('🚀 This demo showcases a complete MQTT-based IoT system with:');
    console.log('   • Multiple device simulators (sensors & actuators)');
    console.log('   • Intelligent control center with automation rules');
    console.log('   • Real-time web dashboard');
    console.log('   • Advanced MQTT features (QoS, retained messages, LWT)');
    console.log();

    try {
      // Start components in order
      if (this.config.startDevices) {
        await this.startDeviceSimulators();
      }

      if (this.config.startControlCenter) {
        await this.startControlCenter();
      }

      if (this.config.startDashboard) {
        await this.startDashboard();
      }

      console.log('\n🎉 MQTT Smart Home Demo is fully operational!');
      this.printUsageInstructions();

    } catch (error) {
      console.error('❌ Failed to start MQTT Smart Home Demo:', error);
      throw error;
    }
  }

  private async startDeviceSimulators(): Promise<void> {
    console.log('📱 Starting IoT Device Simulators...');
    
    this.deviceManager = new DeviceManager();
    const deviceConfigs = createSmartHomeDevices();
    
    console.log(`   Creating ${deviceConfigs.length} smart home devices...`);
    const deviceIds = await this.deviceManager.createMultipleDevices(deviceConfigs);
    
    await this.deviceManager.startAllDevices();
    
    const status = this.deviceManager.getDeviceStatus();
    console.log(`   ✅ Started ${status.onlineDevices}/${status.totalDevices} devices across ${Object.keys(status.devicesByRoom).length} rooms`);
  }

  private async startControlCenter(): Promise<void> {
    console.log('🤖 Starting Control Center with Automation Rules...');
    
    this.controlCenter = new ControlCenter({
      enableAutomation: true,
      enableLogging: true,
      logLevel: 'info',
    });

    await this.controlCenter.connect();
    this.controlCenter.startStatusUpdates(30000);

    const ruleStats = this.controlCenter.getRuleEngine().getStats();
    console.log(`   ✅ Control Center active with ${ruleStats.enabledRules} automation rules`);
  }

  private async startDashboard(): Promise<void> {
    console.log('🌐 Starting Web Dashboard...');
    
    this.dashboardServer = new DashboardServer(this.config.dashboardPort);
    
    await this.dashboardServer.start();
    await this.dashboardServer.connectToMqtt();
    
    console.log(`   ✅ Web dashboard available at http://localhost:${this.config.dashboardPort}`);
  }

  private printUsageInstructions(): void {
    console.log('\n📖 How to Use This Demo:');
    console.log('========================');
    
    if (this.config.startDashboard) {
      console.log(`🌐 Open Web Dashboard: http://localhost:${this.config.dashboardPort}`);
      console.log('   • View real-time device data');
      console.log('   • Control lights, monitor sensors');
      console.log('   • See automation rules in action');
      console.log('   • Watch energy consumption charts');
    }

    console.log('\n📡 MQTT Client Testing:');
    console.log('   • Broker: mqtt://localhost:1883');
    console.log('   • WebSocket: ws://localhost:9001');
    console.log('   • Username: demo_user, Password: demo123');
    
    console.log('\n🔍 Key MQTT Topics to Subscribe To:');
    console.log('   • home/+/+/+                    - All device data');
    console.log('   • home/status/+                 - Device status');
    console.log('   • home/control-center/+         - Control center messages');
    console.log('   • home/+/+/temperature          - Temperature readings');
    console.log('   • home/+/+/motion               - Motion detection');
    console.log('   • home/+/+/state                - Device states');

    console.log('\n🎛️ Send Commands To:');
    console.log('   • home/command/{device-id}      - Device commands');
    console.log('   • home/control-center/command   - Control center commands');

    console.log('\n💡 Example Commands:');
    console.log('   • Turn on light: {"command": "turnOn"}');
    console.log('   • Set brightness: {"command": "setBrightness", "brightness": 75}');
    console.log('   • Light preset: {"command": "preset", "preset": "reading"}');
    console.log('   • Test motion: {"command": "test"}');
    console.log('   • Get rule stats: {"command": "getRuleStats"} (to control-center)');

    console.log('\n🤖 Automation Features:');
    console.log('   • Motion-activated lighting');
    console.log('   • Temperature alerts');
    console.log('   • Night security monitoring');
    console.log('   • Energy-saving automation');
    console.log('   • Welcome home sequences');

    console.log('\n⚡ MQTT Features Demonstrated:');
    console.log('   • QoS Levels (0, 1, 2)');
    console.log('   • Retained Messages');
    console.log('   • Last Will Testament');
    console.log('   • Topic Wildcards');
    console.log('   • Authentication');
    console.log('   • WebSocket Support');

    console.log('\n⏳ The demo is now running... Press Ctrl+C to stop all components');
  }

  public async stop(): Promise<void> {
    console.log('\n🛑 Stopping MQTT Smart Home Demo...');

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
    console.log('✅ All components stopped gracefully');
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
  // Parse command line arguments
  const args = process.argv.slice(2);
  const config: Partial<AppConfig> = {};

  // Simple argument parsing
  args.forEach(arg => {
    if (arg === '--no-devices') config.startDevices = false;
    if (arg === '--no-control-center') config.startControlCenter = false;
    if (arg === '--no-dashboard') config.startDashboard = false;
    if (arg.startsWith('--port=')) config.dashboardPort = parseInt(arg.split('=')[1]);
  });

  const app = new MQTTSmartHomeApp(config);

  // Graceful shutdown handlers
  process.on('SIGINT', async () => {
    console.log('\nReceived SIGINT (Ctrl+C), shutting down gracefully...');
    try {
      await app.stop();
      process.exit(0);
    } catch (error) {
      console.error('Error during shutdown:', error);
      process.exit(1);
    }
  });

  process.on('SIGTERM', async () => {
    console.log('Received SIGTERM, shutting down gracefully...');
    try {
      await app.stop();
      process.exit(0);
    } catch (error) {
      console.error('Error during shutdown:', error);
      process.exit(1);
    }
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    app.stop().then(() => process.exit(1));
  });

  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    app.stop().then(() => process.exit(1));
  });

  try {
    await app.start();
  } catch (error) {
    console.error('Failed to start application:', error);
    process.exit(1);
  }
}

// Export for testing
export { MQTTSmartHomeApp };

// Run if this is the main module (using ESM utility)
if (isMainModule(import.meta.url)) {
  main();
}