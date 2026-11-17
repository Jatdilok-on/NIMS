import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const BACKEND_DIR = path.join(ROOT_DIR, 'backend');
const FRONTEND_DIR = path.join(ROOT_DIR, 'frontend');
const ENV_PATH = path.join(ROOT_DIR, '.env');
const ENV_EXAMPLE_PATH = path.join(ROOT_DIR, '.env.example');

const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';

function ensureEnvFile() {
  if (fs.existsSync(ENV_PATH)) return;
  if (!fs.existsSync(ENV_EXAMPLE_PATH)) {
    throw new Error('.env and .env.example were not found in project root.');
  }

  let content = fs.readFileSync(ENV_EXAMPLE_PATH, 'utf8');
  const jwtSecret = crypto.randomBytes(32).toString('hex');
  const encKey = crypto.randomBytes(32).toString('hex');

  content = content
    .replace('CHANGE_ME_64_HEX_JWT_SECRET', jwtSecret)
    .replace('CHANGE_ME_64_HEX_AES_256_GCM_KEY', encKey);

  fs.writeFileSync(ENV_PATH, content, 'utf8');
  console.log('[NIMS] Created .env from .env.example with freshly generated cryptographic keys.');
}

function loadRootEnv() {
  if (!fs.existsSync(ENV_PATH)) return {};
  const parsed = {};
  const lines = fs.readFileSync(ENV_PATH, 'utf8').split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eqIdx = line.indexOf('=');
    if (eqIdx === -1) continue;
    const key = line.slice(0, eqIdx).trim();
    let val = line.slice(eqIdx + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    parsed[key] = val;
  }
  return parsed;
}

