// src/routes/orderRoutes.js
const express = require('express');
const router = express.Router();
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
const supabase = (supabaseUrl && supabaseKey) ? createClient(supabaseUrl, supabaseKey) : null;

// Dynamic Resolver: Hinahanap ang customer base sa verified user_id, email, o customer_id
async function resolveCustomer(req) {
  if (!supabase) return null;

  const userId = req.body?.user_id || req.query?.user_id || req.cookies?.user_id;
  const email = req.body?.recipient_email || req.body?.guest_email || req.query?.email;
  const customerId = req.body?.customer_id || req.query?.customer_id || req.headers['x-customer-id'] || req.cookies?.customer_id;

  // 1. Unahing hanapin gamit ang user_id para laging tumpak sa naka-login
  if (userId && !isNaN(parseInt(userId, 10))) {
    const { data } = await supabase
      .from('customers')
      .select('id, user_id, loyalty_points')
      .eq('user_id', parseInt(userId, 10))
      .maybeSingle();
    if (data) return data;
  }

  // 2. Kung may email, hanapin via users table
  if (email) {
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .ilike('email', String(email).trim().toLowerCase())
      .maybeSingle();
    if (user) {
      const { data } = await supabase
        .from('customers')
        .select('id, user_id, loyalty_points')
        .eq('user_id', user.id)
        .maybeSingle();
      if (data) return data;
    }
  }

  // 3. Kung customer PK id ang pinasa
  if (customerId && !isNaN(parseInt(customerId, 10))) {
    const { data } = await supabase
      .from('customers')
      .select('id, user_id, loyalty_points')
      .eq('id', parseInt(customerId, 10))
      .maybeSingle();
    if (data) return data;
  }

  return null;
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
      items,
      subtotal,
      discount_amount,
      points_used,
      payment_method,
      pickup_date,
      pickup_instructions,
      order_type,
      guest_name,
      guest_email,
      recipient_name,
      recipient_email
    } = req.body;

    const customer = await resolveCustomer(req);
    const targetCustomerId = customer ? customer.id : null;
    const isGuestOrder = !targetCustomerId;

    const orderSubtotal = parseFloat(subtotal || 0);
    const promoDiscount = parseFloat(discount_amount || 0);
    const requestedPointsUsed = parseFloat(points_used || 0);

    const VALID_PAYMENT_METHODS = ['Cash on Pick-Up', 'E-Wallet'];
    const cleanPaymentMethod = payment_method || 'Cash on Pick-Up';
    if (!VALID_PAYMENT_METHODS.includes(cleanPaymentMethod)) {
      return res.status(400).json({
        status: 'error',
        message: 'Please select a valid payment method (Cash on Pick-Up or E-Wallet).'
      });
    }

    // Decimal Points Math (Sinusuportahan ang 2 decimal places)
    const currentPoints = customer ? parseFloat(customer.loyalty_points || 0) : 0.0;
    const actualPointsDiscount = isGuestOrder 
      ? 0.0 
      : Number(Math.min(currentPoints, requestedPointsUsed, orderSubtotal).toFixed(2));

    const finalTotalAmount = Math.max(0, Number((orderSubtotal - promoDiscount - actualPointsDiscount).toFixed(2)));

    // Tumpak na Formula: Bawat ₱10 nagastos = 0.10 loyalty points (hal. ₱19 = 0.10 pts, ₱100 = 1.00 pt)
    const pointsEarned = isGuestOrder 
      ? 0.0 
      : Number((Math.floor(finalTotalAmount / 10) * 0.10).toFixed(2));

    const newPointsBalance = Math.max(0, Number((currentPoints - actualPointsDiscount + pointsEarned).toFixed(2)));

    const orderNumber = `MM-${Date.now().toString().slice(-6)}`;
    const scheduleDate = pickup_date || null;
    const scheduleText = pickup_instructions || (scheduleDate ? `Pick-up: ${scheduleDate}` : 'Pick-up: N/A');

    const isCustomOrder = order_type === 'custom_build' || (Array.isArray(items) && items.some(i => i.is_custom));
    const validOrderType = isCustomOrder ? 'custom_build' : 'preset';

    const validStatus = (cleanPaymentMethod === 'E-Wallet' && finalTotalAmount <= 0)
      ? 'PAID_VERIFIED'
      : 'PENDING_PAYMENT';

    const cleanGuestName = guest_name || recipient_name || null;
    const cleanGuestEmail = guest_email || recipient_email || null;

    const orderPayload = {
      customer_id: targetCustomerId,
      order_number: orderNumber,
      order_type: validOrderType,
      status: validStatus,
      subtotal: orderSubtotal,
      discount_amount: Number((promoDiscount + actualPointsDiscount).toFixed(2)),
      total_amount: finalTotalAmount,
      payment_method: cleanPaymentMethod,
      pickup_date: scheduleDate,
      pickup_instructions: `${scheduleText} | Payment: ${cleanPaymentMethod}`,
      guest_name: cleanGuestName,
      guest_email: cleanGuestEmail,
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
        quantity: parseInt(item.quantity || 1, 10),
        unit_price: parseFloat(item.unit_price || item.price || orderSubtotal),
        line_total: parseFloat((parseInt(item.quantity || 1, 10)) * (parseFloat(item.unit_price || item.price || orderSubtotal)))
      }));

      await supabase.from('order_items').insert(orderItemsToInsert);
    }

    // I-update ang decimal loyalty_points sa Supabase customers table
    let updatedPointsResult = currentPoints;
    if (customer && targetCustomerId) {
      const { data: updatedCustomer, error: pointsUpdateErr } = await supabase
        .from('customers')
        .update({ loyalty_points: newPointsBalance })
        .eq('id', customer.id)
        .select('id, user_id, loyalty_points')
        .single();

      if (pointsUpdateErr || !updatedCustomer) {
        console.error(
          `[ROUTE LOYALTY SYNC] FAILED to update Customer ${customer.id} points ` +
          `(${currentPoints} -> ${newPointsBalance}):`,
          pointsUpdateErr ? pointsUpdateErr.message : 'No row returned'
        );
      } else {
        updatedPointsResult = parseFloat(updatedCustomer.loyalty_points);
        console.log(`[ROUTE LOYALTY SYNC] Active Account User ${updatedCustomer.user_id}: ${currentPoints} -> ${updatedPointsResult} pts.`);
      }
    }

    return res.json({
      status: 'success',
      message: 'Order placed successfully!',
      order: newOrder,
      points_used: actualPointsDiscount,
      points_earned: pointsEarned,
      new_loyalty_points: updatedPointsResult
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
    const customer = await resolveCustomer(req);
    if (!customer) return res.json({ status: 'success', orders: [] });

    const { data: orders, error } = await supabase
      .from('orders')
      .select(`
        id, order_number, status, subtotal, discount_amount, total_amount, 
        pickup_instructions, pickup_date, placed_at,
        order_items (id, item_label, quantity, unit_price, line_total)
      `)
      .eq('customer_id', customer.id)
      .order('placed_at', { ascending: false });

    if (error) throw error;

    const formattedOrders = (orders || []).map(o => {
      let schedule = o.pickup_date || 'N/A';
      if (schedule === 'N/A' && o.pickup_instructions) {
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
    const customer = await resolveCustomer(req);
    if (!customer) return res.json({ status: 'success', orders: [] });

    const { data, error } = await supabase
      .from('orders')
      .select('id, order_number, status, total_amount, placed_at, pickup_date, pickup_instructions')
      .eq('customer_id', customer.id)
      .order('placed_at', { ascending: false })
      .limit(3);

    if (error) throw error;
    return res.json({ status: 'success', orders: data || [] });
  } catch {
    return res.json({ status: 'success', orders: [] });
  }
});

// GET /api/orders/track - Dedicated Order Tracking Endpoint
router.get('/track', async (req, res) => {
  if (!supabase) {
    return res.status(500).json({ status: 'error', message: 'Database disconnected.' });
  }

  try {
    const rawOrderNum = (req.query.order_number || '').trim().replace(/^#/, '');
    const cleanEmail = (req.query.email || '').trim().toLowerCase();

    if (!rawOrderNum || !cleanEmail) {
      return res.status(400).json({ status: 'error', message: 'Order ID and Email are required.' });
    }

    const { data: order, error } = await supabase
      .from('orders')
      .select(`
        id, order_number, status, subtotal, discount_amount, total_amount,
        pickup_instructions, pickup_date, placed_at, guest_name, guest_email, customer_id, payment_method,
        order_items (id, item_label, quantity, unit_price, line_total),
        customers (
          id,
          users (email, full_name, username)
        )
      `)
      .eq('order_number', rawOrderNum)
      .maybeSingle();

    if (error) {
      console.error('[Track Order DB Error]:', error);
      return res.status(500).json({ status: 'error', message: 'Database query error.' });
    }

    if (!order) {
      return res.status(404).json({ status: 'error', message: 'No order found with that Order ID.' });
    }

    const orderGuestEmail = (order.guest_email || '').trim().toLowerCase();
    const registeredEmail = (order.customers?.users?.email || '').trim().toLowerCase();

    if (orderGuestEmail !== cleanEmail && registeredEmail !== cleanEmail) {
      return res.status(404).json({ status: 'error', message: 'Order ID and Email do not match.' });
    }

    let schedule = order.pickup_date || 'N/A';
    if (schedule === 'N/A' && order.pickup_instructions) {
      const match = order.pickup_instructions.match(/Pick-up:\s*([^|]+)/i);
      if (match) schedule = match[1].trim();
    }

    const formattedOrder = {
      ...order,
      order_ref: order.order_number,
      recipient_name: order.guest_name || order.customers?.users?.full_name || order.customers?.users?.username || 'Customer',
      recipient_email: order.guest_email || registeredEmail || cleanEmail,
      pickup_date: schedule,
      items: (order.order_items || []).map(it => ({
        item_label: it.item_label,
        title: it.item_label,
        quantity: it.quantity,
        unit_price: it.unit_price,
        line_total: it.line_total
      }))
    };

    return res.json({
      status: 'success',
      order: formattedOrder
    });

  } catch (err) {
    console.error('[Track Route Exception]:', err);
    return res.status(500).json({ status: 'error', message: 'Internal server error.' });
  }
});

module.exports = router;