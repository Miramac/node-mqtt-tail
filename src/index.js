#!/usr/bin/env node
import { createRequire } from 'module';
import { program } from 'commander';
import { loadConfig } from './config.js';
import { connect } from './subscriber.js';
import { runSetupIfNeeded } from './setup.js';

const require = createRequire(import.meta.url);
const pkg = require('../package.json');

program
  .name('mqtt-tail')
  .description(
    'Monitor MQTT topics like tail -f.\n\n' +
    'Topics support MQTT wildcards: + (single level), # (multi level).\n' +
    'Defaults to "#" (all topics) when none are specified.'
  )
  .version(pkg.version, '-V, --version')
  .argument('[topics...]', 'MQTT topics to subscribe to')

  // ── Connection ─────────────────────────────────────────────────
  .option('-H, --host <host>',        'Broker host',                     'localhost')
  .option('-p, --port <port>',        'Broker port',                     '1883')
  .option('-u, --username <user>',    'Username')
  .option('-P, --password <pass>',    'Password')
  .option('--tls',                    'Use TLS/SSL (mqtts://)')
  .option('--ca <file>',              'CA certificate file')
  .option('--cert <file>',            'Client certificate file')
  .option('--key <file>',             'Client key file')
  .option('--client-id <id>',         'MQTT client ID (default: random)')

  // ── Filtering ──────────────────────────────────────────────────
  .option('-n, --count <n>',          'Exit after n messages',           parseInt)
  .option('-f, --filter <regex>',     'Filter by topic regex')
  .option('--payload-filter <regex>', 'Filter by payload regex')
  .option('--no-retained',            'Ignore retained messages')
  .option('-q, --qos <level>',        'QoS level for subscriptions (0|1|2)', '0')

  // ── Output format ──────────────────────────────────────────────
  .option('--raw',                    'Print raw payload, no formatting')
  .option('--compact',                'One message per line (no newlines in payload)')
  .option('--output-json',            'Output newline-delimited JSON (for piping to jq)')
  .option('--no-timestamp',           'Hide timestamps')
  .option('--timestamp-format <fmt>', 'Timestamp format: local|iso|unix|unixms', 'local')
  .option('--no-color',               'Disable colored output')

  // ── Misc ───────────────────────────────────────────────────────
  .option('-v, --verbose',            'Show connection info and per-message metadata')
  .option('--config <file>',          'Config file path (default: ~/.mqtttailrc.json)')

  .addHelpText('after', `
Examples:
  $ mqtt-tail                                    Subscribe to all topics on localhost
  $ mqtt-tail sensors/#                          Subscribe to all sensor topics
  $ mqtt-tail "sensors/+" "control/#"            Multiple topics
  $ mqtt-tail -H mqtt.example.com -p 8883 --tls  Remote TLS broker
  $ mqtt-tail -u alice -P secret "#"             Authenticated connection
  $ mqtt-tail -f temperature "#"                 Filter topics by regex
  $ mqtt-tail -n 20 "#"                          Exit after 20 messages
  $ mqtt-tail --compact "#"                      One-line output per message
  $ mqtt-tail --output-json "#" | jq .payload    JSON-lines output, piped to jq
  $ mqtt-tail --no-retained --verbose "#"        Skip retained, show metadata

Config file (~/.mqtttailrc.json):
  { "host": "mqtt.example.com", "username": "alice", "password": "secret" }

Environment variables:
  MQTT_HOST, MQTT_PORT, MQTT_USERNAME, MQTT_PASSWORD, MQTT_TLS, MQTT_CLIENT_ID
`);

program.parse();

const cliOpts = program.opts();
const topics  = program.args.length > 0 ? program.args : ['#'];

await runSetupIfNeeded(cliOpts);

// Load base config (file + env), then overlay only explicitly passed CLI flags.
// We must skip commander's default values, otherwise --host localhost would
// always overwrite MQTT_HOST from .env / config file.
const baseConfig = await loadConfig(cliOpts.config);
const merged = { ...baseConfig };

for (const [key, value] of Object.entries(cliOpts)) {
  if (value !== undefined && program.getOptionValueSource(key) !== 'default') {
    merged[key] = value;
  }
}

await connect(topics, merged);
