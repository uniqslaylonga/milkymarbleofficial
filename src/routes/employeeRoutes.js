// src/routes/employeeRoutes.js
//
// All employee-dashboard API endpoints (Sales Officer, Finance Officer,
// Procurement/Inventory Officer, Production Supervisor), running on
// Supabase. This replaces public/employee/server.js, which was never
// require()'d by the app and called a MySQL-style `db.query(...)` that
// doesn't exist in this project anymore.
//
// Employee LOGIN itself lives in src/routes/authRoutes.js (POST
// /api/auth/employee-login) and already talks to Supabase — nothing to do
// there. This file is the dashboards employees land on *after* logging in.
//
// Tables used that already existed: users, customers, orders, order_items,
// products, promotions.
// Tables this file expects to exist (see supabase_employee_dashboards.sql
// in the project root — run it once in the Supabase SQL editor):
// expenses, vendors, inventory_items, inventory_movement_logs,
// production_orders, recipes.
const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');

// ----------------------------------------------------------------------------
// Shared helper: resolve the logged-in employee's display name + avatar.
// The frontend sends the id saved at login (localStorage 'userId') either as
// an 'x-user-id' header or a user_id query param.
// ----------------------------------------------------------------------------
async function getEmployeeProfile(req) {
  const userId = req.headers['x-user-id'] || req.query.user_id || req.body?.user_id;
  let fullName = 'Employee';
  const DEFAULT_AVATAR = '/employee/images/account.png';
  let avatarUrl = DEFAULT_AVATAR;

  if (userId && supabase) {
    const { data: user } = await supabase
      .from('users')
      .select('full_name, username, avatar')
      .eq('id', userId)
      .maybeSingle();

    if (user) {
      // Prefer the real full name; if that column is empty for this account,
      // show the username rather than the generic 'Employee' placeholder.
      const cleanFull = (user.full_name || '').trim();
      fullName = cleanFull || (user.username || '').trim() || fullName;
      const rawAvatar = user.avatar;
      if (rawAvatar && rawAvatar !== 'account.png') {
        if (rawAvatar.startsWith('http') || rawAvatar.startsWith('data:image') || rawAvatar.startsWith('/')) {
          avatarUrl = rawAvatar;
        } else if (rawAvatar.startsWith('images/') || rawAvatar.startsWith('uploads/')) {
          avatarUrl = '/' + rawAvatar;
        } else {
          avatarUrl = '/images/' + rawAvatar;
        }
        // '/images/account.png' doesn't exist on the server - use the real default.
        if (avatarUrl === '/images/account.png') avatarUrl = DEFAULT_AVATAR;
      }
    }
  }

  return { fullName, firstName: fullName.trim().split(' ')[0] || 'Employee', avatarSrc: avatarUrl };
}

function noDb(res) {
  return res.status(500).json({ status: 'error', message: 'Database disconnected.' });
}

// Clean an item_label the same way the rest of the app does, to surface a
// readable product name on dashboards.
function cleanItemLabel(rawLabel, fallback) {
  let cleanTitle = String(rawLabel || '')
    .replace(/\s*\((8oz|12oz)\)/gi, '')
    .replace(/(\+.*|\[.*\])/g, '')
    .replace(/^(8oz|12oz)\s*/gi, '')
    .trim();
  if (cleanTitle.endsWith('(')) cleanTitle = cleanTitle.slice(0, -1).trim();
  return cleanTitle || fallback;
}

// ============================================================================
// SALES OFFICER
// ============================================================================

async function buildSalesDashboard(req, res) {
  try {
    if (!supabase) return noDb(res);

    const userProfile = await getEmployeeProfile(req);
    const todayStr = new Date().toISOString().split('T')[0];

    const { data: todayOrdersData } = await supabase
      .from('orders')
      .select('total_amount')
      .gte('placed_at', `${todayStr}T00:00:00`)
      .neq('status', 'CANCELLED');

    const { count: pendingCount } = await supabase
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .in('status', ['PENDING', 'PENDING_PAYMENT']);

    const todayOrders = todayOrdersData ? todayOrdersData.length : 0;
    const todaySales = todayOrdersData
      ? todayOrdersData.reduce((sum, o) => sum + (parseFloat(o.total_amount) || 0), 0)
      : 0;

    const { data: recentOrders } = await supabase
      .from('orders')
      .select('id, order_number, status, total_amount, placed_at, guest_name, customers(users(full_name))')
      .order('placed_at', { ascending: false })
      .limit(5);

    const formattedRecent = (recentOrders || []).map(o => ({
      id: o.id,
      order_number: o.order_number,
      status: o.status,
      total_amount: parseFloat(o.total_amount || 0),
      placed_at: o.placed_at,
      customer_name: (o.customers && o.customers.users && o.customers.users.full_name) || o.guest_name || 'Guest'
    }));

    return res.json({
      status: 'success',
      user: userProfile,
      metrics: { todayOrders, todaySales, pendingOrders: pendingCount || 0 },
      recentOrders: formattedRecent
    });
  } catch (error) {
    console.error('[sales-officer/dashboard] error:', error.message);
    return res.status(500).json({ status: 'error', message: error.message });
  }
}

router.get('/sales-officer/dashboard', buildSalesDashboard);
// order-confirmation reuses the same summary data as the dashboard.
router.get('/sales-officer/order-confirmation', buildSalesDashboard);

router.get('/sales-officer/order-monitoring', async (req, res) => {
  try {
    if (!supabase) return noDb(res);
    const userProfile = await getEmployeeProfile(req);

    const { count: preparingCount } = await supabase
      .from('orders').select('*', { count: 'exact', head: true }).eq('status', 'PREPARING');
    const { count: transitCount } = await supabase
      .from('orders').select('*', { count: 'exact', head: true }).eq('status', 'READY_FOR_PICKUP');
    const { count: cancelledCount } = await supabase
      .from('orders').select('*', { count: 'exact', head: true }).eq('status', 'CANCELLED');

    const { data: activeOrders } = await supabase
      .from('orders')
      .select('id, order_number, status, total_amount, placed_at, guest_name, customers(users(full_name)), order_items(id)')
      .in('status', ['PAID_VERIFIED', 'PREPARING', 'READY_FOR_PICKUP'])
      .order('placed_at', { ascending: false });

    const formattedActive = (activeOrders || []).map(o => ({
      id: o.id,
      order_number: o.order_number,
      status: o.status,
      total_amount: parseFloat(o.total_amount || 0),
      item_count: o.order_items ? o.order_items.length : 1,
      customer_name: (o.customers && o.customers.users && o.customers.users.full_name) || o.guest_name || 'Guest'
    }));

    return res.json({
      status: 'success',
      user: userProfile,
      metrics: { preparingCount: preparingCount || 0, transitCount: transitCount || 0, cancelledCount: cancelledCount || 0 },
      activeOrders: formattedActive
    });
  } catch (error) {
    console.error('[sales-officer/order-monitoring] error:', error.message);
    return res.status(500).json({ status: 'error', message: error.message });
  }
});

