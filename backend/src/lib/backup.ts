import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import archiver from 'archiver';
import unzipper from 'unzipper';
import cron, { ScheduledTask } from 'node-cron';
import { BackupSchedule, BackupStatus, BackupType, Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { env } from '../config/env';
import { ensureDir } from './storage';

let activeCronTask: ScheduledTask | null = null;

export async function getStorageAndBackupDirs(): Promise<{ storageDir: string; backupDir: string }> {
  const settings = await prisma.systemSetting.findUnique({ where: { key: 'default' } });
  return {
    storageDir: env.storageRoot,
    backupDir: settings?.backupLocation || env.backupRoot,
  };
}

function hashFileStream(targetPath: string): Promise<{ size: number; sha256: string }> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    let size = 0;
    const stream = fs.createReadStream(targetPath);
    stream.on('data', (chunk) => {
      size += chunk.length;
      hash.update(chunk);
    });
    stream.on('end', () => resolve({ size, sha256: hash.digest('hex') }));
    stream.on('error', reject);
  });
}

export async function createSystemBackup(options: {
  type?: BackupType;
  initiatedById?: string | null;
  notes?: string;
  includesDb?: boolean;
  includesFiles?: boolean;
}) {
  const { storageDir, backupDir } = await getStorageAndBackupDirs();
  ensureDir(backupDir);

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const fileName = `nims-backup-${timestamp}.zip`;
  const filePath = path.join(backupDir, fileName);

  const job = await prisma.backupJob.create({
    data: {
      type: options.type ?? BackupType.MANUAL,
      status: BackupStatus.RUNNING,
      fileName,
      filePath,
      includesDb: options.includesDb ?? true,
      includesFiles: options.includesFiles ?? true,
      initiatedById: options.initiatedById ?? null,
      notes: options.notes ?? null,
    },
  });

  try {
    const manifest: Record<string, unknown> = {
      version: '1.1',
      createdAt: new Date().toISOString(),
      includesDb: job.includesDb,
      includesFiles: job.includesFiles,
    };

    let dbBuffer: Buffer | null = null;
    if (job.includesDb) {
      const dbSnapshot = {
        roles: await prisma.role.findMany(),
        permissions: await prisma.permission.findMany(),
        rolePermissions: await prisma.rolePermission.findMany(),
        users: await prisma.user.findMany(),
        sites: await prisma.site.findMany(),
        siteAgents: await prisma.siteAgent.findMany(),
        userSitePermissions: await prisma.userSitePermission.findMany(),
        deviceTypes: await prisma.deviceType.findMany(),
        devices: await prisma.device.findMany(),
        switches: await prisma.switchDetail.findMany(),
        accessPoints: await prisma.accessPointDetail.findMany(),
        apClients: await prisma.apClientDetail.findMany(),
        controllers: await prisma.controllerDetail.findMany(),
        servers: await prisma.serverDetail.findMany(),
        vlans: await prisma.vlan.findMany(),
        subnets: await prisma.subnet.findMany(),
        ipAddresses: await prisma.ipAddress.findMany(),
        credentials: await prisma.credential.findMany(),
        accessInstructions: await prisma.accessInstruction.findMany(),
        diagrams: await prisma.diagram.findMany(),
        diagramVersions: await prisma.diagramVersion.findMany(),
        projects: await prisma.project.findMany(),
        documents: await prisma.document.findMany(),
        documentVersions: await prisma.documentVersion.findMany(),
        maintenanceRecords: await prisma.maintenanceRecord.findMany(),
        systemSettings: await prisma.systemSetting.findMany(),
      };
      dbBuffer = Buffer.from(JSON.stringify(dbSnapshot, null, 2), 'utf8');
      manifest.dbChecksum = crypto.createHash('sha256').update(dbBuffer).digest('hex');
    }

    await new Promise<void>((resolve, reject) => {
      const output = fs.createWriteStream(filePath);
      const archive = archiver('zip', { zlib: { level: 9 } });

      output.on('close', () => resolve());
      output.on('error', (err) => reject(err));
      archive.on('error', (err) => reject(err));
      archive.pipe(output);

      if (dbBuffer) {
        archive.append(dbBuffer, { name: 'database.json' });
      }
      if (job.includesFiles && fs.existsSync(storageDir)) {
        archive.directory(storageDir, 'storage');
      }

      archive.append(JSON.stringify(manifest, null, 2), { name: 'manifest.json' });
      archive.finalize().catch(reject);
    });

    const { size, sha256: checksum } = await hashFileStream(filePath);

    const completed = await prisma.backupJob.update({
      where: { id: job.id },
      data: {
        status: BackupStatus.COMPLETED,
        fileSize: size,
        checksum,
        completedAt: new Date(),
      },
    });

    await pruneOldBackups();
    return completed;
  } catch (err) {
    await prisma.backupJob.update({
      where: { id: job.id },
      data: {
        status: BackupStatus.FAILED,
        notes: (err as Error).message,
        completedAt: new Date(),
      },
    });
    throw err;
  }
}

