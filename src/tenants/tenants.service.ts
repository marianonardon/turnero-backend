import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';

@Injectable()
export class TenantsService {
  constructor(private prisma: PrismaService) {}

  async create(createTenantDto: CreateTenantDto) {
    // Crear tenant y usuario admin en una transacción
    return this.prisma.$transaction(async (tx) => {
      // 1. Crear tenant
      const tenant = await tx.tenant.create({
        data: {
          ...createTenantDto,
          primaryColor: createTenantDto.primaryColor || '#3b82f6',
          timezone: createTenantDto.timezone || 'America/Argentina/Buenos_Aires',
          locale: createTenantDto.locale || 'es-AR',
        },
      });

      // 2. Crear usuario admin automáticamente usando el email del tenant
      await tx.user.create({
        data: {
          email: createTenantDto.email,
          name: createTenantDto.name, // Usar el nombre del negocio como nombre del usuario
          tenantId: tenant.id,
          role: 'admin',
        },
      });

      return tenant;
    });
  }

  async findAll() {
    return this.prisma.tenant.findMany({
      select: {
        id: true,
        slug: true,
        name: true,
        email: true,
        phone: true,
        logoUrl: true,
        primaryColor: true,
        secondaryColor: true,
        createdAt: true,
      },
    });
  }

  async findBySlug(slug: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug },
      select: {
        id: true,
        slug: true,
        name: true,
        email: true,
        phone: true,
        logoUrl: true,
        primaryColor: true,
        secondaryColor: true,
        fontFamily: true,
        timezone: true,
        locale: true,
      },
    });

    if (!tenant) {
      throw new NotFoundException(`Tenant with slug "${slug}" not found`);
    }

    return tenant;
  }

  async findOne(id: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
    });

    if (!tenant) {
      throw new NotFoundException(`Tenant with ID "${id}" not found`);
    }

    return tenant;
  }

  async update(id: string, updateTenantDto: UpdateTenantDto) {
    await this.findOne(id); // Verificar que existe

    return this.prisma.tenant.update({
      where: { id },
      data: updateTenantDto,
    });
  }

  async remove(id: string) {
    await this.findOne(id); // Verificar que existe

    return this.prisma.tenant.delete({
      where: { id },
    });
  }
}