router.post('/sales-officer/order-monitoring/update', async (req, res) => {
  try {
    if (!supabase) return noDb(res);
    const { order_id, action } = req.body;
    if (!order_id || !action) {
      return res.status(400).json({ status: 'error', message: 'Missing order_id or action.' });
    }
    const newStatus = action === 'complete' ? 'COMPLETED' : 'CANCELLED';
    const { error } = await supabase
      .from('orders')
      .update({ status: newStatus, completed_at: new Date().toISOString() })
      .eq('id', order_id);

    if (error) throw error;
    return res.json({ status: 'success', message: `Order updated to ${newStatus}.` });
  } catch (error) {
    return res.status(500).json({ status: 'error', message: error.message });
  }
});

router.get('/sales-officer/customer-records', async (req, res) => {
  try {
    if (!supabase) return noDb(res);
    const userProfile = await getEmployeeProfile(req);

    const { data: customers, error } = await supabase
      .from('customers')
      .select(`
        id, phone, address, preferred_payment,
        users(full_name, email, avatar),
        orders(id, total_amount, status)
      `);

    if (error) throw error;

    const formattedCustomers = (customers || []).map(c => {
      const validOrders = (c.orders || []).filter(o => o.status !== 'CANCELLED');
      const totalSpent = validOrders.reduce((sum, o) => sum + (parseFloat(o.total_amount) || 0), 0);
      const userObj = Array.isArray(c.users) ? c.users[0] : c.users;
      let custAvatar = '/images/account.png';

      if (userObj && userObj.avatar && userObj.avatar !== 'account.png') {
        custAvatar = userObj.avatar.startsWith('/') || userObj.avatar.startsWith('http')
          ? userObj.avatar
          : '/images/' + userObj.avatar;
      }

      return {
        id: c.id,
        full_name: (userObj && userObj.full_name) || 'Customer',
        email: (userObj && userObj.email) || '',
        phone: c.phone || 'N/A',
        avatar: custAvatar,
        address: c.address || 'No default address specified.',
        preferred_payment: c.preferred_payment || 'GCash',
        total_orders: validOrders.length,
        total_spent: totalSpent
      };
    });

    return res.json({
      status: 'success',
      user: userProfile,
      metrics: {
        totalRegistered: formattedCustomers.length,
        registeredGrowth: '',
        newSignups: formattedCustomers.length,
        signupsGrowth: '',
        repeatRate: formattedCustomers.length
          ? `${Math.round((formattedCustomers.filter(c => c.total_orders > 1).length / formattedCustomers.length) * 1000) / 10}%`
          : '0%'
      },
      customers: formattedCustomers
    });
  } catch (error) {
    console.error('[sales-officer/customer-records] error:', error.message);
    return res.status(500).json({ status: 'error', message: error.message });
  }
});

// --- Promotions -------------------------------------------------------------
// Uses the real `promotions` table (also read by the customer-facing
// /api/promotions/validate endpoint), extended with target_segment,
// min_spend, usage_cap, usage_count, pitch_note, rejection_reason — see
// supabase_employee_dashboards.sql.
router.get('/sales-officer/promotions', async (req, res) => {
  try {
    if (!supabase) return noDb(res);
    const userProfile = await getEmployeeProfile(req);

    const { data: promotions, error } = await supabase
      .from('promotions')
      .select('*')
      .order('id', { ascending: false });

    if (error) throw error;

    const campaigns = (promotions || []).map(p => ({
      id: p.id,
      code: p.code,
      discount_type: p.discount_type,
      discount_value: parseFloat(p.discount_value) || 0,
      target_segment: p.target_segment || 'all',
      min_spend: p.min_spend !== undefined ? p.min_spend : null,
      usage_cap: p.usage_cap !== undefined ? p.usage_cap : null,
      usage_count: p.usage_count || 0,
      status: p.status,
      pitch_note: p.pitch_note || p.title || '',
      rejection_reason: p.rejection_reason || null,
      created_at: p.created_at
    }));

    const activeCount = campaigns.filter(c => (c.status || '').toUpperCase() === 'ACTIVE').length;

    return res.json({
      status: 'success',
      user: userProfile,
      metrics: { totalPromosCount: campaigns.length, activePromosCount: activeCount },
      campaigns
    });
  } catch (error) {
    console.error('[sales-officer/promotions] error:', error.message);
    return res.status(500).json({ status: 'error', message: error.message });
  }
});

// Sales Officer pitches a new promo -> goes to CEO as PENDING_APPROVAL.
router.post('/sales-officer/promotions/pitch', async (req, res) => {
  try {
    if (!supabase) return noDb(res);
    const { code, target_segment, discount_type, discount_value, min_spend, usage_cap, pitch_note } = req.body;

    if (!code || discount_value === undefined || discount_value === null) {
      return res.status(400).json({ status: 'error', message: 'Code and discount value are required.' });
    }

    const { data, error } = await supabase
      .from('promotions')
      .insert([{
        code: String(code).toUpperCase().trim(),
        title: pitch_note || `${code} promo`,
        discount_type: discount_type || 'percent',
        discount_value: parseFloat(discount_value) || 0,
        target_segment: target_segment || 'all',
        min_spend: min_spend !== undefined && min_spend !== null && min_spend !== '' ? parseFloat(min_spend) : null,
        usage_cap: usage_cap !== undefined && usage_cap !== null && usage_cap !== '' ? parseInt(usage_cap, 10) : null,
        usage_count: 0,
        pitch_note: pitch_note || '',
        status: 'PENDING_APPROVAL'
      }])
      .select()
      .single();

    if (error) throw error;
    return res.json({ status: 'success', message: 'Promotion pitched for CEO approval.', promotion: data });
  } catch (error) {
    console.error('[sales-officer/promotions/pitch] error:', error.message);
    return res.status(500).json({ status: 'error', message: error.message });
  }
});

// Kept for backward compatibility with any direct create/toggle calls.
router.post('/sales-officer/promotions/create', async (req, res) => {
  try {
    if (!supabase) return noDb(res);
    const { code, discount_type, discount_value } = req.body;
    if (!code || !discount_value) {
      return res.status(400).json({ status: 'error', message: 'Code and discount value required.' });
    }
    const { data, error } = await supabase
      .from('promotions')
      .insert([{
        code: String(code).toUpperCase().trim(),
        discount_type: discount_type || 'percent',
        discount_value: parseFloat(discount_value),
        status: 'ACTIVE'
      }])
      .select()
      .single();

    if (error) throw error;
    return res.json({ status: 'success', promotion: data });
  } catch (error) {
    return res.status(500).json({ status: 'error', message: error.message });
  }
});

router.post('/sales-officer/promotions/toggle', async (req, res) => {
  try {
    if (!supabase) return noDb(res);
    const { toggle_id, new_status } = req.body;
    const { error } = await supabase.from('promotions').update({ status: new_status }).eq('id', toggle_id);
    if (error) throw error;
    return res.json({ status: 'success', message: 'Status updated.' });
  } catch (error) {
    return res.status(500).json({ status: 'error', message: error.message });
  }
});

