import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateScheduleDto } from './dto/create-schedule.dto';

@Injectable()
export class SchedulesService {
  constructor(private prisma: PrismaService) {}

  async create(tenantId: string, createScheduleDto: CreateScheduleDto) {
    return this.prisma.schedule.create({
      data: {
        ...createScheduleDto,
        tenantId: createScheduleDto.professionalId ? null : tenantId,
      },
    });
  }

  async createMany(tenantId: string, schedules: CreateScheduleDto[]) {
    return this.prisma.schedule.createMany({
      data: schedules.map(schedule => ({
        ...schedule,
        tenantId: schedule.professionalId ? null : tenantId,
      })),
    });
  }

  async findByTenant(tenantId: string) {
    // Retornar TODOS los horarios del tenant (globales y por profesional)
    // Los horarios globales tienen tenantId y professionalId null
    // Los horarios por profesional tienen professionalId y tenantId null, pero el profesional pertenece al tenant
    return this.prisma.schedule.findMany({
      where: {
        OR: [
          // Horarios globales del tenant
          { tenantId, professionalId: null },
          // Horarios específicos de profesionales del tenant
          {
            professionalId: { not: null },
            professional: {
              tenantId,
            },
          },
        ],
      },
      include: {
        professional: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            fullName: true,
          },
        },
      },
      orderBy: [
        { dayOfWeek: 'asc' },
        { startTime: 'asc' },
      ],
    });
  }

  async findByProfessional(professionalId: string) {
    return this.prisma.schedule.findMany({
      where: { professionalId },
      orderBy: { dayOfWeek: 'asc' },
    });
  }

  async update(id: string, tenantId: string, updateData: Partial<CreateScheduleDto>) {
    // Si se está cambiando a un horario global (professionalId se elimina), establecer tenantId
    // Si se está cambiando a un horario por profesional, eliminar tenantId
    const data: any = { ...updateData };
    
    if (updateData.professionalId !== undefined) {
      if (updateData.professionalId === null || updateData.professionalId === '') {
        // Cambiar a horario global
        data.tenantId = tenantId;
        data.professionalId = null;
      } else {
        // Cambiar a horario por profesional
        data.tenantId = null;
        data.professionalId = updateData.professionalId;
      }
    }

    return this.prisma.schedule.update({
      where: { id },
      data,
    });
  }

  async remove(id: string) {
    return this.prisma.schedule.delete({
      where: { id },
    });
  }
}

