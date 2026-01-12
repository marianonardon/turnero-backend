import { Injectable } from '@nestjs/common';
import { Resend } from 'resend';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NotificationsService {
  private resend: Resend;

  constructor(private prisma: PrismaService) {
    // Inicializar Resend solo si hay API key
    const apiKey = process.env.RESEND_API_KEY;
    if (apiKey) {
      this.resend = new Resend(apiKey);
    } else {
      console.warn('⚠️ RESEND_API_KEY no configurada. Los emails no se enviarán.');
    }
  }

  async sendMagicLink(email: string, token: string) {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const magicLink = `${frontendUrl}/auth/callback?token=${token}`;

    // En desarrollo, solo loguear
    if (process.env.NODE_ENV === 'development' && !process.env.RESEND_API_KEY) {
      console.log('📧 Magic Link (desarrollo):', magicLink);
      return { success: true, message: 'Magic link generado (modo desarrollo)' };
    }

    try {
      await this.resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL || 'noreply@turnero.com',
        to: email,
        subject: 'Iniciar sesión en Turnero',
        html: this.getMagicLinkTemplate(magicLink),
      });

      return { success: true, message: 'Magic link enviado por email' };
    } catch (error) {
      console.error('Error sending magic link email:', error);
      throw error;
    }
  }

  async sendAppointmentConfirmation(appointmentId: string) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: {
        customer: true,
        service: true,
        professional: true,
      },
    });

    if (!appointment) {
      throw new Error('Appointment not found');
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: appointment.tenantId },
    });

    const startDate = new Date(appointment.startTime);
    const endDate = new Date(appointment.endTime);

    // Generar .ics content
    const icsContent = this.generateICS(
      appointment.service.name,
      appointment.professional.fullName,
      startDate,
      endDate,
      tenant?.name || 'Turnero',
    );

    // En desarrollo, solo loguear
    if (process.env.NODE_ENV === 'development' && !process.env.RESEND_API_KEY) {
      console.log('📧 Email de confirmación (desarrollo):', {
        to: appointment.customer.email,
        subject: `Confirmación de turno - ${appointment.service.name}`,
      });
      return { success: true, message: 'Email de confirmación generado (modo desarrollo)' };
    }

    try {
      await this.resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL || 'noreply@turnero.com',
        to: appointment.customer.email,
        subject: `Confirmación de turno - ${appointment.service.name}`,
        html: this.getAppointmentConfirmationTemplate(
          appointment,
          tenant,
          startDate,
          endDate,
        ),
        attachments: [
          {
            filename: `turno-${startDate.toISOString().split('T')[0]}.ics`,
            content: Buffer.from(icsContent).toString('base64'),
          },
        ],
      });

      return { success: true, message: 'Email de confirmación enviado' };
    } catch (error) {
      console.error('Error sending confirmation email:', error);
      throw error;
    }
  }

  async sendAppointmentReminder(appointmentId: string) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: {
        customer: true,
        service: true,
        professional: true,
      },
    });

    if (!appointment) {
      throw new Error('Appointment not found');
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: appointment.tenantId },
    });

    const startDate = new Date(appointment.startTime);

    // En desarrollo, solo loguear
    if (process.env.NODE_ENV === 'development' && !process.env.RESEND_API_KEY) {
      console.log('📧 Recordatorio (desarrollo):', {
        to: appointment.customer.email,
        subject: `Recordatorio: Tu turno es mañana - ${appointment.service.name}`,
      });
      return { success: true, message: 'Recordatorio generado (modo desarrollo)' };
    }

    try {
      await this.resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL || 'noreply@turnero.com',
        to: appointment.customer.email,
        subject: `Recordatorio: Tu turno es mañana - ${appointment.service.name}`,
        html: this.getReminderTemplate(appointment, tenant, startDate),
      });

      return { success: true, message: 'Recordatorio enviado' };
    } catch (error) {
      console.error('Error sending reminder email:', error);
      throw error;
    }
  }

  async sendAppointmentCancellation(appointmentId: string, reason?: string) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: {
        customer: true,
        service: true,
        professional: true,
      },
    });

    if (!appointment) {
      throw new Error('Appointment not found');
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: appointment.tenantId },
    });

    // En desarrollo, solo loguear
    if (process.env.NODE_ENV === 'development' && !process.env.RESEND_API_KEY) {
      console.log('📧 Cancelación (desarrollo):', {
        to: appointment.customer.email,
        subject: `Turno cancelado - ${appointment.service.name}`,
      });
      return { success: true, message: 'Email de cancelación generado (modo desarrollo)' };
    }

    try {
      await this.resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL || 'noreply@turnero.com',
        to: appointment.customer.email,
        subject: `Turno cancelado - ${appointment.service.name}`,
        html: this.getCancellationTemplate(appointment, tenant, reason),
      });

      return { success: true, message: 'Email de cancelación enviado' };
    } catch (error) {
      console.error('Error sending cancellation email:', error);
      throw error;
    }
  }

  // Templates de emails
  private getMagicLinkTemplate(magicLink: string): string {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="color: white; margin: 0;">Iniciar Sesión</h1>
          </div>
          <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
            <p>Haz click en el siguiente botón para iniciar sesión:</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${magicLink}" style="background: #667eea; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">
                Iniciar Sesión
              </a>
            </div>
            <p style="font-size: 12px; color: #666;">O copia y pega este link en tu navegador:</p>
            <p style="font-size: 12px; color: #666; word-break: break-all;">${magicLink}</p>
            <p style="font-size: 12px; color: #666; margin-top: 30px;">Este link expira en 15 minutos.</p>
          </div>
        </body>
      </html>
    `;
  }

  private getAppointmentConfirmationTemplate(
    appointment: any,
    tenant: any,
    startDate: Date,
    endDate: Date,
  ): string {
    const formatDate = (date: Date) => {
      return date.toLocaleDateString('es-AR', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    };

    const formatTime = (date: Date) => {
      return date.toLocaleTimeString('es-AR', {
        hour: '2-digit',
        minute: '2-digit',
      });
    };

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="color: white; margin: 0;">✅ Turno Confirmado</h1>
          </div>
          <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
            <p>Hola <strong>${appointment.customer.firstName} ${appointment.customer.lastName}</strong>,</p>
            <p>Tu turno ha sido confirmado exitosamente.</p>
            
            <div style="background: white; padding: 20px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #667eea;">
              <h2 style="margin-top: 0; color: #667eea;">Detalles del Turno</h2>
              <p><strong>Servicio:</strong> ${appointment.service.name}</p>
              <p><strong>Profesional:</strong> ${appointment.professional.fullName}</p>
              <p><strong>Fecha:</strong> ${formatDate(startDate)}</p>
              <p><strong>Hora:</strong> ${formatTime(startDate)} - ${formatTime(endDate)}</p>
              ${tenant?.phone ? `<p><strong>Teléfono:</strong> ${tenant.phone}</p>` : ''}
              ${tenant?.email ? `<p><strong>Email:</strong> ${tenant.email}</p>` : ''}
            </div>

            <p>Hemos adjuntado un archivo .ics que puedes agregar a tu calendario (Google Calendar, Outlook, Apple Calendar).</p>
            
            <p style="font-size: 12px; color: #666; margin-top: 30px;">
              <strong>Nota:</strong> Te enviaremos un recordatorio 24 horas antes de tu cita.
              Si necesitas cancelar o reprogramar, por favor contáctanos con al menos 12 horas de anticipación.
            </p>
          </div>
        </body>
      </html>
    `;
  }

  private getReminderTemplate(appointment: any, tenant: any, startDate: Date): string {
    const formatDate = (date: Date) => {
      return date.toLocaleDateString('es-AR', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    };

    const formatTime = (date: Date) => {
      return date.toLocaleTimeString('es-AR', {
        hour: '2-digit',
        minute: '2-digit',
      });
    };

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="color: white; margin: 0;">⏰ Recordatorio de Turno</h1>
          </div>
          <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
            <p>Hola <strong>${appointment.customer.firstName} ${appointment.customer.lastName}</strong>,</p>
            <p>Te recordamos que tienes un turno programado para mañana:</p>
            
            <div style="background: white; padding: 20px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #f5576c;">
              <h2 style="margin-top: 0; color: #f5576c;">Detalles del Turno</h2>
              <p><strong>Servicio:</strong> ${appointment.service.name}</p>
              <p><strong>Profesional:</strong> ${appointment.professional.fullName}</p>
              <p><strong>Fecha:</strong> ${formatDate(startDate)}</p>
              <p><strong>Hora:</strong> ${formatTime(startDate)}</p>
            </div>

            <p>¡Te esperamos!</p>
            ${tenant?.phone ? `<p>Si necesitas cancelar o reprogramar, contáctanos al: <strong>${tenant.phone}</strong></p>` : ''}
          </div>
        </body>
      </html>
    `;
  }

  private getCancellationTemplate(appointment: any, tenant: any, reason?: string): string {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #fa709a 0%, #fee140 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="color: white; margin: 0;">❌ Turno Cancelado</h1>
          </div>
          <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
            <p>Hola <strong>${appointment.customer.firstName} ${appointment.customer.lastName}</strong>,</p>
            <p>Lamentamos informarte que tu turno ha sido cancelado.</p>
            
            <div style="background: white; padding: 20px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #fa709a;">
              <h2 style="margin-top: 0; color: #fa709a;">Turno Cancelado</h2>
              <p><strong>Servicio:</strong> ${appointment.service.name}</p>
              <p><strong>Profesional:</strong> ${appointment.professional.fullName}</p>
              ${reason ? `<p><strong>Motivo:</strong> ${reason}</p>` : ''}
            </div>

            <p>Si tienes alguna consulta o deseas reprogramar, por favor contáctanos.</p>
            ${tenant?.phone ? `<p>Teléfono: <strong>${tenant.phone}</strong></p>` : ''}
            ${tenant?.email ? `<p>Email: <strong>${tenant.email}</strong></p>` : ''}
          </div>
        </body>
      </html>
    `;
  }

  // Generar archivo .ics para calendarios
  private generateICS(
    serviceName: string,
    professionalName: string,
    startDate: Date,
    endDate: Date,
    location: string,
  ): string {
    const formatICSDate = (date: Date) => {
      return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    };

    return [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Turnero//Turnero//ES',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      `DTSTART:${formatICSDate(startDate)}`,
      `DTEND:${formatICSDate(endDate)}`,
      `SUMMARY:${serviceName} - ${professionalName}`,
      `DESCRIPTION:Turno con ${professionalName} para ${serviceName}`,
      `LOCATION:${location}`,
      'STATUS:CONFIRMED',
      'SEQUENCE:0',
      'BEGIN:VALARM',
      'TRIGGER:-PT24H',
      'ACTION:DISPLAY',
      'DESCRIPTION:Recordatorio de turno',
      'END:VALARM',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
  }
}

