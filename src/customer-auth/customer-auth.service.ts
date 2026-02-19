import { Injectable, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CustomerLoginDto } from './dto/customer-login.dto';
import { randomBytes } from 'crypto';

@Injectable()
export class CustomerAuthService {
  constructor(
    private prisma: PrismaService,
    private notificationsService: NotificationsService,
    private jwtService: JwtService,
  ) {}

  async sendMagicLink(tenantId: string, loginDto: CustomerLoginDto) {
    // Upsert customer: crear si no existe, actualizar si existe
    const customer = await this.prisma.customer.upsert({
      where: {
        tenantId_email: {
          tenantId,
          email: loginDto.email,
        },
      },
      update: {
        firstName: loginDto.firstName,
        lastName: loginDto.lastName,
        phone: loginDto.phone,
      },
      create: {
        tenantId,
        email: loginDto.email,
        firstName: loginDto.firstName,
        lastName: loginDto.lastName,
        phone: loginDto.phone,
      },
    });

    // Generar token temporal
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 15); // 15 minutos

    // Guardar token en base de datos con type="customer"
    await this.prisma.magicLinkToken.create({
      data: {
        email: loginDto.email,
        token,
        expiresAt,
        type: 'customer',
        customerId: customer.id,
      },
    });

    // Enviar email con magic link
    try {
      await this.notificationsService.sendCustomerMagicLink(
        loginDto.email,
        token,
        tenantId,
      );
    } catch (error) {
      console.error('Error sending customer magic link email:', error);
      // No fallar si el email falla, pero loguear el error
    }

    return {
      message: 'Magic link sent to email. Please check your inbox.',
    };
  }

  async verifyMagicLink(token: string) {
    const magicLinkToken = await this.prisma.magicLinkToken.findUnique({
      where: { token },
    });

    if (!magicLinkToken) {
      throw new NotFoundException('Invalid token');
    }

    if (magicLinkToken.type !== 'customer') {
      throw new Error('Invalid token type');
    }

    if (magicLinkToken.used) {
      throw new Error('Token already used');
    }

    if (magicLinkToken.expiresAt < new Date()) {
      throw new Error('Token expired');
    }

    if (!magicLinkToken.customerId) {
      throw new Error('Invalid token: missing customer ID');
    }

    // Obtener customer
    const customer = await this.prisma.customer.findUnique({
      where: { id: magicLinkToken.customerId },
      include: { tenant: true },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    // Marcar token como usado
    await this.prisma.magicLinkToken.update({
      where: { id: magicLinkToken.id },
      data: { used: true },
    });

    // Generar JWT token con información del customer
    const payload = {
      sub: customer.id,
      email: customer.email,
      tenantId: customer.tenantId,
      role: 'customer',
    };

    const accessToken = await this.jwtService.signAsync(payload);

    return {
      accessToken,
      user: {
        id: customer.id,
        email: customer.email,
        name: `${customer.firstName} ${customer.lastName}`,
        tenantId: customer.tenantId,
        tenant: customer.tenant,
      },
    };
  }
}
