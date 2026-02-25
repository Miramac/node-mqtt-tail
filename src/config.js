import { readFile } from 'fs/promises';
import { homedir } from 'os';
import { join } from 'path';

/** Maps environment variable names to option keys. */
const ENV_MAP = {
  MQTT_HOST: 'host',
  MQTT_PORT: 'port',
  MQTT_USERNAME: 'username',
  MQTT_PASSWORD: 'password',
  MQTT_TLS: 'tls',
  MQTT_CLIENT_ID: 'clientId',
  MQTT_CA: 'ca',
  MQTT_CERT: 'cert',
  MQTT_KEY: 'key',
};

async function readConfigFile(filePath) {
  const candidates = filePath
    ? [filePath]
    : [
        join(homedir(), '.mqtttailrc.json'),
        join(homedir(), '.mqtttailrc'),
        join(process.cwd(), '.mqtttailrc.json'),
      ];

  for (const candidate of candidates) {
    try {
      const content = await readFile(candidate, 'utf-8');
      return JSON.parse(content);
    } catch {
      // Try next candidate
    }
  }
  return {};
}

/**
 * Parses a .env file into a key/value map.
 * Supports quoted values and # comments. Does NOT mutate process.env.
 */
async function readDotEnv() {
  try {
    const content = await readFile(join(process.cwd(), '.env'), 'utf-8');
    const vars = {};
    for (const raw of content.split('\n')) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      let val = line.slice(eq + 1).trim();
      // Strip surrounding single or double quotes
      if (/^["']/.test(val) && val.endsWith(val[0])) val = val.slice(1, -1);
      vars[key] = val;
    }
    return vars;
  } catch {
    return {};
  }
}

/**
 * Resolves env vars with priority: process.env > .env file.
 */
function readEnvVars(dotEnv) {
  const config = {};
  for (const [envKey, configKey] of Object.entries(ENV_MAP)) {
    // Real env vars win over .env file values
    const val = process.env[envKey] ?? dotEnv[envKey];
    if (val !== undefined) config[configKey] = val;
  }
  if (config.port !== undefined) config.port = parseInt(config.port, 10);
  if (config.tls !== undefined) config.tls = config.tls === 'true' || config.tls === '1';
  return config;
}

/**
 * Loads configuration.
 *
 * Priority (highest to lowest):
 *   CLI flags  >  process.env  >  .env file  >  ~/.mqtttailrc.json
 *
 * CLI flags are merged later in index.js.
 */
export async function loadConfig(configFile) {
  const [fileConfig, dotEnv] = await Promise.all([
    readConfigFile(configFile),
    readDotEnv(),
  ]);
  const envConfig = readEnvVars(dotEnv);
  return { ...fileConfig, ...envConfig };
}
