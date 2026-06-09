import { IsArray, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateVendorLeadUpdateDto {
  @IsString()
  @MaxLength(64)
  milestone: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  note?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  photoUrls?: string[];
}
