// ============================================================================
// Minimal structured logger. Avoids leaking secrets or full stack traces
// into any surface a client could observe.
// ============================================================================
const REDACT_KEYS = ['password', 'password_hash', 'device_key', 'deviceKey', 'jwt', 'token', 'authorization'];

function redact(meta) {
  if (!meta || typeof meta !== 'object') return meta;
  const clone = { ...meta };
  for (const key of Object.keys(clone)) {
    if (REDACT_KEYS.some((k) => key.toLowerCase().includes(k.toLowerCase()))) {
      clone[key] = '[REDACTED]';
    }
  }
  return clone;
}

function line(level, message, meta) {
  const entry = {
    ts: new Date().toISOString(),
    level,
    message,
    ...(meta ? redact(meta) : {}),
  };
  return JSON.stringify(entry);
}

module.exports = {
  info: (msg, meta) => console.log(line('info', msg, meta)),
  warn: (msg, meta) => console.warn(line('warn', msg, meta)),
  error: (msg, meta) => console.error(line('error', msg, meta)),
  debug: (msg, meta) => {
    if (process.env.NODE_ENV !== 'production') console.debug(line('debug', msg, meta));
  },
};