router.get('/sales-officer/sales-reports', async (req, res) => {
  try {
    if (!supabase) return noDb(res);
    const userProfile = await getEmployeeProfile(req);

    const { data: orders } = await supabase
      .from('orders')
      .select('subtotal, total_amount, status')
      .neq('status', 'CANCELLED');

    const grossSales = (orders || []).reduce((sum, o) => sum + (parseFloat(o.subtotal) || parseFloat(o.total_amount) || 0), 0);
    const netSales = (orders || []).reduce((sum, o) => sum + (parseFloat(o.total_amount) || 0), 0);
    const validCount = (orders || []).length || 1;
    const aov = netSales / validCount;

    const { data: products } = await supabase
      .from('products')
      .select('id, sku, name, order_items(quantity, line_total)');

    const productsRank = (products || []).map(p => {
      const items = p.order_items || [];
      const units_sold = items.reduce((sum, i) => sum + (parseInt(i.quantity, 10) || 0), 0);
      const revenue = items.reduce((sum, i) => sum + (parseFloat(i.line_total) || 0), 0);
      return { sku: p.sku, name: p.name, units_sold, revenue };
    }).sort((a, b) => b.units_sold - a.units_sold);

    return res.json({
      status: 'success',
      user: userProfile,
      metrics: { grossSales, netSales, aov },
      productsRank
    });
  } catch (error) {
    console.error('[sales-officer/sales-reports] error:', error.message);
    return res.status(500).json({ status: 'error', message: error.message });
  }
});

router.get('/sales-officer/sales-target', async (req, res) => {
  try {
    if (!supabase) return noDb(res);
    const userProfile = await getEmployeeProfile(req);

    const todayStr = new Date().toISOString().split('T')[0];
    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const { data: todayOrders } = await supabase
      .from('orders').select('total_amount').gte('placed_at', `${todayStr}T00:00:00`).neq('status', 'CANCELLED');
    const { data: monthOrders } = await supabase
      .from('orders').select('total_amount').gte('placed_at', firstDayOfMonth).neq('status', 'CANCELLED');

    const todaySales = (todayOrders || []).reduce((sum, o) => sum + (parseFloat(o.total_amount) || 0), 0);
    const monthSales = (monthOrders || []).reduce((sum, o) => sum + (parseFloat(o.total_amount) || 0), 0);

    const dailyTarget = 15000.00;
    const monthlyTarget = 320000.00;

    const dailyPct = Math.min(100, Math.round((todaySales / dailyTarget) * 100));
    const monthlyPct = Math.min(100, Math.round((monthSales / monthlyTarget) * 100));

    return res.json({
      status: 'success',
      user: userProfile,
      metrics: { todaySales, dailyTarget, dailyPct, monthSales, monthlyTarget, monthlyPct }
    });
  } catch (error) {
    return res.status(500).json({ status: 'error', message: error.message });
  }
});

// ============================================================================
// FINANCE OFFICER
// ============================================================================
// Revenue/payments are derived from `orders` (this project tracks payment
// state directly on orders.status — there's no separate payments table).
// Budget/expenses run on the new `expenses` table (see the .sql migration).

router.get('/finance-officer/dashboard', async (req, res) => {
  try {
    if (!supabase) return noDb(res);
    const userProfile = await getEmployeeProfile(req);
    const thisYear = new Date().getFullYear();

    const { data: paidOrdersData } = await supabase
      .from('orders').select('total_amount, placed_at').in('status', ['PAID_VERIFIED', 'COMPLETED']);
    const paidOrders = paidOrdersData || [];
    const totalRevenue = paidOrders.reduce((s, o) => s + (parseFloat(o.total_amount) || 0), 0);
    const totalPayments = totalRevenue; // no separate payments ledger — see note above

    const { data: expenseRows } = await supabase.from('expenses').select('amount, status, expense_date');
    const totalExpenses = (expenseRows || [])
      .filter(e => ['APPROVED', 'PURCHASED'].includes(e.status))
      .reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
    const totalBudget = (expenseRows || []).reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);

    const monthlyInflow = Array(12).fill(0);
    paidOrders.forEach(o => {
      const d = new Date(o.placed_at);
      if (d.getFullYear() === thisYear) monthlyInflow[d.getMonth()] += parseFloat(o.total_amount) || 0;
    });

    const monthlyOutflow = Array(12).fill(0);
    (expenseRows || []).forEach(e => {
      if (!['APPROVED', 'PURCHASED'].includes(e.status)) return;
      const d = new Date(e.expense_date);
      if (d.getFullYear() === thisYear) monthlyOutflow[d.getMonth()] += parseFloat(e.amount) || 0;
    });

    let year2026 = 0, year2025 = 0, year2024 = 0;
    paidOrders.forEach(o => {
      const y = new Date(o.placed_at).getFullYear();
      const amt = parseFloat(o.total_amount) || 0;
      if (y === 2026) year2026 += amt;
      else if (y === 2025) year2025 += amt;
      else if (y === 2024) year2024 += amt;
    });
    const totalAllYears = year2026 + year2025 + year2024;
    const pct = (v) => totalAllYears > 0 ? Math.round((v / totalAllYears) * 100) : 0;

    return res.json({
      status: 'success',
      user: userProfile,
      metrics: { totalBudget, totalRevenue, totalPayments, totalExpenses },
      monthlyInflow,
      monthlyOutflow,
      yearlyTotals: { y2026: year2026, y2025: year2025, y2024: year2024 },
      yearlyPercentages: { p2026: pct(year2026), p2025: pct(year2025), p2024: pct(year2024) },
      weeklyWave: { series1: [0, 0, 0, 0, 0, 0, 0], series2: [0, 0, 0, 0, 0, 0, 0] }
    });
  } catch (error) {
    console.error('[finance-officer/dashboard] error:', error.message);
    return res.status(500).json({ status: 'error', message: error.message });
  }
});

router.get('/finance-officer/revenue', async (req, res) => {
  try {
    if (!supabase) return noDb(res);
    const userProfile = await getEmployeeProfile(req);
    const thisYear = new Date().getFullYear();

    const { data: paidOrders } = await supabase.from('orders').select('total_amount, placed_at').in('status', ['PAID_VERIFIED', 'COMPLETED']);
    const totalRevenue = (paidOrders || []).reduce((s, o) => s + (parseFloat(o.total_amount) || 0), 0);
    const totalPayments = totalRevenue;

    const { data: expenseRows } = await supabase.from('expenses').select('amount, status, expense_date');
    const totalExpenses = (expenseRows || [])
      .filter(e => ['APPROVED', 'PURCHASED'].includes(e.status))
      .reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
    const totalBudget = (expenseRows || []).reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);

    const revenueMonthly = Array(12).fill(0);
    const paymentsMonthly = Array(12).fill(0);
    (paidOrders || []).forEach(o => {
      const d = new Date(o.placed_at);
      if (d.getFullYear() === thisYear) {
        revenueMonthly[d.getMonth()] += parseFloat(o.total_amount) || 0;
        paymentsMonthly[d.getMonth()] += parseFloat(o.total_amount) || 0;
      }
    });

    const expensesMonthly = Array(12).fill(0);
    const budgetMonthly = Array(12).fill(0);
    (expenseRows || []).forEach(e => {
      const d = new Date(e.expense_date);
      if (d.getFullYear() !== thisYear) return;
      budgetMonthly[d.getMonth()] += parseFloat(e.amount) || 0;
      if (['APPROVED', 'PURCHASED'].includes(e.status)) expensesMonthly[d.getMonth()] += parseFloat(e.amount) || 0;
    });

    return res.json({
      status: 'success',
      user: userProfile,
      metrics: { totalBudget, totalRevenue, totalExpenses, totalPayments },
      percentages: {
        budget: totalBudget > 0 ? 100 : 0,
        revenue: totalRevenue > 0 ? 100 : 0,
        expenses: totalExpenses > 0 ? 100 : 0,
        payments: totalPayments > 0 ? 100 : 0
      },
      monthly: { budget: budgetMonthly, revenue: revenueMonthly, expenses: expensesMonthly, payments: paymentsMonthly }
    });
  } catch (error) {
    console.error('[finance-officer/revenue] error:', error.message);
    return res.status(500).json({ status: 'error', message: error.message });
  }
});

