import { Injectable, CanActivate, ExecutionContext, BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';

interface RequestWithTenant extends Request {
  tenantId?: string;
  user?: {
    sub: string;
    email: string;
    tenantId: string;
  };
}

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithTenant>();
    const tenantId = request['tenantId'];

    console.log('🔐 [TenantGuard] Validating request:', {
      method: request.method,
      path: request.path,
      tenantId,
      hasUser: !!request.user,
    });

    if (!tenantId) {
      console.error('[TenantGuard] ❌ Tenant ID is missing!');
      console.error('[TenantGuard] Headers:', request.headers);
      throw new BadRequestException('Tenant ID is required. Please provide x-tenant-id header.');
    }

    // Validar que el tenant existe en la base de datos
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant) {
      console.error(`[TenantGuard] ❌ Tenant not found: ${tenantId}`);
      throw new NotFoundException(`Tenant with ID ${tenantId} not found`);
    }

    console.log(`[TenantGuard] ✅ Tenant validated: ${tenant.name} (${tenant.id})`);

    // Si hay un usuario autenticado (JWT), validar que pertenece al tenant
    if (request.user && request.user.tenantId !== tenantId) {
      console.error('[TenantGuard] ❌ User tenantId mismatch!');
      console.error('  User tenantId:', request.user.tenantId);
      console.error('  Requested tenantId:', tenantId);
      throw new UnauthorizedException('You do not have access to this tenant');
    }

    return true;
  }
}

