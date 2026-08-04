import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import routes from './routes/index.js';
import { env } from './config/env.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

const app = express();

// Railway terminates HTTPS at its proxy. Trusting the first proxy keeps
// generated update download URLs on HTTPS.
app.set('trust proxy', 1);

app.use(helmet());
const allowedOrigins = env.corsOrigin.split(',').map(value => value.trim()).filter(Boolean);
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Origin is not allowed by CORS.'));
  },
  credentials: true
}));
app.use(express.json({ limit: '8mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false
});
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/forgot-password', authLimiter);
app.use('/api/auth/reset-privileged-password', authLimiter);

app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'SRSB Work Management API is healthy.' });
});

app.use('/api', routes);
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
