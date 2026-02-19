import { Controller, Post, Get, Body, Query, Param, NotFoundException } from '@nestjs/common';
import { CustomerAuthService } from './customer-auth.service';
import { CustomerLoginDto } from './dto/customer-login.dto';
import { PrismaService } from '../prisma/prisma.service';

@Controller()
export class CustomerAuthController {
  constructor(
    private readonly customerAuthService: CustomerAuthService,
    private readonly prisma: PrismaService,
  ) {}

  @Post(':tenantSlug/customer/auth/login')
  async login(
    @Param('tenantSlug') tenantSlug: string,
    @Body() loginDto: CustomerLoginDto,
  ) {
    // Obtener tenant por slug
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: tenantSlug },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    return this.customerAuthService.sendMagicLink(tenant.id, loginDto);
  }

  @Get(':tenantSlug/customer/auth/callback')
  async callback(@Query('token') token: string) {
    return this.customerAuthService.verifyMagicLink(token);
  }
}
