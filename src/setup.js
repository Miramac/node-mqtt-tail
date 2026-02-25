import { input, password, confirm, select } from '@inquirer/prompts';
import { writeFile, access } from 'fs/promises';
import { homedir } from 'os';
import { join } from 'path';
import chalk from 'chalk';

const GLOBAL_CONFIG_PATH = join(homedir(), '.mqtttailrc.json');
const LOCAL_ENV_PATH     = join(process.cwd(), '.env');

async function fileExists(path) {
  try { await access(path); return true; }
  catch { return false; }
}

// --- Save helpers ------------------------------------------------------------

async function saveGlobalJson(config) {
  await writeFile(GLOBAL_CONFIG_PATH, JSON.stringify(config, null, 2) + '\n', 'utf-8');
  process.stderr.write(chalk.green('Saved ') + chalk.bold.green(GLOBAL_CONFIG_PATH) + '\n\n');
}

async function saveLocalEnv(config) {
  const lines = [];
  if (config.host && config.host !== 'localhost') lines.push(`MQTT_HOST=${config.host}`);
  if (config.port && config.port !== 1883)        lines.push(`MQTT_PORT=${config.port}`);
  if (config.tls)                                 lines.push(`MQTT_TLS=true`);
  if (config.username)                            lines.push(`MQTT_USERNAME=${config.username}`);
  if (config.password)                            lines.push(`MQTT_PASSWORD=${config.password}`);

  const separator = (await fileExists(LOCAL_ENV_PATH)) ? '\n' : '';
  await writeFile(LOCAL_ENV_PATH, separator + lines.join('\n') + '\n', { flag: 'a' });
  process.stderr.write(chalk.green('Saved ') + chalk.bold.green(LOCAL_ENV_PATH) + '\n\n');
}

// --- Wizard ------------------------------------------------------------------

export async function runSetupIfNeeded(cliOpts) {
  if (await fileExists(GLOBAL_CONFIG_PATH)) return;
  if (await fileExists(LOCAL_ENV_PATH))     return;
  if (cliOpts.username || cliOpts.password) return;

  process.stderr.write(
    '\n' +
    chalk.yellow('No config found.') + ' ' +
    chalk.dim('Set up your broker connection (Ctrl+C to skip).') +
    '\n\n'
  );

  const host     = await input({ message: 'Broker host',  default: 'localhost' });
  const port     = await input({ message: 'Broker port',  default: '1883', validate: v => /^\d+$/.test(v) || 'Must be a number' });
  const tls      = await confirm({ message: 'Use TLS/SSL?', default: false });
  const username = await input({ message: 'Username (blank = none)', default: '' });
  const pwd      = username
    ? await password({ message: 'Password', mask: '*' })
    : '';

  const destination = await select({
    message: 'Where should the config be saved?',
    choices: [
      { name: `Global  ${chalk.dim(GLOBAL_CONFIG_PATH)}`,                                  value: 'global' },
      { name: `Local   ${chalk.dim(LOCAL_ENV_PATH)}  ${chalk.dim('(add to .gitignore!)')}`, value: 'local'  },
    ],
  });

  process.stderr.write('\n');

  const config = {
    host,
    port: parseInt(port, 10),
    ...(tls      ? { tls: true }    : {}),
    ...(username ? { username }      : {}),
    ...(pwd      ? { password: pwd } : {}),
  };

  if (destination === 'global') {
    await saveGlobalJson(config);
  } else {
    await saveLocalEnv(config);
  }
}
