import pino from "pino";
import type { AppConfiguration } from "../config/app-config.js";

export const createLogger = (
	level: AppConfiguration["automation"]["logLevel"] = "info",
	name?: string,
) => {
	return pino({
		level,
		name,
		transport:
			process.env.NODE_ENV !== "production"
				? {
						target: "pino-pretty",
						options: {
							colorize: true,
							translateTime: "HH:MM:ss",
							ignore: "pid,hostname",
						},
					}
				: undefined,
	});
};

export const logger = createLogger("info", "mqtt-demo");

export const mqttLogger = createLogger("info", "mqtt");
export const deviceLogger = createLogger("info", "device");
export const dashboardLogger = createLogger("info", "dashboard");
export const automationLogger = createLogger("info", "automation");
export const controlLogger = createLogger("info", "control");

export default logger;
