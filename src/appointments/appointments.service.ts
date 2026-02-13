import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { AvailabilityQueryDto } from './dto/availability-query.dto';
import { AppointmentStatus } from '@prisma/client';
import { utcToZonedTime, zonedTimeToUtc, format as formatTz } from 'date-fns-tz';
import { startOfDay, endOfDay, parseISO, getDay } from 'date-fns';

@Injectable()
export class AppointmentsService {
  constructor(
    private prisma: PrismaService,
    private notificationsService: NotificationsService,
  ) {}

  async create(tenantId: string, createAppointmentDto: CreateAppointmentDto) {
    try {
      console.log('🔵 Starting appointment creation transaction:', {
        tenantId,
        serviceId: createAppointmentDto.serviceId,
        professionalId: createAppointmentDto.professionalId,
        startTime: createAppointmentDto.startTime,
      });

      // Usar transacción para prevenir race conditions
      // Aumentar timeout a 15 segundos para evitar problemas de timeout
      return await this.prisma.$transaction(async (tx) => {
        // SECURITY FIX: Validar que el servicio pertenece al tenant
        const service = await tx.service.findFirst({
          where: {
            id: createAppointmentDto.serviceId,
            tenantId: tenantId,
          },
        });

        if (!service) {
          console.error('❌ Service not found or does not belong to tenant:', {
            serviceId: createAppointmentDto.serviceId,
            tenantId,
          });
          throw new NotFoundException('Service not found or you do not have access to it');
        }

        // SECURITY FIX: Validar que el professional pertenece al tenant
        const professional = await tx.professional.findFirst({
          where: {
            id: createAppointmentDto.professionalId,
            tenantId: tenantId,
          },
        });

        if (!professional) {
          console.error('❌ Professional not found or does not belong to tenant:', {
            professionalId: createAppointmentDto.professionalId,
            tenantId,
          });
          throw new NotFoundException('Professional not found or you do not have access to it');
        }

        console.log('✅ Service found:', { id: service.id, duration: service.duration });

        // Obtener tenant para timezone
        const tenant = await tx.tenant.findUnique({
          where: { id: tenantId },
          select: { timezone: true, name: true }
        });

        if (!tenant) {
          throw new NotFoundException('Tenant not found');
        }

        const timezone = tenant.timezone || 'UTC';
        console.log('🌍 Using tenant timezone for appointment:', timezone);

        // Parsear la fecha del appointment en el timezone del tenant
        // Si el string ya tiene Z (UTC), parsearlo como UTC
        // Si no tiene Z, asumirlo como hora local del tenant y convertir a UTC
        let startTime: Date;
        if (createAppointmentDto.startTime.endsWith('Z')) {
          // Es UTC, usar directamente
          startTime = new Date(createAppointmentDto.startTime);
          console.log('📅 Received UTC time:', createAppointmentDto.startTime);
        } else {
          // Es hora local del tenant, convertir a UTC
          startTime = zonedTimeToUtc(createAppointmentDto.startTime, timezone);
          console.log('📅 Received local time, converted:', {
            input: createAppointmentDto.startTime,
            timezone,
            utc: startTime.toISOString(),
          });
        }

        const endTime = new Date(startTime);
        endTime.setMinutes(endTime.getMinutes() + service.duration);

        console.log('⏰ Calculated times:', {
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
        });

      // Primero, obtener o crear el customer para verificar duplicados
      const customer = await tx.customer.upsert({
        where: {
          tenantId_email: {
            tenantId,
            email: createAppointmentDto['customerEmail'] || 'unknown@example.com',
          },
        },
        update: {},
        create: {
          tenantId,
          firstName: createAppointmentDto['customerFirstName'] || 'Cliente',
          lastName: createAppointmentDto['customerLastName'] || 'Anónimo',
          email: createAppointmentDto['customerEmail'] || 'unknown@example.com',
        },
      });

      // Verificar duplicados exactos PRIMERO (mismo cliente, mismo horario)
      // Buscar turnos del mismo cliente en el mismo horario (ventana de 1 minuto)
      const duplicateAppointment = await tx.appointment.findFirst({
        where: {
          tenantId,
          customerId: customer.id,
          professionalId: createAppointmentDto.professionalId,
          status: {
            not: AppointmentStatus.CANCELLED,
          },
          startTime: {
            gte: new Date(startTime.getTime() - 60000), // 1 minuto antes
            lte: new Date(startTime.getTime() + 60000), // 1 minuto después
          },
        },
      });

      if (duplicateAppointment) {
        console.warn('⚠️ Duplicate appointment found:', {
          duplicateId: duplicateAppointment.id,
          duplicateStart: duplicateAppointment.startTime,
          newStart: startTime,
          customerId: customer.id,
          customerEmail: customer.email,
        });
        throw new ConflictException('Ya tienes un turno reservado en este horario. Por favor verifica tus turnos.');
      }

      // Verificar conflictos de horario (turnos que se solapan con otros clientes)
      const conflicting = await tx.appointment.findFirst({
        where: {
          tenantId,
          professionalId: createAppointmentDto.professionalId,
          status: {
            not: AppointmentStatus.CANCELLED,
          },
          OR: [
            // El nuevo turno empieza durante un turno existente
            {
              startTime: {
                lte: startTime,
              },
              endTime: {
                gt: startTime,
              },
            },
            // El nuevo turno termina durante un turno existente
            {
              startTime: {
                lt: endTime,
              },
              endTime: {
                gte: endTime,
              },
            },
            // El nuevo turno contiene completamente un turno existente
            {
              startTime: {
                gte: startTime,
              },
              endTime: {
                lte: endTime,
              },
            },
          ],
        },
      });

      if (conflicting) {
        console.warn('⚠️ Conflicting appointment found:', {
          conflictingId: conflicting.id,
          conflictingStart: conflicting.startTime,
          conflictingEnd: conflicting.endTime,
          newStart: startTime,
          newEnd: endTime,
        });
        throw new ConflictException('Este horario ya está reservado. Por favor selecciona otro horario.');
      }

        // Crear appointment dentro de la transacción
        console.log('📝 Creating appointment in transaction...');
        const appointment = await tx.appointment.create({
          data: {
            tenantId,
            customerId: customer.id,
            serviceId: createAppointmentDto.serviceId,
            professionalId: createAppointmentDto.professionalId,
            startTime,
            endTime,
            status: createAppointmentDto.status || AppointmentStatus.PENDING,
            notes: createAppointmentDto.notes,
          },
          include: {
            customer: true,
            service: true,
            professional: true,
          },
        });

        console.log('✅ Appointment created in transaction:', appointment.id);
        return appointment;
      }, {
        maxWait: 15000, // Esperar hasta 15 segundos para que la transacción comience
        timeout: 15000, // Timeout de 15 segundos para la transacción completa
      }).then(async (appointment) => {
        // Enviar email de confirmación después de que la transacción se complete
        // No bloquear si falla
        try {
          await this.notificationsService.sendAppointmentConfirmation(appointment.id);
        } catch (error) {
          console.error('Error sending confirmation email:', error);
          // No fallar la creación del appointment si el email falla
        }
        return appointment;
      });
    } catch (error) {
      console.error('❌ Error in create appointment:', {
        error: error.message,
        stack: error.stack,
        tenantId,
        createAppointmentDto,
      });
      throw error;
    }
  }

