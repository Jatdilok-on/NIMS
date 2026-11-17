import { Request, Response, NextFunction } from 'express';
import { AuditResult, RoleCode, UserSitePermission } from '@prisma/client';
import { AuthenticatedUser } from './auth';
import { recordAuditLog } from '../lib/audit';

export type SitePermissionFlag =
  | 'canViewInventory'
  | 'canEditInventory'
  | 'canViewDiagram'
  | 'canEditDiagram'
  | 'canViewIpam'
  | 'canEditIpam'
  | 'canViewDocuments'
  | 'canEditDocuments'
  | 'canDeleteDocuments'
  | 'canViewCredentials'
  | 'canEditCredentials'
  | 'canViewMaintenance'
  | 'canEditMaintenance'
  | 'canManageSite';

export function hasSitePermission(
  user: AuthenticatedUser,
  siteId: string,
  flag: SitePermissionFlag,
): boolean {
  // Super Admin has unrestricted access to all sites and modules
  if (user.roleCode === RoleCode.SUPER_ADMIN) {
    return true;
  }

  // IP_VIEWER is STRICTLY blocked from any credential capability
  if (
    user.roleCode === RoleCode.IP_VIEWER &&
    (flag === 'canViewCredentials' || flag === 'canEditCredentials')
  ) {
    return false;
  }

  const perm: UserSitePermission | undefined = user.sitePermissions.find(
    (p) => p.siteId === siteId,
  );
  if (!perm) {
    return false;
  }

  // VIEWER and IP_VIEWER cannot edit/delete/manage anything even if misconfigured
  if (user.roleCode === RoleCode.VIEWER || user.roleCode === RoleCode.IP_VIEWER) {
    if (
      flag.startsWith('canEdit') ||
      flag.startsWith('canDelete') ||
      flag === 'canManageSite'
    ) {
      return false;
    }
  }

  return Boolean(perm[flag]);
}

export function getPermittedSiteIds(
  user: AuthenticatedUser,
  flag: SitePermissionFlag = 'canViewInventory',
): string[] | null {
  // null means all sites allowed
  if (user.roleCode === RoleCode.SUPER_ADMIN) {
    return null;
  }
  return user.sitePermissions
    .filter((p) => hasSitePermission(user, p.siteId, flag))
    .map((p) => p.siteId);
}

export function requireRoles(...allowedRoles: RoleCode[]) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    if (!allowedRoles.includes(req.user.roleCode)) {
      await recordAuditLog({
        req,
        userId: req.user.id,
        username: req.user.username,
        action: 'ACCESS_DENIED',
        module: 'RBAC',
        result: AuditResult.DENIED,
        details: { path: req.originalUrl, requiredRoles: allowedRoles },
      });
      res.status(403).json({ error: 'Insufficient role permissions' });
      return;
    }
    next();
  };
}

export function requireSitePermission(
  flag: SitePermissionFlag,
  siteIdResolver: (req: Request) => string | undefined | Promise<string | undefined>,
) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const siteId = await siteIdResolver(req);
    if (!siteId) {
      res.status(400).json({ error: 'Site identifier is required' });
      return;
    }

    if (!hasSitePermission(req.user, siteId, flag)) {
      await recordAuditLog({
        req,
        userId: req.user.id,
        username: req.user.username,
        action: 'SITE_PERMISSION_DENIED',
        module: 'RBAC',
        siteId,
        result: AuditResult.DENIED,
        details: { path: req.originalUrl, flag },
      });
      res.status(403).json({ error: 'You do not have permission for this site or action' });
      return;
    }

    next();
  };
}

/**
 * Explicitly blocks IP_VIEWER from any credentials endpoint before even looking up records.
 */
export async function blockIpViewerFromCredentials(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  if (req.user.roleCode === RoleCode.IP_VIEWER) {
    await recordAuditLog({
      req,
      userId: req.user.id,
      username: req.user.username,
      action: 'CREDENTIAL_ACCESS_BLOCKED',
      module: 'CREDENTIALS',
      result: AuditResult.DENIED,
      details: { reason: 'IP_VIEWER role is strictly prohibited from credentials API' },
    });
    res.status(403).json({
      error: 'Access denied: IP Viewer accounts cannot access login credentials or instructions',
    });
    return;
  }
  next();
}
