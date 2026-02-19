import { IsString, IsNotEmpty, IsInt, Min, Max, IsDateString, IsOptional } from 'class-validator';

export class CreateRecurringSeriesDto {
  @IsString()
  @IsNotEmpty()
  customerId: string;

  @IsString()
  @IsNotEmpty()
  serviceId: string;

  @IsString()
  @IsNotEmpty()
  professionalId: string;

  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek: number; // 0 = Domingo, 6 = Sábado

  @IsString()
  @IsNotEmpty()
  startTime: string; // HH:mm format (ej: "14:00")

  @IsInt()
  @Min(1)
  @Max(52)
  weeksAhead: number; // Cuántas semanas generar adelante (default: 8)

  @IsDateString()
  seriesStart: string; // Fecha de inicio de la serie (YYYY-MM-DD)

  @IsOptional()
  @IsDateString()
  seriesEnd?: string; // Fecha de fin opcional (YYYY-MM-DD)
}
