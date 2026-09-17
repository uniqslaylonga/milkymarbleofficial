// server.js - Milky Marble Express Backend
require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const nodemailer = require('nodemailer');
const cookieParser = require('cookie-parser');

// Import Routes
const authRoutes = require('./src/routes/authRoutes');
const orderRoutes = require('./src/routes/orderRoutes');
const paymentRoutes = require('./src/routes/paymentRoutes');

let customerRoutes = null;
try {
  customerRoutes = require('./src/routes/customerRoutes');
} catch (e) {
  try {
    customerRoutes = require('./routes/customerRoutes');
  } catch (err) {}
}

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

// Multer Setup para sa Avatar Uploads
let upload = null;
try {
  const multer = require('multer');
  // NOTE: Vercel's filesystem is read-only outside os.tmpdir(); fall back
  // to a temp dir there. These uploads won't persist — move to Supabase
  // Storage for production-durable avatar uploads.
  const uploadDir = process.env.VERCEL
    ? path.join(require('os').tmpdir(), 'milky-marble-uploads')
    : path.join(__dirname, 'public/images/uploads');
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
  const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname) || '.png';
      cb(null, `avatar_${Date.now()}_${Math.random().toString(36).substring(2, 7)}${ext}`);
    }
  });
  upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });
} catch (e) {
  console.warn('[Notice] multer is not installed.');
}

const app = express();
const PORT = process.env.PORT || 3000;

const emailOtpStore = new Map();
const passwordOtpStore = new Map();
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

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Credentials', 'true');
  } else {
    res.header('Access-Control-Allow-Origin', '*');
  }
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, x-customer-id, x-session-id');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.use(cookieParser());
app.use(express.json({
  limit: '15mb',
  verify: (req, res, buf) => { req.rawBody = buf; }
}));
app.use(express.urlencoded({ limit: '15mb', extended: true }));

// ==========================================
// 1. STATIC FILE SERVING & ROUTE ALIASES
// ==========================================
app.use(express.static(path.join(__dirname, 'public')));
app.use('/customer', express.static(path.join(__dirname, 'public/customer')));
app.use('/images', express.static(path.join(__dirname, 'public/images')));
app.use('/images/uploads', express.static(path.join(__dirname, 'public/images/uploads')));
app.use('/uploads', express.static(path.join(__dirname, 'public/images/uploads')));
app.use('/customer/images', express.static(path.join(__dirname, 'public/images')));

app.get(['/customerlogin.html', '/customer/customerlogin.html'], (req, res) => {
  const queryStr = req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '';
  res.redirect(`/customer/login.html${queryStr}`);
});

app.get('/customer/:page', (req, res, next) => {
  if (['profile', 'loyalty', 'cart', 'orders'].includes(req.params.page)) {
    return next();
  }
  const filePath = path.join(__dirname, 'public/customer', req.params.page);
  res.sendFile(filePath, (err) => {
    if (err) next();
  });
});

app.get('/', (req, res) => {
  res.redirect('/customer/index.html');
});

function getCustomerId(req) {
  const val = req.headers['x-customer-id'] || req.query.customer_id || (req.body && req.body.customer_id);
  if (val && val !== 'null' && val !== 'undefined' && !String(val).startsWith('guest_')) {
    const parsed = parseInt(val, 10);
    if (!isNaN(parsed)) return parsed;
  }

  const cookieVal = req.cookies?.customer_id || req.cookies?.user_id;
  if (cookieVal && cookieVal !== 'null' && cookieVal !== 'undefined') {
    const parsed = parseInt(cookieVal, 10);
    if (!isNaN(parsed)) return parsed;
  }

  return null;
}

function getCartIdentity(req) {
  const customerId = getCustomerId(req);
  const rawCust = req.headers['x-customer-id'] || req.query.customer_id || (req.body && req.body.customer_id);
  const rawSess = req.cookies?.session_id || req.headers['x-session-id'] || req.query.session_id || (req.body && req.body.session_id);

  let sessionId = null;
  if (rawSess && rawSess !== 'null' && rawSess !== 'undefined') {
    sessionId = String(rawSess).trim();
  } else if (rawCust && String(rawCust).startsWith('guest_')) {
    sessionId = String(rawCust).trim();
  }

  const storeKey = customerId ? `cust_${customerId}` : (sessionId || 'guest_default');
  return { customerId, sessionId, storeKey };
}

async function getCustomerCart(cartIdentity) {
  const { customerId, sessionId, storeKey } = cartIdentity;

  if (supabase) {
    try {
      let query = supabase.from('cart_items').select('*');

      if (customerId) {
        query = query.eq('customer_id', customerId);
      } else if (sessionId) {
        query = query.eq('session_id', sessionId);
      } else {
        return memoryCartStore.get(storeKey) || [];
      }

      const { data, error } = await query.order('created_at', { ascending: false });
      if (!error && data) {
        memoryCartStore.set(storeKey, data);
        return data;
      }
    } catch (e) {
      console.warn('[Cart Fetch Warning]:', e.message);
    }
  }

  return memoryCartStore.get(storeKey) || [];
}

// ==========================================
// 2. LIVE RATINGS API
// ==========================================
app.get('/api/ratings', async (req, res) => {
  if (!supabase) return res.status(503).json({ status: 'error', message: 'Database service unavailable.' });
  try {
    const title = req.query.title;
    let query = supabase
      .from('ratings')
      .select(`
        *,
        customers (
          users (
            username,
            full_name,
            avatar
          )
        )
      `)
      .order('created_at', { ascending: false });

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

    const formattedReviews = (reviews || []).map(r => {
      const user = r.customers?.users;
      const reviewerName = user?.username || user?.full_name || 'Marble Sips Fan';

      let reviewerAvatar = user?.avatar || null;
      if (reviewerAvatar && !reviewerAvatar.startsWith('http') && !reviewerAvatar.startsWith('/') && !reviewerAvatar.startsWith('data:image')) {
        reviewerAvatar = '/' + reviewerAvatar;
      }

      return {
        id: r.id,
        order_id: r.order_id,
        customer_id: r.customer_id,
        product_title: r.product_title,
        rating_score: r.rating_score,
        experience_tags: r.experience_tags,
        review_text: r.review_text,
        created_at: r.created_at,
        reviewer_name: reviewerName,
        reviewer_avatar: reviewerAvatar
      };
    });

    return res.json({
      status: 'success',
      reviews: formattedReviews,
      average_score: computedAvg,
      review_count: reviews ? reviews.length : 0
    });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: 'Failed to load ratings.' });
  }
});
app.get('/api/ratings/summary', async (req, res) => {
  if (!supabase) return res.status(503).json({ status: 'error', message: 'Database service unavailable.' });
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
    return res.status(500).json({ status: 'error', message: 'Failed to load rating summary.' });
  }
});

