import { IsString, MaxLength } from 'class-validator';

export class MobileRefreshDto {
  @IsString()
  @MaxLength(4096)
  refresh_token: string;
}