function runSync(cmd, args, cwd, extraEnv = {}) {
  const result = spawnSync(cmd, args, {
    cwd,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, ...extraEnv },
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function startConcurrent(envVars, mode) {
  const backendArgs = mode === 'start' ? ['run', 'start'] : ['run', 'dev'];
  const frontendPort = envVars.FRONTEND_PORT || process.env.FRONTEND_PORT || '3000';
  const frontendHost = envVars.FRONTEND_HOST || process.env.FRONTEND_HOST || '';

  const sharedEnv = {
    ...process.env,
    ...envVars,
    NODE_ENV: mode === 'start' ? 'production' : envVars.NODE_ENV || 'development',
  };

  console.log(`[NIMS] Starting Backend (${mode}) on port ${sharedEnv.PORT || '4000'}...`);
  const backend = spawn(npmCmd, backendArgs, {
    cwd: BACKEND_DIR,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: sharedEnv,
  });

  const nextBin = path.join(FRONTEND_DIR, 'node_modules', 'next', 'dist', 'bin', 'next');
  const useCustomFrontendBind =
    fs.existsSync(nextBin) && (frontendPort !== '3000' || Boolean(frontendHost));

  console.log(
    `[NIMS] Starting Frontend on http://${frontendHost || 'localhost'}:${frontendPort} ...`,
  );
  const frontend = useCustomFrontendBind
    ? spawn(
        process.execPath,
        [
          nextBin,
          mode === 'start' ? 'start' : 'dev',
          '-p',
          String(frontendPort),
          ...(frontendHost ? ['-H', String(frontendHost)] : []),
        ],
        {
          cwd: FRONTEND_DIR,
          stdio: 'inherit',
          env: {
            ...sharedEnv,
            INTERNAL_API_URL:
              sharedEnv.INTERNAL_API_URL || `http://127.0.0.1:${sharedEnv.PORT || '4000'}/api`,
          },
        },
      )
    : spawn(npmCmd, mode === 'start' ? ['run', 'start'] : ['run', 'dev'], {
        cwd: FRONTEND_DIR,
        stdio: 'inherit',
        shell: process.platform === 'win32',
        env: {
          ...sharedEnv,
          INTERNAL_API_URL:
            sharedEnv.INTERNAL_API_URL || `http://127.0.0.1:${sharedEnv.PORT || '4000'}/api`,
        },
      });

  let shuttingDown = false;
  const shutdown = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`\n[NIMS] Stopping services (${signal})...`);
    for (const child of [backend, frontend]) {
      if (!child.killed) {
        try {
          child.kill(signal);
        } catch {
          // ignore
        }
      }
    }
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  backend.on('exit', (code) => {
    if (!shuttingDown) {
      console.error(`[NIMS] Backend exited with code ${code}.`);
      shutdown('SIGTERM');
      process.exit(code ?? 1);
    }
  });

  frontend.on('exit', (code) => {
    if (!shuttingDown) {
      console.error(`[NIMS] Frontend exited with code ${code}.`);
      shutdown('SIGTERM');
      process.exit(code ?? 1);
    }
  });
}

function runPrisma(args, envVars = {}) {
  const localPrismaCli = path.join(BACKEND_DIR, 'node_modules', 'prisma', 'build', 'index.js');
  if (fs.existsSync(localPrismaCli)) {
    runSync('node', [localPrismaCli, ...args], BACKEND_DIR, envVars);
    return;
  }
  runSync(npxCmd, ['prisma', ...args], BACKEND_DIR, envVars);
}

function ensurePrismaClientGenerated(envVars) {
  const generatedEntry = path.join(BACKEND_DIR, 'node_modules', '.prisma', 'client', 'index.js');
  if (!fs.existsSync(generatedEntry)) {
    runPrisma(['generate'], envVars);
  }
}

const command = process.argv[2] || 'dev';

switch (command) {
  case 'install': {
    console.log('[NIMS] Installing backend dependencies...');
    runSync(npmCmd, ['install'], BACKEND_DIR);
    console.log('[NIMS] Generating Prisma Client for MongoDB...');
    runSync(npxCmd, ['prisma', 'generate'], BACKEND_DIR);
    console.log('[NIMS] Installing frontend dependencies...');
    runSync(npmCmd, ['install'], FRONTEND_DIR);
    break;
  }
  case 'init-rs': {
    ensureEnvFile();
    const envVars = loadRootEnv();
    ensurePrismaClientGenerated(envVars);
    runSync('node', ['scripts/init-mongo-rs.mjs'], BACKEND_DIR, envVars);
    break;
  }
  case 'setup-db': {
    ensureEnvFile();
    const envVars = loadRootEnv();
    const generatedEntry = path.join(BACKEND_DIR, 'node_modules', '.prisma', 'client', 'index.js');
    const offlineSkipGen = process.env.NIMS_OFFLINE === '1' && fs.existsSync(generatedEntry);
    console.log('[NIMS] Checking Prisma Client & MongoDB Replica Set...');
    if (!offlineSkipGen) {
      runPrisma(['generate'], envVars);
    }
    runSync('node', ['scripts/init-mongo-rs.mjs'], BACKEND_DIR, envVars);
    console.log('[NIMS] Pushing MongoDB schema/indexes...');
    runPrisma(offlineSkipGen ? ['db', 'push', '--skip-generate'] : ['db', 'push'], envVars);
    console.log('[NIMS] Seeding reference roles, permissions, and device types...');
    runSync(npmCmd, ['run', 'seed:admin'], BACKEND_DIR, envVars);
    console.log('[NIMS] MongoDB setup complete.');
    break;
  }
  case 'build': {
    const buildEnv = { ...loadRootEnv(), NODE_ENV: 'production' };
    console.log('[NIMS] Building backend (TypeScript)...');
    ensurePrismaClientGenerated(buildEnv);
    runSync(npmCmd, ['run', 'build'], BACKEND_DIR, buildEnv);
    console.log('[NIMS] Building frontend (Next.js)...');
    runSync(npmCmd, ['run', 'build'], FRONTEND_DIR, buildEnv);
    console.log('[NIMS] Build complete.');
    break;
  }
  case 'dev': {
    ensureEnvFile();
    const envVars = loadRootEnv();
    startConcurrent(envVars, 'dev');
    break;
  }
  case 'start': {
    ensureEnvFile();
    const envVars = loadRootEnv();
    const buildEnv = { ...envVars, NODE_ENV: 'production' };
    const hasBackendBuild = fs.existsSync(path.join(BACKEND_DIR, 'dist', 'index.js'));
    const hasFrontendBuild = fs.existsSync(path.join(FRONTEND_DIR, '.next', 'BUILD_ID'));
    if (!hasBackendBuild || !hasFrontendBuild) {
      console.log('[NIMS] Production build not found; building backend & frontend first...');
      ensurePrismaClientGenerated(buildEnv);
      runSync(npmCmd, ['run', 'build'], BACKEND_DIR, buildEnv);
      runSync(npmCmd, ['run', 'build'], FRONTEND_DIR, buildEnv);
    }
    startConcurrent(envVars, 'start');
    break;
  }
  case 'fast': {
    ensureEnvFile();
    const envVars = loadRootEnv();
    const buildEnv = { ...envVars, NODE_ENV: 'production' };
    console.log('[NIMS] Building & starting NIMS in fast Production mode...');
    ensurePrismaClientGenerated(buildEnv);
    runSync(npmCmd, ['run', 'build'], BACKEND_DIR, buildEnv);
    runSync(npmCmd, ['run', 'build'], FRONTEND_DIR, buildEnv);
    startConcurrent(envVars, 'start');
    break;
  }
  default:
    console.error(`Unknown command: ${command}. Use: install | setup-db | init-rs | dev | build | start | fast`);
    process.exit(1);
}
