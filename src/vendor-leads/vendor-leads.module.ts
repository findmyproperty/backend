import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VendorLead } from './entities/vendor-lead.entity';
import { VendorLeadUpdate } from './entities/vendor-lead-update.entity';
import { ServiceRequest } from '../service-requests/entities/service-request.entity';
import { VendorLeadsService } from './vendor-leads.service';
import { VendorLeadsController } from './vendor-leads.controller';
import { VendorLeadsAdminController } from './vendor-leads.admin.controller';
import { VendorsModule } from '../vendors/vendors.module';
import { VendorWalletModule } from '../vendor-wallet/vendor-wallet.module';
import { UsersModule } from '../users/users.module';
import { TelephonyModule } from '../telephony/telephony.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      VendorLead,
      VendorLeadUpdate,
      ServiceRequest,
    ]),
    VendorsModule,
    VendorWalletModule,
    UsersModule,
    TelephonyModule,
  ],
  controllers: [VendorLeadsController, VendorLeadsAdminController],
  providers: [VendorLeadsService],
  exports: [VendorLeadsService],
})
export class VendorLeadsModule {}
