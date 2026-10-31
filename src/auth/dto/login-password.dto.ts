import { IsString, MaxLength, MinLength } from 'class-validator';

export class LoginPasswordDto {
  @IsString()
  phone: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password: string;
}
