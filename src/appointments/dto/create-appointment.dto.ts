import {
  IsString,
  IsDateString,
  IsOptional,
  IsEnum,
  IsNotEmpty,
  IsEmail,
  MinLength,
  MaxLength,
  Matches
} from 'class-validator';
import { AppointmentStatus } from '@prisma/client';

export class CreateAppointmentDto {
  // Datos del cliente (si no existe, se crea)
  @IsString({ message: 'El nombre debe ser texto' })
  @IsNotEmpty({ message: 'El nombre es requerido' })
  @MinLength(2, { message: 'El nombre debe tener al menos 2 caracteres' })
  @MaxLength(50, { message: 'El nombre no puede exceder 50 caracteres' })
  @Matches(/^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s'-]+$/, {
    message: 'El nombre solo puede contener letras, espacios, apóstrofes y guiones'
  })
  customerFirstName: string;

  @IsString({ message: 'El apellido debe ser texto' })
  @IsNotEmpty({ message: 'El apellido es requerido' })
  @MinLength(2, { message: 'El apellido debe tener al menos 2 caracteres' })
  @MaxLength(50, { message: 'El apellido no puede exceder 50 caracteres' })
  @Matches(/^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s'-]+$/, {
    message: 'El apellido solo puede contener letras, espacios, apóstrofes y guiones'
  })
  customerLastName: string;

  @IsEmail({}, { message: 'Ingresa un email válido' })
  @IsNotEmpty({ message: 'El email es requerido' })
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

