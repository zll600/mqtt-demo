# 🏠 MQTT Smart Home Demo

A comprehensive TypeScript/Node.js demonstration of MQTT protocol features through a realistic smart home IoT simulation. This project showcases advanced MQTT concepts including QoS levels, retained messages, last will testament, topic wildcards, and real-time automation.

## 🌟 Features

### 🔧 Complete MQTT Implementation
- **QoS Levels**: Demonstrates QoS 0 (fire-and-forget), QoS 1 (at least once), and QoS 2 (exactly once)
- **Retained Messages**: Device states and configurations persist for new subscribers
- **Last Will Testament**: Automatic offline detection when devices disconnect unexpectedly  
- **Topic Wildcards**: Subscribe to multiple device topics with `+` and `#` wildcards
- **Authentication**: Username/password authentication for secure connections
- **WebSocket Support**: Browser-compatible MQTT over WebSocket

### 🔄 Modern ESM Features
- **Pure ES Modules**: Full ESM support with `"type": "module"` in package.json
- **Top-level await**: Configuration loading and async initialization without IIFE
- **Node.js Protocol Imports**: Using `node:events`, `node:path`, etc. for built-in modules  
- **Dynamic imports**: Runtime module loading with proper typing
- **import.meta.url**: Modern file path resolution replacing `__dirname`
- **Modern tooling**: tsx for development hot-reloading, replacing ts-node-dev
- **Vitest ESM**: Native ESM test runner with excellent TypeScript support

### 🏠 Smart Home Simulation
- **IoT Device Simulators**: Temperature sensors, motion detectors, smart lights, door/window sensors, energy meters
- **Realistic Data**: Simulated environmental patterns, time-of-day variations, and random events
- **Multi-Room Setup**: Devices distributed across different rooms (living room, bedroom, kitchen, etc.)

### 🤖 Intelligent Automation
- **Rule Engine**: Configurable automation rules with conditions and actions
- **Motion-Activated Lighting**: Automatically turn lights on/off based on motion detection
- **Temperature Monitoring**: Alerts and actions based on temperature thresholds
- **Security Automation**: Night-time door/window monitoring with notifications
- **Energy Management**: Smart power consumption monitoring and optimization

### 🌐 Real-Time Web Dashboard
- **Live Device Monitoring**: Real-time visualization of all device data
- **Interactive Controls**: Click-to-control interface for lights and other actuators
- **Room-Based Organization**: Devices grouped by room for easy navigation
- **Energy Charts**: Live power consumption graphs
- **Notification System**: Real-time alerts and system notifications
- **Responsive Design**: Mobile-friendly interface

## 🚀 Quick Start

### Prerequisites
- **Node.js** 18+ and **pnpm**
- **Docker** and **Docker Compose** (for MQTT broker)

### 1. Clone and Install
```bash
git clone <repository-url>
cd mqtt-demo
pnpm install
```

### 2. Start MQTT Broker
```bash
pnpm run start:broker
```

### 3. Run the Complete Demo
```bash
# Start all components with hot reload (recommended for development)
pnpm run dev

# Or run components individually with hot reload:
pnpm run dev:devices     # IoT device simulators
pnpm run dev:control     # Automation control center  
pnpm run dev:dashboard   # Web dashboard

# For production builds:
pnpm run build
pnpm run start:devices     # Built IoT device simulators
pnpm run start:control     # Built automation control center
pnpm run start:dashboard   # Built web dashboard

# Run all components concurrently:
pnpm run demo:full         # Broker + all components
pnpm run demo:components   # Just the three main components
```