export async function deleteBackupJobAndFile(jobId: string): Promise<{
  deletedId: string;
  fileName: string;
  freedBytes: number;
}> {
  const job = await prisma.backupJob.findUnique({ where: { id: jobId } });
  if (!job) {
    throw new Error('Backup job not found');
  }
  if (job.status === BackupStatus.RUNNING) {
    throw new Error('Cannot delete a backup that is currently running');
  }

  const { backupDir } = await getStorageAndBackupDirs();
  const allowedRoots = [path.resolve(backupDir), path.resolve(env.backupRoot)];
  let freedBytes = 0;

  if (job.filePath) {
    const resolvedFile = path.resolve(job.filePath);
    const isInsideAllowedRoot = allowedRoots.some(
      (root) => resolvedFile.startsWith(root + path.sep),
    );
    if (isInsideAllowedRoot && fs.existsSync(resolvedFile)) {
      try {
        freedBytes = fs.statSync(resolvedFile).size;
        fs.unlinkSync(resolvedFile);
      } catch {
        // ignore disk unlink issue and still remove job metadata if file is gone
      }
    }
  }

  await prisma.backupJob.delete({ where: { id: job.id } });
  return {
    deletedId: job.id,
    fileName: job.fileName,
    freedBytes: freedBytes || job.fileSize || 0,
  };
}

export async function pruneOldBackups(): Promise<{
  deletedCount: number;
  freedBytes: number;
  keptCount: number;
}> {
  const settings = await prisma.systemSetting.findUnique({ where: { key: 'default' } });
  const keepCount = settings?.backupRetentionCount ?? 14;
  if (keepCount <= 0) {
    return { deletedCount: 0, freedBytes: 0, keptCount: 0 };
  }

  const validJobs = await prisma.backupJob.findMany({
    where: { status: { in: [BackupStatus.COMPLETED, BackupStatus.RESTORED] } },
    orderBy: { startedAt: 'desc' },
  });

  const failedJobs = await prisma.backupJob.findMany({
    where: { status: BackupStatus.FAILED },
    orderBy: { startedAt: 'desc' },
  });

  const toDelete = [...validJobs.slice(keepCount), ...failedJobs.slice(Math.min(keepCount, 5))];
  let deletedCount = 0;
  let freedBytes = 0;

  const { backupDir } = await getStorageAndBackupDirs();
  const allowedRoots = [path.resolve(backupDir), path.resolve(env.backupRoot)];

  for (const job of toDelete) {
    try {
      if (job.filePath) {
        const resolvedFile = path.resolve(job.filePath);
        const isInsideAllowedRoot = allowedRoots.some(
          (root) => resolvedFile.startsWith(root + path.sep),
        );
        if (isInsideAllowedRoot && fs.existsSync(resolvedFile)) {
          freedBytes += fs.statSync(resolvedFile).size;
          fs.unlinkSync(resolvedFile);
        }
      }
      await prisma.backupJob.delete({ where: { id: job.id } });
      deletedCount++;
    } catch {
      // ignore individual cleanup failure
    }
  }

  return {
    deletedCount,
    freedBytes,
    keptCount: Math.min(validJobs.length, keepCount),
  };
}

export async function pruneOldAuditLogs(): Promise<{
  deletedCount: number;
  retentionDays: number;
}> {
  const settings = await prisma.systemSetting.findUnique({ where: { key: 'default' } });
  const retentionDays = settings?.auditRetentionDays ?? 365;
  if (retentionDays <= 0) {
    return { deletedCount: 0, retentionDays };
  }

  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  const res = await prisma.auditLog.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });

  return { deletedCount: res.count, retentionDays };
}