router.get('/finance-officer/budget', async (req, res) => {
  try {
    if (!supabase) return noDb(res);
    const userProfile = await getEmployeeProfile(req);

    const { data: expenseRows, error } = await supabase
      .from('expenses')
      .select('amount, expense_date')
      .order('expense_date', { ascending: false });
    if (error) throw error;

    const records = (expenseRows || []).map(e => {
      const amount = parseFloat(e.amount) || 0;
      const d = new Date(e.expense_date);
      return {
        date: `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`,
        capital: amount,
        raw_material: amount * 0.50,
        emergency_funds: amount * 0.15,
        manpower_cost: amount * 0.35
      };
    });

    return res.json({ status: 'success', user: userProfile, records });
  } catch (error) {
    console.error('[finance-officer/budget] error:', error.message);
    return res.status(500).json({ status: 'error', message: error.message });
  }
});

router.get('/finance-officer/expenses', async (req, res) => {
  try {
    if (!supabase) return noDb(res);
    const userProfile = await getEmployeeProfile(req);

    const { data: expenseRows, error } = await supabase
      .from('expenses')
      .select('amount, expense_date')
      .order('expense_date', { ascending: false });
    if (error) throw error;

    const records = (expenseRows || []).map(e => {
      const amount = parseFloat(e.amount) || 0;
      const d = new Date(e.expense_date);
      return {
        date: `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`,
        marketing: amount * 0.20,
        taxes: amount * 0.15,
        cogs: amount * 0.65
      };
    });

    return res.json({ status: 'success', user: userProfile, records });
  } catch (error) {
    console.error('[finance-officer/expenses] error:', error.message);
    return res.status(500).json({ status: 'error', message: error.message });
  }
});

router.get('/finance-officer/payments', async (req, res) => {
  try {
    if (!supabase) return noDb(res);
    const userProfile = await getEmployeeProfile(req);

    const { data: paidOrders, error } = await supabase
      .from('orders')
      .select('id, order_number, total_amount, placed_at, guest_name, customers(users(full_name, username))')
      .eq('status', 'PAID_VERIFIED')
      .order('placed_at', { ascending: false });
    if (error) throw error;

    const now = new Date();
    let monthlyTotal = 0, quarterlyTotal = 0, yearlyTotal = 0;
    const currentQuarter = Math.floor(now.getMonth() / 3);

    const payments = (paidOrders || []).map(o => {
      const amt = parseFloat(o.total_amount) || 0;
      const d = new Date(o.placed_at);
      if (d.getFullYear() === now.getFullYear()) {
        yearlyTotal += amt;
        if (Math.floor(d.getMonth() / 3) === currentQuarter) quarterlyTotal += amt;
        if (d.getMonth() === now.getMonth()) monthlyTotal += amt;
      }

      const userObj = o.customers && o.customers.users;
      return {
        payment_id: o.id,
        amount: amt,
        transaction_id: o.order_number,
        created_at: o.placed_at,
        customer_name: (userObj && userObj.full_name) || o.guest_name || 'Guest Customer',
        user_identifier: (userObj && userObj.username) || 'N/A'
      };
    });

    return res.json({
      status: 'success',
      user: userProfile,
      summary: { monthlyTotal, quarterlyTotal, yearlyTotal },
      payments
    });
  } catch (error) {
    console.error('[finance-officer/payments] error:', error.message);
    return res.status(500).json({ status: 'error', message: error.message });
  }
});

// ============================================================================
// PROCUREMENT / INVENTORY OFFICER
// ============================================================================

router.get('/procurement-officer/dashboard', async (req, res) => {
  try {
    if (!supabase) return noDb(res);
    const userProfile = await getEmployeeProfile(req);

    const { count: openRequests } = await supabase
      .from('expenses').select('*', { count: 'exact', head: true }).in('status', ['PENDING_FINANCE', 'PENDING_CEO']);

    const { data: vendorRows } = await supabase.from('vendors').select('id, vendor_name, category_desc, status, updated_at').order('updated_at', { ascending: false });
    const activeVendors = (vendorRows || []).filter(v => v.status === 'Active').length;
    const totalVendorsCount = (vendorRows || []).length;
    const vendorsList = (vendorRows || []).slice(0, 5);

    const { count: itemsMonitored } = await supabase.from('inventory_items').select('*', { count: 'exact', head: true });

    const { data: prRows } = await supabase
      .from('expenses')
      .select('id, item_name, store_name, amount, status, requested_by')
      .order('created_at', { ascending: false })
      .limit(5);

    const purchaseRequests = (prRows || []).map(e => ({
      id: e.id,
      pr_code: `PR-${1000 + e.id}`,
      name: e.item_name,
      department: 'Procurement',
      quantity: 1,
      unit: 'unit',
      total_price: parseFloat(e.amount) || 0,
      status: e.status
    }));

    const { data: invRows } = await supabase.from('inventory_items').select('item_type, on_hand');
    let ingUnits = 0, pkgUnits = 0, eqpUnits = 0;
    (invRows || []).forEach(r => {
      const qty = parseFloat(r.on_hand) || 0;
      if (r.item_type === 'raw_material') ingUnits += qty;
      else if (r.item_type === 'packaging') pkgUnits += qty;
      else if (r.item_type === 'equipment') eqpUnits += qty;
    });
    const totalAvailableUnits = ingUnits + pkgUnits + eqpUnits;

    // PostgREST can't filter on a computed comparison (on_hand <= reorder_point)
    // directly, so pull the rows and compute the low-stock count in JS.
    const { data: allInvItems } = await supabase.from('inventory_items').select('on_hand, reorder_point');
    const lowStockCount = (allInvItems || []).filter(i => (parseFloat(i.on_hand) || 0) <= (parseFloat(i.reorder_point) || 0)).length;

    return res.json({
      status: 'success',
      user: userProfile,
      metrics: { openRequests: openRequests || 0, activeVendors, itemsMonitored: itemsMonitored || 0, reservedStocks: 0 },
      purchaseRequests,
      vendorsList,
      vendorStats: {
        totalVendorsCount,
        activeVendorsPercent: totalVendorsCount > 0 ? Math.round((activeVendors / totalVendorsCount) * 100) : 0
      },
      inventoryCategory: { ingUnits, pkgUnits, eqpUnits, totalAvailableUnits },
      attentionCount: lowStockCount
    });
  } catch (error) {
    console.error('[procurement-officer/dashboard] error:', error.message);
    return res.status(500).json({ status: 'error', message: error.message });
  }
});

router.post('/procurement-officer/add-request', async (req, res) => {
  try {
    if (!supabase) return noDb(res);
    const { item_name, store_name, amount } = req.body;
    const userId = req.headers['x-user-id'] || req.body?.user_id || null;

    if (!item_name || !amount || parseFloat(amount) <= 0) {
      return res.status(400).json({ status: 'error', message: 'Item name and a valid amount are required.' });
    }

    const numAmount = parseFloat(amount);
    const tier = numAmount > 500 ? 'major' : (numAmount > 300 ? 'medium' : 'micro');

    const { error } = await supabase.from('expenses').insert([{
      item_name,
      store_name: store_name || '',
      amount: numAmount,
      tier,
      status: 'PENDING_FINANCE',
      requested_by: userId || null,
      expense_date: new Date().toISOString().split('T')[0]
    }]);
    if (error) throw error;

    return res.json({ status: 'success', message: 'Purchase request added successfully.' });
  } catch (error) {
    console.error('[procurement-officer/add-request] error:', error.message);
    return res.status(500).json({ status: 'error', message: error.message });
  }
});

