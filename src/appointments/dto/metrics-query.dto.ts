import { IsOptional, IsDateString } from 'class-validator';

export class MetricsQueryDto {
  @IsOptional()
  @IsDateString()
  startDate?: string; // YYYY-MM-DD

  @IsOptional()
  @IsDateString()
  endDate?: string; // YYYY-MM-DD
}
