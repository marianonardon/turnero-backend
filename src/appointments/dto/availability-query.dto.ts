import { IsString, IsDateString, IsOptional, IsNotEmpty } from 'class-validator';

export class AvailabilityQueryDto {
  @IsString()
  @IsOptional()
  tenantSlug?: string; // No se valida aquí, se usa en el controlador

  @IsString()
  @IsNotEmpty()
  professionalId: string;

  @IsDateString()
  @IsNotEmpty()
  date: string; // ISO date string (solo fecha, sin hora)

  @IsString()
  @IsOptional()
  serviceId?: string; // Para calcular duración del servicio
}