router.get('/procurement-officer/purchasing-vendor', async (req, res) => {
  try {
    if (!supabase) return noDb(res);
    const userProfile = await getEmployeeProfile(req);

    const { data: expenseRows } = await supabase
      .from('expenses')
      .select('id, item_name, store_name, amount, status, created_at, requested_by')
      .order('created_at', { ascending: false });

    const requesterIds = [...new Set((expenseRows || []).map(e => e.requested_by).filter(Boolean))];
    let requesterMap = {};
    if (requesterIds.length) {
      const { data: requesterUsers } = await supabase.from('users').select('id, full_name').in('id', requesterIds);
      (requesterUsers || []).forEach(u => { requesterMap[u.id] = u.full_name; });
    }

    const requests = (expenseRows || []).map(e => ({
      id: e.id,
      pr_code: `PR-${1000 + e.id}`,
      name: e.item_name,
      vendor_name: e.store_name,
      department: 'Procurement',
      requester_name: requesterMap[e.requested_by] || 'Staff',
      quantity: 1,
      unit: 'unit',
      total_price: parseFloat(e.amount) || 0,
      status: e.status,
      created_at: e.created_at
    }));

    const { data: vendors, error: vErr } = await supabase.from('vendors').select('*').order('id', { ascending: false });
    if (vErr) throw vErr;

    return res.json({ status: 'success', user: userProfile, requests, vendors: vendors || [] });
  } catch (error) {
    console.error('[procurement-officer/purchasing-vendor] error:', error.message);
    return res.status(500).json({ status: 'error', message: error.message });
  }
});

router.post('/procurement-officer/add-vendor', async (req, res) => {
  try {
    if (!supabase) return noDb(res);
    const { vendor_name, category, contact, status } = req.body;
    if (!vendor_name) {
      return res.status(400).json({ status: 'error', message: 'Vendor name is required.' });
    }

    const { error } = await supabase.from('vendors').insert([{
      vendor_name,
      category_desc: category || '',
      contact_email: contact || '',
      status: status || 'Active',
      total_spent: 0
    }]);
    if (error) throw error;

    return res.json({ status: 'success', message: 'Vendor created successfully.' });
  } catch (error) {
    console.error('[procurement-officer/add-vendor] error:', error.message);
    return res.status(500).json({ status: 'error', message: error.message });
  }
});

router.post('/procurement-officer/edit-vendor', async (req, res) => {
  try {
    if (!supabase) return noDb(res);
    const { vendor_id, vendor_name, category, contact, status } = req.body;
    if (!vendor_id || !vendor_name) {
      return res.status(400).json({ status: 'error', message: 'Vendor ID and name are required.' });
    }

    const { error } = await supabase.from('vendors').update({
      vendor_name,
      category_desc: category || '',
      contact_email: contact || '',
      status: status || 'Active',
      updated_at: new Date().toISOString()
    }).eq('id', vendor_id);
    if (error) throw error;

    return res.json({ status: 'success', message: 'Vendor updated successfully.' });
  } catch (error) {
    console.error('[procurement-officer/edit-vendor] error:', error.message);
    return res.status(500).json({ status: 'error', message: error.message });
  }
});

router.get('/procurement-officer/inventory-section', async (req, res) => {
  try {
    if (!supabase) return noDb(res);
    const userProfile = await getEmployeeProfile(req);

    const { data: items, error } = await supabase.from('inventory_items').select('*').order('id', { ascending: false });
    if (error) throw error;

    const { data: vendorRows } = await supabase.from('vendors').select('vendor_name').order('vendor_name', { ascending: true });
    const vendorsList = (vendorRows || []).map(v => v.vendor_name);

    const totalCount = (items || []).length;
    let ingCount = 0, pkgCount = 0, eqpCount = 0;
    (items || []).forEach(it => {
      const type = String(it.item_type || '').toLowerCase();
      if (type === 'raw_material') ingCount++;
      else if (type === 'packaging') pkgCount++;
      else if (type === 'equipment') eqpCount++;
    });

    return res.json({
      status: 'success',
      user: userProfile,
      counts: { totalCount, ingCount, pkgCount, eqpCount },
      items: items || [],
      vendors: vendorsList
    });
  } catch (error) {
    console.error('[procurement-officer/inventory-section] error:', error.message);
    return res.status(500).json({ status: 'error', message: error.message });
  }
});

async function getEmployeeNameForLog(req) {
  const userId = req.headers['x-user-id'] || req.body?.user_id;
  if (!userId || !supabase) return 'Staff';
  const { data: user } = await supabase.from('users').select('full_name').eq('id', userId).maybeSingle();
  return (user && user.full_name) || 'Staff';
}

router.post('/procurement-officer/add-stock', async (req, res) => {
  try {
    if (!supabase) return noDb(res);
    const { name, department, quantity, unit, reorder_level } = req.body;

    if (!name || isNaN(quantity)) {
      return res.status(400).json({ status: 'error', message: 'Item name and quantity are required.' });
    }

    const numQty = parseFloat(quantity);
    const numReorder = parseFloat(reorder_level || 10);
    const dbItemType = department === 'Packaging' ? 'packaging' : (department === 'Equipment' ? 'equipment' : 'raw_material');
    const empName = await getEmployeeNameForLog(req);

    const { data: existing } = await supabase.from('inventory_items').select('id, on_hand').eq('name', name).limit(1).maybeSingle();

    let itemId;
    if (existing) {
      itemId = existing.id;
      const { error } = await supabase.from('inventory_items').update({
        on_hand: (parseFloat(existing.on_hand) || 0) + numQty,
        reorder_point: numReorder,
        unit_of_measure: unit || 'grams',
        item_type: dbItemType,
        updated_at: new Date().toISOString()
      }).eq('id', itemId);
      if (error) throw error;
    } else {
      const { data: inserted, error } = await supabase.from('inventory_items').insert([{
        name, item_type: dbItemType, on_hand: numQty, reorder_point: numReorder, unit_of_measure: unit || 'grams'
      }]).select().single();
      if (error) throw error;
      itemId = inserted.id;
    }

    await supabase.from('inventory_movement_logs').insert([{
      item_id: itemId, item_name: name, change_type: 'ADD', quantity_changed: numQty, employee_name: empName
    }]);

    return res.json({ status: 'success', message: 'Stock added successfully.' });
  } catch (error) {
    console.error('[procurement-officer/add-stock] error:', error.message);
    return res.status(500).json({ status: 'error', message: error.message });
  }
});