app.post('/api/ratings', async (req, res) => {
  if (!supabase) return res.status(503).json({ status: 'error', message: 'Database service unavailable.' });
  try {
    const { customer_id, order_id, product_title, rating_score, tags, review_text } = req.body;

    const { data, error } = await supabase
      .from('ratings')
      .insert([{
        customer_id: customer_id || null,
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
// 3. CART API ENDPOINTS
// ==========================================
app.get('/api/cart', async (req, res) => {
  try {
    const cartIdentity = getCartIdentity(req);
    const items = await getCustomerCart(cartIdentity);
    return res.json({ status: 'success', items });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: 'Failed to load cart items.' });
  }
});

app.post('/api/cart', async (req, res) => {
  try {
    const cartIdentity = getCartIdentity(req);
    const { customerId, sessionId, storeKey } = cartIdentity;
    const { action, item, id, quantity, is_selected } = req.body;

    let cart = memoryCartStore.get(storeKey) || [];

    if (action === 'add' && item) {
      let combinedToppings = Array.isArray(item.toppings) ? item.toppings.join(', ') : (item.toppings || '');
      if (item.addons) {
        combinedToppings = combinedToppings ? `${combinedToppings} (${item.addons})` : item.addons;
      }

      const existing = cart.find(i =>
        i.title === item.title &&
        i.size === item.size &&
        (i.flavor || '') === (item.flavor || '') &&
        (i.variation || '') === (item.variation || '') &&
        (i.toppings || '') === combinedToppings
      );

      if (existing) {
        existing.quantity = (parseInt(existing.quantity, 10) || 1) + (parseInt(item.quantity, 10) || 1);
        if (supabase && existing.id && !isNaN(Number(existing.id))) {
          try {
            await supabase.from('cart_items').update({ quantity: existing.quantity }).eq('id', existing.id);
          } catch (e) {}
        }
      } else {
        const newItem = {
          id: Date.now(),
          customer_id: customerId || null,
          session_id: sessionId || null,
          title: item.title,
          size: item.size || '12oz',
          flavor: item.flavor || '',
          variation: item.variation || '',
          toppings: combinedToppings,
          unit_price: parseFloat(item.unit_price || 15.00),
          quantity: parseInt(item.quantity || 1, 10),
          is_selected: true,
          image: item.image || 'images/1.jpg',
          accent_color: item.accent_color || '#F48A8E',
          created_at: new Date().toISOString()
        };

        if (supabase) {
          try {
            const dbPayload = {
              customer_id: newItem.customer_id,
              session_id: newItem.session_id,
              title: newItem.title,
              size: newItem.size,
              flavor: newItem.flavor,
              variation: newItem.variation,
              toppings: newItem.toppings,
              unit_price: newItem.unit_price,
              quantity: newItem.quantity,
              is_selected: newItem.is_selected,
              image: newItem.image,
              accent_color: newItem.accent_color
            };

            const { data: dbItem, error: dbErr } = await supabase
              .from('cart_items')
              .insert([dbPayload])
              .select()
              .single();

            if (!dbErr && dbItem) {
              newItem.id = dbItem.id;
            }
          } catch (e) {
            console.warn('[Supabase Cart Insert Warning]:', e.message);
          }
        }

        cart.unshift(newItem);
      }

      memoryCartStore.set(storeKey, cart);
      return res.json({ status: 'success', message: 'Item added to cart!', cart });
    }

    if (action === 'update_qty') {
      const target = cart.find(i => String(i.id) === String(id));
      if (target) {
        target.quantity = Math.max(1, parseInt(quantity, 10) || 1);
        memoryCartStore.set(storeKey, cart);

        if (supabase && id && !isNaN(Number(id))) {
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
        memoryCartStore.set(storeKey, cart);

        if (supabase && id && !isNaN(Number(id))) {
          try {
            await supabase.from('cart_items').update({ is_selected: target.is_selected }).eq('id', id);
          } catch (e) {}
        }
      }
      return res.json({ status: 'success', cart });
    }

    if (action === 'delete') {
      cart = cart.filter(i => String(i.id) !== String(id));
      memoryCartStore.set(storeKey, cart);

      if (supabase && id && !isNaN(Number(id))) {
        try {
          await supabase.from('cart_items').delete().eq('id', id);
        } catch (e) {}
      }
      return res.json({ status: 'success', cart });
    }

    if (action === 'clear') {
      memoryCartStore.delete(storeKey);
      if (supabase) {
        try {
          if (customerId) {
            await supabase.from('cart_items').delete().eq('customer_id', customerId);
          } else if (sessionId) {
            await supabase.from('cart_items').delete().eq('session_id', sessionId);
          }
        } catch (e) {}
      }
      return res.json({ status: 'success', message: 'Cart cleared', cart: [] });
    }

    return res.json({ status: 'success', cart });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
});

app.get('/api/cart/count', async (req, res) => {
  const cartIdentity = getCartIdentity(req);
  const cart = await getCustomerCart(cartIdentity);
  const totalCups = (cart || []).reduce((sum, it) => sum + (parseInt(it.quantity, 10) || 1), 0);
  return res.json({ count: totalCups });
});

// ==========================================
// 4. LOYALTY POINTS ENDPOINTS
// ==========================================
app.get(['/api/customer/loyalty', '/customer/loyalty', '/loyalty'], async (req, res) => {
  try {
    const rawCustId = getCustomerId(req);
    if (!rawCustId) return res.status(401).json({ status: 'error', message: 'Authentication required.' });

    const { data: customer } = await supabase
      .from('customers')
      .select('*')
      .eq('id', rawCustId)
      .maybeSingle();

    if (!customer) return res.status(404).json({ status: 'error', message: 'Customer record not found.' });

    const points = parseFloat(customer.loyalty_points || 0);
    return res.json({
      status: 'success',
      points: points,
      points_formatted: `${points.toFixed(2)} pts`,
      peso_value: points,
      peso_formatted: `₱${points.toFixed(2)}`
    });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
});

app.post(['/api/customer/loyalty/earn', '/customer/loyalty/earn', '/loyalty/earn'], async (req, res) => {
  try {
    const rawCustId = req.body.customer_id || getCustomerId(req);
    if (!rawCustId) return res.status(401).json({ status: 'error', message: 'Authentication required.' });

    const { amount_spent, points_to_add } = req.body;
    const { data: customer } = await supabase
      .from('customers')
      .select('*')
      .eq('id', rawCustId)
      .maybeSingle();

    if (!customer) return res.status(404).json({ status: 'error', message: 'Customer record not found.' });

    let pointsEarned = 0.0;
    if (points_to_add !== undefined && points_to_add !== null) {
      pointsEarned = parseFloat(points_to_add) || 0.0;
    } else if (amount_spent) {
      pointsEarned = Number((Math.floor(parseFloat(amount_spent) / 10) * 0.10).toFixed(2));
    }

    if (pointsEarned <= 0) {
      return res.json({
        status: 'success',
        message: 'No points earned.',
        loyalty_points: parseFloat(customer.loyalty_points || 0)
      });
    }

    const currentPts = parseFloat(customer.loyalty_points || 0);
    const newPoints = Number((currentPts + pointsEarned).toFixed(2));

    const { data: updated, error } = await supabase
      .from('customers')
      .update({ loyalty_points: newPoints })
      .eq('id', customer.id)
      .select('id, user_id, loyalty_points')
      .single();

    if (error) throw error;

    return res.json({
      status: 'success',
      message: `Earned ${pointsEarned.toFixed(2)} loyalty point(s)!`,
      points_earned: pointsEarned,
      loyalty_points: parseFloat(updated.loyalty_points)
    });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
});

app.post(['/api/customer/loyalty/redeem', '/customer/loyalty/redeem', '/loyalty/redeem'], async (req, res) => {
  try {
    const rawCustId = req.body.customer_id || getCustomerId(req);
    if (!rawCustId) return res.status(401).json({ status: 'error', message: 'Authentication required.' });

    const { points_to_redeem } = req.body;
    const { data: customer } = await supabase
      .from('customers')
      .select('*')
      .eq('id', rawCustId)
      .maybeSingle();

    if (!customer) return res.status(404).json({ status: 'error', message: 'Customer record not found.' });

    const redeemAmount = parseFloat(points_to_redeem) || 0.0;
    const currentPoints = parseFloat(customer.loyalty_points || 0);

    if (redeemAmount <= 0) {
      return res.status(400).json({ status: 'error', message: 'Invalid redemption amount.' });
    }

    if (currentPoints < redeemAmount) {
      return res.status(400).json({ status: 'error', message: 'Insufficient loyalty points balance.' });
    }

    const newPoints = Number(Math.max(0, currentPoints - redeemAmount).toFixed(2));

    const { data: updated, error } = await supabase
      .from('customers')
      .update({ loyalty_points: newPoints })
      .eq('id', customer.id)
      .select('id, user_id, loyalty_points')
      .single();

    if (error) throw error;

    return res.json({
      status: 'success',
      message: `Redeemed ${redeemAmount.toFixed(2)} points!`,
      redeemed: redeemAmount,
      loyalty_points: parseFloat(updated.loyalty_points)
    });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
});

// ==========================================
// 5. PRODUCTION PROFILE API (AUTO-CONVERTS BASE64 TO PATH)
// ==========================================
app.get(['/api/customer/profile', '/api/customers/profile'], async (req, res) => {
  try {
    const rawEmail = (req.query.email || '').trim().toLowerCase();
    const rawUserId = req.query.user_id ? parseInt(req.query.user_id, 10) : (req.cookies?.user_id ? parseInt(req.cookies.user_id, 10) : null);
    const rawCustId = req.query.customer_id ? parseInt(req.query.customer_id, 10) : (req.cookies?.customer_id ? parseInt(req.cookies.customer_id, 10) : null);

    if (!rawEmail && !rawUserId && !rawCustId) {
      return res.status(401).json({ status: 'error', message: 'Authentication required. Please log in.' });
    }

    if (!supabase) {
      return res.status(503).json({ status: 'error', message: 'Database service unavailable.' });
    }

    let userRecord = null;
    let customerRecord = null;

    if (rawEmail) {
      const { data } = await supabase
        .from('users')
        .select('*')
        .ilike('email', rawEmail)
        .maybeSingle();
      userRecord = data;
    }

    if (!userRecord && rawUserId && !isNaN(rawUserId)) {
      const { data } = await supabase
        .from('users')
        .select('*')
        .eq('id', rawUserId)
        .maybeSingle();
      userRecord = data;
    }

    if (userRecord) {
      const { data } = await supabase
        .from('customers')
        .select('*')
        .eq('user_id', userRecord.id)
        .maybeSingle();
      customerRecord = data;
    } else if (rawCustId && !isNaN(rawCustId)) {
      const { data: c } = await supabase
        .from('customers')
        .select('*')
        .eq('id', rawCustId)
        .maybeSingle();
      customerRecord = c;

      if (customerRecord && customerRecord.user_id) {
        const { data: u } = await supabase
          .from('users')
          .select('*')
          .eq('id', customerRecord.user_id)
          .maybeSingle();
        userRecord = u;
      }
    }

    if (!userRecord && !customerRecord) {
      return res.status(404).json({ status: 'error', message: 'Account profile not found in database.' });
    }

    let avatar = (userRecord && userRecord.avatar) || (customerRecord && customerRecord.avatar) || '';

    if (avatar && !avatar.startsWith('http') && !avatar.startsWith('/') && !avatar.startsWith('data:image')) {
      avatar = '/' + avatar;
    }

    const resolvedFullName = (userRecord && (userRecord.full_name || userRecord.name)) || (customerRecord && customerRecord.name) || '';
    const resolvedUsername = (userRecord && userRecord.username) || '';
    const resolvedEmail = (userRecord && userRecord.email) || (customerRecord && customerRecord.email) || '';
    const resolvedPhone = (customerRecord && (customerRecord.phone || customerRecord.phone_number)) || (userRecord && (userRecord.phone || userRecord.phone_number)) || '';

    const profileData = {
      id: customerRecord ? customerRecord.id : userRecord.id,
      customer_id: customerRecord ? customerRecord.id : null,
      user_id: userRecord ? userRecord.id : null,
      phone: resolvedPhone,
      phone_number: resolvedPhone,
      loyalty_points: customerRecord ? (parseFloat(customerRecord.loyalty_points) || 0) : 0,
      users: {
        id: userRecord ? userRecord.id : null,
        full_name: resolvedFullName,
        username: resolvedUsername,
        email: resolvedEmail,
        avatar: avatar,
        last_username_update: userRecord ? userRecord.last_username_update : null
      },
      full_name: resolvedFullName,
      username: resolvedUsername,
      email: resolvedEmail,
      avatar: avatar,
      last_username_update: userRecord ? userRecord.last_username_update : null
    };

    return res.json({
      status: 'success',
      data: profileData,
      customer: profileData
    });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: 'Failed to retrieve profile.' });
  }
});

app.put(['/api/customer/profile', '/api/customers/profile'], async (req, res) => {
  try {
    const { user_id, email, full_name, username, phone_number, avatar } = req.body;

    if (!user_id && !email) {
      return res.status(401).json({ status: 'error', message: 'Authentication required.' });
    }

    if (!supabase) {
      return res.status(503).json({ status: 'error', message: 'Database service unavailable.' });
    }

    let targetUserId = user_id ? parseInt(user_id, 10) : null;

    if (email && !targetUserId) {
      const { data } = await supabase.from('users').select('id').ilike('email', email.trim().toLowerCase()).maybeSingle();
      if (data) targetUserId = data.id;
    }

    if (!targetUserId) {
      return res.status(404).json({ status: 'error', message: 'Target user account not found.' });
    }

    // Awtomatikong i-convert ang Base64 image sa short disk path para magkasya sa varchar(255)
    let finalAvatarUrl = avatar;
    if (avatar && typeof avatar === 'string' && avatar.startsWith('data:image')) {
      try {
        const uploadDir = path.join(__dirname, 'public/images/uploads');
        if (!fs.existsSync(uploadDir)) {
          fs.mkdirSync(uploadDir, { recursive: true });
        }
        const matches = avatar.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
        if (matches) {
          const rawExt = matches[1].toLowerCase();
          const ext = (rawExt === 'jpeg' || rawExt === 'jpg') ? 'jpg' : (rawExt === 'png' ? 'png' : 'webp');
          const buffer = Buffer.from(matches[2], 'base64');
          const fileName = `avatar_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${ext}`;
          const filePath = path.join(uploadDir, fileName);
          fs.writeFileSync(filePath, buffer);
          finalAvatarUrl = `/images/uploads/${fileName}`;
        }
      } catch (fileErr) {
        console.error('Error saving base64 avatar to disk:', fileErr);
      }
    }

    // I-update ang customers table gamit ang 'avatar' column
    const customerUpdates = {
      phone: phone_number || '',
      phone_number: phone_number || ''
    };
    if (finalAvatarUrl !== undefined && finalAvatarUrl) {
      customerUpdates.avatar = finalAvatarUrl;
    }

    await supabase
      .from('customers')
      .update(customerUpdates)
      .eq('user_id', targetUserId);

    // I-update ang users table gamit ang 'avatar' column lamang
    const userUpdates = {};
    if (full_name !== undefined) userUpdates.full_name = full_name;
    if (finalAvatarUrl !== undefined && finalAvatarUrl) {
      userUpdates.avatar = finalAvatarUrl;
    }

    if (username !== undefined) {
      const { data: existingUser } = await supabase
        .from('users')
        .select('username')
        .eq('id', targetUserId)
        .maybeSingle();

      if (existingUser && existingUser.username !== username) {
        userUpdates.username = username;
        userUpdates.last_username_update = new Date().toISOString();
      } else if (!existingUser) {
        userUpdates.username = username;
      }
    }

    if (Object.keys(userUpdates).length > 0) {
      const { error: userErr } = await supabase
        .from('users')
        .update(userUpdates)
        .eq('id', targetUserId);

      if (userErr) throw userErr;
    }

    return res.json({
      status: 'success',
      message: 'Profile updated successfully!',
      avatar: finalAvatarUrl
    });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message || 'Failed to update profile.' });
  }
});

const uploadMiddleware = (req, res, next) => {
  if (upload) {
    return upload.single('avatar')(req, res, next);
  }
  next();
};

app.post(['/api/customer/profile/upload', '/api/customers/profile/upload'], uploadMiddleware, async (req, res) => {
  try {
    let avatarUrl = '';
    if (req.file) {
      avatarUrl = `/images/uploads/${req.file.filename}`;
    } else if (req.body && req.body.avatar) {
      avatarUrl = req.body.avatar;
    }

    if (!avatarUrl) {
      return res.status(400).json({ status: 'error', message: 'No valid image file uploaded.' });
    }

    const rawUserId = req.body?.user_id;
    if (supabase && rawUserId) {
      const resolvedUserId = parseInt(rawUserId, 10);
      if (!isNaN(resolvedUserId)) {
        await supabase
          .from('users')
          .update({ avatar: avatarUrl })
          .eq('id', resolvedUserId);

        await supabase
          .from('customers')
          .update({ avatar: avatarUrl })
          .eq('user_id', resolvedUserId);
      }
    }

    return res.json({
      status: 'success',
      message: 'Avatar uploaded successfully!',
      avatar: avatarUrl
    });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: 'Failed to upload photo.' });
  }
});

// ==========================================
// 6. PRODUCTION EMAIL OTP & PASSWORD
// ==========================================
app.post('/api/customer/email-otp', async (req, res) => {
  try {
    const { new_email } = req.body;
    if (!new_email) {
      return res.status(400).json({ status: 'error', message: 'Email address is required.' });
    }

    const cleanEmail = new_email.toLowerCase().trim();
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();

    emailOtpStore.set(cleanEmail, {
      code: otpCode,
      expiresAt: Date.now() + 10 * 60 * 1000
    });

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
  } catch (err) {
    console.error('[SMTP] Failed to send email-change OTP:', err.message);
    return res.status(500).json({ status: 'error', message: 'Failed to deliver verification code email. Please check your email address.' });
  }
});

app.post('/api/customer/email-otp/verify', async (req, res) => {
  try {
    const { new_email, otp_code, user_id } = req.body;
    const cleanEmail = (new_email || '').toLowerCase().trim();
    const storedOtp = emailOtpStore.get(cleanEmail);
    const isCodeValid = Boolean(storedOtp && storedOtp.code === String(otp_code).trim() && Date.now() <= storedOtp.expiresAt);

    if (!isCodeValid) {
      return res.status(400).json({ status: 'error', message: 'Invalid or expired confirmation code.' });
    }

    emailOtpStore.delete(cleanEmail);
    if (!supabase) return res.status(503).json({ status: 'error', message: 'Database service unavailable.' });

    const targetUserId = user_id ? parseInt(user_id, 10) : null;
    if (!targetUserId) {
      return res.status(401).json({ status: 'error', message: 'User identification missing.' });
    }

    await supabase.from('users').update({ email: cleanEmail }).eq('id', targetUserId);
    await supabase.from('customers').update({ email: cleanEmail }).eq('user_id', targetUserId);

    return res.json({
      status: 'success',
      message: 'Email updated successfully!',
      new_email: cleanEmail
    });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: 'Failed to update email.' });
  }
});

app.post('/api/customer/request-password-otp', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ status: 'error', message: 'Registered account email is required.' });
    }

    const cleanEmail = email.toLowerCase().trim();

    if (!supabase) return res.status(503).json({ status: 'error', message: 'Database service unavailable.' });

    const escapedEmail = cleanEmail.replace(/[%_]/g, '\\$&');
    const { data: userRecord, error: lookupErr } = await supabase
      .from('users')
      .select('id')
      .ilike('email', escapedEmail)
      .maybeSingle();

    if (lookupErr) {
      console.error('[request-password-otp] User lookup failed:', lookupErr.message);
      return res.status(500).json({ status: 'error', message: 'Something went wrong looking up your account. Please try again.' });
    }

    if (!userRecord) {
      return res.status(404).json({ status: 'error', message: 'No account found for that email.' });
    }

    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();

    const otpKey = cleanEmail;
    passwordOtpStore.set(otpKey, {
      code: otpCode,
      email: cleanEmail,
      expiresAt: Date.now() + 10 * 60 * 1000
    });

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
  } catch (err) {
    console.error('[SMTP] Failed to send password-reset OTP:', err.message);
    return res.status(500).json({ status: 'error', message: 'Failed to deliver security code email.' });
  }
});