### 4. Access the Web Dashboard
Open [http://localhost:3000](http://localhost:3000) to see the live dashboard.

## 📡 MQTT Topics Structure

### Device Data Topics
```
home/{room}/{device-id}/{metric}
```
Examples:
- `home/living-room/temp-sensor-123/temperature`
- `home/bedroom/smart-light-456/state`
- `home/kitchen/motion-detector-789/motion`

### Control Topics
```
home/command/{device-id}          # Send commands to devices
home/status/{device-id}           # Device status and heartbeat
home/control-center/command       # Control center commands
home/control-center/notification  # System notifications
```

### Wildcard Subscriptions
```bash
home/+/+/temperature    # All temperature readings
home/+/+/+              # All device data
home/status/+           # All device status
```

## 🎛️ Device Control Examples

### Smart Light Control
```json
{
  "command": "turnOn"
}

{
  "command": "setBrightness", 
  "brightness": 75
}

{
  "command": "setColor",
  "color": {"r": 255, "g": 100, "b": 50}
}

{
  "command": "preset",
  "preset": "reading"
}
```

### Sensor Commands
```json
{
  "command": "calibrate"
}

{
  "command": "test"
}

{
  "command": "setSensitivity",
  "sensitivity": 0.8
}
```

### Control Center Commands
```json
{
  "command": "getRuleStats"
}

{
  "command": "enableRule",
  "ruleId": "motion-lights-on"
}

{
  "command": "sendDeviceCommand",
  "deviceId": "smart-light-123",
  "deviceCommand": {"command": "turnOn"}
}
```

## 🧪 Testing MQTT with External Clients

### MQTTX Desktop Client
1. Download [MQTTX](https://mqttx.app/)
2. Connect to `mqtt://localhost:1883`
3. Username: `demo_user`, Password: `demo123`
4. Subscribe to `home/+/+/+` to see all data

### Command Line with Mosquitto
```bash
# Subscribe to all device data
mosquitto_sub -h localhost -p 1883 -u demo_user -P demo123 -t "home/+/+/+"

# Send a light command
mosquitto_pub -h localhost -p 1883 -u demo_user -P demo123 \
  -t "home/command/smart-light-bedroom-bedside-lamp" \
  -m '{"command":"turnOn"}'
```

### WebSocket Testing
Connect to `ws://localhost:9001` from browser JavaScript:
```javascript
const client = mqtt.connect('ws://localhost:9001');
client.subscribe('home/+/+/+');
client.on('message', (topic, message) => {
  console.log('Received:', topic, message.toString());
});
```

## 🏗️ Architecture Overview

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   IoT Devices   │    │ Control Center  │    │  Web Dashboard  │
│                 │    │                 │    │                 │
│ • Sensors       │    │ • Rule Engine   │    │ • Real-time UI  │
│ • Actuators     │    │ • Automation    │    │ • Device Control│
│ • Simulators    │    │ • Notifications │    │ • Visualization │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                    ┌─────────────────┐
                    │  MQTT Broker    │
                    │  (Mosquitto)    │
                    │                 │
                    │ • QoS Support   │
                    │ • Retained Msgs │
                    │ • WebSocket     │
                    │ • Authentication│
                    └─────────────────┘
```

## 🔧 Configuration

### MQTT Broker Settings
Edit `docker/mosquitto.conf`:
- Port 1883: Standard MQTT
- Port 9001: WebSocket MQTT
- Authentication: Enabled with password file

### Device Configuration
Modify `src/devices/device-manager.ts` to customize:
- Device types and quantities
- Room assignments  
- Publishing intervals
- Authentication settings

### Automation Rules
Edit `src/control/rule-engine.ts` to add custom rules:
- Conditions (device states, time, sensor values)
- Actions (device commands, notifications, webhooks)
- Priorities and cooldown periods

## 📊 Learning Outcomes

This demo teaches you:

### MQTT Protocol Mastery
- Understanding QoS levels and when to use each
- Topic design best practices and hierarchies
- Retained messages for device state persistence
- Last Will Testament for offline detection
- Efficient wildcard subscriptions

### IoT System Architecture
- Device abstraction and inheritance patterns
- Event-driven communication between components
- Scalable topic structures for large deployments
- Real-time data processing and visualization

### Modern TypeScript/Node.js Development
- **Full ESM Support**: Native ES Modules with import/export
- **Top-level await**: Modern async initialization patterns  
- **Node.js Protocol Imports**: Using `node:` prefix for built-ins
- **Dynamic imports**: Runtime module loading capabilities
- **Modern tooling**: tsx for development, Vitest for testing
- **Event-driven architecture**: With EventEmitter and async patterns
- **WebSocket integration**: Real-time communication with Socket.IO
- **Docker containerization**: Easy deployment and development

### Smart Home Automation
- Rule-based automation systems
- Sensor data processing and alerting
- Device state management
- User interface design for IoT control

## 🧪 Running Tests

```bash
# Run all tests
pnpm test

# Run tests in watch mode  
pnpm run test:watch

# Run with UI
pnpm run test:ui

# Type checking
pnpm run type-check

# Build project
pnpm run build

# Test ESM compatibility
node test-esm.mjs
```

## 📝 Project Structure

```
mqtt-demo/
├── src/
│   ├── devices/           # IoT device simulators
│   │   ├── sensors/       # Temperature, motion, door sensors
│   │   ├── actuators/     # Smart lights, energy meters
│   │   └── device-manager.ts
│   ├── control/           # Automation control center
│   │   ├── rule-engine.ts
│   │   └── control-center.ts
│   ├── dashboard/         # Web dashboard
│   │   ├── server.ts      # Express + Socket.IO server
│   │   └── public/        # Frontend assets
│   ├── config/            # MQTT and app configuration
│   └── index.ts           # Main application entry point
├── docker/                # MQTT broker configuration
├── tests/                 # Test suites
└── package.json
```

## 🎯 Advanced Extensions

Want to extend this demo? Try adding:

- **Cloud Integration**: AWS IoT Core, Azure IoT Hub, or Google Cloud IoT
- **Database Persistence**: Time-series data storage with InfluxDB
- **Mobile App**: React Native client with MQTT.js
- **Security Enhancements**: TLS/SSL certificates and advanced authentication
- **Machine Learning**: Predictive analytics on sensor data
- **Voice Control**: Alexa/Google Assistant integration
- **Grafana Dashboards**: Professional monitoring and alerting

## 🤝 Contributing

This is a learning project! Feel free to:
- Add new device types
- Create additional automation rules  
- Improve the web dashboard UI
- Add more comprehensive testing
- Write documentation and tutorials

## 📄 License

MIT License - Use this project for learning and experimentation!

## References

- MQTT: https://en.wikipedia.org/wiki/MQTT

---

**🎉 Happy Learning!** This demo provides hands-on experience with MQTT while building something practical and visually engaging. Perfect for understanding IoT communication patterns and modern TypeScript development practices.