export async function restoreFromBackupArchive(backupFilePath: string): Promise<{
  restoredTables: number;
  restoredFiles: number;
}> {
  const { storageDir } = await getStorageAndBackupDirs();
  if (!fs.existsSync(backupFilePath)) {
    throw new Error('Backup archive not found');
  }

  const directory = await unzipper.Open.file(backupFilePath);
  const manifestEntry = directory.files.find((f) => f.path === 'manifest.json');
  const dbEntry = directory.files.find((f) => f.path === 'database.json');
  let restoredTables = 0;
  let restoredFiles = 0;

  let expectedDbChecksum: string | null = null;
  if (manifestEntry) {
    try {
      const manifestRaw = (await manifestEntry.buffer()).toString('utf8');
      const manifest = JSON.parse(manifestRaw) as { dbChecksum?: unknown };
      if (typeof manifest.dbChecksum === 'string') {
        expectedDbChecksum = manifest.dbChecksum;
      }
    } catch {
      throw new Error('Corrupted backup manifest.json');
    }
  }

  if (dbEntry) {
    const dbBuffer = await dbEntry.buffer();
    if (expectedDbChecksum) {
      const actualChecksum = crypto.createHash('sha256').update(dbBuffer).digest('hex');
      if (actualChecksum !== expectedDbChecksum) {
        throw new Error('Backup database.json checksum verification failed');
      }
    }
    const raw = dbBuffer.toString('utf8');
    const data = JSON.parse(raw);

    // Clear operational collections in reverse dependency order (MongoDB-compatible without multi-doc transactions)
    await prisma.documentVersion.deleteMany();
    await prisma.document.deleteMany();
    await prisma.project.deleteMany();
    await prisma.diagramVersion.deleteMany();
    await prisma.diagram.deleteMany();
    await prisma.accessInstruction.deleteMany();
    await prisma.credential.deleteMany();
    await prisma.ipAddress.deleteMany();
    await prisma.subnet.deleteMany();
    await prisma.vlan.deleteMany();
    await prisma.maintenanceRecord.deleteMany();
    await prisma.switchDetail.deleteMany();
    await prisma.accessPointDetail.deleteMany();
    await prisma.apClientDetail.deleteMany();
    await prisma.controllerDetail.deleteMany();
    await prisma.serverDetail.deleteMany();
    await prisma.device.deleteMany();
    await prisma.siteAgent.deleteMany();
    await prisma.userSitePermission.deleteMany();
    await prisma.site.deleteMany();

    if (Array.isArray(data.sites) && data.sites.length) {
      await prisma.site.createMany({ data: data.sites });
      restoredTables++;
    }
    if (Array.isArray(data.siteAgents) && data.siteAgents.length) {
      await prisma.siteAgent.createMany({ data: data.siteAgents });
      restoredTables++;
    }
    // Build roleId and deviceTypeId remapping tables so restored users/devices match target DB reference ObjectIds
    const backupRoleCodeById = new Map<string, string>();
    if (Array.isArray(data.roles)) {
      for (const r of data.roles as Array<{ id?: string; code?: string }>) {
        if (r?.id && r?.code) backupRoleCodeById.set(r.id, r.code);
      }
    }
    const currentRoles = await prisma.role.findMany();
    const currentRoleIdByCode = new Map(currentRoles.map((r) => [String(r.code), r.id]));

    if (Array.isArray(data.deviceTypes) && data.deviceTypes.length) {
      for (const dt of data.deviceTypes) {
        await prisma.deviceType.create({ data: dt }).catch(() => undefined);
      }
      restoredTables++;
    }
    const currentDeviceTypes = await prisma.deviceType.findMany();
    const currentDtIdByCode = new Map(currentDeviceTypes.map((dt) => [String(dt.code), dt.id]));
    const backupDtCodeById = new Map<string, string>();
    if (Array.isArray(data.deviceTypes)) {
      for (const dt of data.deviceTypes as Array<{ id?: string; code?: string }>) {
        if (dt?.id && dt?.code) backupDtCodeById.set(dt.id, dt.code);
      }
    }

    if (Array.isArray(data.users) && data.users.length) {
      for (const u of data.users) {
        const mappedRoleCode = backupRoleCodeById.get(u.roleId);
        const mappedRoleId = mappedRoleCode ? currentRoleIdByCode.get(mappedRoleCode) : undefined;
        const userPayload = mappedRoleId ? { ...u, roleId: mappedRoleId } : u;
        await prisma.user.create({ data: userPayload }).catch(() => undefined);
      }
      restoredTables++;
    }
    if (Array.isArray(data.userSitePermissions) && data.userSitePermissions.length) {
      await prisma.userSitePermission.createMany({ data: data.userSitePermissions });
      restoredTables++;
    }
    if (Array.isArray(data.devices) && data.devices.length) {
      const remappedDevices = (data.devices as Prisma.DeviceCreateManyInput[]).map((d) => {
        const code = backupDtCodeById.get(d.deviceTypeId) || d.category;
        const targetDtId = code ? currentDtIdByCode.get(String(code)) : undefined;
        return targetDtId ? { ...d, deviceTypeId: targetDtId } : d;
      });
      await prisma.device.createMany({ data: remappedDevices });
      restoredTables++;
    }
    if (Array.isArray(data.switches) && data.switches.length) {
      await prisma.switchDetail.createMany({ data: data.switches });
      restoredTables++;
    }
    if (Array.isArray(data.accessPoints) && data.accessPoints.length) {
      await prisma.accessPointDetail.createMany({ data: data.accessPoints });
      restoredTables++;
    }
    if (Array.isArray(data.apClients) && data.apClients.length) {
      await prisma.apClientDetail.createMany({ data: data.apClients });
      restoredTables++;
    }
    if (Array.isArray(data.controllers) && data.controllers.length) {
      await prisma.controllerDetail.createMany({ data: data.controllers });
      restoredTables++;
    }
    if (Array.isArray(data.servers) && data.servers.length) {
      await prisma.serverDetail.createMany({ data: data.servers });
      restoredTables++;
    }
    if (Array.isArray(data.vlans) && data.vlans.length) {
      await prisma.vlan.createMany({ data: data.vlans });
      restoredTables++;
    }
    if (Array.isArray(data.subnets) && data.subnets.length) {
      await prisma.subnet.createMany({ data: data.subnets });
      restoredTables++;
    }
    if (Array.isArray(data.ipAddresses) && data.ipAddresses.length) {
      await prisma.ipAddress.createMany({ data: data.ipAddresses });
      restoredTables++;
    }
    if (Array.isArray(data.credentials) && data.credentials.length) {
      await prisma.credential.createMany({ data: data.credentials });
      restoredTables++;
    }
    if (Array.isArray(data.accessInstructions) && data.accessInstructions.length) {
      await prisma.accessInstruction.createMany({ data: data.accessInstructions });
      restoredTables++;
    }
    if (Array.isArray(data.diagrams) && data.diagrams.length) {
      await prisma.diagram.createMany({ data: data.diagrams });
      restoredTables++;
    }
    if (Array.isArray(data.diagramVersions) && data.diagramVersions.length) {
      await prisma.diagramVersion.createMany({ data: data.diagramVersions });
      restoredTables++;
    }
    if (Array.isArray(data.projects) && data.projects.length) {
      await prisma.project.createMany({ data: data.projects });
      restoredTables++;
    }
    if (Array.isArray(data.documents) && data.documents.length) {
      await prisma.document.createMany({ data: data.documents });
      restoredTables++;
    }
    if (Array.isArray(data.documentVersions) && data.documentVersions.length) {
      await prisma.documentVersion.createMany({ data: data.documentVersions });
      restoredTables++;
    }
    if (Array.isArray(data.maintenanceRecords) && data.maintenanceRecords.length) {
      await prisma.maintenanceRecord.createMany({ data: data.maintenanceRecords });
      restoredTables++;
    }
  }

  ensureDir(storageDir);
  const normalizedRoot = path.resolve(storageDir);
  for (const entry of directory.files) {
    if (entry.type === 'File' && entry.path.startsWith('storage/')) {
      const rel = entry.path.slice('storage/'.length);
      const target = path.resolve(normalizedRoot, rel);
      if (!target.startsWith(normalizedRoot + path.sep)) continue;
      ensureDir(path.dirname(target));
      const content = await entry.buffer();
      fs.writeFileSync(target, content);
      restoredFiles++;
    }
  }

  return { restoredTables, restoredFiles };
}

export async function refreshBackupScheduler(): Promise<void> {
  if (activeCronTask) {
    activeCronTask.stop();
    activeCronTask = null;
  }

  const settings = await prisma.systemSetting.findUnique({ where: { key: 'default' } }).catch(() => null);
  const schedule = settings?.backupSchedule ?? BackupSchedule.DAILY;

  let cronExpr: string | null = null;
  if (schedule === BackupSchedule.DAILY) cronExpr = '0 2 * * *';
  if (schedule === BackupSchedule.WEEKLY) cronExpr = '0 2 * * 0';
  if (schedule === BackupSchedule.MONTHLY) cronExpr = '0 2 1 * *';

  if (cronExpr) {
    activeCronTask = cron.schedule(cronExpr, async () => {
      try {
        await createSystemBackup({
          type: BackupType.SCHEDULED,
          notes: `Scheduled ${schedule.toLowerCase()} backup`,
        });
        await pruneOldAuditLogs().catch((err) => {
          console.error('Scheduled audit log retention cleanup failed:', (err as Error).message);
        });
      } catch (err) {
        console.error('Scheduled backup failed:', (err as Error).message);
      }
    });
  }
}
