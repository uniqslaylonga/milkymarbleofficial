const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

// Supabase client initialization
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// 1. GET /api/sales-officer/dashboard - Live Dashboard Metrics & Register Lock State
router.get('/dashboard', async (req, res) => {
    try {
        const userId = req.headers['x-user-id'];
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        // A. Kunin ang user profile
        let user = { fullName: 'Employee', firstName: 'Employee' };
        if (userId) {
            const { data: userData } = await supabase
                .from('users')
                .select('full_name')
                .eq('id', userId)
                .single();
            if (userData) {
                user.fullName = userData.full_name;
                user.firstName = userData.full_name.split(' ')[0];
            }
        }

        // B. Alamin kung naka-lock ang rehistro sa araw na ito
        const { data: lockSetting } = await supabase
            .from('system_settings')
            .select('setting_value')
            .eq('setting_key', 'register_status')
            .single();

        const isLocked = lockSetting ? lockSetting.setting_value === 'LOCKED' : false;

        // C. Kunin ang orders ngayong araw
        const { data: todayOrdersData, error: ordersErr } = await supabase
            .from('orders')
            .select('id, order_number, customer_id, guest_name, total_amount, status, placed_at, payment_method, order_type')
            .gte('placed_at', todayStart.toISOString())
            .order('placed_at', { ascending: false });

        if (ordersErr) throw ordersErr;

        const todayOrders = todayOrdersData || [];
        const todaySales = todayOrders
            .filter(o => o.status !== 'CANCELLED')
            .reduce((sum, o) => sum + parseFloat(o.total_amount || 0), 0);
        const pendingOrders = todayOrders.filter(o => o.status === 'PENDING_PAYMENT' || o.status === 'CONFIRMED').length;

        // D. Revenue Split: Registered vs Guest
        let registeredRevenue = 0;
        let guestRevenue = 0;
        todayOrders.forEach(o => {
            if (o.status !== 'CANCELLED') {
                if (o.customer_id) registeredRevenue += parseFloat(o.total_amount || 0);
                else guestRevenue += parseFloat(o.total_amount || 0);
            }
        });

        return res.json({
            user,
            isLocked,
            metrics: {
                todayOrders: todayOrders.length,
                todaySales,
                pendingOrders
            },
            revenueSplit: {
                registeredRevenue,
                guestRevenue
            },
            recentOrders: todayOrders
        });
    } catch (err) {
        console.error('Error loading sales dashboard:', err);
        return res.status(500).json({ error: 'Failed to fetch dashboard data' });
    }
});

// 2. GET /api/sales-officer/x-reading - Live Snapshot para sa X-Reading Modal
router.get('/x-reading', async (req, res) => {
    try {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        const { data: orders, error } = await supabase
            .from('orders')
            .select('total_amount, payment_method, order_type, status')
            .gte('placed_at', todayStart.toISOString())
            .neq('status', 'CANCELLED');

        if (error) throw error;

        let gcashTotal = 0;
        let mayaTotal = 0;
        let walkinCashTotal = 0;
        let preordersCount = 0;
        let presetsCount = 0;

        (orders || []).forEach(o => {
            const amt = parseFloat(o.total_amount || 0);
            const method = (o.payment_method || '').toLowerCase();

            if (method.includes('gcash')) {
                gcashTotal += amt;
                preordersCount++;
            } else if (method.includes('maya')) {
                mayaTotal += amt;
                preordersCount++;
            } else {
                walkinCashTotal += amt;
                presetsCount++;
            }
        });

        const openingFloat = 1000.00;
        const expectedDrawer = openingFloat + walkinCashTotal;
        const grossTotal = gcashTotal + mayaTotal + walkinCashTotal;

        return res.json({
            preordersCount,
            presetsCount,
            gcashTotal,
            mayaTotal,
            digitalSubtotal: gcashTotal + mayaTotal,
            walkinCashTotal,
            openingFloat,
            expectedDrawer,
            grossTotal
        });
    } catch (err) {
        console.error('Error generating X-reading:', err);
        return res.status(500).json({ error: 'Failed to calculate X-Reading' });
    }
});

// 3. POST /api/sales-officer/z-reading - I-save sa `drawer_reconciliations` at I-lock ang Register
router.post('/z-reading', async (req, res) => {
    try {
        const userId = req.headers['x-user-id'] || null;
        const { actual_cash, expected_cash, variance, notes } = req.body;

        const periodStart = new Date();
        periodStart.setHours(10, 0, 0, 0); // 10:00 AM shift start
        const periodEnd = new Date(); // 3:00 PM cut-off

        // A. I-save sa `drawer_reconciliations` table
        const { data: reconciliation, error: recError } = await supabase
            .from('drawer_reconciliations')
            .insert({
                counted_amount: actual_cash,
                expected_amount: expected_cash,
                variance: variance,
                period_start: periodStart.toISOString(),
                period_end: periodEnd.toISOString(),
                notes: notes || 'Shift Z-Reading Transmitted from Sales Desk',
                recorded_by: userId
            })
            .select()
            .single();

        if (recError) throw recError;

        // B. I-update o i-set ang system lock sa `system_settings` table
        await supabase
            .from('system_settings')
            .upsert({
                setting_key: 'register_status',
                setting_value: 'LOCKED',
                description: 'Lockdown status after 3:00 PM Z-reading'
            }, { onConflict: 'setting_key' });

        return res.json({
            status: 'success',
            message: 'Z-Report transmitted and register locked',
            reconciliation
        });
    } catch (err) {
        console.error('Error saving Z-Reading:', err);
        return res.status(500).json({ error: 'Failed to record Z-Reading' });
    }
});

module.exports = router;