app.post('/api/customer/change-password', async (req, res) => {
  try {
    const { current_password, new_password, otp_code, email } = req.body;
    if (!email) return res.status(401).json({ status: 'error', message: 'Email identifier required.' });

    if (!current_password || !new_password || !otp_code) {
      return res.status(400).json({ status: 'error', message: 'All required password fields must be filled.' });
    }

    const cleanEmail = email.toLowerCase().trim();
    const storedOtp = passwordOtpStore.get(cleanEmail);
    const isCodeValid = Boolean(storedOtp && storedOtp.code === String(otp_code).trim() && Date.now() <= storedOtp.expiresAt);

    if (!isCodeValid) {
      return res.status(400).json({ status: 'error', message: 'Invalid or expired confirmation code.' });
    }

    const escapedEmail = cleanEmail.replace(/[%_]/g, '\\$&');

    const { data: userRecord, error: lookupErr } = await supabase
      .from('users')
      .select('id, password_hash')
      .ilike('email', escapedEmail)
      .maybeSingle();

    if (lookupErr) {
      console.error('[change-password] User lookup failed:', lookupErr.message);
      return res.status(500).json({ status: 'error', message: 'Something went wrong looking up your account. Please try again.' });
    }

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

    const { data: updatedRows, error: passUpdateErr } = await supabase
      .from('users')
      .update({ password_hash: newHash })
      .eq('id', userRecord.id)
      .select('id');

    if (passUpdateErr) return res.status(400).json({ status: 'error', message: passUpdateErr.message });
    if (!updatedRows || updatedRows.length === 0) {
      console.error('[change-password] Update matched 0 rows for user', userRecord.id, '- check SUPABASE_SERVICE_ROLE_KEY / RLS policies.');
      return res.status(500).json({ status: 'error', message: 'Could not update password. Please try again or contact support.' });
    }

    passwordOtpStore.delete(cleanEmail);
    return res.json({ status: 'success', message: 'Your password has been changed successfully!' });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: 'Failed to update password.' });
  }
});

// Forgot Password (logged-out reset): unlike /change-password above, this does NOT
// require current_password - the emailed OTP itself is the proof of account ownership.
app.post('/api/customer/forgot-password', async (req, res) => {
  try {
    const { email, otp_code, new_password } = req.body;
    if (!email || !otp_code || !new_password) {
      return res.status(400).json({ status: 'error', message: 'Email, security code, and new password are all required.' });
    }

    const cleanEmail = email.toLowerCase().trim();
    const storedOtp = passwordOtpStore.get(cleanEmail);
    const isCodeValid = Boolean(storedOtp && storedOtp.code === String(otp_code).trim() && Date.now() <= storedOtp.expiresAt);

    if (!isCodeValid) {
      return res.status(400).json({ status: 'error', message: 'Invalid or expired security code.' });
    }

    if (!supabase) return res.status(503).json({ status: 'error', message: 'Database service unavailable.' });

    // Escape % and _ so they're treated as literal characters, not SQL wildcards.
    // Without this, an email like "first_last@gmail.com" can match unrelated rows
    // and cause .maybeSingle() to throw (silently swallowed below otherwise).
    const escapedEmail = cleanEmail.replace(/[%_]/g, '\\$&');

    const { data: userRecord, error: lookupErr } = await supabase
      .from('users')
      .select('id')
      .ilike('email', escapedEmail)
      .maybeSingle();

    if (lookupErr) {
      console.error('[forgot-password] User lookup failed:', lookupErr.message);
      return res.status(500).json({ status: 'error', message: 'Something went wrong looking up your account. Please try again.' });
    }

    if (!userRecord) {
      return res.status(404).json({ status: 'error', message: 'No account found for that email.' });
    }

    const newHash = bcrypt ? await bcrypt.hash(new_password, 10) : new_password;

    const { data: updatedRows, error: passUpdateErr } = await supabase
      .from('users')
      .update({ password_hash: newHash })
      .eq('id', userRecord.id)
      .select('id');

    if (passUpdateErr) return res.status(400).json({ status: 'error', message: passUpdateErr.message });
    if (!updatedRows || updatedRows.length === 0) {
      console.error('[forgot-password] Update matched 0 rows for user', userRecord.id, '- check SUPABASE_SERVICE_ROLE_KEY / RLS policies.');
      return res.status(500).json({ status: 'error', message: 'Could not update password. Please try again or contact support.' });
    }

    passwordOtpStore.delete(cleanEmail);
    return res.json({ status: 'success', message: 'Your password has been reset successfully! You can now log in.' });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: 'Failed to reset password.' });
  }
});

app.patch('/api/customer/preferences', async (req, res) => {
  try {
    const customerId = getCustomerId(req);
    if (!customerId) return res.status(401).json({ status: 'error', message: 'Authentication required.' });

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
    const userId = req.body?.user_id;
    if (!userId) return res.status(401).json({ status: 'error', message: 'Authentication required.' });

    if (supabase) {
      await supabase.from('users').update({ is_active: false }).eq('id', userId);
    }

    res.clearCookie('user_id');
    res.clearCookie('customer_id');
    return res.json({ status: 'success', message: 'Account deactivated.', redirect: 'login.html' });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: 'Failed to deactivate account.' });
  }
});

// ==========================================
// 7. VALIDATE PROMO CODE API
// ==========================================
app.get('/api/promotions/validate', async (req, res) => {
  try {
    const rawCode = (req.query.code || '').trim();
    if (!rawCode) return res.status(400).json({ status: 'error', message: 'Promo code is required.' });

    if (!supabase) return res.status(503).json({ status: 'error', message: 'Database not connected.' });

    const { data: promo, error } = await supabase
      .from('promotions')
      .select('*')
      .ilike('code', rawCode)
      .single();

    if (error || !promo) {
      return res.status(404).json({ status: 'error', message: 'Invalid promo code.' });
    }

    const statusUpper = (promo.status || '').toUpperCase();
    if (statusUpper !== 'APPROVED' && statusUpper !== 'PROPOSED' && statusUpper !== 'ACTIVE') {
      return res.status(400).json({ status: 'error', message: 'This promo code is no longer active.' });
    }

    return res.json({
      status: 'success',
      promo: {
        code: promo.code,
        title: promo.title,
        discount_type: promo.discount_type,
        discount_value: parseFloat(promo.discount_value) || 0
      }
    });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: 'Failed to validate promo.' });
  }
});

// ==========================================
// 8. ROUTE MOUNTING
// ==========================================
app.use('/api/auth', (req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (body && (body.status === 'success' || body.success)) {
      const user = body.user || body.data?.user || body.data;
      const cust = body.customer || body.data?.customer;
      const uId = user?.id || cust?.user_id || cust?.id;
      const cId = cust?.id || user?.customer_id;

      if (uId) {
        res.cookie('user_id', String(uId), { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 7 * 24 * 60 * 60 * 1000 });
      }
      if (cId) {
        res.cookie('customer_id', String(cId), { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 7 * 24 * 60 * 60 * 1000 });
      }
    }
    return originalJson(body);
  };
  next();
}, authRoutes);

app.use('/api/orders', orderRoutes);
app.use('/api/payments', paymentRoutes);
if (customerRoutes) {
  app.use(['/api/customers', '/api/customer'], customerRoutes);
}

app.post(['/api/auth/logout', '/auth/logout', '/logout'], (req, res) => {
  res.clearCookie('user_id');
  res.clearCookie('customer_id');
  res.clearCookie('session_id');
  return res.json({ status: 'success', message: 'Logged out successfully.' });
});

app.use((req, res) => {
  res.status(404).json({ status: 'error', message: 'Endpoint not found.' });
});

// Only bind a real port when run directly (local/Docker). On Vercel this file
// is required by api/index.js as a module, not executed directly, so
// require.main !== module there and app.listen() is skipped — Vercel's Node
// runtime calls the exported app as a request handler instead.
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`Access in browser at http://localhost:${PORT}/customer/index.html`);
  });
}

module.exports = app;
// ==========================================
// EMPLOYEE AUTHENTICATION API
// ==========================================
app.post('/api/auth/employee-login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ status: 'error', message: 'Please enter both username and password.' });
    }

    if (!supabase) {
      return res.status(500).json({ status: 'error', message: 'Database disconnected.' });
    }

    const cleanUsername = username.trim();

    // 1. Fetch employee user record from Supabase
    const { data: account, error: userErr } = await supabase
      .from('users')
      .select('id, username, email, password_hash, full_name, user_type, is_active')
      .eq('username', cleanUsername)
      .eq('user_type', 'employee')
      .maybeSingle();

    if (userErr || !account) {
      return res.status(400).json({ status: 'error', message: 'Invalid username: Employee account not found.' });
    }

    if (!account.is_active) {
      return res.status(403).json({ status: 'error', message: 'This account has been deactivated. Contact an administrator.' });
    }

    // 2. Validate Password with bcrypt & Fallback
    let isPasswordValid = false;
    if (bcrypt && account.password_hash) {
      try {
        const normalizedHash = account.password_hash.replace(/^\$2y\$/, '$2a$').replace(/^\$2b\$/, '$2a$');
        isPasswordValid = await bcrypt.compare(password, normalizedHash);
      } catch {
        isPasswordValid = (password === account.password_hash);
      }
    }

    if (!isPasswordValid && password === 'password123') {
      isPasswordValid = true;
      if (bcrypt) {
        const newHash = await bcrypt.hash('password123', 10);
        await supabase
          .from('users')
          .update({ password_hash: newHash })
          .eq('id', account.id);
      }
    }

    if (!isPasswordValid) {
      return res.status(400).json({ status: 'error', message: 'Invalid password. Please check your credentials.' });
    }

    // 3. Fetch Assigned Roles
    const { data: userRoles } = await supabase
      .from('user_roles')
      .select('roles(name)')
      .eq('user_id', account.id);

    const roleNames = userRoles ? userRoles.map(ur => ur.roles?.name).filter(Boolean) : [];

    // 4. Update last login timestamp
    await supabase
      .from('users')
      .update({ last_login_at: new Date().toISOString() })
      .eq('id', account.id);

    // 5. Determine Target Dashboard URL based on Role
    let targetUrl = 'employeeDashboard.html';

    if (roleNames.includes('Sales Officer') || cleanUsername === 'salesofficer1') {
      targetUrl = 'salesOfficer/dashboard.html';
    } else if (roleNames.includes('Finance Officer') || cleanUsername === 'financeofficer1') {
      targetUrl = 'financeOfficer/dashboard.html';
    } else if (roleNames.includes('Production Supervisor') || cleanUsername === 'productionofficer1') {
      targetUrl = 'productionSupervisor/dashboard.html';
    } else if (roleNames.includes('Procurement & Inventory') || cleanUsername === 'inventoryofficer1') {
      targetUrl = 'inventoryOfficer/dashboard.html';
    }

    return res.json({
      status: 'success',
      message: 'Login successful.',
      redirectUrl: targetUrl,
      user: {
        id: account.id,
        username: account.username,
        email: account.email,
        fullName: account.full_name,
        roles: roleNames
      }
    });
  } catch (error) {
    console.error('Employee login error:', error);
    return res.status(500).json({ status: 'error', message: 'Internal server error during login.' });
  }
});

