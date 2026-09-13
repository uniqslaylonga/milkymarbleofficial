// src/services/paymongoService.js
// Thin wrapper around the PayMongo REST API (https://developers.paymongo.com).
// Uses Node's built-in fetch (Node 18+) — no extra dependency required.

require('dotenv').config();
const crypto = require('crypto');

const PAYMONGO_API_BASE = 'https://api.paymongo.com/v1';
const SECRET_KEY = process.env.PAYMONGO_SECRET_KEY || '';

function authHeader() {
  if (!SECRET_KEY) {
    throw new Error('PAYMONGO_SECRET_KEY is not set in .env');
  }
  const token = Buffer.from(`${SECRET_KEY}:`).toString('base64');
  return `Basic ${token}`;
}

async function paymongoFetch(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${PAYMONGO_API_BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: authHeader()
    },
    body: body ? JSON.stringify(body) : undefined
  });

  const json = await res.json().catch(() => ({}));

  if (!res.ok) {
    const message = json?.errors?.[0]?.detail || `PayMongo API error (${res.status})`;
    const err = new Error(message);
    err.status = res.status;
    err.details = json;
    throw err;
  }

  return json;
}

/**
 * Creates a PayMongo Checkout Session restricted to QRPh only.
 * Amount must be passed in PESOS (converted to centavos internally).
 */
async function createQrphCheckoutSession({
  orderId,
  orderNumber,
  amountPesos,
  description,
  lineItems,
  customerName,
  customerEmail,
  successUrl,
  cancelUrl
}) {
  const amountCentavos = Math.round(Number(amountPesos) * 100);

  if (!amountCentavos || amountCentavos < 100) {
    throw new Error('Order total must be at least ₱1.00 to pay via QRPh.');
  }

  const items = (lineItems && lineItems.length > 0)
    ? lineItems.map(it => ({
        name: (it.name || 'Milky Marble Cup').slice(0, 255),
        amount: Math.round((it.unit_price || 0) * 100),
        currency: 'PHP',
        quantity: it.quantity || 1
      }))
    : [{
        name: description || `Order ${orderNumber}`,
        amount: amountCentavos,
        currency: 'PHP',
        quantity: 1
      }];

  const payload = {
    data: {
      attributes: {
        send_email_receipt: true,
        show_description: true,
        show_line_items: true,
        description: description || `Milky Marble Order ${orderNumber}`,
        line_items: items,
        payment_method_types: ['qrph'],
        success_url: successUrl,
        cancel_url: cancelUrl,
        billing: {
          name: customerName || undefined,
          email: customerEmail || undefined
        },
        metadata: {
          order_id: String(orderId),
          order_number: orderNumber || ''
        }
      }
    }
  };

  const json = await paymongoFetch('/checkout_sessions', { method: 'POST', body: payload });
  const session = json.data;

  return {
    id: session.id,
    checkoutUrl: session.attributes.checkout_url,
    status: session.attributes.status,
    raw: session
  };
}

async function retrieveCheckoutSession(sessionId) {
  const json = await paymongoFetch(`/checkout_sessions/${sessionId}`);
  return json.data;
}

/**
 * Verifies a PayMongo webhook signature.
 * Header format: "t=<timestamp>,te=<test_signature>,li=<live_signature>"
 * Signed payload: `${timestamp}.${rawBody}`
 */
function verifyWebhookSignature(rawBody, signatureHeader, webhookSecret) {
  if (!signatureHeader || !webhookSecret) return false;

  const parts = Object.fromEntries(
    signatureHeader.split(',').map(p => {
      const [k, v] = p.split('=');
      return [k, v];
    })
  );

  const timestamp = parts.t;
  const candidateSignature = parts.li || parts.te;
  if (!timestamp || !candidateSignature) return false;

  const signedPayload = `${timestamp}.${rawBody}`;
  const expected = crypto
    .createHmac('sha256', webhookSecret)
    .update(signedPayload)
    .digest('hex');

  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(candidateSignature));
  } catch {
    return false;
  }
}

module.exports = {
  createQrphCheckoutSession,
  retrieveCheckoutSession,
  verifyWebhookSignature
};
