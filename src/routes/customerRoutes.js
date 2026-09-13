// src/routes/customerRoutes.js
const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

// Supabase client initialization
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
);

// GET /api/customer/profile
router.get('/profile', async (req, res) => {
  try {
    const customerId = req.query.customer_id || req.headers['x-customer-id'] || 11;

    const { data: customer, error } = await supabase
      .from('customers')
      .select('id, full_name, username, email, phone_number, avatar, created_at')
      .eq('id', customerId)
      .single();

    if (error || !customer) {
      return res.status(404).json({
        status: 'error',
        message: 'Customer not found.'
      });
    }

    return res.json({
      status: 'success',
      customer: customer
    });
  } catch (err) {
    console.error('Profile fetch error:', err);
    return res.status(500).json({
      status: 'error',
      message: 'Server error loading profile.'
    });
  }
});

// PUT /api/customer/profile (para sa pag-update ng profile details)
router.put('/profile', async (req, res) => {
  try {
    const { customer_id, full_name, username, phone_number, avatar } = req.body;
    const targetId = customer_id || 11;

    const updatePayload = {};
    if (full_name !== undefined) updatePayload.full_name = full_name;
    if (username !== undefined) updatePayload.username = username;
    if (phone_number !== undefined) updatePayload.phone_number = phone_number;
    if (avatar !== undefined) updatePayload.avatar = avatar;

    const { data, error } = await supabase
      .from('customers')
      .update(updatePayload)
      .eq('id', targetId)
      .select()
      .single();

    if (error) {
      return res.status(400).json({ status: 'error', message: error.message });
    }

    return res.json({
      status: 'success',
      message: 'Profile updated successfully.',
      customer: data
    });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: 'Update failed.' });
  }
});

module.exports = router;