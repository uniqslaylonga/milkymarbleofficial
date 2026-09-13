// server.js - Milky Marble Express Backend
require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const nodemailer = require('nodemailer');

// Import Auth Routes
const authRoutes = require('./src/routes/authRoutes');
const orderRoutes = require('./src/routes/orderRoutes');
const promoRoutes = require('./src/routes/promoRoutes');
const { router: paymentRoutes, webhookHandler: paymongoWebhookHandler } = require('./src/routes/paymentRoutes');

let bcrypt = null;
try {
  bcrypt = require('bcrypt');
} catch {
  try {
    bcrypt = require('bcryptjs');
  } catch {
    console.warn('[Notice] Neither bcrypt nor bcryptjs is installed. Run npm install bcrypt');
  }
}

const app = express();
const PORT = process.env.PORT || 3000;

const emailOtpStore = new Map();
const passwordOtpStore = new Map();

// In-Memory Cart Store per Customer
const memoryCartStore = new Map();

// ==========================================
// NODEMAILER TRANSPORTER SETUP
// ==========================================
const emailUser = process.env.EMAIL_USER || process.env.MAIL_USER || process.env.SMTP_USER;
const emailPass = process.env.EMAIL_PASS || process.env.MAIL_PASS || process.env.SMTP_PASS;

const transporter = nodemailer.createTransport({
  service: 'gmail',
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,
  auth: {
    user: emailUser,
    pass: emailPass
  }
});

transporter.verify((error) => {
  if (error) {
    console.warn('[SMTP Warning] Email service not ready:', error.message);
  } else {
    console.log('[SMTP Ready] Nodemailer is ready to send emails.');
  }
});

// ==========================================
// SUPABASE CLIENT SETUP
// ==========================================
let supabase = null;
try {
  const { createClient } = require('@supabase/supabase-js');
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (supabaseUrl && supabaseKey) {
    supabase = createClient(supabaseUrl, supabaseKey);
  }
} catch (e) {
  console.warn('[Notice] @supabase/supabase-js not loaded.');
}

// ==========================================
// OTP STORAGE (Supabase-backed, with in-memory fallback)
// ==========================================
// Plain JS Maps don't survive across serverless invocations reliably
// (Vercel can route requests to different warm instances), so OTPs and
// cart state should live in Supabase when it's configured. The Maps
// below are kept only as a fallback for local dev without Supabase.
async function setOtp(key, data) {
  if (supabase) {
    try {
      const { error } = await supabase.from('otp_codes').upsert({
        key,
        code: data.code,
        email: data.email || null,
        expires_at: new Date(data.expiresAt).toISOString()
      });
      if (!error) return;
    } catch (e) {
      console.warn('[OTP] Supabase write failed, using memory fallback:', e.message);
    }
  }
  const store = key.startsWith('pwd:') ? passwordOtpStore : emailOtpStore;
  store.set(key, data);
}

async function getOtp(key) {
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('otp_codes')
        .select('code, email, expires_at')
        .eq('key', key)
        .single();
      if (!error && data) {
        return { code: data.code, email: data.email, expiresAt: new Date(data.expires_at).getTime() };
      }
    } catch (e) {}
  }
  const store = key.startsWith('pwd:') ? passwordOtpStore : emailOtpStore;
  return store.get(key);
}

async function deleteOtp(key) {
  if (supabase) {
    try {
      await supabase.from('otp_codes').delete().eq('key', key);
    } catch (e) {}
  }
  const store = key.startsWith('pwd:') ? passwordOtpStore : emailOtpStore;
  store.delete(key);
}

// Native CORS Headers
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, x-customer-id');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// PayMongo webhook needs the raw body for signature verification —
// must be registered BEFORE express.json()
app.post('/api/payments/paymongo/webhook', express.raw({ type: 'application/json' }), paymongoWebhookHandler);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// ==========================================
// 1. STATIC FILE SERVING & ROUTE ALIASES
// ==========================================
app.use(express.static(path.join(__dirname, 'public')));
app.use('/customer', express.static(path.join(__dirname, 'public/customer')));
app.use('/images', express.static(path.join(__dirname, 'public/images')));
app.use('/images/uploads', express.static(
  process.env.VERCEL ? path.join('/tmp', 'uploads') : path.join(__dirname, 'public/images/uploads')
));
app.use('/customer/images', express.static(path.join(__dirname, 'public/images')));

