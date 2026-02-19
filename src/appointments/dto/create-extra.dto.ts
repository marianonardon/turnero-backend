import { IsString, IsNumber, IsInt, Min, IsNotEmpty } from 'class-validator';

export class CreateExtraDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsNumber()
  @Min(0)
  unitPrice: number;

  @IsInt()
  @Min(0)
  dividedAmong: number; // 0 = todos los jugadores
}