  async getAvailability(tenantId: string, query: AvailabilityQueryDto) {
    console.log('🔍 getAvailability called with:', { tenantId, query });

    // Parsear fecha correctamente (formato ISO: 'YYYY-MM-DD')
    if (!query.date) {
      throw new BadRequestException('Date is required');
    }

    // Validar formato YYYY-MM-DD
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(query.date)) {
      throw new BadRequestException(`Invalid date format: ${query.date}. Expected YYYY-MM-DD`);
    }

    const dateParts = query.date.split('-');
    const year = parseInt(dateParts[0]);
    const month = parseInt(dateParts[1]);
    const day = parseInt(dateParts[2]);

    // Validar rangos válidos
    if (month < 1 || month > 12) {
      throw new BadRequestException(`Invalid month: ${month}. Must be between 1 and 12`);
    }
    if (day < 1 || day > 31) {
      throw new BadRequestException(`Invalid day: ${day}. Must be between 1 and 31`);
    }

    // ✅ TIMEZONE FIX IMPLEMENTED
    // Obtener tenant para usar su timezone
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { timezone: true, name: true }
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    const timezone = tenant.timezone || 'UTC'; // Fallback a UTC si no está configurado
    console.log('🌍 Using tenant timezone:', timezone, 'for tenant:', tenant.name);

