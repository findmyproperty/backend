import { IsString, MaxLength, MinLength } from 'class-validator';

export class RejectPropertyDto {
  @IsString()
  @MinLength(1)
  @MaxLength(10000)
  reason: string;
}
