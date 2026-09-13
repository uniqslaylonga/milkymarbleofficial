// src/routes/orderRoutes.js
const express = require('express');
const router = express.Router();
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
const supabase = (supabaseUrl && supabaseKey) ? createClient(supabaseUrl, supabaseKey) : null;

function getCustomerId(req) {
  return req.headers['x-customer-id'] || req.query.customer_id || (req.body && req.body.customer_id) || 11;
}

// POST /api/orders
router.post('/', async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({
        status: 'error',
        message: 'Database is disconnected. Please check your Supabase configuration.'
      });
    }

    const {
      customer_id,
      items,
      subtotal,
      discount_amount,
      points_used,
      payment_method,
      pickup_date,
      pickup_instructions,
      order_type
    } = req.body;

    const targetCustomerId = customer_id || getCustomerId(req);
    const orderSubtotal = parseFloat(subtotal || 0);
    const promoDiscount = parseFloat(discount_amount || 0);
    const requestedPointsUsed = parseFloat(points_used || 0);

    const VALID_PAYMENT_METHODS = ['Cash on Pick-Up', 'E-Wallet'];
    if (!payment_method || !VALID_PAYMENT_METHODS.includes(payment_method)) {
      return res.status(400).json({
        status: 'error',
        message: 'Please select a valid payment method (Cash on Pick-Up or E-Wallet).'
      });
    }

    const { data: customer, error: custErr } = await supabase
      .from('customers')
      .select('id, loyalty_points')
      .eq('id', targetCustomerId)
      .single();

    if (custErr || !customer) {
      return res.status(404).json({
        status: 'error',
        message: `Customer ID ${targetCustomerId} not found in database.`
      });
    }

    const currentPoints = parseFloat(customer.loyalty_points || 0);
    const actualPointsDiscount = Math.min(currentPoints, requestedPointsUsed, orderSubtotal);
    const finalTotalAmount = Math.max(0, orderSubtotal - promoDiscount - actualPointsDiscount);
    const pointsEarned = Number((Math.floor(finalTotalAmount / 10) * 0.1).toFixed(2));
    const newPointsBalance = Number(Math.max(0, currentPoints - actualPointsDiscount + pointsEarned).toFixed(2));

    const orderNumber = `MM-${Date.now().toString().slice(-6)}`;
    const scheduleText = pickup_instructions || (pickup_date ? `Pick-up: ${pickup_date}` : 'Pick-up: N/A');

    // 1. Tiyaking pumasa sa orders_order_type_check: 'preset' o 'custom_build'
    const isCustomOrder = order_type === 'custom_build' || (Array.isArray(items) && items.some(i => i.is_custom));
    const validOrderType = isCustomOrder ? 'custom_build' : 'preset';

    // 2. Tiyaking pumasa sa orders_status_check: 'PENDING_PAYMENT' o 'PAID_VERIFIED'
    // NOTE: Orders always start PENDING_PAYMENT now. For "E-Wallet" orders, status
    // only flips to PAID_VERIFIED once PayMongo confirms the QRPh payment (via
    // webhook, see src/routes/paymentRoutes.js) — we no longer auto-mark orders
    // as paid at creation time, since no actual payment had happened yet.
    const validStatus = 'PENDING_PAYMENT';

    const orderPayload = {
      customer_id: targetCustomerId,
      order_number: orderNumber,
      order_type: validOrderType,
      status: validStatus,
      subtotal: orderSubtotal,
      discount_amount: Number((promoDiscount + actualPointsDiscount).toFixed(2)),
      total_amount: finalTotalAmount,
      pickup_instructions: `${scheduleText} | Payment: ${payment_method || 'Cash on Pick-Up'}`,
      payment_method: payment_method || 'Cash on Pick-Up',
      placed_at: new Date().toISOString()
    };

    const { data: newOrder, error: orderErr } = await supabase
      .from('orders')
      .insert([orderPayload])
      .select()
      .single();

    if (orderErr || !newOrder) {
      console.error('Order insertion error:', orderErr);
      return res.status(400).json({ status: 'error', message: orderErr ? orderErr.message : 'Failed to create order.' });
    }

    if (Array.isArray(items) && items.length > 0) {
      const orderItemsToInsert = items.map(item => ({
        order_id: newOrder.id,
        item_label: item.title || item.item_label || 'Special Blend Cup',
        quantity: item.quantity || 1,
        unit_price: parseFloat(item.unit_price || item.price || orderSubtotal),
        line_total: parseFloat((item.quantity || 1) * (item.unit_price || item.price || orderSubtotal))
      }));

      await supabase.from('order_items').insert(orderItemsToInsert);
    }

    const { data: updatedCustomer, error: pointsUpdateErr } = await supabase
      .from('customers')
      .update({ loyalty_points: newPointsBalance })
      .eq('id', targetCustomerId)
      .select('id, loyalty_points')
      .single();

    if (pointsUpdateErr || !updatedCustomer) {
      // The order itself was already created successfully - don't fail the
      // whole request - but make sure this is loud and visible, since a
      // silent failure here means points never actually get deducted.
      console.error(
        `[ROUTE LOYALTY SYNC] FAILED to update Customer ${targetCustomerId} points ` +
        `(${currentPoints} -> ${newPointsBalance}):`,
        pointsUpdateErr ? pointsUpdateErr.message : 'no row returned (check RLS policy on customers table / SUPABASE_SERVICE_ROLE_KEY)'
      );

      return res.json({
        status: 'success',
        message: 'Order placed successfully, but loyalty points could not be updated. Please contact support.',
        order: newOrder,
        points_used: actualPointsDiscount,
        points_earned: pointsEarned,
        new_loyalty_points: currentPoints, // unchanged - reflect reality, not the intended value
        points_sync_error: true
      });
    }

    console.log(`[ROUTE LOYALTY SYNC] Customer ${targetCustomerId}: ${currentPoints} -> ${updatedCustomer.loyalty_points} pts.`);

    return res.json({
      status: 'success',
      message: 'Order placed successfully!',
      order: newOrder,
      points_used: actualPointsDiscount,
      points_earned: pointsEarned,
      new_loyalty_points: updatedCustomer.loyalty_points
    });

  } catch (err) {
    console.error('Error in order route:', err);
    return res.status(500).json({ status: 'error', message: 'Failed to place order.' });
  }
});