router.post('/procurement-officer/adjust-stock', async (req, res) => {
  try {
    if (!supabase) return noDb(res);
    const { item_id, name, department, quantity, unit, reorder_level } = req.body;

    if (!item_id || !name || isNaN(quantity)) {
      return res.status(400).json({ status: 'error', message: 'Item ID, name, and quantity are required.' });
    }

    const numQty = parseFloat(quantity);
    const numReorder = parseFloat(reorder_level || 10);
    const dbItemType = department === 'Packaging' ? 'packaging' : (department === 'Equipment' ? 'equipment' : 'raw_material');
    const empName = await getEmployeeNameForLog(req);

    const { data: prevRow } = await supabase.from('inventory_items').select('on_hand').eq('id', item_id).maybeSingle();
    const oldQty = prevRow ? parseFloat(prevRow.on_hand) || 0 : 0;
    const diff = numQty - oldQty;
    let changeType = 'ADJUST';
    if (diff < 0) changeType = 'DEDUCT';
    else if (diff > 0) changeType = 'ADD';

    const { error } = await supabase.from('inventory_items').update({
      name, on_hand: numQty, reorder_point: numReorder, unit_of_measure: unit || 'grams', item_type: dbItemType,
      updated_at: new Date().toISOString()
    }).eq('id', item_id);
    if (error) throw error;

    await supabase.from('inventory_movement_logs').insert([{
      item_id, item_name: name, change_type: changeType, quantity_changed: Math.abs(diff), employee_name: empName
    }]);

    return res.json({ status: 'success', message: 'Stock adjusted successfully.' });
  } catch (error) {
    console.error('[procurement-officer/adjust-stock] error:', error.message);
    return res.status(500).json({ status: 'error', message: error.message });
  }
});

router.post('/procurement-officer/delete-stock', async (req, res) => {
  try {
    if (!supabase) return noDb(res);
    const { item_id } = req.body;
    if (!item_id) {
      return res.status(400).json({ status: 'error', message: 'Item ID is required.' });
    }
    const empName = await getEmployeeNameForLog(req);

    const { data: delRow } = await supabase.from('inventory_items').select('name, on_hand').eq('id', item_id).maybeSingle();
    const { error } = await supabase.from('inventory_items').delete().eq('id', item_id);
    if (error) throw error;

    if (delRow) {
      await supabase.from('inventory_movement_logs').insert([{
        item_id, item_name: delRow.name, change_type: 'DEDUCT', quantity_changed: parseFloat(delRow.on_hand) || 0, employee_name: empName
      }]);
    }

    return res.json({ status: 'success', message: 'Stock deleted successfully.' });
  } catch (error) {
    console.error('[procurement-officer/delete-stock] error:', error.message);
    return res.status(500).json({ status: 'error', message: error.message });
  }
});

router.get('/procurement-officer/stock-control', async (req, res) => {
  try {
    if (!supabase) return noDb(res);
    const userProfile = await getEmployeeProfile(req);

    const { count: openRequests } = await supabase
      .from('expenses').select('*', { count: 'exact', head: true }).in('status', ['PENDING_FINANCE', 'PENDING_CEO']);
    const { count: activeVendors } = await supabase
      .from('vendors').select('*', { count: 'exact', head: true }).eq('status', 'Active');
    const { count: itemsMonitored } = await supabase.from('inventory_items').select('*', { count: 'exact', head: true });

    const { data: allItems } = await supabase.from('inventory_items').select('id, name, item_type, on_hand, reorder_point, unit_of_measure');
    const lowStockItems = (allItems || [])
      .filter(i => (parseFloat(i.on_hand) || 0) <= (parseFloat(i.reorder_point) || 0) && (parseFloat(i.reorder_point) || 0) > 0)
      .sort((a, b) => (a.on_hand / (a.reorder_point || 1)) - (b.on_hand / (b.reorder_point || 1)))
      .map(i => ({ ...i, reorder_level: i.reorder_point, unit: i.unit_of_measure }));

    const { data: rawLogs } = await supabase
      .from('inventory_movement_logs')
      .select('id, item_id, item_name, change_type, quantity_changed, employee_name, created_at')
      .order('created_at', { ascending: false })
      .limit(10);

    const todayStr = new Date().toISOString().split('T')[0];
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    const movementLogs = (rawLogs || []).map(log => {
      const createdAt = new Date(log.created_at);
      const logDateStr = createdAt.toISOString().split('T')[0];
      const timeStr = createdAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

      let dateGroup = 'older';
      let displayTime = `${createdAt.getMonth() + 1}/${createdAt.getDate()}/${String(createdAt.getFullYear()).slice(2)} - ${timeStr}`;

      if (logDateStr === todayStr) { dateGroup = 'today'; displayTime = `Today - ${timeStr}`; }
      else if (logDateStr === yesterdayStr) { dateGroup = 'yesterday'; displayTime = `Yesterday - ${timeStr}`; }

      return { ...log, dateGroup, displayTime };
    });

    return res.json({
      status: 'success',
      user: userProfile,
      metrics: { openRequests: openRequests || 0, activeVendors: activeVendors || 0, itemsMonitored: itemsMonitored || 0, reservedStocks: 0 },
      lowStockItems,
      movementLogs
    });
  } catch (error) {
    console.error('[procurement-officer/stock-control] error:', error.message);
    return res.status(500).json({ status: 'error', message: error.message });
  }
});

// ============================================================================
// PRODUCTION SUPERVISOR
// ============================================================================

