// src/routes/authRoutes.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const supabase = require('../config/supabase');

// 1. POST /api/auth/signup
router.post('/signup', async (req, res) => {
  try {
    const { fullname, username, email, password } = req.body;

    if (!fullname || !username || !email || !password) {
      return res.status(400).json({
        status: 'error',
        message: 'All fields are required.'
      });
    }

    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    const { data: user, error: userErr } = await supabase
      .from('users')
      .insert([
        {
          full_name: fullname.trim(),
          username: username.trim(),
          email: email.trim().toLowerCase(),
          password_hash: hashedPassword,
          user_type: 'customer',
          is_active: true
        }
      ])
      .select()
      .single();

    if (userErr) {
      if (userErr.code === '23505') {
        return res.status(400).json({
          status: 'error',
          message: 'Email or username is already registered.'
        });
      }
      throw userErr;
    }

    const { data: customer, error: custErr } = await supabase
      .from('customers')
      .insert([
        {
          user_id: user.id,
          loyalty_points: 0,
          notify_pickup: true,
          notify_email_receipts: true,
          notify_promos: false
        }
      ])
      .select()
      .single();

    if (custErr) {
      console.error('Customer link warning:', custErr.message);
    }

    res.json({
      status: 'success',
      message: 'Account created successfully!',
      user: {
        id: user.id,
        customer_id: customer ? customer.id : null,
        username: user.username,
        email: user.email,
        full_name: user.full_name,
        avatar: user.avatar || 'images/account.png',
        loyalty_points: customer ? customer.loyalty_points : 0
      }
    });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// 2. POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { user_or_email, password } = req.body;

    if (!user_or_email || !password) {
      return res.status(400).json({
        status: 'error',
        message: 'Username/email and password are required.'
      });
    }

    const cleanInput = user_or_email.trim().toLowerCase();

    const { data: user, error: userErr } = await supabase
      .from('users')
      .select('*')
      .or(`email.ilike.${cleanInput},username.ilike.${cleanInput}`)
      .eq('user_type', 'customer')
      .maybeSingle();

    if (userErr) throw userErr;

    if (!user) {
      return res.status(401).json({
        status: 'error',
        message: 'Invalid username/email or password.'
      });
    }

    if (!user.is_active) {
      return res.status(403).json({
        status: 'error',
        message: 'This account has been deactivated. Please contact support.'
      });
    }

    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({
        status: 'error',
        message: 'Invalid username/email or password.'
      });
    }

    let { data: customer } = await supabase
      .from('customers')
      .select('id, loyalty_points')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!customer) {
      const { data: newCustomer } = await supabase
        .from('customers')
        .insert([{ user_id: user.id, loyalty_points: 0 }])
        .select()
        .single();
      customer = newCustomer;
    }

    await supabase
      .from('users')
      .update({ last_login_at: new Date().toISOString() })
      .eq('id', user.id);

    return res.json({
      status: 'success',
      message: 'Login successful!',
      user: {
        id: user.id,
        customer_id: customer ? customer.id : null,
        username: user.username,
        email: user.email,
        full_name: user.full_name,
        avatar: user.avatar || 'images/account.png',
        loyalty_points: customer ? customer.loyalty_points : 0
      }
    });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
});

// 3. ALL /api/auth/logout
router.all('/logout', (req, res) => {
  res.clearCookie('remember_user', { path: '/' });
  res.clearCookie('user_id', { path: '/' });
  res.clearCookie('customer_id', { path: '/' });
  res.clearCookie('session_id', { path: '/' });

  if (req.session) {
    req.session.destroy(() => {
      res.clearCookie('connect.sid', { path: '/' });
      res.redirect('/customer/login.html?logged_out=1');
    });
  } else {
    res.redirect('/customer/login.html?logged_out=1');
  }
});

module.exports = router;