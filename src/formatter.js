import chalk from 'chalk'

// --- Topic colors -------------------------------------------------------------

const TOPIC_COLORS = [
  chalk.cyan,
  chalk.green,
  chalk.yellow,
  chalk.magenta,
  chalk.blue,
  chalk.red,
  chalk.cyanBright,
  chalk.greenBright,
  chalk.yellowBright,
  chalk.magentaBright,
]

function hashTopic(topic) {
  let hash = 0
  for (let i = 0; i < topic.length; i++) {
    hash = (Math.imul(31, hash) + topic.charCodeAt(i)) | 0
  }
  return Math.abs(hash) % TOPIC_COLORS.length
}

function topicColor(topic) {
  return TOPIC_COLORS[hashTopic(topic)]
}

export function colorTopic(topic) {
  return topicColor(topic)(topic)
}

// --- Timestamp ----------------------------------------------------------------

export function formatTimestamp(format) {
  const now = new Date()
  switch (format) {
    case 'iso':
      return now.toISOString()
    case 'unix':
      return String(Math.floor(now.getTime() / 1000))
    case 'unixms':
      return String(now.getTime())
    default: // 'local'
      return now.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
        fractionalSecondDigits: 3,
      })
  }
}

// --- JSON syntax highlighting ------------------------------------------------

/**
 * Tokenizes a JSON string and applies chalk colors:
 *  - object keys : blue
 *  - strings     : green
 *  - numbers     : yellow
 *  - booleans    : cyan
 *  - null        : gray
 *  - punctuation : dim white
 */
export function colorizeJson(src) {
  const out = []
  let i = 0

  while (i < src.length) {
    const ch = src[i]

    // Whitespace - pass through
    if (/\s/.test(ch)) {
      out.push(ch)
      i++
      continue
    }

    // String
    if (ch === '"') {
      let j = i + 1
      while (j < src.length) {
        if (src[j] === '\\') { j += 2; continue }
        if (src[j] === '"') { j++; break }
        j++
      }
      const token = src.slice(i, j)
      // Peek ahead past whitespace to see if a colon follows - it's a key
      let k = j
      while (k < src.length && /\s/.test(src[k])) k++
      out.push(src[k] === ':' ? chalk.blue(token) : chalk.green(token))
      i = j
      continue
    }

    // Number
    const numMatch = src.slice(i).match(/^-?\d+(\.\d+)?([eE][+-]?\d+)?/)
    if (numMatch) {
      out.push(chalk.yellow(numMatch[0]))
      i += numMatch[0].length
      continue
    }

    // Keywords
    if (src.startsWith('true', i))  { out.push(chalk.cyan('true'));  i += 4; continue }
    if (src.startsWith('false', i)) { out.push(chalk.cyan('false')); i += 5; continue }
    if (src.startsWith('null', i))  { out.push(chalk.gray('null'));  i += 4; continue }

    // Structural punctuation
    if ('{}[],:'.includes(ch)) {
      out.push(chalk.dim(ch))
      i++
      continue
    }

    out.push(ch)
    i++
  }

  return out.join('')
}

// --- Payload formatting -------------------------------------------------------

function formatPayload(payload, opts) {
  const str = payload.toString()

  if (opts.raw) return str

  try {
    const obj = JSON.parse(str)
    if (opts.compact || opts.outputJson) return JSON.stringify(obj)
    return colorizeJson(JSON.stringify(obj, null, 2))
  } catch {
    return str
  }
}

/**
 * Prefixes every line of str with the given left-border string.
 */
function addLeftBorder(str, border) {
  return str
    .split('\n')
    .map(line => border + line)
    .join('\n')
}

// --- Full message formatting --------------------------------------------------

/**
 * Returns the formatted string to print for a single MQTT message.
 * @param {string} topic
 * @param {Buffer} payload
 * @param {object} packet - raw mqtt.js packet (.qos, .retain)
 * @param {object} opts   - merged CLI options
 */
export function formatMessage(topic, payload, packet, opts) {
  // JSON-lines output for piping
  if (opts.outputJson) {
    let payloadParsed
    try { payloadParsed = JSON.parse(payload.toString()) }
    catch { payloadParsed = payload.toString() }

    return JSON.stringify({
      timestamp: new Date().toISOString(),
      topic,
      payload: payloadParsed,
      qos: packet.qos,
      retain: packet.retain,
      size: payload.length,
    })
  }

  const color = topicColor(topic)

  // Header: ▶ TOPIC  timestamp  (meta)
  const header = [
    color('▶') + ' ' + chalk.bold(color(topic)),
    opts.timestamp !== false ? chalk.dim(formatTimestamp(opts.timestampFormat || 'local')) : null,
    opts.verbose ? chalk.dim(buildMeta(packet, payload)) : null,
  ].filter(Boolean).join('  ')

  if (opts.compact) {
    return `${header}  ${formatPayload(payload, opts)}`
  }

  // Body: each line prefixed with a colored border
  const body = addLeftBorder(formatPayload(payload, opts), color('│') + ' ')

  return `${header}\n${body}`
}

function buildMeta(packet, payload) {
  const parts = [`qos:${packet.qos}`]
  if (packet.retain) parts.push(chalk.yellow('retained'))
  parts.push(`${payload.length}B`)
  return `(${parts.join(' ')})`
}
