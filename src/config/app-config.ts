import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { logger } from "../utils/logger.js";

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
		logLevel: "debug" | "info" | "warn" | "error";
		cooldownMs: number;
	};
}

const defaultConfig: AppConfiguration = {
	mqtt: {
		broker: {
			host: "localhost",
			port: 11883,
			websocketPort: 19001,
		},
		auth: {
			username: "demo_user",
			password: "demo123",
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
		logLevel: "info",
		cooldownMs: 5000,
	},
};

const loadEnvironmentConfig = async (): Promise<Partial<AppConfiguration>> => {
	const env = process.env.NODE_ENV || "development";
	const configPath = resolve(__dirname, `../../config/${env}.json`);

	try {
		const configData = await readFile(configPath, "utf-8");
		return JSON.parse(configData);
	} catch (error) {
		logger.info(
			`No config file found at ${configPath} with error ${error}, using defaults`,
		);
		return {};
	}
};

const envConfig = await loadEnvironmentConfig();

const mergeWithEnvVars = (config: AppConfiguration): AppConfiguration => {
	return {
		...config,
		mqtt: {
			...config.mqtt,
			broker: {
				...config.mqtt.broker,
				host: process.env.MQTT_HOST || config.mqtt.broker.host,
				port: process.env.MQTT_PORT
					? parseInt(process.env.MQTT_PORT, 10)
					: config.mqtt.broker.port,
				websocketPort: process.env.MQTT_WS_PORT
					? parseInt(process.env.MQTT_WS_PORT, 10)
					: config.mqtt.broker.websocketPort,
			},
			auth: {
				...config.mqtt.auth,
				username: process.env.MQTT_USERNAME || config.mqtt.auth.username,
				password: process.env.MQTT_PASSWORD || config.mqtt.auth.password,
			},
		},
		dashboard: {
			...config.dashboard,
			port: process.env.DASHBOARD_PORT
				? parseInt(process.env.DASHBOARD_PORT, 10)
				: config.dashboard.port,
		},
		automation: {
			...config.automation,
			enabled: process.env.AUTOMATION_ENABLED !== "false",
			logLevel:
				(process.env.LOG_LEVEL as AppConfiguration["automation"]["logLevel"]) ||
				config.automation.logLevel,
		},
	};
};

export const appConfig: AppConfiguration = mergeWithEnvVars({
	...defaultConfig,
	...envConfig,
});

export const mqttConfig = appConfig.mqtt;
export const dashboardConfig = appConfig.dashboard;
export const deviceConfig = appConfig.devices;
export const automationConfig = appConfig.automation;

const validateConfig = (config: AppConfiguration): void => {
	if (config.mqtt.broker.port < 1 || config.mqtt.broker.port > 65535) {
		throw new Error("Invalid MQTT broker port");
	}

	if (config.dashboard.port < 1 || config.dashboard.port > 65535) {
		throw new Error("Invalid dashboard port");
	}

	if (config.devices.publishInterval < 100) {
		throw new Error("Publish interval too low (minimum 100ms)");
	}
};

validateConfig(appConfig);

if (process.env.NODE_ENV !== "production") {
	logger.info(
		{
			mqtt: {
				broker: `${appConfig.mqtt.broker.host}:${appConfig.mqtt.broker.port}`,
				websocket: `ws://${appConfig.mqtt.broker.host}:${appConfig.mqtt.broker.websocketPort}`,
				user: appConfig.mqtt.auth.username,
			},
			dashboard: `http://localhost:${appConfig.dashboard.port}`,
			automation: appConfig.automation.enabled ? "enabled" : "disabled",
		},
		"Loaded configuration",
	);
}

export default appConfig;
