import {
  Controller,
  Get,
  Patch,
  Param,
  UseGuards,
  Request,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CustomerAuthGuard } from '../common/guards/customer-auth.guard';

@Controller()
@UseGuards(CustomerAuthGuard)
export class CustomerAppointmentsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get(':tenantSlug/customer/appointments')
  async getMyAppointments(@Request() req: any, @Param('tenantSlug') tenantSlug: string) {
    const customerId = req.user.sub;

    // Verificar que el tenant existe y coincide con el del customer
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: tenantSlug },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    if (req.user.tenantId !== tenant.id) {
      throw new ForbiddenException('Customer does not belong to this tenant');
    }

    // Obtener appointments del customer
    const appointments = await this.prisma.appointment.findMany({
      where: {
        customerId,
        tenantId: tenant.id,
      },
      include: {
        service: true,
        professional: true,
      },
      orderBy: {
        startTime: 'desc',
      },
    });

    return appointments;
  }

  @Patch(':tenantSlug/customer/appointments/:id/cancel')
  async cancelAppointment(
    @Request() req: any,
    @Param('tenantSlug') tenantSlug: string,
    @Param('id') appointmentId: string,
  ) {
    const customerId = req.user.sub;

    // Verificar tenant
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: tenantSlug },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    // Obtener appointment
    const appointment = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
    });

    if (!appointment) {
      throw new NotFoundException('Appointment not found');
    }

    // Verificar que pertenece al customer
    if (appointment.customerId !== customerId) {
      throw new ForbiddenException('This appointment does not belong to you');
    }

    // Verificar que pertenece al tenant
    if (appointment.tenantId !== tenant.id) {
      throw new ForbiddenException('Invalid appointment');
    }

    // Verificar que no esté ya cancelado
    if (appointment.status === 'CANCELLED') {
      throw new ForbiddenException('Appointment is already cancelled');
    }

    // Verificar límite de cancelación
    const now = new Date();
    const hoursUntilAppointment =
      (appointment.startTime.getTime() - now.getTime()) / (1000 * 60 * 60);

    if (hoursUntilAppointment < tenant.cancellationHoursLimit) {
      throw new ForbiddenException(
        `Cannot cancel appointment less than ${tenant.cancellationHoursLimit} hours before the scheduled time`,
      );
    }

    // Cancelar appointment
    const cancelled = await this.prisma.appointment.update({
      where: { id: appointmentId },
      data: {
        status: 'CANCELLED',
        cancelledAt: now,
        cancelledBy: 'customer',
      },
      include: {
        service: true,
        professional: true,
      },
    });

    return cancelled;
  }
}
