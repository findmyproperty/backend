import {
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { VendorPayoutAccountType } from '../entities/vendor-payout-account.entity';

export class CreatePayoutAccountDto {
  @IsEnum(VendorPayoutAccountType)
  type: VendorPayoutAccountType;

  @IsString()
  @MinLength(3)
  beneficiaryName: string;

  @IsOptional()
  @IsString()
  label?: string;

  @ValidateIf(
    (body: CreatePayoutAccountDto) =>
      body.type === VendorPayoutAccountType.BANK_ACCOUNT,
  )
  @IsString()
  @Matches(/^[A-Z]{4}0[A-Z0-9]{6}$/i, {
    message: 'IFSC must be a valid 11-character IFSC code.',
  })
  ifsc?: string;

  @ValidateIf(
    (body: CreatePayoutAccountDto) =>
      body.type === VendorPayoutAccountType.BANK_ACCOUNT,
  )
  @IsString()
  @Matches(/^[0-9]{6,20}$/, {
    message: 'Account number must contain 6 to 20 digits.',
  })
  accountNumber?: string;

  @ValidateIf(
    (body: CreatePayoutAccountDto) => body.type === VendorPayoutAccountType.VPA,
  )
  @IsString()
  @Matches(/^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z][a-zA-Z0-9.\-_]{1,64}$/, {
    message: 'VPA address must be a valid UPI ID.',
  })
  vpaAddress?: string;
}
