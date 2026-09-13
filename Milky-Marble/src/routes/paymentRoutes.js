// src/routes/paymentRoutes.js
const express = require('express');
const router = express.Router();
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const paymongo = require('../services/paymongoService');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
const supabase = (supabaseUrl && supabaseKey) ? createClient(supabaseUrl, supabaseKey) : null;

const APP_BASE_URL = (process.env.APP_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');

// ==========================================
// POST /api/payments/paymongo/create-checkout
// Body: { order_id }
// Creates a QRPh checkout session for an existing PENDING_PAYMENT order
// ==========================================
router.post('/create-checkout', async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ status: 'error', message: 'Database is disconnected.' });
    }

    const { order_id } = req.body;
    if (!order_id) {
      return res.status(400).json({ status: 'error', message: 'order_id is required.' });
    }

    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .select(`
        id, order_number, status, total_amount, customer_id,
        order_items (item_label, quantity, unit_price)
      `)
      .eq('id', order_id)
      .single();

    if (orderErr || !order) {
      return res.status(404).json({ status: 'error', message: 'Order not found.' });
    }

    if (order.status === 'PAID_VERIFIED') {
      return res.status(400).json({ status: 'error', message: 'This order has already been paid.' });
    }

    // Look up the customer's name/email for the QRPh checkout page
    let customerName = 'Milky Marble Customer';
    let customerEmail = undefined;
    const { data: customer } = await supabase
      .from('customers')
      .select('user_id, email, users(full_name, email)')
      .eq('id', order.customer_id)
      .single();

    if (customer) {
      customerName = customer.users?.full_name || customerName;
      customerEmail = customer.users?.email || customer.email || undefined;
    }

    const lineItems = (order.order_items || []).map(it => ({
      name: it.item_label,
      unit_price: it.unit_price,
      quantity: it.quantity
    }));

    const successUrl = `${APP_BASE_URL}/customer/cart.html?payment=success&order_id=${order.id}`;
    const cancelUrl = `${APP_BASE_URL}/customer/cart.html?payment=cancelled&order_id=${order.id}`;

    const session = await paymongo.createQrphCheckoutSession({
      orderId: order.id,
      orderNumber: order.order_number,
      amountPesos: order.total_amount,
      description: `Milky Marble Order ${order.order_number}`,
      lineItems,
      customerName,
      customerEmail,
      successUrl,
      cancelUrl
    });

    await supabase
      .from('orders')
      .update({
        payment_reference: session.id,
        payment_method: 'PayMongo QRPh'
      })
      .eq('id', order.id);

    return res.json({
      status: 'success',
      checkout_url: session.checkoutUrl,
      checkout_session_id: session.id
    });
  } catch (err) {
    console.error('PayMongo checkout creation error:', err.message);
    return res.status(500).json({ status: 'error', message: err.message || 'Failed to create QRPh checkout session.' });
  }
});

// ==========================================
// GET /api/payments/paymongo/status/:order_id
// Used by the frontend to poll/confirm payment status after redirect back from PayMongo
// ==========================================
router.get('/status/:order_id', async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ status: 'error', message: 'Database is disconnected.' });
    }

    const { order_id } = req.params;
    const { data: order, error } = await supabase
      .from('orders')
      .select(`
        id, order_number, status, subtotal, discount_amount, total_amount,
        pickup_instructions, placed_at, payment_reference,
        order_items (item_label, quantity, unit_price, line_total)
      `)
      .eq('id', order_id)
      .single();

    if (error || !order) {
      return res.status(404).json({ status: 'error', message: 'Order not found.' });
    }

    // Safety net: if the webhook hasn't landed yet, actively check PayMongo directly.
    if (order.status !== 'PAID_VERIFIED' && order.payment_reference) {
      try {
        const session = await paymongo.retrieveCheckoutSession(order.payment_reference);
        const paid = session.attributes.payments?.some(p => p.attributes.status === 'paid')
          || session.attributes.status === 'paid';

        if (paid) {
          await supabase
            .from('orders')
            .update({ status: 'PAID_VERIFIED', paid_at: new Date().toISOString() })
            .eq('id', order.id);
          order.status = 'PAID_VERIFIED';
        }
      } catch (checkErr) {
        console.warn('Could not verify checkout session live status:', checkErr.message);
      }
    }

    return res.json({
      status: 'success',
      order_status: order.status,
      order: order
    });
  } catch (err) {
    console.error('Payment status check error:', err.message);
    return res.status(500).json({ status: 'error', message: 'Failed to check payment status.' });
  }
});

// ==========================================
// Webhook handler (mounted separately in server.js with express.raw())
// Listens for: checkout_session.payment.paid
// ==========================================
async function webhookHandler(req, res) {
  try {
    const signatureHeader = req.headers['paymongo-signature'];
    const webhookSecret = process.env.PAYMONGO_WEBHOOK_SECRET;
    const rawBody = req.body instanceof Buffer ? req.body.toString('utf8') : req.body;

    if (webhookSecret) {
      const isValid = paymongo.verifyWebhookSignature(rawBody, signatureHeader, webhookSecret);
      if (!isValid) {
        console.warn('[PayMongo Webhook] Invalid signature — rejecting.');
        return res.status(400).json({ status: 'error', message: 'Invalid webhook signature.' });
      }
    } else {
      console.warn('[PayMongo Webhook] PAYMONGO_WEBHOOK_SECRET not set — skipping signature verification. Set this before going live.');
    }

    const event = JSON.parse(rawBody);
    const eventType = event?.data?.attributes?.type;
    const eventData = event?.data?.attributes?.data;

    console.log(`[PayMongo Webhook] Received event: ${eventType}`);

    if (eventType === 'checkout_session.payment.paid') {
      const orderId = eventData?.attributes?.metadata?.order_id
        || eventData?.attributes?.checkout_session?.metadata?.order_id;

      if (!orderId) {
        console.warn('[PayMongo Webhook] No order_id in metadata; cannot update order.');
        return res.status(200).json({ received: true });
      }

      if (supabase) {
        const { error } = await supabase
          .from('orders')
          .update({ status: 'PAID_VERIFIED', paid_at: new Date().toISOString() })
          .eq('id', orderId);

        if (error) {
          console.error('[PayMongo Webhook] Failed to update order status:', error.message);
        } else {
          console.log(`[PayMongo Webhook] Order ${orderId} marked as PAID_VERIFIED.`);
        }
      }
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error('[PayMongo Webhook] Handler error:', err.message);
    return res.status(400).json({ status: 'error', message: 'Webhook processing failed.' });
  }
}

module.exports = { router, webhookHandler };
