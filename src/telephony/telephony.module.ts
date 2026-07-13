import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VendorLeadMaskedContact } from './entities/vendor-lead-masked-contact.entity';
import { TelephonyService } from './telephony.service';

@Module({
  imports: [TypeOrmModule.forFeature([VendorLeadMaskedContact])],
  providers: [TelephonyService],
  exports: [TelephonyService],
})
export class TelephonyModule {}