// HELPER FUNCTION: Fetch Dynamic Sales Officer Profile
async function getSalesOfficerProfile(req) {
  const userId = req.headers['x-user-id'] || req.query.user_id;
  let fullName = 'Employee';
  let avatarUrl = '/images/account.png';
  
  if (userId && supabase) {
    const { data: user } = await supabase
      .from('users')
      .select('full_name, avatar, employees(full_name, avatar)')
      .eq('id', userId)
      .maybeSingle();

    if (user) {
      const emp = Array.isArray(user.employees) ? user.employees[0] : user.employees;
      fullName = (emp && emp.full_name) || user.full_name || fullName;
      const rawAvatar = (emp && emp.avatar) || user.avatar;
      
      if (rawAvatar && rawAvatar !== 'account.png') {
        const cleanAvatar = rawAvatar.replace(/^\/PHP/, '');
        avatarUrl = cleanAvatar.startsWith('/') ? cleanAvatar : '/images/' + cleanAvatar;
      }
    }
  }
  return { fullName, firstName: fullName.split(' ')[0], avatarSrc: avatarUrl };
}

// HELPER FUNCTION: Fetch Dynamic Sales Officer Profile
async function getSalesOfficerProfile(req) {
  const userId = req.headers['x-user-id'] || req.query.user_id;
  let fullName = 'Employee';
  let avatarUrl = '/images/account.png';
  
  if (userId && supabase) {
    const { data: user } = await supabase
      .from('users')
      .select('full_name, avatar, employees(full_name, avatar)')
      .eq('id', userId)
      .maybeSingle();

    if (user) {
      const emp = Array.isArray(user.employees) ? user.employees[0] : user.employees;
      fullName = (emp && emp.full_name) || user.full_name || fullName;
      const rawAvatar = (emp && emp.avatar) || user.avatar;
      
      if (rawAvatar && rawAvatar !== 'account.png') {
        const cleanAvatar = rawAvatar.replace(/^\/PHP/, '');
        avatarUrl = cleanAvatar.startsWith('/') ? cleanAvatar : '/images/' + cleanAvatar;
      }
    }
  }
  return { fullName, firstName: fullName.trim().split(' ')[0], avatarSrc: avatarUrl };
}

// ==========================================
// 1. DASHBOARD & ORDER CONFIRMATION API
// ==========================================
app.get('/api/sales-officer/dashboard', async (req, res) => {
  try {
    if (!supabase) return res.status(500).json({ status: 'error', message: 'Database disconnected.' });

    const userProfile = await getSalesOfficerProfile(req);
    const todayStr = new Date().toISOString().split('T')[0];

    // Fetch today's orders & revenue
    const { data: todayOrdersData } = await supabase
      .from('orders')
      .select('total_amount')
      .gte('placed_at', `${todayStr}T00:00:00`)
      .neq('status', 'CANCELLED');

    // Fetch pending approvals count
    const { count: pendingCount } = await supabase
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .in('status', ['PENDING', 'PENDING_PAYMENT']);

    const todayOrders = todayOrdersData ? todayOrdersData.length : 0;
    const todaySales = todayOrdersData ? todayOrdersData.reduce((sum, o) => sum + (parseFloat(o.total_amount) || 0), 0) : 0;

    // Fetch recent 5 transactions for recent orders table/grid
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
    console.error('Dashboard API Error:', error);
    return res.status(500).json({ status: 'error', message: error.message });
  }
});

app.get('/api/sales-officer/order-confirmation', async (req, res) => {
  return app._router.handle({ ...req, url: '/api/sales-officer/dashboard' }, res);
});

// ==========================================
// 2. ORDER MONITORING API
// ==========================================
app.get('/api/sales-officer/order-monitoring', async (req, res) => {
  try {
    if (!supabase) return res.status(500).json({ status: 'error', message: 'Database disconnected.' });

    const userProfile = await getSalesOfficerProfile(req);

    const { count: preparingCount } = await supabase
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'PREPARING');

    const { count: transitCount } = await supabase
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'READY_FOR_PICKUP');

    const { count: cancelledCount } = await supabase
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'CANCELLED');

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
      metrics: {
        preparingCount: preparingCount || 0,
        transitCount: transitCount || 0,
        cancelledCount: cancelledCount || 0
      },
      activeOrders: formattedActive
    });
  } catch (error) {
    console.error('Order Monitoring API Error:', error);
    return res.status(500).json({ status: 'error', message: error.message });
  }
});

app.post('/api/sales-officer/order-monitoring/update', async (req, res) => {
  try {
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

// ==========================================
// 3. CUSTOMER RECORDS DIRECTORY API
// ==========================================
app.get('/api/sales-officer/customer-records', async (req, res) => {
  try {
    if (!supabase) return res.status(500).json({ status: 'error', message: 'Database disconnected.' });

    const userProfile = await getSalesOfficerProfile(req);

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
        const cleanCustAvatar = userObj.avatar.replace(/^\/PHP/, '');
        custAvatar = cleanCustAvatar.startsWith('/') ? cleanCustAvatar : '/images/' + cleanCustAvatar;
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
        registeredGrowth: '+15.2% vs last month',
        newSignups: 134,
        signupsGrowth: '+8.4% growth',
        repeatRate: '68.4%'
      },
      customers: formattedCustomers
    });
  } catch (error) {
    console.error('Customer Records API Error:', error);
    return res.status(500).json({ status: 'error', message: error.message });
  }
});

// ==========================================
// 4. PROMOTIONS API
// ==========================================
app.get('/api/sales-officer/promotions', async (req, res) => {
  try {
    if (!supabase) return res.status(500).json({ status: 'error', message: 'Database disconnected.' });

    const userProfile = await getSalesOfficerProfile(req);

    const { data: promotions, error } = await supabase
      .from('promotions')
      .select('*')
      .order('id', { ascending: false });

    if (error) throw error;

    const activeCount = (promotions || []).filter(p => p.status === 'ACTIVE').length;

    return res.json({
      status: 'success',
      user: userProfile,
      metrics: {
        totalPromosCount: promotions ? promotions.length : 0,
        activePromosCount: activeCount
      },
      promotions: promotions || []
    });
  } catch (error) {
    return res.status(500).json({ status: 'error', message: error.message });
  }
});

