import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateLeadDto {
  @IsInt()
  @Min(1)
  propertyId: number;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  message?: string;
}