router.get('/production-supervisor/dashboard', async (req, res) => {
  try {
    if (!supabase) return noDb(res);
    const userProfile = await getEmployeeProfile(req);
    const todayStr = new Date().toISOString().split('T')[0];

    const { data: completedTodayRows } = await supabase
      .from('orders').select('id').eq('status', 'COMPLETED').gte('completed_at', `${todayStr}T00:00:00`);
    let finalCompleted = (completedTodayRows || []).length;
    if (finalCompleted === 0) {
      const { count: totalCompleted } = await supabase.from('orders').select('*', { count: 'exact', head: true }).eq('status', 'COMPLETED');
      finalCompleted = totalCompleted || 0;
    }

    const { count: pendingOrders } = await supabase
      .from('orders').select('*', { count: 'exact', head: true }).in('status', ['PENDING_PAYMENT', 'PAID_VERIFIED']);
    const { count: inProduction } = await supabase
      .from('orders').select('*', { count: 'exact', head: true }).eq('status', 'PREPARING');

    const { data: invRows } = await supabase.from('inventory_items').select('on_hand');
    const reservedStocks = (invRows || []).reduce((s, i) => s + (parseFloat(i.on_hand) || 0), 0);

    const { data: rawOrders } = await supabase
      .from('orders')
      .select('id, order_number, status, total_amount, placed_at, pickup_instructions, guest_name, customers(users(full_name)), order_items(item_label, quantity)')
      .neq('status', 'CANCELLED')
      .order('placed_at', { ascending: false })
      .limit(5);

    const recentOrders = (rawOrders || []).map(o => {
      const firstItem = (o.order_items && o.order_items[0]) || {};
      const cleanTitle = cleanItemLabel(firstItem.item_label, 'Marble Cup');
      const rawStatus = String(o.status || '').toUpperCase();
      let statusClass = 'pending', statusLabel = 'Pending';
      if (rawStatus === 'PREPARING') { statusClass = 'inprogress'; statusLabel = 'In Progress'; }
      else if (rawStatus === 'READY_FOR_PICKUP' || rawStatus === 'COMPLETED') {
        statusClass = 'approved';
        statusLabel = rawStatus === 'READY_FOR_PICKUP' ? 'Ready' : 'Completed';
      }

      let scheduleText = 'Standard';
      const pickupMatch = o.pickup_instructions ? o.pickup_instructions.match(/Pick-up:\s*([^|]+)/i) : null;
      if (pickupMatch) {
        scheduleText = pickupMatch[1].trim();
      } else if (o.placed_at) {
        const pDate = new Date(o.placed_at);
        scheduleText = pDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ', ' +
          pDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
      }

      return {
        id: o.id,
        order_number: o.order_number,
        status: o.status,
        total_amount: parseFloat(o.total_amount || 0),
        placed_at: o.placed_at,
        item_label: firstItem.item_label || 'Milky Marble Cup',
        quantity: firstItem.quantity || 1,
        customer_name: (o.customers && o.customers.users && o.customers.users.full_name) || o.guest_name || 'Customer',
        cleanTitle, statusClass, statusLabel, scheduleText
      };
    });

    const { data: rawSchedule } = await supabase
      .from('orders')
      .select('id, order_number, status, placed_at, pickup_instructions')
      .in('status', ['PENDING_PAYMENT', 'PAID_VERIFIED', 'PREPARING', 'READY_FOR_PICKUP'])
      .not('pickup_instructions', 'is', null)
      .order('placed_at', { ascending: false })
      .limit(5);

    const scheduleList = (rawSchedule || []).map(sch => {
      const pDate = new Date(sch.placed_at);
      let dayName = pDate.toLocaleDateString('en-US', { weekday: 'long' });
      let timeStr = pDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

      const pickupMatch = sch.pickup_instructions ? sch.pickup_instructions.match(/Pick-up:\s*([^|]+)/i) : null;
      if (pickupMatch) {
        const cleanSched = pickupMatch[1].trim();
        const dateMatch = cleanSched.match(/([0-9]{4}-[0-9]{2}-[0-9]{2})/);
        const fullMatch = cleanSched.match(/([A-Za-z]+),\s*([A-Za-z]+)\s*([0-9]+).*·\s*([0-9:]+\s*[APM]+)/i);
        if (dateMatch) { dayName = new Date(dateMatch[1]).toLocaleDateString('en-US', { weekday: 'long' }); timeStr = 'Pick-up'; }
        else if (fullMatch) { dayName = fullMatch[1]; timeStr = fullMatch[4]; }
      }

      return { ...sch, dayName, timeStr };
    });

    return res.json({
      status: 'success',
      user: userProfile,
      metrics: { completedToday: finalCompleted, pendingOrders: pendingOrders || 0, inProduction: inProduction || 0, reservedStocks },
      recentOrders,
      scheduleList
    });
  } catch (error) {
    console.error('[production-supervisor/dashboard] error:', error.message);
    return res.status(500).json({ status: 'error', message: error.message });
  }
});

router.get('/production-supervisor/order-list', async (req, res) => {
  try {
    if (!supabase) return noDb(res);
    const userProfile = await getEmployeeProfile(req);

    const { count: pendingCount } = await supabase
      .from('orders').select('*', { count: 'exact', head: true }).in('status', ['PENDING_PAYMENT', 'PAID_VERIFIED']);
    const { count: inProgressCount } = await supabase
      .from('orders').select('*', { count: 'exact', head: true }).eq('status', 'PREPARING');
    const { count: completedCount } = await supabase
      .from('orders').select('*', { count: 'exact', head: true }).eq('status', 'COMPLETED');

    const { data: rawOrders } = await supabase
      .from('orders')
      .select('id, order_number, status, total_amount, placed_at, guest_name, customers(users(full_name)), order_items(item_label, quantity)')
      .neq('status', 'CANCELLED')
      .order('placed_at', { ascending: false });

    const ordersList = (rawOrders || []).map(ord => {
      const firstItem = (ord.order_items && ord.order_items[0]) || {};
      const cleanTitle = cleanItemLabel(firstItem.item_label, 'Milky Marble Cup');
      const size = String(firstItem.item_label || '').toLowerCase().includes('8oz') ? '8oz' : '12oz';

      const rawStatus = String(ord.status || '').toUpperCase();
      let statusClass = 'pending', statusLabel = 'Pending';
      if (rawStatus === 'PREPARING') { statusClass = 'inprogress'; statusLabel = 'In Progress'; }
      else if (rawStatus === 'COMPLETED' || rawStatus === 'READY_FOR_PICKUP') {
        statusClass = 'complete';
        statusLabel = rawStatus === 'READY_FOR_PICKUP' ? 'Ready' : 'Complete';
      }

      return {
        id: ord.id,
        order_number: ord.order_number,
        status: ord.status,
        total_amount: parseFloat(ord.total_amount || 0),
        placed_at: ord.placed_at,
        item_label: firstItem.item_label || 'Custom Marble Cup',
        quantity: firstItem.quantity || 1,
        customer_name: (ord.customers && ord.customers.users && ord.customers.users.full_name) || ord.guest_name || 'Customer',
        cleanTitle, size, statusClass, statusLabel
      };
    });

    const presetCards = [
      { name: 'Chocolatey Coffee Noodly Jelly', flavor: 'Coffee', cut: 'Spaghetti', toppings: ['Nuts', 'Chocolate Chips'], card_class: '' },
      { name: 'Cheesy Pandan Cubes', flavor: 'Pandan', cut: 'Cubes', toppings: ['Cheese', 'Tapioca Pearls'], card_class: 'green-card' },
      { name: 'Bubbly Coffee Jelly', flavor: 'Coffee', cut: 'Cubes', toppings: ['Marshmallows', 'Tapioca Pearls'], card_class: '' },
      { name: 'Strawberry String Party', flavor: 'Strawberry', cut: 'Spaghetti', toppings: ['Marshmallows', 'Sprinkles (Assorted)'], card_class: 'pink-card' }
    ];

    return res.json({
      status: 'success',
      user: userProfile,
      kpis: { pendingCount: pendingCount || 0, inProgressCount: inProgressCount || 0, completedCount: completedCount || 0 },
      ordersList,
      presetCards
    });
  } catch (error) {
    console.error('[production-supervisor/order-list] error:', error.message);
    return res.status(500).json({ status: 'error', message: error.message });
  }
});

