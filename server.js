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

    const { data: userRecord } = await supabase
      .from('users')
      .select('id, password_hash')
      .ilike('email', cleanEmail)
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
      .eq('id', userRecord.id);

    if (passUpdateErr) return res.status(400).json({ status: 'error', message: passUpdateErr.message });

    passwordOtpStore.delete(cleanEmail);
    return res.json({ status: 'success', message: 'Your password has been changed successfully!' });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: 'Failed to update password.' });
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
        res.cookie('user_id', String(uId), { httpOnly: true, sameSite: 'lax', maxAge: 7 * 24 * 60 * 60 * 1000 });
      }
      if (cId) {
        res.cookie('customer_id', String(cId), { httpOnly: true, sameSite: 'lax', maxAge: 7 * 24 * 60 * 60 * 1000 });
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