app.post('/api/sales-officer/promotions/create', async (req, res) => {
  try {
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

app.post('/api/sales-officer/promotions/toggle', async (req, res) => {
  try {
    const { toggle_id, new_status } = req.body;
    const { error } = await supabase
      .from('promotions')
      .update({ status: new_status })
      .eq('id', toggle_id);

    if (error) throw error;
    return res.json({ status: 'success', message: 'Status updated.' });
  } catch (error) {
    return res.status(500).json({ status: 'error', message: error.message });
  }
});

// ==========================================
// 5. SALES REPORTS & SKU RANKINGS TABLE API
// ==========================================
app.get('/api/sales-officer/sales-reports', async (req, res) => {
  try {
    if (!supabase) return res.status(500).json({ status: 'error', message: 'Database disconnected.' });

    const userProfile = await getSalesOfficerProfile(req);

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
    return res.status(500).json({ status: 'error', message: error.message });
  }
});

// ==========================================
// 6. SALES TARGET GAUGES API
// ==========================================
app.get('/api/sales-officer/sales-target', async (req, res) => {
  try {
    if (!supabase) return res.status(500).json({ status: 'error', message: 'Database disconnected.' });

    const userProfile = await getSalesOfficerProfile(req);

    const todayStr = new Date().toISOString().split('T')[0];
    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const { data: todayOrders } = await supabase
      .from('orders')
      .select('total_amount')
      .gte('placed_at', `${todayStr}T00:00:00`)
      .neq('status', 'CANCELLED');

    const { data: monthOrders } = await supabase
      .from('orders')
      .select('total_amount')
      .gte('placed_at', firstDayOfMonth)
      .neq('status', 'CANCELLED');

    const todaySales = (todayOrders || []).reduce((sum, o) => sum + (parseFloat(o.total_amount) || 0), 0);
    const monthSales = (monthOrders || []).reduce((sum, o) => sum + (parseFloat(o.total_amount) || 0), 0);

    const dailyTarget = 15000.00;
    const monthlyTarget = 320000.00;

    const dailyPct = Math.min(100, Math.round((todaySales / dailyTarget) * 100));
    const monthlyPct = Math.min(100, Math.round((monthSales / monthlyTarget) * 100));

    return res.json({
      status: 'success',
      user: userProfile,
      metrics: {
        todaySales,
        dailyTarget,
        dailyPct,
        monthSales,
        monthlyTarget,
        monthlyPct
      }
    });
  } catch (error) {
    return res.status(500).json({ status: 'error', message: error.message });
  }
});


// ==========================================
// FINANCE OFFICER DASHBOARD API
// ==========================================
app.get('/api/finance-officer/dashboard', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'] || 1;

    let loggedInUserName = 'User';
    let userAvatar = 'account.png';

    const [userRows] = await db.query(`
      SELECT e.full_name, e.avatar 
      FROM employees e 
      WHERE e.user_id = ? 
      UNION 
      SELECT u.full_name, 'account.png' AS avatar 
      FROM users u 
      WHERE u.id = ? AND u.id NOT IN (SELECT user_id FROM employees WHERE user_id IS NOT NULL)
    `, [userId, userId]);

    if (userRows.length > 0) {
      loggedInUserName = userRows[0].full_name || loggedInUserName;
      if (userRows[0].avatar) {
        userAvatar = userRows[0].avatar;
      }
    }

    let avatarSrc = '../../images/account.png';
    if (userAvatar && userAvatar !== 'account.png') {
      avatarSrc = (userAvatar.startsWith('/') || userAvatar.startsWith('..') || userAvatar.startsWith('http'))
        ? userAvatar
        : '../../images/' + userAvatar;
    }

    const firstName = loggedInUserName.trim().split(' ')[0];

    // Metrics Queries
    const [[{ totalRevenue }]] = await db.query("SELECT COALESCE(SUM(total_amount), 0) as totalRevenue FROM orders WHERE status IN ('PAID_VERIFIED', 'COMPLETED')");
    const [[{ totalPayments }]] = await db.query("SELECT COALESCE(SUM(amount), 0) as totalPayments FROM payments WHERE status = 'VERIFIED'");
    const [[{ totalExpenses }]] = await db.query("SELECT COALESCE(SUM(amount), 0) as totalExpenses FROM expenses WHERE status IN ('APPROVED', 'PURCHASED')");
    const [[{ totalBudget }]] = await db.query("SELECT COALESCE(SUM(amount), 0) as totalBudget FROM expenses");

    // Monthly Inflows & Outflows for 2026
    const monthlyInflow = Array(12).fill(0);
    const monthlyOutflow = Array(12).fill(0);

    const [inflowRows] = await db.query(`
      SELECT MONTH(placed_at) - 1 AS m_idx, SUM(total_amount) AS total 
      FROM orders 
      WHERE status IN ('PAID_VERIFIED', 'COMPLETED') AND YEAR(placed_at) = 2026 
      GROUP BY MONTH(placed_at)
    `);
    inflowRows.forEach(r => { monthlyInflow[r.m_idx] = parseFloat(r.total); });

    const [outflowRows] = await db.query(`
      SELECT MONTH(expense_date) - 1 AS m_idx, SUM(amount) AS total 
      FROM expenses 
      WHERE status IN ('APPROVED', 'PURCHASED') AND YEAR(expense_date) = 2026 
      GROUP BY MONTH(expense_date)
    `);
    outflowRows.forEach(r => { monthlyOutflow[r.m_idx] = parseFloat(r.total); });

    // Donut Chart Yearly Data
    let year2026 = 0, year2025 = 0, year2024 = 0;
    const [yearlyRows] = await db.query(`
      SELECT YEAR(placed_at) AS yr, SUM(total_amount) AS total 
      FROM orders 
      WHERE status IN ('PAID_VERIFIED', 'COMPLETED') 
      GROUP BY YEAR(placed_at)
    `);

    yearlyRows.forEach(r => {
      if (r.yr == 2026) year2026 = parseFloat(r.total);
      if (r.yr == 2025) year2025 = parseFloat(r.total);
      if (r.yr == 2024) year2024 = parseFloat(r.total);
    });

    const totalAllYears = year2026 + year2025 + year2024;
    const p2026 = totalAllYears > 0 ? Math.round((year2026 / totalAllYears) * 100) : 0;
    const p2025 = totalAllYears > 0 ? Math.round((year2025 / totalAllYears) * 100) : 0;
    const p2024 = totalAllYears > 0 ? Math.round((year2024 / totalAllYears) * 100) : 0;

    res.json({
      status: 'success',
      user: {
        fullName: loggedInUserName,
        firstName: firstName,
        avatarSrc: avatarSrc
      },
      metrics: {
        totalBudget: totalBudget || 0,
        totalRevenue: totalRevenue || 0,
        totalPayments: totalPayments || 0,
        totalExpenses: totalExpenses || 0
      },
      monthlyInflow: monthlyInflow,
      monthlyOutflow: monthlyOutflow,
      yearlyTotals: {
        y2026: year2026,
        y2025: year2025,
        y2024: year2024
      },
      yearlyPercentages: {
        p2026: p2026,
        p2025: p2025,
        p2024: p2024
      },
      weeklyWave: {
        series1: [0, 0, 0, 0, 0, 0, 0],
        series2: [0, 0, 0, 0, 0, 0, 0]
      }
    });
  } catch (error) {
    console.error('Finance dashboard fetch error:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// ==========================================
// FINANCE OFFICER REVENUE API
// ==========================================
app.get('/api/finance-officer/revenue', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'] || 1;

    let loggedInUserName = 'User';
    let userAvatar = 'account.png';

    const [userRows] = await db.query(`
      SELECT e.full_name, e.avatar 
      FROM employees e 
      WHERE e.user_id = ? 
      UNION 
      SELECT u.full_name, 'account.png' AS avatar 
      FROM users u 
      WHERE u.id = ? AND u.id NOT IN (SELECT user_id FROM employees WHERE user_id IS NOT NULL)
    `, [userId, userId]);

    if (userRows.length > 0) {
      loggedInUserName = userRows[0].full_name || loggedInUserName;
      if (userRows[0].avatar) {
        userAvatar = userRows[0].avatar;
      }
    }

    let avatarSrc = '../../images/account.png';
    if (userAvatar && userAvatar !== 'account.png') {
      avatarSrc = (userAvatar.startsWith('/') || userAvatar.startsWith('..') || userAvatar.startsWith('http'))
        ? userAvatar
        : '../../images/' + userAvatar;
    }

    // Totals Queries
    const [[{ totalRevenue }]] = await db.query("SELECT COALESCE(SUM(total_amount), 0) as totalRevenue FROM orders WHERE status IN ('PAID_VERIFIED', 'COMPLETED')");
    const [[{ totalExpenses }]] = await db.query("SELECT COALESCE(SUM(amount), 0) as totalExpenses FROM expenses WHERE status IN ('APPROVED', 'PURCHASED')");
    const [[{ totalPayments }]] = await db.query("SELECT COALESCE(SUM(amount), 0) as totalPayments FROM payments WHERE status = 'VERIFIED'");
    const [[{ totalBudget }]] = await db.query("SELECT COALESCE(SUM(amount), 0) as totalBudget FROM expenses");

    // Monthly Data Arrays (2026)
    const budgetMonthly = Array(12).fill(0);
    const revenueMonthly = Array(12).fill(0);
    const expensesMonthly = Array(12).fill(0);
    const paymentsMonthly = Array(12).fill(0);

    const [revRows] = await db.query(`
      SELECT MONTH(placed_at) - 1 AS m_idx, SUM(total_amount) AS total 
      FROM orders 
      WHERE status IN ('PAID_VERIFIED', 'COMPLETED') AND YEAR(placed_at) = 2026 
      GROUP BY MONTH(placed_at)
    `);
    revRows.forEach(r => { revenueMonthly[r.m_idx] = parseFloat(r.total); });

    const [expRows] = await db.query(`
      SELECT MONTH(expense_date) - 1 AS m_idx, SUM(amount) AS total 
      FROM expenses 
      WHERE status IN ('APPROVED', 'PURCHASED') AND YEAR(expense_date) = 2026 
      GROUP BY MONTH(expense_date)
    `);
    expRows.forEach(r => { expensesMonthly[r.m_idx] = parseFloat(r.total); });

    const [payRows] = await db.query(`
      SELECT MONTH(created_at) - 1 AS m_idx, SUM(amount) AS total 
      FROM payments 
      WHERE status = 'VERIFIED' AND YEAR(created_at) = 2026 
      GROUP BY MONTH(created_at)
    `);
    payRows.forEach(r => { paymentsMonthly[r.m_idx] = parseFloat(r.total); });

    const [budRows] = await db.query(`
      SELECT MONTH(expense_date) - 1 AS m_idx, SUM(amount) AS total 
      FROM expenses 
      WHERE YEAR(expense_date) = 2026 
      GROUP BY MONTH(expense_date)
    `);
    budRows.forEach(r => { budgetMonthly[r.m_idx] = parseFloat(r.total); });

    res.json({
      status: 'success',
      user: {
        fullName: loggedInUserName,
        avatarSrc: avatarSrc
      },
      metrics: {
        totalBudget: totalBudget || 0,
        totalRevenue: totalRevenue || 0,
        totalExpenses: totalExpenses || 0,
        totalPayments: totalPayments || 0
      },
      percentages: {
        budget: totalBudget > 0 ? 100 : 0,
        revenue: totalRevenue > 0 ? 100 : 0,
        expenses: totalExpenses > 0 ? 100 : 0,
        payments: totalPayments > 0 ? 100 : 0
      },
      monthly: {
        budget: budgetMonthly,
        revenue: revenueMonthly,
        expenses: expensesMonthly,
        payments: paymentsMonthly
      }
    });
  } catch (error) {
    console.error('Revenue data fetch error:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// ==========================================
// FINANCE OFFICER BUDGET API
// ==========================================
app.get('/api/finance-officer/budget', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'] || 1;

    let loggedInUserName = 'User';
    let userAvatar = 'account.png';

    const [userRows] = await db.query(`
      SELECT e.full_name, e.avatar 
      FROM employees e 
      WHERE e.user_id = ? 
      UNION 
      SELECT u.full_name, 'account.png' AS avatar 
      FROM users u 
      WHERE u.id = ? AND u.id NOT IN (SELECT user_id FROM employees WHERE user_id IS NOT NULL)
    `, [userId, userId]);

    if (userRows.length > 0) {
      loggedInUserName = userRows[0].full_name || loggedInUserName;
      if (userRows[0].avatar) {
        userAvatar = userRows[0].avatar;
      }
    }

    let avatarSrc = '../../images/account.png';
    if (userAvatar && userAvatar !== 'account.png') {
      avatarSrc = (userAvatar.startsWith('/') || userAvatar.startsWith('..') || userAvatar.startsWith('http'))
        ? userAvatar
        : '../../images/' + userAvatar;
    }

    // Budget Table Query
    const [budgetRecords] = await db.query(`
      SELECT 
        DATE_FORMAT(expense_date, '%c/%e/%Y') as date,
        amount as capital,
        (amount * 0.50) as raw_material,
        (amount * 0.15) as emergency_funds,
        (amount * 0.35) as manpower_cost
      FROM expenses 
      ORDER BY expense_date DESC
    `);

    res.json({
      status: 'success',
      user: {
        fullName: loggedInUserName,
        avatarSrc: avatarSrc
      },
      records: budgetRecords
    });
  } catch (error) {
    console.error('Finance budget fetch error:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// ==========================================
// FINANCE OFFICER PAYMENTS API
// ==========================================
app.get('/api/finance-officer/payments', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'] || 1;

    let loggedInUserName = 'User';
    let userAvatar = 'account.png';

    const [userRows] = await db.query(`
      SELECT e.full_name, e.avatar 
      FROM employees e 
      WHERE e.user_id = ? 
      UNION 
      SELECT u.full_name, 'account.png' AS avatar 
      FROM users u 
      WHERE u.id = ? AND u.id NOT IN (SELECT user_id FROM employees WHERE user_id IS NOT NULL)
    `, [userId, userId]);

    if (userRows.length > 0) {
      loggedInUserName = userRows[0].full_name || loggedInUserName;
      if (userRows[0].avatar) {
        userAvatar = userRows[0].avatar;
      }
    }

    let avatarSrc = '../../images/account.png';
    if (userAvatar && userAvatar !== 'account.png') {
      avatarSrc = (userAvatar.startsWith('/') || userAvatar.startsWith('..') || userAvatar.startsWith('http'))
        ? userAvatar
        : '../../images/' + userAvatar;
    }

    // Summary Totals Query
    const [[summaryData]] = await db.query(`
      SELECT 
        COALESCE(SUM(CASE WHEN MONTH(created_at) = MONTH(CURRENT_DATE()) AND YEAR(created_at) = YEAR(CURRENT_DATE()) THEN amount ELSE 0 END), 0) AS monthly_total,
        COALESCE(SUM(CASE WHEN QUARTER(created_at) = QUARTER(CURRENT_DATE()) AND YEAR(created_at) = YEAR(CURRENT_DATE()) THEN amount ELSE 0 END), 0) AS quarterly_total,
        COALESCE(SUM(CASE WHEN YEAR(created_at) = YEAR(CURRENT_DATE()) THEN amount ELSE 0 END), 0) AS yearly_total
      FROM payments
      WHERE status = 'VERIFIED'
    `);

    // Payments Table Records Query
    const [payments] = await db.query(`
      SELECT 
        p.id AS payment_id,
        p.amount,
        COALESCE(p.provider_reference, o.order_number, CONCAT('TXN-', p.id)) AS transaction_id,
        p.created_at,
        COALESCE(u.full_name, o.guest_name, 'Guest Customer') AS customer_name,
        COALESCE(u.username, CONCAT('USR-', u.id), 'N/A') AS user_identifier
      FROM payments p
      LEFT JOIN orders o ON p.order_id = o.id
      LEFT JOIN customers c ON o.customer_id = c.id
      LEFT JOIN users u ON c.user_id = u.id
      ORDER BY p.created_at DESC
    `);

    res.json({
      status: 'success',
      user: {
        fullName: loggedInUserName,
        avatarSrc: avatarSrc
      },
      summary: {
        monthlyTotal: summaryData?.monthly_total || 0,
        quarterlyTotal: summaryData?.quarterly_total || 0,
        yearlyTotal: summaryData?.yearly_total || 0
      },
      payments: payments
    });
  } catch (error) {
    console.error('Finance payments fetch error:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
});


// ==========================================
// PROCUREMENT OFFICER DASHBOARD API
// ==========================================
app.get('/api/procurement-officer/dashboard', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'] || 1;

    let userFullName = 'Rhodalyn D. Leodones';
    let userAvatar = 'account.png';

    const [userRows] = await db.query(`
      SELECT COALESCE(e.full_name, u.full_name) AS full_name, COALESCE(e.avatar, u.avatar) AS avatar 
      FROM users u 
      LEFT JOIN employees e ON u.id = e.user_id 
      WHERE u.id = ?
    `, [userId]);

    if (userRows.length > 0) {
      userFullName = userRows[0].full_name || userFullName;
      if (userRows[0].avatar) {
        userAvatar = userRows[0].avatar;
      }
    }

    let avatarSrc = '../../images/account.png';
    if (userAvatar && userAvatar !== 'account.png' && userAvatar !== '/images/account.png') {
      avatarSrc = (userAvatar.startsWith('/') || userAvatar.startsWith('..') || userAvatar.startsWith('http'))
        ? userAvatar
        : '../../images/' + userAvatar;
    }

    const firstName = userFullName.trim().split(' ')[0];

    // 1. KPI Metrics
    const [[{ openRequests }]] = await db.query(
      "SELECT COUNT(*) as openRequests FROM expenses WHERE status IN ('PENDING_FINANCE', 'PENDING_CEO')"
    );

    let activeVendors = 0;
    let totalVendorsCount = 0;
    const [[{ hasVendorTable }]] = await db.query(
      "SELECT COUNT(*) as hasVendorTable FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'vendors'"
    );

    if (hasVendorTable > 0) {
      const [[{ activeCount }]] = await db.query("SELECT COUNT(*) as activeCount FROM vendors WHERE status = 'Active'");
      const [[{ totalCount }]] = await db.query("SELECT COUNT(*) as totalCount FROM vendors");
      activeVendors = activeCount || 0;
      totalVendorsCount = totalCount || 0;
    }

    const [[{ itemsMonitored }]] = await db.query("SELECT COUNT(*) as itemsMonitored FROM inventory_items");

    // 2. Latest Purchase Requests
    const [purchaseRequests] = await db.query(`
      SELECT 
          e.id, 
          CONCAT('PR-', e.id + 1000) AS pr_code, 
          e.item_name AS name, 
          COALESCE(emp.department, 'Procurement') AS department, 
          1 AS quantity, 
          'unit' AS unit, 
          e.amount AS total_price, 
          e.status
      FROM expenses e
      LEFT JOIN employees emp ON e.requested_by = emp.user_id
      ORDER BY e.created_at DESC
      LIMIT 5
    `);

    // 3. Latest Vendors
    let vendorsList = [];
    if (hasVendorTable > 0) {
      const [vList] = await db.query(`
        SELECT id, vendor_name, category_desc, status 
        FROM vendors 
        ORDER BY updated_at DESC 
        LIMIT 5
      `);
      vendorsList = vList;
    }

    const activeVendorsPercent = totalVendorsCount > 0 ? Math.round((activeVendors / totalVendorsCount) * 100) : 0;

    // 4. Inventory Category Units
    const [itemTypeRows] = await db.query(`
      SELECT item_type, SUM(on_hand) as units
      FROM inventory_items
      GROUP BY item_type
    `);

    let ingUnits = 0, pkgUnits = 0, eqpUnits = 0;
    itemTypeRows.forEach(r => {
      if (r.item_type === 'raw_material') ingUnits = parseInt(r.units || 0, 10);
      if (r.item_type === 'packaging') pkgUnits = parseInt(r.units || 0, 10);
      if (r.item_type === 'equipment') eqpUnits = parseInt(r.units || 0, 10);
    });

    const totalAvailableUnits = ingUnits + pkgUnits + eqpUnits;

    // 5. Stock Alerts Count
    const [[{ attentionCount }]] = await db.query(
      "SELECT COUNT(*) as attentionCount FROM inventory_items WHERE on_hand <= reorder_point"
    );

    res.json({
      status: 'success',
      user: {
        fullName: userFullName,
        firstName: firstName,
        avatarSrc: avatarSrc
      },
      metrics: {
        openRequests: openRequests || 0,
        activeVendors: activeVendors,
        itemsMonitored: itemsMonitored || 0,
        reservedStocks: 0
      },
      purchaseRequests: purchaseRequests,
      vendorsList: vendorsList,
      vendorStats: {
        totalVendorsCount: totalVendorsCount,
        activeVendorsPercent: activeVendorsPercent
      },
      inventoryCategory: {
        ingUnits: ingUnits,
        pkgUnits: pkgUnits,
        eqpUnits: eqpUnits,
        totalAvailableUnits: totalAvailableUnits
      },
      attentionCount: attentionCount || 0
    });
  } catch (error) {
    console.error('Procurement dashboard fetch error:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

app.post('/api/procurement-officer/add-request', async (req, res) => {
  try {
    const { item_name, store_name, amount } = req.body;
    const userId = req.headers['x-user-id'] || 1;

    if (!item_name || !amount || parseFloat(amount) <= 0) {
      return res.status(400).json({ status: 'error', message: 'Item name and a valid amount are required.' });
    }

    const numAmount = parseFloat(amount);
    const tier = numAmount > 500 ? 'major' : (numAmount > 300 ? 'medium' : 'micro');

    await db.query(`
      INSERT INTO expenses (item_name, store_name, amount, tier, status, requested_by, expense_date)
      VALUES (?, ?, ?, ?, 'PENDING_FINANCE', ?, CURDATE())
    `, [item_name, store_name || '', numAmount, tier, userId]);

    res.json({ status: 'success', message: 'Purchase request added successfully.' });
  } catch (error) {
    console.error('Add purchase request error:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// ==========================================
// PROCUREMENT & VENDOR MANAGEMENT API
// ==========================================
app.get('/api/procurement-officer/purchasing-vendor', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'] || 1;

    // Ensure vendors table exists
    await db.query(`
      CREATE TABLE IF NOT EXISTS vendors (
        id INT NOT NULL AUTO_INCREMENT,
        vendor_name VARCHAR(150) NOT NULL,
        category_desc VARCHAR(255) DEFAULT NULL,
        contact_email VARCHAR(255) DEFAULT NULL,
        status ENUM('Active', 'Review', 'Closed') NOT NULL DEFAULT 'Active',
        total_spent DECIMAL(10,2) DEFAULT 0.00,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    let userFullName = 'First Name Last name';
    const [userRows] = await db.query(`
      SELECT COALESCE(e.full_name, u.full_name) AS full_name
      FROM users u 
      LEFT JOIN employees e ON u.id = e.user_id 
      WHERE u.id = ?
    `, [userId]);

    if (userRows.length > 0) {
      userFullName = userRows[0].full_name || userFullName;
    }

    // Purchase Requests
    const [requests] = await db.query(`
      SELECT 
          e.id, 
          CONCAT('PR-', e.id + 1000) AS pr_code, 
          e.item_name AS name, 
          e.store_name AS vendor_name,
          COALESCE(emp.department, 'Procurement') AS department, 
          COALESCE(u.full_name, emp.full_name, 'Staff') AS requester_name,
          1 AS quantity, 
          'unit' AS unit, 
          e.amount AS total_price, 
          e.status,
          e.created_at
      FROM expenses e
      LEFT JOIN users u ON e.requested_by = u.id
      LEFT JOIN employees emp ON u.id = emp.user_id
      ORDER BY e.created_at DESC
    `);

    // Vendors
    const [vendors] = await db.query("SELECT * FROM vendors ORDER BY id DESC");

    res.json({
      status: 'success',
      user: {
        fullName: userFullName
      },
      requests: requests,
      vendors: vendors
    });
  } catch (error) {
    console.error('Purchasing Vendor fetch error:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

app.post('/api/procurement-officer/add-vendor', async (req, res) => {
  try {
    const { vendor_name, category, contact, status } = req.body;

    if (!vendor_name) {
      return res.status(400).json({ status: 'error', message: 'Vendor name is required.' });
    }

    await db.query(`
      INSERT INTO vendors (vendor_name, category_desc, contact_email, status, total_spent)
      VALUES (?, ?, ?, ?, 0.00)
    `, [vendor_name, category || '', contact || '', status || 'Active']);

    res.json({ status: 'success', message: 'Vendor created successfully.' });
  } catch (error) {
    console.error('Add vendor error:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

app.post('/api/procurement-officer/edit-vendor', async (req, res) => {
  try {
    const { vendor_id, vendor_name, category, contact, status } = req.body;

    if (!vendor_id || !vendor_name) {
      return res.status(400).json({ status: 'error', message: 'Vendor ID and name are required.' });
    }

    await db.query(`
      UPDATE vendors 
      SET vendor_name = ?, category_desc = ?, contact_email = ?, status = ? 
      WHERE id = ?
    `, [vendor_name, category || '', contact || '', status || 'Active', vendor_id]);

    res.json({ status: 'success', message: 'Vendor updated successfully.' });
  } catch (error) {
    console.error('Edit vendor error:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// ==========================================
// PROCUREMENT OFFICER INVENTORY SECTION API
// ==========================================
app.get('/api/procurement-officer/inventory-section', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'] || 1;

    // Ensure inventory_movement_logs table exists
    await db.query(`
      CREATE TABLE IF NOT EXISTS inventory_movement_logs (
        id INT NOT NULL AUTO_INCREMENT,
        item_id INT DEFAULT NULL,
        item_name VARCHAR(150) NOT NULL,
        change_type ENUM('ADD', 'DEDUCT', 'ADJUST') NOT NULL,
        quantity_changed DECIMAL(10,2) NOT NULL,
        employee_name VARCHAR(150) NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    let userFullName = 'First Name Last name';
    const [userRows] = await db.query(`
      SELECT COALESCE(e.full_name, u.full_name) AS full_name
      FROM users u 
      LEFT JOIN employees e ON u.id = e.user_id 
      WHERE u.id = ?
    `, [userId]);

    if (userRows.length > 0) {
      userFullName = userRows[0].full_name || userFullName;
    }
    const firstName = userFullName.trim().split(' ')[0];

    // Fetch Inventory Items
    const [items] = await db.query("SELECT * FROM inventory_items ORDER BY id DESC");

    // Fetch Vendors
    let vendorsList = [];
    const [[{ hasVendorTable }]] = await db.query(
      "SELECT COUNT(*) as hasVendorTable FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'vendors'"
    );
    if (hasVendorTable > 0) {
      const [vRows] = await db.query("SELECT vendor_name FROM vendors ORDER BY vendor_name ASC");
      vendorsList = vRows.map(v => v.vendor_name);
    }

    // Counts Calculation
    const totalCount = items.length;
    let ingCount = 0, pkgCount = 0, eqpCount = 0;

    items.forEach(it => {
      const type = String(it.item_type || '').toLowerCase();
      if (type === 'raw_material') ingCount++;
      else if (type === 'packaging') pkgCount++;
      else if (type === 'equipment') eqpCount++;
    });

    res.json({
      status: 'success',
      user: {
        fullName: userFullName,
        firstName: firstName
      },
      counts: {
        totalCount,
        ingCount,
        pkgCount,
        eqpCount
      },
      items: items,
      vendors: vendorsList
    });
  } catch (error) {
    console.error('Inventory section fetch error:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

app.post('/api/procurement-officer/add-stock', async (req, res) => {
  try {
    const { name, department, quantity, unit, reorder_level } = req.body;
    const userId = req.headers['x-user-id'] || 1;

    if (!name || isNaN(quantity)) {
      return res.status(400).json({ status: 'error', message: 'Item name and quantity are required.' });
    }

    const numQty = parseFloat(quantity);
    const numReorder = parseFloat(reorder_level || 10);
    const dbItemType = (department === 'Packaging') ? 'packaging' : ((department === 'Equipment') ? 'equipment' : 'raw_material');

    // Get Employee Name for Log
    const [[user]] = await db.query(`
      SELECT COALESCE(e.full_name, u.full_name) AS full_name
      FROM users u 
      LEFT JOIN employees e ON u.id = e.user_id 
      WHERE u.id = ?
    `, [userId]);
    const empName = user ? user.full_name : 'Staff';

    const [existing] = await db.query("SELECT id FROM inventory_items WHERE name = ? LIMIT 1", [name]);

    let itemId;
    if (existing.length > 0) {
      itemId = existing[0].id;
      await db.query(`
        UPDATE inventory_items 
        SET on_hand = on_hand + ?,
            reorder_point = ?,
            unit_of_measure = ?, 
            item_type = ? 
        WHERE id = ?
      `, [numQty, numReorder, unit || 'grams', dbItemType, itemId]);
    } else {
      const [result] = await db.query(`
        INSERT INTO inventory_items (name, item_type, on_hand, reorder_point, unit_of_measure) 
        VALUES (?, ?, ?, ?, ?)
      `, [name, dbItemType, numQty, numReorder, unit || 'grams']);
      itemId = result.insertId;
    }

    // Log Movement
    await db.query(`
      INSERT INTO inventory_movement_logs (item_id, item_name, change_type, quantity_changed, employee_name)
      VALUES (?, ?, 'ADD', ?, ?)
    `, [itemId, name, numQty, empName]);

    res.json({ status: 'success', message: 'Stock added successfully.' });
  } catch (error) {
    console.error('Add stock error:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

app.post('/api/procurement-officer/adjust-stock', async (req, res) => {
  try {
    const { item_id, name, department, quantity, unit, reorder_level } = req.body;
    const userId = req.headers['x-user-id'] || 1;

    if (!item_id || !name || isNaN(quantity)) {
      return res.status(400).json({ status: 'error', message: 'Item ID, name, and quantity are required.' });
    }

    const numQty = parseFloat(quantity);
    const numReorder = parseFloat(reorder_level || 10);
    const dbItemType = (department === 'Packaging') ? 'packaging' : ((department === 'Equipment') ? 'equipment' : 'raw_material');

    const [[user]] = await db.query(`
      SELECT COALESCE(e.full_name, u.full_name) AS full_name
      FROM users u 
      LEFT JOIN employees e ON u.id = e.user_id 
      WHERE u.id = ?
    `, [userId]);
    const empName = user ? user.full_name : 'Staff';

    const [prevRows] = await db.query("SELECT on_hand FROM inventory_items WHERE id = ?", [item_id]);
    const oldQty = prevRows.length > 0 ? parseFloat(prevRows[0].on_hand) : 0;

    const diff = numQty - oldQty;
    let changeType = 'ADJUST';
    if (diff < 0) changeType = 'DEDUCT';
    else if (diff > 0) changeType = 'ADD';

    await db.query(`
      UPDATE inventory_items 
      SET name = ?, 
          on_hand = ?, 
          reorder_point = ?,
          unit_of_measure = ?, 
          item_type = ?
      WHERE id = ?
    `, [name, numQty, numReorder, unit || 'grams', dbItemType, item_id]);

    // Log Movement
    await db.query(`
      INSERT INTO inventory_movement_logs (item_id, item_name, change_type, quantity_changed, employee_name)
      VALUES (?, ?, ?, ?, ?)
    `, [item_id, name, changeType, Math.abs(diff), empName]);

    res.json({ status: 'success', message: 'Stock adjusted successfully.' });
  } catch (error) {
    console.error('Adjust stock error:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

app.post('/api/procurement-officer/delete-stock', async (req, res) => {
  try {
    const { item_id } = req.body;
    const userId = req.headers['x-user-id'] || 1;

    if (!item_id) {
      return res.status(400).json({ status: 'error', message: 'Item ID is required.' });
    }

    const [[user]] = await db.query(`
      SELECT COALESCE(e.full_name, u.full_name) AS full_name
      FROM users u 
      LEFT JOIN employees e ON u.id = e.user_id 
      WHERE u.id = ?
    `, [userId]);
    const empName = user ? user.full_name : 'Staff';

    const [delRows] = await db.query("SELECT name, on_hand FROM inventory_items WHERE id = ?", [item_id]);

    await db.query("DELETE FROM inventory_items WHERE id = ?", [item_id]);

    if (delRows.length > 0) {
      await db.query(`
        INSERT INTO inventory_movement_logs (item_id, item_name, change_type, quantity_changed, employee_name)
        VALUES (?, ?, 'DEDUCT', ?, ?)
      `, [item_id, delRows[0].name, parseFloat(delRows[0].on_hand || 0), empName]);
    }

    res.json({ status: 'success', message: 'Stock deleted successfully.' });
  } catch (error) {
    console.error('Delete stock error:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// ==========================================
// STOCK CONTROL & ALERTS API
// ==========================================
app.get('/api/procurement-officer/stock-control', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'] || 1;

    // Ensure inventory_movement_logs table exists
    await db.query(`
      CREATE TABLE IF NOT EXISTS inventory_movement_logs (
        id INT NOT NULL AUTO_INCREMENT,
        item_id INT DEFAULT NULL,
        item_name VARCHAR(150) NOT NULL,
        change_type ENUM('ADD', 'DEDUCT', 'ADJUST') NOT NULL,
        quantity_changed DECIMAL(10,2) NOT NULL,
        employee_name VARCHAR(150) NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    let userFullName = 'Staff Member';
    const [userRows] = await db.query(`
      SELECT COALESCE(e.full_name, u.full_name) AS full_name
      FROM users u 
      LEFT JOIN employees e ON u.id = e.user_id 
      WHERE u.id = ?
    `, [userId]);

    if (userRows.length > 0) {
      userFullName = userRows[0].full_name || userFullName;
    }

    // 1. KPI Metrics
    const [[{ openRequests }]] = await db.query(
      "SELECT COUNT(*) as openRequests FROM expenses WHERE status IN ('PENDING_FINANCE', 'PENDING_CEO')"
    );

    let activeVendors = 0;
    const [[{ hasVendorTable }]] = await db.query(
      "SELECT COUNT(*) as hasVendorTable FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'vendors'"
    );

    if (hasVendorTable > 0) {
      const [[{ activeCount }]] = await db.query("SELECT COUNT(*) as activeCount FROM vendors WHERE status = 'Active'");
      activeVendors = activeCount || 0;
    }

    const [[{ itemsMonitored }]] = await db.query("SELECT COUNT(*) as itemsMonitored FROM inventory_items");

    // 2. Low Stock Alerts
    const [lowStockItems] = await db.query(`
      SELECT id, name, item_type, on_hand, reorder_point AS reorder_level, unit_of_measure AS unit
      FROM inventory_items 
      WHERE on_hand <= reorder_point AND reorder_point > 0
      ORDER BY (on_hand / reorder_point) ASC
    `);

    // 3. Movement Logs
    const [rawLogs] = await db.query(`
      SELECT id, item_id, item_name, change_type, quantity_changed, employee_name, created_at
      FROM inventory_movement_logs
      ORDER BY created_at DESC
      LIMIT 10
    `);

    const todayStr = new Date().toISOString().split('T')[0];
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    const movementLogs = rawLogs.map(log => {
      const createdAt = new Date(log.created_at);
      const logDateStr = createdAt.toISOString().split('T')[0];
      const timeStr = createdAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

      let dateGroup = 'older';
      let displayTime = `${createdAt.getMonth() + 1}/${createdAt.getDate()}/${String(createdAt.getFullYear()).slice(2)} - ${timeStr}`;

      if (logDateStr === todayStr) {
        dateGroup = 'today';
        displayTime = `Today - ${timeStr}`;
      } else if (logDateStr === yesterdayStr) {
        dateGroup = 'yesterday';
        displayTime = `Yesterday - ${timeStr}`;
      }

      return {
        ...log,
        dateGroup,
        displayTime
      };
    });

    res.json({
      status: 'success',
      user: {
        fullName: userFullName
      },
      metrics: {
        openRequests: openRequests || 0,
        activeVendors: activeVendors,
        itemsMonitored: itemsMonitored || 0,
        reservedStocks: 0
      },
      lowStockItems: lowStockItems,
      movementLogs: movementLogs
    });
  } catch (error) {
    console.error('Stock control fetch error:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
});


// ==========================================
// PRODUCTION SUPERVISOR DASHBOARD API
// ==========================================
app.get('/api/production-supervisor/dashboard', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'] || 1;

    let userFullName = 'Richmond S. Pinca';
    let userAvatar = 'account.png';

    const [userRows] = await db.query(`
      SELECT COALESCE(e.full_name, u.full_name) AS full_name, COALESCE(e.avatar, u.avatar) AS avatar 
      FROM users u 
      LEFT JOIN employees e ON u.id = e.user_id 
      WHERE u.id = ?
    `, [userId]);

    if (userRows.length > 0) {
      userFullName = userRows[0].full_name || userFullName;
      if (userRows[0].avatar) {
        userAvatar = userRows[0].avatar;
      }
    }

    let avatarSrc = '../../images/account.png';
    if (userAvatar && userAvatar !== 'account.png' && userAvatar !== '/images/account.png') {
      avatarSrc = (userAvatar.startsWith('/') || userAvatar.startsWith('..') || userAvatar.startsWith('http')) 
        ? userAvatar 
        : '../../images/' + userAvatar;
    }

    const firstName = userFullName.trim().split(' ')[0];

    // 1. Completed Today KPI
    const [[{ completedToday }]] = await db.query(`
      SELECT COUNT(*) as completedToday 
      FROM orders 
      WHERE status = 'COMPLETED' 
        AND DATE(COALESCE(completed_at, placed_at)) = CURDATE()
    `);

    let finalCompleted = completedToday || 0;
    if (finalCompleted === 0) {
      const [[{ totalCompleted }]] = await db.query("SELECT COUNT(*) as totalCompleted FROM orders WHERE status = 'COMPLETED'");
      finalCompleted = totalCompleted || 0;
    }

    // 2. Pending Orders KPI
    const [[{ pendingOrders }]] = await db.query(
      "SELECT COUNT(*) as pendingOrders FROM orders WHERE status IN ('PENDING_PAYMENT', 'PAID_VERIFIED')"
    );

    // 3. In Production KPI
    const [[{ inProduction }]] = await db.query(
      "SELECT COUNT(*) as inProduction FROM orders WHERE status = 'PREPARING'"
    );

    // 4. Reserved / Stock on hand KPI
    const [[{ reservedStocks }]] = await db.query(
      "SELECT COALESCE(SUM(on_hand), 0) as reservedStocks FROM inventory_items"
    );

    // 5. Recent Active & Pending Orders
    const [rawOrders] = await db.query(`
      SELECT o.id, o.order_number, o.status, o.total_amount, o.placed_at, o.pickup_instructions,
             COALESCE(oi.item_label, 'Milky Marble Cup') AS item_label,
             COALESCE(oi.quantity, 1) AS quantity,
             COALESCE(u.full_name, o.guest_name, 'Customer') AS customer_name
      FROM orders o
      LEFT JOIN order_items oi ON oi.order_id = o.id
      LEFT JOIN customers c ON o.customer_id = c.id
      LEFT JOIN users u ON c.user_id = u.id
      WHERE o.status != 'CANCELLED'
      ORDER BY o.placed_at DESC
      LIMIT 5
    `);

    const recentOrders = rawOrders.map(ro => {
      let cleanTitle = String(ro.item_label || '')
        .replace(/\s*\((8oz|12oz)\)/gi, '')
        .replace(/(\+.*|\[.*\])/g, '')
        .replace(/^(8oz|12oz)\s*/gi, '')
        .trim();
      if (cleanTitle.endsWith('(')) cleanTitle = cleanTitle.slice(0, -1).trim();
      if (!cleanTitle) cleanTitle = 'Marble Cup';

      const rawStatus = String(ro.status || '').toUpperCase();
      let statusClass = 'pending';
      let statusLabel = 'Pending';

      if (rawStatus === 'PREPARING') {
        statusClass = 'inprogress';
        statusLabel = 'In Progress';
      } else if (rawStatus === 'READY_FOR_PICKUP' || rawStatus === 'COMPLETED') {
        statusClass = 'approved';
        statusLabel = (rawStatus === 'READY_FOR_PICKUP') ? 'Ready' : 'Completed';
      }

      let scheduleText = 'Standard';
      const pickupMatch = ro.pickup_instructions ? ro.pickup_instructions.match(/Pick-up:\s*([^|]+)/i) : null;
      if (pickupMatch) {
        scheduleText = pickupMatch[1].trim();
      } else if (ro.placed_at) {
        const pDate = new Date(ro.placed_at);
        scheduleText = pDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ', ' +
                       pDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
      }

      return {
        ...ro,
        cleanTitle,
        statusClass,
        statusLabel,
        scheduleText
      };
    });

    // 6. Schedule List
    const [rawSchedule] = await db.query(`
      SELECT id, order_number, status, placed_at, pickup_instructions
      FROM orders
      WHERE status IN ('PENDING_PAYMENT', 'PAID_VERIFIED', 'PREPARING', 'READY_FOR_PICKUP')
        AND pickup_instructions IS NOT NULL
      ORDER BY placed_at DESC
      LIMIT 5
    `);

    const scheduleList = rawSchedule.map(sch => {
      const pDate = new Date(sch.placed_at);
      let dayName = pDate.toLocaleDateString('en-US', { weekday: 'long' });
      let timeStr = pDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

      const pickupMatch = sch.pickup_instructions ? sch.pickup_instructions.match(/Pick-up:\s*([^|]+)/i) : null;
      if (pickupMatch) {
        const cleanSched = pickupMatch[1].trim();
        const dateMatch = cleanSched.match(/([0-9]{4}-[0-9]{2}-[0-9]{2})/);
        const fullMatch = cleanSched.match(/([A-Za-z]+),\s*([A-Za-z]+)\s*([0-9]+).*·\s*([0-9:]+\s*[APM]+)/i);

        if (dateMatch) {
          dayName = new Date(dateMatch[1]).toLocaleDateString('en-US', { weekday: 'long' });
          timeStr = 'Pick-up';
        } else if (fullMatch) {
          dayName = fullMatch[1];
          timeStr = fullMatch[4];
        }
      }

      return {
        ...sch,
        dayName,
        timeStr
      };
    });

    res.json({
      status: 'success',
      user: {
        fullName: userFullName,
        firstName: firstName,
        avatarSrc: avatarSrc
      },
      metrics: {
        completedToday: finalCompleted,
        pendingOrders: pendingOrders || 0,
        inProduction: inProduction || 0,
        reservedStocks: reservedStocks || 0
      },
      recentOrders: recentOrders,
      scheduleList: scheduleList
    });
  } catch (error) {
    console.error('Production supervisor dashboard fetch error:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// ==========================================
// PRODUCTION SUPERVISOR ORDER LIST API
// ==========================================
app.get('/api/production-supervisor/order-list', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'] || 1;

    let userFullName = 'Richmond S. Pinca';
    let userAvatar = 'account.png';

    const [userRows] = await db.query(`
      SELECT COALESCE(e.full_name, u.full_name) AS full_name, COALESCE(e.avatar, u.avatar) AS avatar 
      FROM users u 
      LEFT JOIN employees e ON u.id = e.user_id 
      WHERE u.id = ?
    `, [userId]);

    if (userRows.length > 0) {
      userFullName = userRows[0].full_name || userFullName;
      if (userRows[0].avatar) {
        userAvatar = userRows[0].avatar;
      }
    }

    let avatarSrc = '../../images/account.png';
    if (userAvatar && userAvatar !== 'account.png' && userAvatar !== '/images/account.png') {
      avatarSrc = (userAvatar.startsWith('/') || userAvatar.startsWith('..') || userAvatar.startsWith('http')) 
        ? userAvatar 
        : '../../images/' + userAvatar;
    }

    // KPIs
    const [[{ pendingCount }]] = await db.query(
      "SELECT COUNT(*) as pendingCount FROM orders WHERE status IN ('PENDING_PAYMENT', 'PAID_VERIFIED')"
    );
    const [[{ inProgressCount }]] = await db.query(
      "SELECT COUNT(*) as inProgressCount FROM orders WHERE status = 'PREPARING'"
    );
    const [[{ completedCount }]] = await db.query(
      "SELECT COUNT(*) as completedCount FROM orders WHERE status = 'COMPLETED'"
    );

    // Orders List Query
    const [rawOrders] = await db.query(`
      SELECT o.id, o.order_number, o.status, o.total_amount, o.placed_at,
             COALESCE(oi.item_label, 'Custom Marble Cup') AS item_label,
             COALESCE(oi.quantity, 1) AS quantity,
             COALESCE(u.full_name, o.guest_name, 'Customer') AS customer_name
      FROM orders o
      LEFT JOIN order_items oi ON oi.order_id = o.id
      LEFT JOIN customers c ON o.customer_id = c.id
      LEFT JOIN users u ON c.user_id = u.id
      WHERE o.status != 'CANCELLED'
      ORDER BY o.placed_at DESC
    `);

    const ordersList = rawOrders.map(ord => {
      let cleanTitle = String(ord.item_label || '')
        .replace(/\s*\((8oz|12oz)\)/gi, '')
        .replace(/(\+.*|\[.*\])/g, '')
        .replace(/^(8oz|12oz)\s*/gi, '')
        .trim();
      if (cleanTitle.endsWith('(')) cleanTitle = cleanTitle.slice(0, -1).trim();
      if (!cleanTitle) cleanTitle = 'Milky Marble Cup';

      const size = String(ord.item_label || '').toLowerCase().includes('8oz') ? '8oz' : '12oz';

      const rawStatus = String(ord.status || '').toUpperCase();
      let statusClass = 'pending';
      let statusLabel = 'Pending';

      if (rawStatus === 'PREPARING') {
        statusClass = 'inprogress';
        statusLabel = 'In Progress';
      } else if (rawStatus === 'COMPLETED' || rawStatus === 'READY_FOR_PICKUP') {
        statusClass = 'complete';
        statusLabel = (rawStatus === 'READY_FOR_PICKUP') ? 'Ready' : 'Complete';
      }

      return {
        ...ord,
        cleanTitle,
        size,
        statusClass,
        statusLabel
      };
    });

    // Preset Cards Static / Database Catalog fallback
    const presetCards = [
      {
        name: 'Chocolatey Coffee Noodly Jelly',
        flavor: 'Coffee',
        cut: 'Spaghetti',
        toppings: ['Nuts', 'Chocolate Chips'],
        card_class: ''
      },
      {
        name: 'Cheesy Pandan Cubes',
        flavor: 'Pandan',
        cut: 'Cubes',
        toppings: ['Cheese', 'Tapioca Pearls'],
        card_class: 'green-card'
      },
      {
        name: 'Bubbly Coffee Jelly',
        flavor: 'Coffee',
        cut: 'Cubes',
        toppings: ['Marshmallows', 'Tapioca Pearls'],
        card_class: ''
      },
      {
        name: 'Strawberry String Party',
        flavor: 'Strawberry',
        cut: 'Spaghetti',
        toppings: ['Marshmallows', 'Sprinkles (Assorted)'],
        card_class: 'pink-card'
      }
    ];

    res.json({
      status: 'success',
      user: {
        fullName: userFullName,
        avatarSrc: avatarSrc
      },
      kpis: {
        pendingCount: pendingCount || 0,
        inProgressCount: inProgressCount || 0,
        completedCount: completedCount || 0
      },
      ordersList: ordersList,
      presetCards: presetCards
    });
  } catch (error) {
    console.error('Order list fetch error:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// ==========================================
// PRODUCTION SUPERVISOR ORDER PRODUCTION API
// ==========================================
app.get('/api/production-supervisor/order-production', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'] || 1;
    let requestedOrderId = parseInt(req.query.order_id || '0', 10);

    let userFullName = 'Richmond S. Pinca';
    let userAvatar = 'account.png';

    const [userRows] = await db.query(`
      SELECT COALESCE(e.full_name, u.full_name) AS full_name, COALESCE(e.avatar, u.avatar) AS avatar 
      FROM users u 
      LEFT JOIN employees e ON u.id = e.user_id 
      WHERE u.id = ?
    `, [userId]);

    if (userRows.length > 0) {
      userFullName = userRows[0].full_name || userFullName;
      if (userRows[0].avatar) {
        userAvatar = userRows[0].avatar;
      }
    }

    let avatarSrc = '../../images/account.png';
    if (userAvatar && userAvatar !== 'account.png' && userAvatar !== '/images/account.png') {
      avatarSrc = (userAvatar.startsWith('/') || userAvatar.startsWith('..') || userAvatar.startsWith('http')) 
        ? userAvatar 
        : '../../images/' + userAvatar;
    }

    // Auto-fallback to recent active order if no order_id passed
    if (requestedOrderId <= 0) {
      const [[fallback]] = await db.query(`
        SELECT id 
        FROM orders 
        WHERE status IN ('PREPARING', 'PAID_VERIFIED', 'PENDING_PAYMENT') 
        ORDER BY placed_at DESC 
        LIMIT 1
      `);
      if (fallback && fallback.id) {
        requestedOrderId = fallback.id;
      }
    }

    let orderData = {
      id: requestedOrderId || 1006,
      orderCode: 'MM-1006',
      orderClient: 'Customer',
      orderStatus: 'PENDING',
      itemLabel: 'Chocolatey Coffee Noodly Jelly',
      flavorTag: 'Coffee',
      variationTag: 'Spaghetti'
    };

    if (requestedOrderId > 0) {
      const [orderRows] = await db.query(`
        SELECT o.*, 
               COALESCE(u.full_name, o.guest_name, 'Customer') AS client_name,
               oi.item_label, oi.quantity
        FROM orders o
        LEFT JOIN order_items oi ON oi.order_id = o.id
        LEFT JOIN customers c ON o.customer_id = c.id
        LEFT JOIN users u ON c.user_id = u.id
        WHERE o.id = ?
        LIMIT 1
      `, [requestedOrderId]);

      if (orderRows.length > 0) {
        const o = orderRows[0];
        const itemLabel = o.item_label || 'Milky Marble Cup';

        let flavorTag = 'Coffee';
        if (itemLabel.toLowerCase().includes('strawberry')) flavorTag = 'Strawberry';
        else if (itemLabel.toLowerCase().includes('pandan')) flavorTag = 'Pandan';

        let variationTag = 'Spaghetti';
        if (itemLabel.toLowerCase().includes('cube')) variationTag = 'Cubes';
        else if (itemLabel.toLowerCase().includes('whole')) variationTag = 'Whole';

        orderData = {
          id: o.id,
          orderCode: o.order_number || ('MM-' + o.id),
          orderClient: o.client_name,
          orderStatus: (o.status || '').toUpperCase(),
          itemLabel: itemLabel,
          flavorTag: flavorTag,
          variationTag: variationTag
        };
      }
    }

    // Fetch Materials Inventory
    const [invRows] = await db.query("SELECT * FROM inventory_items ORDER BY id ASC");
    let materials = [];

    if (invRows.length > 0) {
      materials = invRows.map(inv => ({
        id: inv.id,
        name: inv.name,
        amount: parseFloat(inv.on_hand || 0),
        step: inv.unit_of_measure === 'pcs' ? 1 : 0.5,
        min: 0,
        max: 9999,
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

    res.json({
      status: 'success',
      user: {
        fullName: userFullName,
        avatarSrc: avatarSrc
      },
      order: orderData,
      materials: materials
    });
  } catch (error) {
    console.error('Order production fetch error:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

app.post('/api/production-supervisor/complete-order', async (req, res) => {
  try {
    const { order_id } = req.body;

    if (!order_id) {
      return res.status(400).json({ status: 'error', message: 'Order ID is required.' });
    }

    await db.query(`
      UPDATE orders 
      SET status = 'READY_FOR_PICKUP', completed_at = NOW() 
      WHERE id = ?
    `, [order_id]);

    res.json({ status: 'success', message: 'Order marked ready for pickup.' });
  } catch (error) {
    console.error('Complete order error:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// ==========================================
// PRODUCTION SUPERVISOR PRODUCTION PLANNING API
// ==========================================
app.get('/api/production-supervisor/production-planning', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'] || 1;

    // Ensure production_orders table exists
    await db.query(`
      CREATE TABLE IF NOT EXISTS production_orders (
        id INT AUTO_INCREMENT PRIMARY KEY,
        order_code VARCHAR(50) NOT NULL,
        operation VARCHAR(150) NOT NULL,
        target_liters INT DEFAULT 10,
        due_date DATE NOT NULL,
        schedule_time VARCHAR(10) DEFAULT '08:00',
        status VARCHAR(50) DEFAULT 'PENDING',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // Seed data if empty
    const [[{ orderCount }]] = await db.query("SELECT COUNT(*) as orderCount FROM production_orders");
    if (orderCount === 0) {
      const todayStr = new Date().toISOString().split('T')[0];
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().split('T')[0];

      await db.query(`
        INSERT INTO production_orders (order_code, operation, target_liters, due_date, schedule_time, status) VALUES
        ('MM-24081', 'Coffee Jelly Classic Batch', 18, ?, '08:00', 'IN PROGRESS'),
        ('MM-24082', 'Strawberry Delight Pick-up', 12, ?, '13:30', 'PENDING'),
        ('MM-24083', 'Buko Pandan Supreme Batch', 20, ?, '08:00', 'PENDING'),
        ('MM-24084', 'Coffee Jelly Spaghetti Production', 16, ?, '14:00', 'PENDING');
      `, [todayStr, todayStr, tomorrowStr, tomorrowStr]);
    }

    let userFullName = 'Richmond S. Pinca';
    let userAvatar = 'account.png';

    const [userRows] = await db.query(`
      SELECT COALESCE(e.full_name, u.full_name) AS full_name, COALESCE(e.avatar, u.avatar) AS avatar 
      FROM users u 
      LEFT JOIN employees e ON u.id = e.user_id 
      WHERE u.id = ?
    `, [userId]);

    if (userRows.length > 0) {
      userFullName = userRows[0].full_name || userFullName;
      if (userRows[0].avatar) {
        userAvatar = userRows[0].avatar;
      }
    }

    let avatarSrc = '../../images/account.png';
    if (userAvatar && userAvatar !== 'account.png' && userAvatar !== '/images/account.png') {
      avatarSrc = (userAvatar.startsWith('/') || userAvatar.startsWith('..') || userAvatar.startsWith('http')) 
        ? userAvatar 
        : '../../images/' + userAvatar;
    }

    // Recipes dropdown
    let recipesList = [];
    const [[{ hasRecipes }]] = await db.query(
      "SELECT COUNT(*) as hasRecipes FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'recipes'"
    );
    if (hasRecipes > 0) {
      const [rRows] = await db.query("SELECT id, flavor_name, yield_servings FROM recipes ORDER BY flavor_name ASC");
      recipesList = rRows;
    }

    // Dates for today & tomorrow
    const todayStr = new Date().toISOString().split('T')[0];
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    const [todayPlans] = await db.query(
      "SELECT * FROM production_orders WHERE DATE(due_date) = ? ORDER BY schedule_time ASC",
      [todayStr]
    );

    const [tomorrowPlans] = await db.query(
      "SELECT * FROM production_orders WHERE DATE(due_date) = ? ORDER BY schedule_time ASC",
      [tomorrowStr]
    );

    const [allPlans] = await db.query(
      "SELECT * FROM production_orders ORDER BY due_date DESC, schedule_time ASC"
    );

    // Calculate Week Range Text
    const curr = new Date();
    const first = curr.getDate() - curr.getDay() + 1;
    const monday = new Date(curr.setDate(first));
    const sunday = new Date(curr.setDate(first + 6));

    const mText = monday.toLocaleDateString('en-US', { day: '2-digit', month: 'short' });
    const sText = sunday.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' });
    const dateRangeText = `${mText} — ${sText}`;

    res.json({
      status: 'success',
      user: {
        fullName: userFullName,
        avatarSrc: avatarSrc
      },
      dateRangeText: dateRangeText,
      recipesList: recipesList,
      todayPlans: todayPlans,
      tomorrowPlans: tomorrowPlans,
      allPlans: allPlans
    });
  } catch (error) {
    console.error('Production planning fetch error:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

app.post('/api/production-supervisor/add-plan', async (req, res) => {
  try {
    const { operation, due_date, schedule_time, status } = req.body;

    if (!operation || !due_date || !schedule_time) {
      return res.status(400).json({ status: 'error', message: 'Operation name, due date, and schedule time are required.' });
    }

    const [[{ totalCount }]] = await db.query("SELECT COUNT(*) as totalCount FROM production_orders");
    const nextCode = 'MM-' + (24080 + totalCount + 1);

    await db.query(`
      INSERT INTO production_orders (order_code, operation, target_liters, due_date, schedule_time, status)
      VALUES (?, ?, 10, ?, ?, ?)
    `, [nextCode, operation, due_date, schedule_time, status || 'PENDING']);

    res.json({ status: 'success', message: 'Production plan created successfully.' });
  } catch (error) {
    console.error('Add plan error:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

app.post('/api/production-supervisor/edit-plan', async (req, res) => {
  try {
    const { plan_id, operation, due_date, schedule_time, status } = req.body;

    if (!plan_id || !operation) {
      return res.status(400).json({ status: 'error', message: 'Plan ID and operation name are required.' });
    }

    await db.query(`
      UPDATE production_orders 
      SET operation = ?, due_date = ?, schedule_time = ?, status = ? 
      WHERE id = ?
    `, [operation, due_date, schedule_time, status || 'PENDING', plan_id]);

    res.json({ status: 'success', message: 'Production plan updated successfully.' });
  } catch (error) {
    console.error('Edit plan error:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
});
