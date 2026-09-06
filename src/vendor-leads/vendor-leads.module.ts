import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VendorLead } from './entities/vendor-lead.entity';
import { VendorLeadUpdate } from './entities/vendor-lead-update.entity';
import { ServiceRequest } from '../service-requests/entities/service-request.entity';
import { VendorLeadsService } from './vendor-leads.service';
import { VendorLeadsController } from './vendor-leads.controller';
import { VendorLeadsAdminController } from './vendor-leads.admin.controller';
import { VendorLeadsNotifier } from './vendor-leads.notifier';
import { VendorsModule } from '../vendors/vendors.module';
import { VendorWalletModule } from '../vendor-wallet/vendor-wallet.module';
import { UsersModule } from '../users/users.module';
import { TelephonyModule } from '../telephony/telephony.module';
import { CategoriesModule } from '../categories/categories.module';

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
    CategoriesModule,
  ],
  controllers: [VendorLeadsController, VendorLeadsAdminController],
  providers: [VendorLeadsService, VendorLeadsNotifier],
  exports: [VendorLeadsService],
})
export class VendorLeadsModule {}
