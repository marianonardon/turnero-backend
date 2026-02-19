import { IsInt, IsString, IsPositive, Min } from 'class-validator';

export class PayAppointmentDto {
  @IsInt()
  @Min(1)
  playerCount: number;

  @IsString()
  paymentMethod: string; // "efectivo" | "transferencia" | "qr"
}
