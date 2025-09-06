/**
 * ESM utilities demonstrating modern ES module features
 */
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// Get current file and directory paths in ESM
export const getCurrentFile = (importMetaUrl: string): string => fileURLToPath(importMetaUrl);
export const getCurrentDir = (importMetaUrl: string): string => dirname(fileURLToPath(importMetaUrl));

// Dynamic imports with proper typing
export const dynamicImport = async <T = any>(modulePath: string): Promise<T> => {
  return await import(modulePath);
};

// Top-level await helper for configuration loading
export const loadConfig = async (configPath: string): Promise<Record<string, any>> => {
  try {
    const fullPath = resolve(configPath);
    const config = await import(fullPath);
    return config.default || config;
  } catch (error) {
    console.warn(`Could not load config from ${configPath}:`, error);
    return {};
  }
};

// ESM-compatible module resolution
export const resolveModule = (moduleName: string, fromFile: string): string => {
  return resolve(dirname(fromFile), moduleName);
};

// Utility for checking if running as main module in ESM
export const isMainModule = (importMetaUrl: string): boolean => {
  return importMetaUrl === `file://${process.argv[1]}`;
};

// Modern export patterns
export { fileURLToPath, dirname } from 'node:path';
export { readFileSync, writeFileSync } from 'node:fs';

// Re-export with renaming (ESM feature)
export { 
  EventEmitter as ESMEventEmitter,
  once as eventOnce 
} from 'node:events';

// Default export alongside named exports
const ESMUtils = {
  getCurrentFile,
  getCurrentDir,
  dynamicImport,
  loadConfig,
  resolveModule,
  isMainModule,
};

export default ESMUtils;