import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import logger from "./logger.js";

export const getCurrentDir = (importMetaUrl: string): string =>
	dirname(fileURLToPath(importMetaUrl));

export const loadConfig = async (
	configPath: string,
): Promise<Record<string, any>> => {
	try {
		const fullPath = resolve(configPath);
		const config = await import(fullPath);
		return config.default || config;
	} catch (error) {
		logger.warn(error, `Could not load config from ${configPath}:`);
		return {};
	}
};

export const isMainModule = (importMetaUrl: string): boolean => {
	return importMetaUrl === `file://${process.argv[1]}`;
};

export {
	EventEmitter as ESMEventEmitter,
	once as eventOnce,
} from "node:events";
export { readFileSync, writeFileSync } from "node:fs";
export { dirname } from "node:path";

const ESMUtils = {
	getCurrentDir,
	loadConfig,
	isMainModule,
};

export default ESMUtils;
