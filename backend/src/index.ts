import { env } from './config/env';
import { createApp } from './app';
import { ensureReferenceData } from './lib/bootstrap';
import { ensureDir } from './lib/storage';
import { refreshBackupScheduler } from './lib/backup';

async function main() {
  ensureDir(env.storageRoot);
  ensureDir(env.backupRoot);

  await ensureReferenceData();
  await refreshBackupScheduler();

  const app = createApp();
  app.listen(env.port, () => {
    console.log(`NIMS Backend API listening on port ${env.port} (${env.nodeEnv})`);
  });
}

main().catch((err: unknown) => {
  const code = (err as { code?: string })?.code;
  if (code === 'P2031') {
    console.error(
      '\n[NIMS] MongoDB Replica Set required (Prisma P2031):\n' +
        'Prisma ORM requires MongoDB to run as a Replica Set (e.g. rs0), even for a single local node.\n' +
        'Enable replication in mongod.cfg:\n' +
        '  replication:\n' +
        '    replSetName: "rs0"\n' +
        'Then restart the MongoDB service and run:\n' +
        '  npm run mongo:init-rs   (no mongosh required)\n' +
        'And set DATABASE_URL=mongodb://127.0.0.1:27017/nims?replicaSet=rs0&directConnection=true in .env\n',
    );
  }
  console.error('Fatal startup error:', err);
  process.exit(1);
});
