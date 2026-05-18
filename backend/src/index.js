require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const morgan = require('morgan');
const { blockDemoWrites } = require('./middleware/demoGuard');

const { errorHandler, notFound } = require('./utils/errors');
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const productRoutes = require('./routes/products');
const categoryRoutes = require('./routes/categories');
const clientRoutes = require('./routes/clients');
const projectRoutes = require('./routes/projects');
const supplierRoutes = require('./routes/suppliers');
const supplierOrderRoutes = require('./routes/supplierOrders');
const materialRequestRoutes = require('./routes/materialRequests');
const clientOrderRoutes = require('./routes/clientOrders');
const deliveryRoutes = require('./routes/deliveries');
const auditLogRoutes = require('./routes/auditLogs');
const notificationRoutes = require('./routes/notifications');
const quoteRequestRoutes = require('./routes/quoteRequests');
const projectFormRoutes = require('./routes/projectForms');
const stockTransactionRoutes = require('./routes/stockTransactions');
const dashboardRoutes = require('./routes/dashboard');
const activityRoutes = require('./routes/activities');
const insightsRoutes = require('./routes/insights');
const aiRoutes = require('./routes/ai');
const companyRoutes = require('./routes/company');
const publicRoutes = require('./routes/public');
const proofRoutes = require('./routes/proofs');
const testEmailRoutes = require('./routes/testEmail');
const fileRoutes = require('./routes/files');

const app = express();

const defaultAllowedOrigins = [
  'https://impexengineering.org',
  'https://www.impexengineering.org',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];
const configuredAllowedOrigins = [
  process.env.CORS_ORIGIN,
  process.env.FRONTEND_URL,
  process.env.CLIENT_URL,
  process.env.APP_URL,
]
  .filter(Boolean)
  .flatMap((value) => String(value).split(','))
  .map((origin) => origin.trim().replace(/\/$/, ''))
  .filter(Boolean);
const allowedOrigins = Array.from(new Set([...defaultAllowedOrigins, ...configuredAllowedOrigins]));

function isAllowedOrigin(origin) {
  if (!origin) return true;
  const normalized = String(origin).trim().replace(/\/$/, '');
  return allowedOrigins.includes(normalized);
}

app.use(
  cors({
    origin(origin, callback) {
      if (isAllowedOrigin(origin)) return callback(null, true);
      return callback(new Error(`CORS origin not allowed: ${origin}`));
    },
    credentials: true,
  })
);
app.use(express.json({ limit: '2mb' }));
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));
app.use('/pending-proofs', express.static(path.join(__dirname, '..', 'storage', 'pending-proofs')));
app.use(morgan('dev'));
app.use(blockDemoWrites);

// Basic CSRF mitigation: enforce Origin on state-changing requests
app.use((req, res, next) => {
  const method = req.method.toUpperCase();
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) return next();
  const origin = req.headers.origin || '';
  if (isAllowedOrigin(origin)) return next();
  return res.status(403).json({ error: 'Invalid origin' });
});

// Basic input sanitization to reduce XSS risks
app.use((req, _res, next) => {
  const sanitize = (value) => {
    if (typeof value === 'string') {
      return value.replace(/[<>]/g, '');
    }
    if (Array.isArray(value)) {
      return value.map(sanitize);
    }
    if (value && typeof value === 'object') {
      Object.keys(value).forEach((key) => {
        value[key] = sanitize(value[key]);
      });
      return value;
    }
    return value;
  };
  if (req.body) {
    req.body = sanitize(req.body);
  }
  next();
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/products', productRoutes);
app.use('/api/inventory', productRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/purchase-orders', supplierOrderRoutes);
app.use('/api/material-requests', materialRequestRoutes);
app.use('/api/orders', clientOrderRoutes);
app.use('/api/deliveries', deliveryRoutes);
app.use('/api/audit-logs', auditLogRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/quote-requests', quoteRequestRoutes);
app.use('/api/project-forms', projectFormRoutes);
app.use('/api/transactions', stockTransactionRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/activities', activityRoutes);
app.use('/api/insights', insightsRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/company', companyRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/proofs', proofRoutes);
app.use('/api/test-email', testEmailRoutes);
app.use('/api/files', fileRoutes);

app.use(notFound);
app.use(errorHandler);

const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`Backend running on http://localhost:${port}`);
});
