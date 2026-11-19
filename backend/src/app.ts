import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { env } from './config/env';
import { APP_META } from './config/appMeta';
import { apiRateLimiter } from './middleware/rateLimit';
import { errorHandler } from './middleware/errorHandler';
import { apiRequestLoggerMiddleware } from './lib/apiLogger';

import setupRoutes from './routes/setup.routes';
import authRoutes from './routes/auth.routes';
import dashboardRoutes from './routes/dashboard.routes';
import sitesRoutes from './routes/sites.routes';
import devicesRoutes from './routes/devices.routes';
import importExportRoutes from './routes/importExport.routes';
import ipamRoutes from './routes/ipam.routes';
import credentialsRoutes from './routes/credentials.routes';
import diagramsRoutes from './routes/diagrams.routes';
import documentsRoutes from './routes/documents.routes';
import maintenanceRoutes from './routes/maintenance.routes';
import usersRoutes from './routes/users.routes';
import auditRoutes from './routes/audit.routes';
import backupRoutes from './routes/backup.routes';
import settingsRoutes from './routes/settings.routes';
import agentsRoutes from './routes/agents.routes';

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  app.use(
    cors({
      origin: env.corsOrigin.split(',').map((o) => o.trim()),
      credentials: true,
    }),
  );
  app.use(cookieParser());
  app.use(express.json({ limit: '15mb' }));
  app.use(express.urlencoded({ extended: true, limit: '15mb' }));
  app.use('/api', apiRequestLoggerMiddleware);
  app.use('/api', apiRateLimiter);

  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'nims-backend',
      name: APP_META.name,
      version: APP_META.version,
      author: APP_META.author,
      license: APP_META.license,
      timestamp: new Date().toISOString(),
    });
  });

  app.use('/api/setup', setupRoutes);
  app.use('/api/auth', authRoutes);
  app.use('/api/dashboard', dashboardRoutes);
  app.use('/api/sites', sitesRoutes);
  app.use('/api/devices', devicesRoutes);
  app.use('/api/inventory', importExportRoutes);
  app.use('/api/ipam', ipamRoutes);
  app.use('/api/credentials', credentialsRoutes);
  app.use('/api/diagrams', diagramsRoutes);
  app.use('/api/documents', documentsRoutes);
  app.use('/api/maintenance', maintenanceRoutes);
  app.use('/api/users', usersRoutes);
  app.use('/api/audit-logs', auditRoutes);
  app.use('/api/backups', backupRoutes);
  app.use('/api/settings', settingsRoutes);
  app.use('/api/agents', agentsRoutes);

  app.use(errorHandler);
  return app;
}
