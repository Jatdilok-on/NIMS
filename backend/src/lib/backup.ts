import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import archiver from 'archiver';
import unzipper from 'unzipper';
import cron, { ScheduledTask } from 'node-cron';
import { BackupSchedule, BackupStatus, BackupType } from '@prisma/client';
import { prisma } from './prisma';
import { env } from '../config/env';
import { ensureDir } from './storage';

let activeCronTask: ScheduledTask | null = null;

async function getStorageAndBackupDirs(): Promise<{ storageDir: string; backupDir: string }> {
  const settings = await prisma.systemSetting.findUnique({ where: { key: 'default' } });
  return {
    storageDir: settings?.storageLocation || env.storageRoot,
    backupDir: settings?.backupLocation || env.backupRoot,
  };
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
    await new Promise<void>(async (resolve, reject) => {
      const output = fs.createWriteStream(filePath);
      const archive = archiver('zip', { zlib: { level: 9 } });

      output.on('close', () => resolve());
      archive.on('error', (err) => reject(err));
      archive.pipe(output);

      const manifest: Record<string, unknown> = {
        version: '1.0',
        createdAt: new Date().toISOString(),
        includesDb: job.includesDb,
        includesFiles: job.includesFiles,
      };

      if (job.includesDb) {
        const dbSnapshot = {
          roles: await prisma.role.findMany(),
          permissions: await prisma.permission.findMany(),
          rolePermissions: await prisma.rolePermission.findMany(),
          users: await prisma.user.findMany(),
          sites: await prisma.site.findMany(),
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
        const dbBuffer = Buffer.from(JSON.stringify(dbSnapshot, null, 2), 'utf8');
        manifest.dbChecksum = crypto.createHash('sha256').update(dbBuffer).digest('hex');
        archive.append(dbBuffer, { name: 'database.json' });
      }

      if (job.includesFiles && fs.existsSync(storageDir)) {
        archive.directory(storageDir, 'storage');
      }

      archive.append(JSON.stringify(manifest, null, 2), { name: 'manifest.json' });
      await archive.finalize();
    });

    const fileBuffer = fs.readFileSync(filePath);
    const checksum = crypto.createHash('sha256').update(fileBuffer).digest('hex');

    const completed = await prisma.backupJob.update({
      where: { id: job.id },
      data: {
        status: BackupStatus.COMPLETED,
        fileSize: fileBuffer.length,
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

export async function pruneOldBackups(): Promise<void> {
  const settings = await prisma.systemSetting.findUnique({ where: { key: 'default' } });
  const keepCount = settings?.backupRetentionCount ?? 14;
  if (keepCount <= 0) return;

  const jobs = await prisma.backupJob.findMany({
    where: { status: BackupStatus.COMPLETED },
    orderBy: { startedAt: 'desc' },
  });

  const toDelete = jobs.slice(keepCount);
  for (const job of toDelete) {
    try {
      if (fs.existsSync(job.filePath)) {
        fs.unlinkSync(job.filePath);
      }
      await prisma.backupJob.delete({ where: { id: job.id } });
    } catch {
      // ignore cleanup failure
    }
  }
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
  const dbEntry = directory.files.find((f) => f.path === 'database.json');
  let restoredTables = 0;
  let restoredFiles = 0;

  if (dbEntry) {
    const raw = (await dbEntry.buffer()).toString('utf8');
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
    await prisma.userSitePermission.deleteMany();
    await prisma.site.deleteMany();

    if (Array.isArray(data.sites) && data.sites.length) {
      await prisma.site.createMany({ data: data.sites });
      restoredTables++;
    }
    if (Array.isArray(data.deviceTypes) && data.deviceTypes.length) {
      for (const dt of data.deviceTypes) {
        await prisma.deviceType.create({ data: dt }).catch(() => undefined);
      }
      restoredTables++;
    }
    if (Array.isArray(data.users) && data.users.length) {
      for (const u of data.users) {
        await prisma.user.create({ data: u }).catch(() => undefined);
      }
      restoredTables++;
    }
    if (Array.isArray(data.userSitePermissions) && data.userSitePermissions.length) {
      await prisma.userSitePermission.createMany({ data: data.userSitePermissions });
      restoredTables++;
    }
    if (Array.isArray(data.devices) && data.devices.length) {
      await prisma.device.createMany({ data: data.devices });
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
      } catch (err) {
        console.error('Scheduled backup failed:', (err as Error).message);
      }
    });
  }
}
