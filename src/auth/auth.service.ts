import { Injectable, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { LoginDto } from './dto/login.dto';
import { randomBytes } from 'crypto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private notificationsService: NotificationsService,
    private jwtService: JwtService,
  ) {}

  async sendMagicLink(loginDto: LoginDto) {
    // Buscar usuario por email
    const user = await this.prisma.user.findUnique({
      where: { email: loginDto.email },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Generar token temporal
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 15); // 15 minutos

    // Guardar token en base de datos
    await this.prisma.magicLinkToken.create({
      data: {
        email: loginDto.email,
        token,
        expiresAt,
      },
    });

    // Enviar email con magic link
    try {
      await this.notificationsService.sendMagicLink(loginDto.email, token);
    } catch (error) {
      console.error('Error sending magic link email:', error);
      // No fallar si el email falla, pero loguear el error
    }

    // SECURITY: Never expose the magic link in response, even in development
    // The link should only be sent via email
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

    if (magicLinkToken.used) {
      throw new Error('Token already used');
    }

    if (magicLinkToken.expiresAt < new Date()) {
      throw new Error('Token expired');
    }

    // Obtener usuario
    const user = await this.prisma.user.findUnique({
      where: { email: magicLinkToken.email },
      include: { tenant: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Marcar token como usado
    await this.prisma.magicLinkToken.update({
      where: { id: magicLinkToken.id },
      data: { used: true },
    });

    // Actualizar último login
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    // Generar JWT token con información del usuario y tenant
    const payload = {
      sub: user.id,
      email: user.email,
      tenantId: user.tenantId,
    };

    const accessToken = await this.jwtService.signAsync(payload);

    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        tenantId: user.tenantId,
        tenant: user.tenant,
      },
    };
  }
}

