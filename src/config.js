import crypto from 'node:crypto';

const env = process.env;

export const config = {
  port: Number(env.PORT || 3000),
  host: env.HOST || '0.0.0.0',
  baseUrl: (env.BASE_URL || `http://localhost:${env.PORT || 3000}`).replace(/\/$/, ''),
  dbPath: env.DB_PATH || (env.RAILWAY_VOLUME_MOUNT_PATH ? `${env.RAILWAY_VOLUME_MOUNT_PATH}/iwin.db` : './data/iwin.db'),
  // The secret signs voter ids and IP hashes. In production it must come from the environment.
  secret: env.SECRET || 'dev-secret-change-me',
  adminToken: env.ADMIN_TOKEN || '',
  agentToken: env.AGENT_TOKEN || '',
  indexNowKey: env.INDEXNOW_KEY || '',
  production: env.NODE_ENV === 'production',
  // A want needs this many "works for me" votes on one answer to become fulfilled without the wisher.
  fulfillVotes: Number(env.FULFILL_VOTES || 3),
  // Content hides automatically after this many reports.
  hideReports: Number(env.HIDE_REPORTS || 3),
};

export function hmac(value) {
  return crypto.createHmac('sha256', config.secret).update(String(value)).digest('hex').slice(0, 32);
}