    // Parsear la fecha en la zona horaria del tenant (no UTC)
    // Crear fecha "naive" en la zona horaria local del tenant
    const dateString = `${query.date}T00:00:00`; // YYYY-MM-DDT00:00:00
    const dateInTenantTz = zonedTimeToUtc(dateString, timezone);

    console.log('📅 Parsed date in tenant timezone:', {
      input: query.date,
      timezone,
      dateInTenantTz: dateInTenantTz.toISOString(),
      dateString,
    });

    if (isNaN(dateInTenantTz.getTime())) {
      throw new BadRequestException(`Invalid date: ${query.date}`);
    }

    // Validar que la fecha no sea más de 1 año en el futuro
    const oneYearFromNow = new Date();
    oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);
    if (dateInTenantTz > oneYearFromNow) {
      throw new BadRequestException('Cannot create appointments more than 1 year in advance');
    }

    // Crear startOfDay y endOfDay EN LA ZONA HORARIA DEL TENANT
    const startOfDayLocal = zonedTimeToUtc(`${query.date}T00:00:00`, timezone);
    const endOfDayLocal = zonedTimeToUtc(`${query.date}T23:59:59`, timezone);

    console.log('📅 Day boundaries:', {
      startOfDay: startOfDayLocal.toISOString(),
      endOfDay: endOfDayLocal.toISOString(),
    });

    // Verificar que el profesional pertenezca al tenant
    const professional = await this.prisma.professional.findFirst({
      where: {
        id: query.professionalId,
        tenantId,
      },
    });

    if (!professional) {
      throw new NotFoundException('Professional not found');
    }

    // Calcular dayOfWeek en la zona horaria del tenant (NO en UTC)
    // Convertir la fecha UTC a la zona horaria del tenant para obtener el día correcto
    const dateInLocalTz = utcToZonedTime(dateInTenantTz, timezone);
    const dayOfWeek = getDay(dateInLocalTz); // 0 (Domingo) a 6 (Sábado) en zona local

    console.log('🔍 Searching schedules:', {
      tenantId,
      professionalId: query.professionalId,
      dayOfWeek,
      dayOfWeekName: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dayOfWeek],
      dateInLocalTz: formatTz(dateInLocalTz, 'yyyy-MM-dd HH:mm:ss zzz', { timeZone: timezone }),
    });

    // Buscar horarios específicos del profesional primero
    const professionalSchedules = await this.prisma.schedule.findMany({
      where: {
        professionalId: query.professionalId,
        dayOfWeek,
        isException: false,
      },
    });

    console.log('👤 Professional schedules found:', professionalSchedules.length);
    if (professionalSchedules.length > 0) {
      console.log('👤 Professional schedules details:', professionalSchedules.map(s => ({
        id: s.id,
        startTime: s.startTime,
        endTime: s.endTime,
        dayOfWeek: s.dayOfWeek,
      })));
    }

    // Buscar horarios globales del tenant
    const globalSchedules = await this.prisma.schedule.findMany({
      where: {
        tenantId,
        professionalId: null,
        dayOfWeek,
        isException: false,
      },
    });

    console.log('🌐 Global schedules found:', globalSchedules.length);
    if (globalSchedules.length > 0) {
      console.log('🌐 Global schedules details:', globalSchedules.map(s => ({
        id: s.id,
        startTime: s.startTime,
        endTime: s.endTime,
        dayOfWeek: s.dayOfWeek,
      })));
    }

    // Combinar ambos tipos de horarios
    // Si hay horarios específicos del profesional, usar solo esos
    // Si no, usar los horarios globales
    const schedules = professionalSchedules.length > 0 
      ? professionalSchedules 
      : globalSchedules;

    // Debug: Log para verificar qué horarios se encontraron
    console.log('🔍 Availability Debug:', {
      tenantId,
      professionalId: query.professionalId,
      date: query.date,
      dayOfWeek,
      schedulesFound: schedules.length,
      professionalSchedulesCount: professionalSchedules.length,
      globalSchedulesCount: globalSchedules.length,
      usingProfessionalSchedules: professionalSchedules.length > 0,
      schedules: schedules.map(s => ({
        id: s.id,
        professionalId: s.professionalId,
        tenantId: s.tenantId,
        dayOfWeek: s.dayOfWeek,
        startTime: s.startTime,
        endTime: s.endTime,
        isException: s.isException,
      })),
    });

    if (schedules.length === 0) {
      return []; // No hay horarios configurados
    }

    // Obtener appointments existentes (incluyendo PENDING, CONFIRMED, COMPLETED)
    // Excluir solo CANCELLED y NO_SHOW
    const appointments = await this.prisma.appointment.findMany({
      where: {
        tenantId,
        professionalId: query.professionalId,
        startTime: {
          gte: startOfDayLocal,
          lte: endOfDayLocal,
        },
        status: {
          notIn: [AppointmentStatus.CANCELLED, AppointmentStatus.NO_SHOW],
        },
      },
      orderBy: {
        startTime: 'asc',
      },
    });
    
    console.log(`📅 Found ${appointments.length} existing appointments for ${query.date}:`, 
      appointments.map(apt => ({
        id: apt.id,
        startTime: apt.startTime.toISOString(),
        endTime: apt.endTime.toISOString(),
        status: apt.status,
      }))
    );

    // Generar slots disponibles
    const slots: { time: string; available: boolean }[] = [];
    const serviceDuration = query.serviceId
      ? (await this.prisma.service.findUnique({ where: { id: query.serviceId } }))?.duration || 30
      : 30;

    console.log('⏱️ Service duration:', serviceDuration, 'minutes');
    console.log('📅 Existing appointments:', appointments.length);

    // Por cada schedule, generar slots EN LA ZONA HORARIA DEL TENANT
    for (const schedule of schedules) {
      const [startHour, startMinute] = schedule.startTime.split(':').map(Number);
      const [endHour, endMinute] = schedule.endTime.split(':').map(Number);

      // Crear fechas en la zona horaria del tenant
      const scheduleStartString = `${query.date}T${schedule.startTime}:00`;
      const scheduleEndString = `${query.date}T${schedule.endTime}:00`;

      // Convertir a UTC para almacenamiento/comparación
      const scheduleStart = zonedTimeToUtc(scheduleStartString, timezone);
      const scheduleEnd = zonedTimeToUtc(scheduleEndString, timezone);

      console.log(`📋 Processing schedule: ${schedule.startTime} - ${schedule.endTime} (tenant local time)`);
      console.log(`   Schedule start (UTC): ${scheduleStart.toISOString()}`);
      console.log(`   Schedule end (UTC): ${scheduleEnd.toISOString()}`);

      let currentTime = new Date(scheduleStart);
      let slotsGenerated = 0;

      while (currentTime < scheduleEnd) {
        const slotEnd = new Date(currentTime);
        slotEnd.setMinutes(slotEnd.getMinutes() + serviceDuration);

        if (slotEnd > scheduleEnd) break;

        // Convertir currentTime a zona horaria del tenant para mostrar la hora LOCAL
        const currentTimeInTenantTz = utcToZonedTime(currentTime, timezone);
        const hours = currentTimeInTenantTz.getHours();
        const minutes = currentTimeInTenantTz.getMinutes();
        const timeString = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;

        // Verificar si hay conflicto con appointments existentes
        const hasConflict = appointments.some(apt => {
          const aptStart = new Date(apt.startTime);
          const aptEnd = new Date(apt.endTime);
          return (
            (currentTime >= aptStart && currentTime < aptEnd) ||
            (slotEnd > aptStart && slotEnd <= aptEnd) ||
            (currentTime <= aptStart && slotEnd >= aptEnd)
          );
        });

        // Verificar que no sea en el pasado (comparar en UTC es correcto)
        const now = new Date();
        const isPast = currentTime.getTime() < now.getTime();

        const available = !hasConflict && !isPast;

        // Debug para los primeros slots
        if (slots.length < 3) {
          console.log(`   Slot ${timeString} (local): available=${available}, hasConflict=${hasConflict}, isPast=${isPast}`);
          console.log(`      currentTime (UTC): ${currentTime.toISOString()}`);
          console.log(`      currentTime (local): ${formatTz(currentTimeInTenantTz, 'yyyy-MM-dd HH:mm:ss zzz', { timeZone: timezone })}`);
          console.log(`      now (UTC): ${now.toISOString()}`);
        }

        slots.push({
          time: timeString,
          available,
        });

        slotsGenerated++;

        // Incrementar por la duración del servicio (o 30 min mínimo)
        currentTime.setMinutes(currentTime.getMinutes() + Math.max(serviceDuration, 30));
      }

      console.log(`   Generated ${slotsGenerated} slots from this schedule`);
    }

    // Eliminar slots duplicados (mismo tiempo)
    // Usar un Map para mantener solo el último slot de cada tiempo
    const uniqueSlotsMap = new Map<string, { time: string; available: boolean }>();
    
    for (const slot of slots) {
      // Si ya existe un slot con este tiempo, mantener el que tenga available=true si es posible
      const existing = uniqueSlotsMap.get(slot.time);
      if (!existing || (slot.available && !existing.available)) {
        uniqueSlotsMap.set(slot.time, slot);
      }
    }
    
    const uniqueSlots = Array.from(uniqueSlotsMap.values());
    const availableSlots = uniqueSlots.filter(s => s.available);
    const unavailableSlots = uniqueSlots.filter(s => !s.available);
    
    console.log(`✅ Total slots generated: ${slots.length}`);
    console.log(`✅ Unique slots: ${uniqueSlots.length}`);
    console.log(`✅ Available slots: ${availableSlots.length}`);
    console.log(`❌ Unavailable slots: ${unavailableSlots.length}`);
    
    if (availableSlots.length > 0) {
      console.log(`📊 First 10 available slots:`, availableSlots.slice(0, 10).map(s => s.time));
    } else {
      console.warn('⚠️ NO AVAILABLE SLOTS FOUND!');
      console.log('📊 First 10 unavailable slots (for debugging):', unavailableSlots.slice(0, 10).map(s => ({
        time: s.time,
        available: s.available,
      })));
    }

    return uniqueSlots;
  }

  // Público: Obtener appointments del día (solo para visualización, sin datos sensibles)
  async getDayAppointments(tenantId: string, date: string) {
    const dateParts = date.split('-');
    if (dateParts.length !== 3) {
      throw new Error(`Invalid date format: ${date}. Expected YYYY-MM-DD`);
    }

    const startOfDay = new Date(Date.UTC(
      parseInt(dateParts[0]),
      parseInt(dateParts[1]) - 1,
      parseInt(dateParts[2]),
      0, 0, 0, 0
    ));
    const endOfDay = new Date(Date.UTC(
      parseInt(dateParts[0]),
      parseInt(dateParts[1]) - 1,
      parseInt(dateParts[2]),
      23, 59, 59, 999
    ));

    const appointments = await this.prisma.appointment.findMany({
      where: {
        tenantId,
        startTime: {
          gte: startOfDay,
          lte: endOfDay,
        },
        status: {
          notIn: [AppointmentStatus.CANCELLED, AppointmentStatus.NO_SHOW],
        },
      },
      select: {
        id: true,
        professionalId: true,
        startTime: true,
        endTime: true,
        service: {
          select: {
            duration: true,
          },
        },
      },
      orderBy: {
        startTime: 'asc',
      },
    });

    return appointments;
  }

  async findAll(tenantId: string, filters?: {
    professionalId?: string;
    status?: AppointmentStatus;
    startDate?: Date;
    endDate?: Date;
  }) {
    console.log('🔍 [findAll] Called with:', {
      tenantId,
      filters,
    });

    const appointments = await this.prisma.appointment.findMany({
      where: {
        tenantId,
        ...(filters?.professionalId && { professionalId: filters.professionalId }),
        ...(filters?.status && { status: filters.status }),
        ...(filters?.startDate && filters?.endDate && {
          startTime: {
            gte: filters.startDate,
            lte: filters.endDate,
          },
        }),
      },
      include: {
        customer: true,
        service: true,
        professional: true,
      },
      orderBy: { startTime: 'asc' },
    });

    console.log(`✅ [findAll] Found ${appointments.length} appointments for tenant ${tenantId}`);

    return appointments;
  }

  async findOne(id: string, tenantId: string) {
    const appointment = await this.prisma.appointment.findFirst({
      where: {
        id,
        tenantId,
      },
      include: {
        customer: true,
        service: true,
        professional: true,
      },
    });

    if (!appointment) {
      throw new NotFoundException(`Appointment with ID "${id}" not found`);
    }

    return appointment;
  }

  async cancel(id: string, tenantId: string, reason?: string, cancelledBy?: string) {
    await this.findOne(id, tenantId);

    return this.prisma.appointment.update({
      where: { id },
      data: {
        status: AppointmentStatus.CANCELLED,
        cancelledAt: new Date(),
        cancellationReason: reason,
        cancelledBy: cancelledBy || 'admin',
      },
    });
  }

  async remove(id: string, tenantId: string) {
    await this.findOne(id, tenantId);

    return this.prisma.appointment.delete({
      where: { id },
    });
  }
}
