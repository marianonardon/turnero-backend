import { IsString, IsDateString, IsOptional, IsEnum, IsNotEmpty, IsEmail } from 'class-validator';
import { AppointmentStatus } from '@prisma/client';

export class CreateAppointmentDto {
  // Datos del cliente (si no existe, se crea)
  @IsString()
  @IsNotEmpty()
  customerFirstName: string;

  @IsString()
  @IsNotEmpty()
  customerLastName: string;

  @IsEmail()
  @IsNotEmpty()
  customerEmail: string;

  @IsString()
  @IsOptional()
  customerPhone?: string;

  // Datos del turno
  @IsString()
  @IsNotEmpty()
  serviceId: string;

  @IsString()
  @IsNotEmpty()
  professionalId: string;

  @IsDateString()
  @IsNotEmpty()
  startTime: string; // ISO string

  @IsEnum(AppointmentStatus)
  @IsOptional()
  status?: AppointmentStatus;

  @IsString()
  @IsOptional()
  notes?: string;
}