// REDIRECT ALIAS: Awtomatikong dadalhin sa login.html kung tawagin man ang customerlogin.html
app.get(['/customerlogin.html', '/customer/customerlogin.html'], (req, res) => {
  const queryStr = req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '';
  res.redirect(`/customer/login.html${queryStr}`);
});

app.get('/customer/:page', (req, res, next) => {
  const filePath = path.join(__dirname, 'public/customer', req.params.page);
  res.sendFile(filePath, (err) => {
    if (err) next();
  });
});

app.get('/', (req, res) => {
  res.redirect('/customer/home.html');
});

function getCustomerId(req) {
  return req.headers['x-customer-id'] || req.query.customer_id || (req.body && req.body.customer_id) || 11;
}

// Helper: Kuhanin ang cart items ng customer mula sa Supabase o Memory
async function getCustomerCart(customerId) {
  const cIdStr = String(customerId);
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('cart_items')
        .select('*')
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false });
      if (!error && data && data.length > 0) return data;
    } catch (e) {}
  }
  return memoryCartStore.get(cIdStr) || [];
}

// ==========================================
// 2. LIVE RATINGS API (COMPUTED, HINDI HARDCODED)
// ==========================================
app.get('/api/ratings', async (req, res) => {
  if (!supabase) return res.json({ status: 'success', reviews: [], average_score: 0.0, review_count: 0 });
  try {
    const title = req.query.title;
    let query = supabase.from('ratings').select('*').order('created_at', { ascending: false });

    if (title) {
      const cleanTitle = title.replace(/^(8oz|12oz)\s+/i, '').trim();
      query = query.ilike('product_title', `%${cleanTitle}%`);
    }

    const { data: reviews, error } = await query;
    if (error) throw error;

    let computedAvg = 0.0;
    if (reviews && reviews.length > 0) {
      const sum = reviews.reduce((acc, r) => acc + (parseFloat(r.rating_score) || 0), 0);
      computedAvg = Number((sum / reviews.length).toFixed(1));
    }

    const formattedReviews = (reviews || []).map(r => ({
      ...r,
      reviewer_name: r.reviewer_name || 'Customer'
    }));

    return res.json({
      status: 'success',
      reviews: formattedReviews,
      average_score: computedAvg,
      review_count: reviews ? reviews.length : 0
    });
  } catch (err) {
    console.error('Ratings fetch error:', err);
    return res.json({ status: 'success', reviews: [], average_score: 0.0, review_count: 0 });
  }
});

app.get('/api/ratings/summary', async (req, res) => {
  if (!supabase) return res.json({ status: 'success', ratings: {} });
  try {
    const { data: allReviews, error } = await supabase
      .from('ratings')
      .select('product_title, rating_score');

    if (error) throw error;

    const summary = {};
    (allReviews || []).forEach(r => {
      const normKey = (r.product_title || '')
        .replace(/^(8oz|12oz)\s+/i, '')
        .replace(/\r?\n|\r/g, ' ')
        .trim()
        .toLowerCase();

      if (!summary[normKey]) {
        summary[normKey] = { sum: 0, count: 0 };
      }
      summary[normKey].sum += parseFloat(r.rating_score) || 0;
      summary[normKey].count += 1;
    });

    const calculatedRatings = {};
    Object.keys(summary).forEach(key => {
      calculatedRatings[key] = Number((summary[key].sum / summary[key].count).toFixed(1));
    });

    return res.json({ status: 'success', ratings: calculatedRatings });
  } catch (err) {
    return res.json({ status: 'success', ratings: {} });
  }
});

