import { IsInt, Min } from 'class-validator';

export class AdminLoginAsDto {
  @IsInt()
  @Min(1)
  userId: number;
}
