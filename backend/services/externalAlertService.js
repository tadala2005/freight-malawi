
'use strict';

const { pool } = require('../config/db');
const logger = require('../utils/logger');

const BREVO_API = 'https://api.brevo.com/v3';
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Prevent repeated email/SMS alerts for the same vehicle
// and incident type within five minutes.
const COOLDOWN_MS = 5 * 60 * 1000;

const lastAccepted = new Map();
const inFlight = new Set();

const isEnabled = (key) =>
  String(process.env[key] || '')
    .trim()
    .toLowerCase() === 'true';

// Send a request to the Brevo API.
async function sendBrevo(path, payload) {
  const apiKey = String(
    process.env.BREVO_API_KEY || ''
  ).trim();

  if (!apiKey) {
    throw new Error('BREVO_API_KEY is not configured');
  }

  const response = await fetch(`${BREVO_API}${path}`, {
    method: 'POST',
    headers: {
      'api-key': apiKey,
      accept: 'application/json',
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    throw new Error(`Brevo HTTP ${response.status}`);
  }
}

/**
 * Deliver CRITICAL alerts to the vehicle owner's
 * registered Freight Malawi account.
 *
 * Email is free within Brevo's daily allowance.
 * SMS is optional and uses prepaid credits.
 */
async function sendCriticalAlert(alert, userId) {
  if (
    !alert ||
    String(alert.severity).toUpperCase() !== 'CRITICAL'
  ) {
    return;
  }

  const emailEnabled = isEnabled('ALERT_EMAIL_ENABLED');
  const smsEnabled = isEnabled('ALERT_SMS_ENABLED');

  if (!emailEnabled && !smsEnabled) return;

  const fingerprint =
    `${userId}:${alert.vehicle_id}:${alert.type}`;

  const lastTime = lastAccepted.get(fingerprint) || 0;

  if (
    inFlight.has(fingerprint) ||
    Date.now() - lastTime < COOLDOWN_MS
  ) {
    logger.info('Repeated external alert suppressed', {
      alertId: alert.id,
    });
    return;
  }

  inFlight.add(fingerprint);

  try {
    // Identify the actual owner of the vehicle.
    const [rows] = await pool.execute(
      'SELECT email FROM users WHERE id = ? LIMIT 1',
      [userId],
    );

    const ownerEmail = String(
      rows[0]?.email || ''
    ).trim().toLowerCase();

    const plate = String(
      alert.license_plate || 'Unknown plate'
    );

    const name = String(
      alert.vehicle_name || 'Vehicle'
    );

    const type = String(
      alert.type || 'CRITICAL_EVENT'
    ).replace(/_/g, ' ');

    const description =
      typeof alert.message === 'string'
        ? alert.message
        : 'A critical fleet incident was detected.';

    const when =
      alert.created_at &&
      !Number.isNaN(new Date(alert.created_at).getTime())
        ? new Date(alert.created_at).toISOString()
        : new Date().toISOString();

    const deliveries = [];

    // =========================================
    // EMAIL NOTIFICATIONS
    // =========================================

    if (emailEnabled) {
      const from = String(
        process.env.ALERT_FROM_EMAIL || ''
      ).trim();

      if (
        !EMAIL_PATTERN.test(from) ||
        !EMAIL_PATTERN.test(ownerEmail)
      ) {
        logger.error(
          'Critical email skipped: verify sender and account email',
          { alertId: alert.id }
        );
      } else {
        deliveries.push(
          sendBrevo('/smtp/email', {
            sender: {
              name: 'Freight Malawi',
              email: from,
            },
            to: [
              { email: ownerEmail }
            ],
            subject:
              `[CRITICAL] ${type} - ${plate}`,
            textContent: [
              'FREIGHT MALAWI | CRITICAL FLEET ALERT',
              '',
              `Vehicle: ${name} (${plate})`,
              `Incident: ${type}`,
              `Time (UTC): ${when}`,
              '',
              description,
              '',
              'Open the Freight Malawi dashboard to investigate.',
            ].join('\n'),
          }).then(() => {
            logger.info(
              'Critical email accepted by Brevo',
              { alertId: alert.id }
            );
          })
        );
      }
    }

    // =========================================
    // SMS NOTIFICATIONS
    // =========================================

    if (smsEnabled) {
      const boundEmail = String(
        process.env.ALERT_SMS_OWNER_EMAIL || ''
      ).trim().toLowerCase();

      const phone = String(
        process.env.ALERT_SMS_TO || ''
      ).trim();

      const sender = String(
        process.env.ALERT_SMS_SENDER || 'FreightMW'
      ).trim();

      // Only send SMS for the configured owner.
      if (
        !boundEmail ||
        ownerEmail !== boundEmail ||
        !/^\+265\d{9}$/.test(phone) ||
        !/^[a-zA-Z0-9]{1,11}$/.test(sender)
      ) {
        logger.error(
          'Critical SMS skipped: check owner, recipient and sender',
          { alertId: alert.id }
        );
      } else {
        const summary =
          `Freight Malawi CRITICAL: ${plate} ` +
          `${type}. ${description}`;

        deliveries.push(
          sendBrevo('/transactionalSMS/send', {
            sender,
            recipient: phone.slice(1),
            content: summary.slice(0, 155),
            type: 'transactional',
          }).then(() => {
            logger.info(
              'Critical SMS accepted by Brevo',
              { alertId: alert.id }
            );
          })
        );
      }
    }

    // Process both channels independently.
    const outcomes = await Promise.allSettled(deliveries);

    let accepted = 0;

    for (const result of outcomes) {
      if (result.status === 'fulfilled') {
        accepted++;
      } else {
        logger.error(
          'External critical notification failed',
          {
            alertId: alert.id,
            message:
              result.reason?.message || 'Provider error',
          }
        );
      }
    }

    if (accepted > 0) {
      lastAccepted.set(fingerprint, Date.now());
    }

  } finally {
    inFlight.delete(fingerprint);
  }
}

module.exports = {
  sendCriticalAlert
};
