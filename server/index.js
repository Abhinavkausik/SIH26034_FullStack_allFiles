require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const path = require('path');

require('./db'); // ensures schema + migrations are applied on boot

const authRoutes = require('./routes/auth.routes');
const adminRoutes = require('./routes/admin.routes');
const { router: scanRoutes } = require('./routes/scan.routes');
const sellerRoutes = require('./routes/seller.routes');
const regulatorRoutes = require('./routes/regulator.routes');
const authorityRoutes = require('./routes/authority.routes');
const barcodeRoutes = require('./routes/barcode.routes');
const coverageRoutes = require('./routes/coverage.routes');
const inspectionRoutes = require('./routes/inspection.routes');
const { router: complaintRoutes } = require('./routes/complaint.routes');
const { router: feedbackRoutes } = require('./routes/feedback.routes');
const publicCheckRoutes = require('./routes/publicCheck.routes'); // placeholder scanner - see file header

const app = express();
const PORT = process.env.PORT || 5000;
const CORS_ORIGIN = (process.env.CORS_ORIGIN || 'http://localhost:3000').split(',');

app.set('trust proxy', true);
app.use(cors({
  origin: CORS_ORIGIN,
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Actor-Token', 'X-Actor-Type']
}));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve uploaded label images and generated PDF reports as static files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/reports', express.static(path.join(__dirname, 'reports')));

app.get('/api/health', (req, res) => res.json({
  status: 'ok',
  service: 'lmpc-backend',
  scanMode: (process.env.SCAN_MODE || 'live').toLowerCase()
}));

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api', scanRoutes);
app.use('/api/seller', sellerRoutes);
app.use('/api/regulator', regulatorRoutes);
app.use('/api/authority', authorityRoutes);
app.use('/api/barcode', barcodeRoutes);
app.use('/api/rule-coverage', coverageRoutes);
app.use('/api/inspections', inspectionRoutes);
app.use('/api/complaints', complaintRoutes);
app.use('/api/feedback', feedbackRoutes);
app.use('/api/public-check', publicCheckRoutes); // placeholder scanner - see file header

// Central error handler (e.g. multer file-type/size errors, validation errors)
app.use((err, req, res, next) => {
  if (err && err.status === 400) {
    return res.status(400).json({ error: err.message, field: err.field });
  }
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Something went wrong on the server.' });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`LMPC backend listening on http://localhost:${PORT}`);
  });
}

module.exports = app;