// GET /api/orders
router.get('/', async (req, res) => {
  if (!supabase) return res.json({ status: 'success', orders: [] });

  try {
    const customerId = getCustomerId(req);
    const { data: orders, error } = await supabase
      .from('orders')
      .select(`
        id, order_number, status, subtotal, discount_amount, total_amount, 
        pickup_instructions, placed_at,
        order_items (id, item_label, quantity, unit_price, line_total)
      `)
      .eq('customer_id', customerId)
      .order('placed_at', { ascending: false });

    if (error) throw error;

    const formattedOrders = (orders || []).map(o => {
      let schedule = 'N/A';
      if (o.pickup_instructions) {
        const match = o.pickup_instructions.match(/Pick-up:\s*([^|]+)/i);
        if (match) schedule = match[1].trim();
      }

      return {
        id: o.id,
        order_number: o.order_number || `#MM-${o.id}`,
        status: o.status || 'PENDING_PAYMENT',
        total_amount: o.total_amount || 0,
        pickup_date: schedule,
        items: (o.order_items || []).map(it => ({
          item_label: it.item_label,
          quantity: it.quantity,
          unit_price: it.unit_price
        }))
      };
    });

    return res.json({ status: 'success', orders: formattedOrders });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message, orders: [] });
  }
});

// GET /api/orders/recent
router.get('/recent', async (req, res) => {
  if (!supabase) return res.json({ status: 'success', orders: [] });

  try {
    const customerId = getCustomerId(req);
    const { data, error } = await supabase
      .from('orders')
      .select('id, order_number, status, total_amount, placed_at')
      .eq('customer_id', customerId)
      .order('placed_at', { ascending: false })
      .limit(3);

    if (error) throw error;
    return res.json({ status: 'success', orders: data || [] });
  } catch {
    return res.json({ status: 'success', orders: [] });
  }
});

module.exports = router;