router.get('/production-supervisor/order-production', async (req, res) => {
  try {
    if (!supabase) return noDb(res);
    const userProfile = await getEmployeeProfile(req);
    let requestedOrderId = parseInt(req.query.order_id || '0', 10);

    if (requestedOrderId <= 0) {
      const { data: fallback } = await supabase
        .from('orders').select('id')
        .in('status', ['PREPARING', 'PAID_VERIFIED', 'PENDING_PAYMENT'])
        .order('placed_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (fallback && fallback.id) requestedOrderId = fallback.id;
    }

    let orderData = {
      id: requestedOrderId || 0,
      orderCode: requestedOrderId ? `MM-${requestedOrderId}` : 'MM-0000',
      orderClient: 'Customer',
      orderStatus: 'PENDING',
      itemLabel: 'Chocolatey Coffee Noodly Jelly',
      flavorTag: 'Coffee',
      variationTag: 'Spaghetti'
    };

    if (requestedOrderId > 0) {
      const { data: order } = await supabase
        .from('orders')
        .select('id, order_number, status, guest_name, customers(users(full_name)), order_items(item_label, quantity)')
        .eq('id', requestedOrderId)
        .maybeSingle();

      if (order) {
        const firstItem = (order.order_items && order.order_items[0]) || {};
        const itemLabel = firstItem.item_label || 'Milky Marble Cup';

        let flavorTag = 'Coffee';
        if (itemLabel.toLowerCase().includes('strawberry')) flavorTag = 'Strawberry';
        else if (itemLabel.toLowerCase().includes('pandan')) flavorTag = 'Pandan';

        let variationTag = 'Spaghetti';
        if (itemLabel.toLowerCase().includes('cube')) variationTag = 'Cubes';
        else if (itemLabel.toLowerCase().includes('whole')) variationTag = 'Whole';

        orderData = {
          id: order.id,
          orderCode: order.order_number || `MM-${order.id}`,
          orderClient: (order.customers && order.customers.users && order.customers.users.full_name) || order.guest_name || 'Customer',
          orderStatus: (order.status || '').toUpperCase(),
          itemLabel, flavorTag, variationTag
        };
      }
    }

    const { data: invRows } = await supabase.from('inventory_items').select('*').order('id', { ascending: true });
    let materials;
    if (invRows && invRows.length > 0) {
      materials = invRows.map(inv => ({
        id: inv.id,
        name: inv.name,
        amount: parseFloat(inv.on_hand || 0),
        step: inv.unit_of_measure === 'pcs' ? 1 : 0.5,
        min: 0, max: 9999,
        unit: inv.unit_of_measure
      }));
    } else {
      materials = [
        { id: 1, name: '8oz Plastic Cups & Lids', amount: 1.0, step: 1, min: 1, max: 50, unit: 'pcs' },
        { id: 2, name: 'Coffee Jelly Powder', amount: 200.0, step: 10, min: 10, max: 1000, unit: 'grams' },
        { id: 3, name: 'Condensed Milk', amount: 1.5, step: 0.5, min: 0.5, max: 10, unit: 'cans' },
        { id: 4, name: 'Evaporated Milk', amount: 2.0, step: 0.5, min: 0.5, max: 10, unit: 'cans' }
      ];
    }

    return res.json({ status: 'success', user: userProfile, order: orderData, materials });
  } catch (error) {
    console.error('[production-supervisor/order-production] error:', error.message);
    return res.status(500).json({ status: 'error', message: error.message });
  }
});

router.post('/production-supervisor/complete-order', async (req, res) => {
  try {
    if (!supabase) return noDb(res);
    const { order_id } = req.body;
    if (!order_id) {
      return res.status(400).json({ status: 'error', message: 'Order ID is required.' });
    }

    const { error } = await supabase
      .from('orders')
      .update({ status: 'READY_FOR_PICKUP', completed_at: new Date().toISOString() })
      .eq('id', order_id);
    if (error) throw error;

    return res.json({ status: 'success', message: 'Order marked ready for pickup.' });
  } catch (error) {
    console.error('[production-supervisor/complete-order] error:', error.message);
    return res.status(500).json({ status: 'error', message: error.message });
  }
});

router.get('/production-supervisor/production-planning', async (req, res) => {
  try {
    if (!supabase) return noDb(res);
    const userProfile = await getEmployeeProfile(req);

    const todayStr = new Date().toISOString().split('T')[0];
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    // Seed a few starter plans the first time this table is empty, so the
    // page isn't blank on day one (mirrors the previous behavior).
    const { count: existingCount } = await supabase.from('production_orders').select('*', { count: 'exact', head: true });
    if (!existingCount) {
      await supabase.from('production_orders').insert([
        { order_code: 'MM-24081', operation: 'Coffee Jelly Classic Batch', target_liters: 18, due_date: todayStr, schedule_time: '08:00', status: 'IN PROGRESS' },
        { order_code: 'MM-24082', operation: 'Strawberry Delight Pick-up', target_liters: 12, due_date: todayStr, schedule_time: '13:30', status: 'PENDING' },
        { order_code: 'MM-24083', operation: 'Buko Pandan Supreme Batch', target_liters: 20, due_date: tomorrowStr, schedule_time: '08:00', status: 'PENDING' },
        { order_code: 'MM-24084', operation: 'Coffee Jelly Spaghetti Production', target_liters: 16, due_date: tomorrowStr, schedule_time: '14:00', status: 'PENDING' }
      ]);
    }

    // recipes is optional — degrade gracefully if it doesn't exist yet.
    let recipesList = [];
    try {
      const { data: rRows, error: rErr } = await supabase.from('recipes').select('id, flavor_name, yield_servings').order('flavor_name', { ascending: true });
      if (!rErr) recipesList = rRows || [];
    } catch { /* table missing — leave empty */ }

    const { data: todayPlans } = await supabase.from('production_orders').select('*').eq('due_date', todayStr).order('schedule_time', { ascending: true });
    const { data: tomorrowPlans } = await supabase.from('production_orders').select('*').eq('due_date', tomorrowStr).order('schedule_time', { ascending: true });
    const { data: allPlans } = await supabase.from('production_orders').select('*').order('due_date', { ascending: false }).order('schedule_time', { ascending: true });

    const curr = new Date();
    const first = curr.getDate() - curr.getDay() + 1;
    const monday = new Date(curr);
    monday.setDate(first);
    const sunday = new Date(curr);
    sunday.setDate(first + 6);
    const mText = monday.toLocaleDateString('en-US', { day: '2-digit', month: 'short' });
    const sText = sunday.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' });
    const dateRangeText = `${mText} — ${sText}`;

    return res.json({
      status: 'success',
      user: userProfile,
      dateRangeText,
      recipesList,
      todayPlans: todayPlans || [],
      tomorrowPlans: tomorrowPlans || [],
      allPlans: allPlans || []
    });
  } catch (error) {
    console.error('[production-supervisor/production-planning] error:', error.message);
    return res.status(500).json({ status: 'error', message: error.message });
  }
});

router.post('/production-supervisor/add-plan', async (req, res) => {
  try {
    if (!supabase) return noDb(res);
    const { operation, due_date, schedule_time, status } = req.body;
    if (!operation || !due_date || !schedule_time) {
      return res.status(400).json({ status: 'error', message: 'Operation name, due date, and schedule time are required.' });
    }

    const { count: totalCount } = await supabase.from('production_orders').select('*', { count: 'exact', head: true });
    const nextCode = 'MM-' + (24080 + (totalCount || 0) + 1);

    const { error } = await supabase.from('production_orders').insert([{
      order_code: nextCode, operation, target_liters: 10, due_date, schedule_time, status: status || 'PENDING'
    }]);
    if (error) throw error;

    return res.json({ status: 'success', message: 'Production plan created successfully.' });
  } catch (error) {
    console.error('[production-supervisor/add-plan] error:', error.message);
    return res.status(500).json({ status: 'error', message: error.message });
  }
});

router.post('/production-supervisor/edit-plan', async (req, res) => {
  try {
    if (!supabase) return noDb(res);
    const { plan_id, operation, due_date, schedule_time, status } = req.body;
    if (!plan_id || !operation) {
      return res.status(400).json({ status: 'error', message: 'Plan ID and operation name are required.' });
    }

    const { error } = await supabase.from('production_orders').update({
      operation, due_date, schedule_time, status: status || 'PENDING'
    }).eq('id', plan_id);
    if (error) throw error;

    return res.json({ status: 'success', message: 'Production plan updated successfully.' });
  } catch (error) {
    console.error('[production-supervisor/edit-plan] error:', error.message);
    return res.status(500).json({ status: 'error', message: error.message });
  }
});

module.exports = router;