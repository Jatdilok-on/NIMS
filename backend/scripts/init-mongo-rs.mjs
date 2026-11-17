import { PrismaClient } from '@prisma/client';

function buildAdminDirectUrl(rawUrl) {
  const fallback = 'mongodb://127.0.0.1:27017/admin?directConnection=true';
  if (!rawUrl) return fallback;
  try {
    const parsed = new URL(rawUrl);
    parsed.pathname = '/admin';
    parsed.searchParams.delete('replicaSet');
    parsed.searchParams.set('directConnection', 'true');
    return parsed.toString();
  } catch {
    return fallback;
  }
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const adminUrl = buildAdminDirectUrl(process.env.DATABASE_URL);
  const prisma = new PrismaClient({
    datasources: { db: { url: adminUrl } },
  });

  try {
    const hello = await prisma.$runCommandRaw({ hello: 1 });
    if (hello.setName && hello.isWritablePrimary) {
      console.log(`[NIMS] MongoDB Replica Set "${hello.setName}" is already initialized and PRIMARY.`);
      return;
    }

    console.log('[NIMS] Initializing MongoDB Replica Set (rs0) via Node.js...');
    try {
      await prisma.$runCommandRaw({ replSetInitiate: {} });
    } catch (initErr) {
      const msg = String(initErr?.message || initErr);
      if (msg.includes('already initialized')) {
        console.log('[NIMS] Replica Set already initialized.');
      } else if (
        msg.includes('NoReplicationEnabled') ||
        msg.includes('not started with replication enabled') ||
        msg.includes('not running with --replSet') ||
        msg.includes('replSet')
      ) {
        console.error(
          '\n[NIMS] MongoDB server is still running without Replica Set enabled.\n' +
            '1. Open mongod.cfg (e.g. C:\\Program Files\\MongoDB\\Server\\<ver>\\bin\\mongod.cfg)\n' +
            '2. Add:\n' +
            '     replication:\n' +
            '       replSetName: "rs0"\n' +
            '3. Run in Administrator PowerShell:\n' +
            '     Restart-Service MongoDB\n' +
            '4. Re-run: npm run setup:db\n',
        );
        process.exitCode = 1;
        return;
      } else {
        throw initErr;
      }
    }

    for (let i = 0; i < 15; i++) {
      const status = await prisma.$runCommandRaw({ hello: 1 });
      if (status.setName && status.isWritablePrimary) {
        console.log(`[NIMS] MongoDB Replica Set "${status.setName}" is now PRIMARY and ready.`);
        return;
      }
      await sleep(500);
    }

    console.warn('[NIMS] Replica Set initiated, waiting for PRIMARY election. Retry in a few seconds.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('[NIMS] MongoDB connection check failed:', err?.message || err);
  process.exit(1);
});
