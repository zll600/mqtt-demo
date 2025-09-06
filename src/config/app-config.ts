/**
 * Application configuration using modern ESM features
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getCurrentDir } from '../utils/esm-utils.js';

// Get current directory
const __dirname = getCurrentDir(import.meta.url);

// App configuration interface
export interface AppConfiguration {
  mqtt: {
    broker: {
      host: string;
      port: number;
      websocketPort: number;
    };
    auth: {
      username: string;
      password: string;
    };
    qos: {
      default: 0 | 1 | 2;
      critical: 0 | 1 | 2;
      status: 0 | 1 | 2;
    };
  };
  dashboard: {
    port: number;
    updateInterval: number;
  };
  devices: {
    publishInterval: number;
    heartbeatInterval: number;
    simulationSpeed: number;
  };
  automation: {
    enabled: boolean;
    logLevel: 'debug' | 'info' | 'warn' | 'error';
    cooldownMs: number;
  };
}

// Default configuration
const defaultConfig: AppConfiguration = {
  mqtt: {
    broker: {
      host: 'localhost',
      port: 1883,
      websocketPort: 9001,
    },
    auth: {
      username: 'demo_user',
      password: 'demo123',
    },
    qos: {
      default: 0,
      critical: 1,
      status: 1,
    },
  },
  dashboard: {
    port: 3000,
    updateInterval: 5000,
  },
  devices: {
    publishInterval: 5000,
    heartbeatInterval: 30000,
    simulationSpeed: 1.0,
  },
  automation: {
    enabled: true,
    logLevel: 'info',
    cooldownMs: 5000,
  },
};

// Load environment-specific configuration
const loadEnvironmentConfig = async (): Promise<Partial<AppConfiguration>> => {
  const env = process.env.NODE_ENV || 'development';
  const configPath = resolve(__dirname, `../../config/${env}.json`);
  
  try {
    const configData = readFileSync(configPath, 'utf-8');
    return JSON.parse(configData);
  } catch (error) {
    // Config file doesn't exist or is invalid, use defaults
    console.log(`No config file found at ${configPath}, using defaults`);
    return {};
  }
};

// Top-level await to load configuration
const envConfig = await loadEnvironmentConfig();

// Merge configurations with environment variables override
const mergeWithEnvVars = (config: AppConfiguration): AppConfiguration => {
  return {
    ...config,
    mqtt: {
      ...config.mqtt,
      broker: {
        ...config.mqtt.broker,
        host: process.env.MQTT_HOST || config.mqtt.broker.host,
        port: process.env.MQTT_PORT ? parseInt(process.env.MQTT_PORT) : config.mqtt.broker.port,
        websocketPort: process.env.MQTT_WS_PORT ? parseInt(process.env.MQTT_WS_PORT) : config.mqtt.broker.websocketPort,
      },
      auth: {
        ...config.mqtt.auth,
        username: process.env.MQTT_USERNAME || config.mqtt.auth.username,
        password: process.env.MQTT_PASSWORD || config.mqtt.auth.password,
      },
    },
    dashboard: {
      ...config.dashboard,
      port: process.env.DASHBOARD_PORT ? parseInt(process.env.DASHBOARD_PORT) : config.dashboard.port,
    },
    automation: {
      ...config.automation,
      enabled: process.env.AUTOMATION_ENABLED !== 'false',
      logLevel: (process.env.LOG_LEVEL as any) || config.automation.logLevel,
    },
  };
};

// Final configuration with all merges applied
export const appConfig: AppConfiguration = mergeWithEnvVars({
  ...defaultConfig,
  ...envConfig,
});

// Export individual config sections for convenience
export const mqttConfig = appConfig.mqtt;
export const dashboardConfig = appConfig.dashboard;
export const deviceConfig = appConfig.devices;
export const automationConfig = appConfig.automation;

// Configuration validation
const validateConfig = (config: AppConfiguration): void => {
  if (config.mqtt.broker.port < 1 || config.mqtt.broker.port > 65535) {
    throw new Error('Invalid MQTT broker port');
  }
  
  if (config.dashboard.port < 1 || config.dashboard.port > 65535) {
    throw new Error('Invalid dashboard port');
  }
  
  if (config.devices.publishInterval < 100) {
    throw new Error('Publish interval too low (minimum 100ms)');
  }
};

// Validate configuration on import
validateConfig(appConfig);

// Log configuration in development
if (process.env.NODE_ENV !== 'production') {
  console.log('📋 Loaded configuration:', {
    mqtt: {
      broker: `${appConfig.mqtt.broker.host}:${appConfig.mqtt.broker.port}`,
      websocket: `ws://${appConfig.mqtt.broker.host}:${appConfig.mqtt.broker.websocketPort}`,
      user: appConfig.mqtt.auth.username,
    },
    dashboard: `http://localhost:${appConfig.dashboard.port}`,
    automation: appConfig.automation.enabled ? 'enabled' : 'disabled',
  });
}

// Default export
export default appConfig;