app.post('/api/ratings', async (req, res) => {
  if (!supabase) return res.status(500).json({ status: 'error', message: 'Database disconnected.' });
  try {
    const { customer_id, order_id, product_title, rating_score, tags, review_text } = req.body;
    const { data, error } = await supabase
      .from('ratings')
      .insert([{
        customer_id: customer_id || getCustomerId(req),
        order_id: order_id || null,
        product_title: product_title,
        rating_score: rating_score || 5,
        experience_tags: Array.isArray(tags) ? tags.join(', ') : tags,
        review_text: review_text || '',
        created_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (error) throw error;
    return res.json({ status: 'success', review: data });
  } catch (err) {
    return res.status(400).json({ status: 'error', message: err.message });
  }
});

// ==========================================
// 4. CART API ENDPOINTS (GET, POST, COUNT)
// ==========================================
app.get('/api/cart', async (req, res) => {
  try {
    const customerId = getCustomerId(req);
    const items = await getCustomerCart(customerId);
    return res.json({ status: 'success', items });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: 'Failed to load cart items.' });
  }
});

app.post('/api/cart', async (req, res) => {
  try {
    const customerId = req.body.customer_id || getCustomerId(req);
    const cIdStr = String(customerId);
    const { action, item, id, quantity, is_selected } = req.body;

    let cart = await getCustomerCart(customerId);

    if (action === 'add' && item) {
      const topStr = Array.isArray(item.toppings) ? item.toppings.join(', ') : (item.toppings || '');
      const existing = cart.find(i => 
        i.title === item.title &&
        i.size === item.size &&
        (i.flavor || '') === (item.flavor || '') &&
        (i.variation || '') === (item.variation || '') &&
        (i.toppings || '') === topStr &&
        (i.addons || '') === (item.addons || '')
      );

      if (existing) {
        existing.quantity = (parseInt(existing.quantity, 10) || 1) + (parseInt(item.quantity, 10) || 1);
      } else {
        const newItem = {
          id: `c_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
          customer_id: customerId,
          title: item.title,
          size: item.size || '12oz',
          flavor: item.flavor || '',
          variation: item.variation || '',
          toppings: topStr,
          addons: item.addons || '',
          unit_price: parseFloat(item.unit_price || 0),
          quantity: parseInt(item.quantity || 1, 10),
          is_selected: true,
          image: item.image || '',
          accent_color: item.accent_color || '#F48A8E',
          created_at: new Date().toISOString()
        };
        cart.unshift(newItem);
      }
      memoryCartStore.set(cIdStr, cart);

      if (supabase) {
        try {
          await supabase.from('cart_items').upsert(cart);
        } catch (e) {}
      }

      return res.json({ status: 'success', message: 'Item added to cart!', cart });
    }

    if (action === 'update_qty') {
      const target = cart.find(i => String(i.id) === String(id));
      if (target) {
        target.quantity = Math.max(1, parseInt(quantity, 10) || 1);
        memoryCartStore.set(cIdStr, cart);
        if (supabase) {
          try {
            await supabase.from('cart_items').update({ quantity: target.quantity }).eq('id', id);
          } catch (e) {}
        }
      }
      return res.json({ status: 'success', cart });
    }

    if (action === 'update_selection') {
      const target = cart.find(i => String(i.id) === String(id));
      if (target) {
        target.is_selected = Boolean(is_selected);
        memoryCartStore.set(cIdStr, cart);
        if (supabase) {
          try {
            await supabase.from('cart_items').update({ is_selected: target.is_selected }).eq('id', id);
          } catch (e) {}
        }
      }
      return res.json({ status: 'success', cart });
    }

    if (action === 'delete') {
      cart = cart.filter(i => String(i.id) !== String(id));
      memoryCartStore.set(cIdStr, cart);
      if (supabase) {
        try {
          await supabase.from('cart_items').delete().eq('id', id);
        } catch (e) {}
      }
      return res.json({ status: 'success', cart });
    }

    return res.json({ status: 'success', cart });
  } catch (err) {
    console.error('Cart operation error:', err);
    return res.status(500).json({ status: 'error', message: err.message });
  }
});

app.get('/api/cart/count', async (req, res) => {
  const customerId = getCustomerId(req);
  const cart = await getCustomerCart(customerId);
  const totalCups = cart.reduce((sum, it) => sum + (parseInt(it.quantity, 10) || 1), 0);
  return res.json({ count: totalCups });
});

// ==========================================
// 5. CUSTOMER & USER PROFILE API
// ==========================================
app.get('/api/customer/profile', async (req, res) => {
  try {
    const customerId = getCustomerId(req);

    if (!supabase) {
      return res.status(500).json({
        status: 'error',
        message: 'Database is disconnected. Check your Supabase configuration in .env.'
      });
    }

    const { data: customer, error: custErr } = await supabase
      .from('customers')
      .select('*')
      .eq('id', customerId)
      .single();

    if (custErr || !customer) {
      return res.status(404).json({ status: 'error', message: `Customer ID ${customerId} not found in database.` });
    }

    const targetUserId = customer.user_id || customer.id;
    const { data: userRecord, error: userErr } = await supabase
      .from('users')
      .select('*')
      .eq('id', targetUserId)
      .single();

    if (userErr || !userRecord) {
      return res.status(404).json({ status: 'error', message: `User record for Customer ID ${customerId} not found.` });
    }

    const pointsNum = parseFloat(customer.loyalty_points || 0);

    const combined = {
      ...customer,
      loyalty_points: Number(pointsNum.toFixed(2)),
      phone: customer.phone || customer.phone_number || '',
      phone_number: customer.phone || customer.phone_number || '',
      users: userRecord,
      avatar: userRecord.avatar || '/images/account.png',
      full_name: userRecord.full_name || '',
      username: userRecord.username || '',
      email: userRecord.email || '',
      last_username_update: userRecord.last_username_update || null
    };

    return res.json({
      status: 'success',
      data: combined,
      customer: combined
    });
  } catch (err) {
    console.error('Profile fetch error:', err);
    return res.status(500).json({ status: 'error', message: 'Internal server error loading profile.' });
  }
});

app.put('/api/customer/profile', async (req, res) => {
  try {
    if (!supabase) return res.status(500).json({ status: 'error', message: 'Database disconnected.' });

    const { full_name, username, phone_number, phone, avatar } = req.body;
    const targetCustomerId = getCustomerId(req);

    const { data: customer, error: custErr } = await supabase
      .from('customers')
      .select('*')
      .eq('id', targetCustomerId)
      .single();

    if (custErr || !customer) {
      return res.status(404).json({ status: 'error', message: 'Customer record not found.' });
    }

    const targetUserId = customer.user_id || customer.id;
    const userUpdate = {};

    if (avatar && avatar.startsWith('data:image')) {
      // NOTE: Vercel's filesystem is read-only except for /tmp, and /tmp is
      // wiped between invocations, so avatars saved here will NOT persist in
      // production. This keeps the upload from crashing the request, but for
      // real persistence, this should be changed to upload to Supabase
      // Storage (or S3/Cloudinary/etc.) instead of local disk.
      const uploadDir = process.env.VERCEL
        ? path.join('/tmp', 'uploads')
        : path.join(__dirname, 'public/images/uploads');
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }

      const matches = avatar.match(/^data:image\/([a-zA-Z0-9]+);base64,(.+)$/);
      if (matches) {
        const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
        const base64Data = matches[2];
        const fileName = `cust_${targetUserId}_${Date.now()}.${ext}`;
        const fullFilePath = path.join(uploadDir, fileName);

        fs.writeFileSync(fullFilePath, Buffer.from(base64Data, 'base64'));
        userUpdate.avatar = `/images/uploads/${fileName}`;
      }
    } else if (avatar) {
      userUpdate.avatar = avatar;
    }

    let updatedUser = null;
    if (targetUserId) {
      const { data: currentUserRecord } = await supabase
        .from('users')
        .select('username, last_username_update')
        .eq('id', targetUserId)
        .single();

      if (username !== undefined && currentUserRecord && username !== currentUserRecord.username) {
        if (currentUserRecord.last_username_update) {
          const lastUpdate = new Date(currentUserRecord.last_username_update);
          const now = new Date();
          const diffMs = now - lastUpdate;
          const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
          const cooldownDays = 30;

          if (diffDays < cooldownDays) {
            const daysRemaining = cooldownDays - diffDays;
            return res.status(400).json({
              status: 'error',
              message: `You can only change your username once every 30 days. Please wait ${daysRemaining} more day(s).`
            });
          }
        }

        userUpdate.username = username;
        userUpdate.last_username_update = new Date().toISOString();
      }

      if (full_name !== undefined) userUpdate.full_name = full_name;

      if (Object.keys(userUpdate).length > 0) {
        const { data: uData, error: uErr } = await supabase
          .from('users')
          .update(userUpdate)
          .eq('id', targetUserId)
          .select()
          .single();

        if (uErr) return res.status(400).json({ status: 'error', message: uErr.message });
        updatedUser = uData;
      }
    }

    const rawPhone = phone !== undefined ? phone : phone_number;
    let cleanPhone = null;

    if (rawPhone) {
      cleanPhone = rawPhone.toString().replace(/[^0-9]/g, '');

      if (!/^09\d{9}$/.test(cleanPhone)) {
        return res.status(400).json({
          status: 'error',
          message: 'Contact number must be an 11-digit number starting with 09 (e.g., 09123456789).'
        });
      }

      const { data: phoneOwner } = await supabase
        .from('customers')
        .select('id')
        .eq('phone', cleanPhone)
        .neq('id', targetCustomerId)
        .maybeSingle();

      if (phoneOwner) {
        return res.status(400).json({
          status: 'error',
          message: 'This contact number is already linked to another customer account.'
        });
      }
    }

    if (rawPhone !== undefined) {
      const phoneCol = ('phone' in customer) ? 'phone' : 'phone_number';
      const { error: phoneErr } = await supabase
        .from('customers')
        .update({ [phoneCol]: cleanPhone })
        .eq('id', targetCustomerId);

      if (phoneErr) return res.status(400).json({ status: 'error', message: phoneErr.message });
    }

    return res.json({
      status: 'success',
      message: 'Profile details saved successfully to database!',
      data: {
        ...customer,
        phone: cleanPhone,
        phone_number: cleanPhone,
        users: updatedUser || {}
      }
    });
  } catch (err) {
    console.error('Profile update error:', err);
    return res.status(500).json({ status: 'error', message: err.message || 'Server error updating profile.' });
  }
});

// ==========================================
// 6. EMAIL CHANGE & OTP ENDPOINTS
// ==========================================
app.post('/api/customer/email-otp', async (req, res) => {
  try {
    const { new_email } = req.body;
    if (!new_email) {
      return res.status(400).json({ status: 'error', message: 'New email is required.' });
    }

    const cleanEmail = new_email.toLowerCase().trim();
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();

    await setOtp(cleanEmail, {
      code: otpCode,
      expiresAt: Date.now() + 10 * 60 * 1000
    });

    try {
      await transporter.sendMail({
        from: `"Milky Marble" <${emailUser}>`,
        to: cleanEmail,
        subject: 'Milky Marble - Email Verification Code',
        html: `
          <div style="font-family: Arial, sans-serif; background: #FFF5F4; padding: 35px 20px; text-align: center;">
            <div style="max-width: 460px; margin: 0 auto; background: #FFFFFF; border-radius: 24px; padding: 32px 26px; border: 2px solid #FCE1DD;">
              <h2 style="color: #594A42;">Confirm your new email address</h2>
              <div style="background: #FDF1EE; border-radius: 16px; padding: 18px 10px; margin-bottom: 20px;">
                <span style="font-size: 34px; font-weight: 800; letter-spacing: 8px; color: #F48A8E;">${otpCode}</span>
              </div>
              <p style="color: #7C4F38; font-size: 13px;">This code will expire in 10 minutes.</p>
            </div>
          </div>
        `
      });

      return res.json({ status: 'success', message: `Verification code sent to ${cleanEmail}.` });
    } catch (mailErr) {
      console.error('[SMTP] Failed to send email-change OTP:', mailErr.message);
      return res.json({ status: 'success', message: `Code generated! Use ${otpCode} or 123456.` });
    }
  } catch (err) {
    console.error('SMTP Email Error:', err);
    return res.status(500).json({ status: 'error', message: 'Failed to send verification email. Please try again later.' });
  }
});

app.post('/api/customer/email-otp/verify', async (req, res) => {
  try {
    const { new_email, otp_code, customer_id } = req.body;
    const targetCustomerId = customer_id || getCustomerId(req);
    const cleanEmail = (new_email || '').toLowerCase().trim();

    const storedOtp = await getOtp(cleanEmail);
    const isCodeValid = Boolean(storedOtp && storedOtp.code === String(otp_code).trim() && Date.now() <= storedOtp.expiresAt);
    if (!isCodeValid) {
      return res.status(400).json({ status: 'error', message: 'Invalid or expired confirmation code.' });
    }

    await deleteOtp(cleanEmail);

    if (!supabase) {
      return res.status(500).json({ status: 'error', message: 'Database disconnected.' });
    }

    const { data: customer, error: custErr } = await supabase
      .from('customers')
      .select('id, user_id')
      .eq('id', targetCustomerId)
      .single();

    if (custErr || !customer) {
      return res.status(404).json({ status: 'error', message: 'Customer record not found.' });
    }

    const targetUserId = customer.user_id || customer.id;

    await supabase
      .from('users')
      .update({ email: cleanEmail })
      .eq('id', targetUserId);

    await supabase
      .from('customers')
      .update({ email: cleanEmail })
      .eq('id', targetCustomerId);

    return res.json({
      status: 'success',
      message: 'Email updated successfully in database!',
      new_email: cleanEmail
    });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: 'Failed to update email in database.' });
  }
});

// ==========================================
// 7. ACCOUNT SETTINGS & PASSWORD OTP
// ==========================================
app.post('/api/customer/request-password-otp', async (req, res) => {
  try {
    const { email, customer_id } = req.body;
    const customerId = customer_id || getCustomerId(req);
    let targetEmail = email;

    if (!targetEmail && supabase) {
      const { data: customer } = await supabase
        .from('customers')
        .select('user_id, email, users(email)')
        .eq('id', customerId)
        .single();

      if (customer) {
        targetEmail = (customer.users && customer.users.email) || customer.email;
      }
    }

    if (!targetEmail) targetEmail = emailUser;

    const cleanEmail = (targetEmail || '').toLowerCase().trim();
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();

    await setOtp(`pwd:${customerId}`, {
      code: otpCode,
      email: cleanEmail,
      expiresAt: Date.now() + 10 * 60 * 1000
    });

    try {
      await transporter.sendMail({
        from: `"Milky Marble Security" <${emailUser}>`,
        to: cleanEmail,
        subject: 'Milky Marble - Password Reset Security Code',
        html: `
          <div style="font-family: Arial, sans-serif; background: #FFF5F4; padding: 25px; text-align: center;">
            <div style="max-width: 440px; margin: 0 auto; background: #FFF; border-radius: 16px; padding: 25px; border: 1px solid #FCE1DD;">
              <h2 style="color: #594A42;">Change Password Verification</h2>
              <p style="color: #7C4F38;">Your security code is:</p>
              <h1 style="color: #F48A8E; letter-spacing: 6px;">${otpCode}</h1>
              <p style="color: #7C4F38; font-size: 12px;">Valid for 10 minutes.</p>
            </div>
          </div>
        `
      });
      return res.json({ status: 'success', message: 'Security code sent to your email.' });
    } catch (mailErr) {
      console.error('[SMTP] Failed to send password-reset OTP:', mailErr.message);
      return res.json({ status: 'success', message: `Code generated! Use ${otpCode} or 123456.` });
    }
  } catch (err) {
    console.error('SMTP Password Reset Error:', err);
    return res.status(500).json({ status: 'error', message: 'Failed to send security code to your email. Please try again later.' });
  }
});

app.post('/api/customer/change-password', async (req, res) => {
  try {
    const { current_password, new_password, otp_code, customer_id } = req.body;
    const customerId = customer_id || getCustomerId(req);

    if (!current_password || !new_password || !otp_code) {
      return res.status(400).json({ status: 'error', message: 'Please provide all required fields.' });
    }

    const storedOtp = await getOtp(`pwd:${customerId}`);
    const isCodeValid = Boolean(storedOtp && storedOtp.code === String(otp_code).trim() && Date.now() <= storedOtp.expiresAt);

    if (!isCodeValid) {
      return res.status(400).json({ status: 'error', message: 'Invalid or expired confirmation code.' });
    }

    const { data: customer } = await supabase
      .from('customers')
      .select('id, user_id')
      .eq('id', customerId)
      .single();

    if (!customer) return res.status(404).json({ status: 'error', message: 'Customer record not found.' });

    const targetUserId = customer.user_id || customer.id;
    const { data: userRecord } = await supabase
      .from('users')
      .select('id, password_hash')
      .eq('id', targetUserId)
      .single();

    if (!userRecord) return res.status(404).json({ status: 'error', message: 'User account not found.' });

    if (bcrypt && userRecord.password_hash) {
      let isMatch = false;
      const normalizedHash = userRecord.password_hash.replace(/^\$2y\$/, '$2a$').replace(/^\$2b\$/, '$2a$');
      
      try {
        isMatch = await bcrypt.compare(current_password, normalizedHash);
      } catch {
        isMatch = (current_password === userRecord.password_hash);
      }

      if (!isMatch && current_password !== userRecord.password_hash) {
        return res.status(400).json({ status: 'error', message: 'Current password does not match our records.' });
      }
    }

    const newHash = bcrypt ? await bcrypt.hash(new_password, 10) : new_password;

    const { error: passUpdateErr } = await supabase
      .from('users')
      .update({ password_hash: newHash })
      .eq('id', targetUserId);

    if (passUpdateErr) return res.status(400).json({ status: 'error', message: passUpdateErr.message });

    await deleteOtp(`pwd:${customerId}`);

    return res.json({ status: 'success', message: 'Your password has been changed successfully!' });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: 'Failed to update password.' });
  }
});

app.patch('/api/customer/preferences', async (req, res) => {
  try {
    const customerId = getCustomerId(req);
    const { key, value } = req.body;

    const validKeys = ['notify_pickup', 'notify_email_receipts', 'notify_promos'];
    if (!validKeys.includes(key)) {
      return res.status(400).json({ status: 'error', message: 'Invalid preference key.' });
    }

    if (supabase) {
      await supabase
        .from('customers')
        .update({ [key]: Boolean(value) })
        .eq('id', customerId);
    }

    return res.json({ status: 'success', message: 'Preference updated successfully!' });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: 'Failed to update preference.' });
  }
});

app.post('/api/customer/deactivate', async (req, res) => {
  try {
    const customerId = getCustomerId(req);

    if (supabase) {
      const { data: customer } = await supabase
        .from('customers')
        .select('user_id')
        .eq('id', customerId)
        .single();

      if (customer && customer.user_id) {
        await supabase
          .from('users')
          .update({ is_active: false })
          .eq('id', customer.user_id);
      }
    }

    return res.json({ status: 'success', message: 'Account deactivated.', redirect: 'customerlogin.html' });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: 'Failed to deactivate account.' });
  }
});

// ==========================================
// 8. AUTH ROUTES MOUNT
// ==========================================
app.use('/api/auth', authRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/promo', promoRoutes);
app.use('/api/payments/paymongo', paymentRoutes);

app.post('/api/auth/logout', (req, res) => res.json({ status: 'success', message: 'Logged out successfully.' }));

// Catch-all 404 handler
app.use((req, res) => {
  res.status(404).json({ status: 'error', message: 'Endpoint not found.' });
});

// Only bind a port when run directly (local dev / Docker).
// On Vercel the app is imported as a serverless function handler instead.
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server is running inside Docker on internal port ${PORT}`);
    console.log(`Access in browser at http://localhost:8001/customer/home.html`);
  });
}

module.exports = app;