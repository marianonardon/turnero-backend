import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    // Extraer tenant_id de diferentes fuentes:
    // 1. Header X-Tenant-Id (para admin) - Express normaliza headers a lowercase
    // 2. Subdomain (futuro: tenant1.turnero.com)
    // 3. Path parameter (futuro: /api/tenants/:slug/...)
    // 4. Query parameter (temporal para desarrollo)
    
    const tenantId = 
      (req.headers['x-tenant-id'] as string) ||
      (req.headers['X-Tenant-Id'] as string) ||
      (req.query.tenantId as string) ||
      undefined;
    
    // Debug logging
    if (process.env.NODE_ENV === 'development') {
      console.log('[TenantMiddleware] Request to:', req.path);
      console.log('[TenantMiddleware] Headers:', {
        'x-tenant-id': req.headers['x-tenant-id'],
        'X-Tenant-Id': req.headers['x-tenant-id'],
        allHeaders: Object.keys(req.headers).filter(k => k.toLowerCase().includes('tenant')),
      });
      console.log('[TenantMiddleware] Extracted tenantId:', tenantId);
    }
    
    req['tenantId'] = tenantId;
    next();
  }
}

