import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VendorProfile } from './entities/vendor-profile.entity';
import { VendorsService } from './vendors.service';
import { VendorsController } from './vendors.controller';
import { VendorsAdminController } from './vendors.admin.controller';
import { VendorsNotifier } from './vendors.notifier';
import { UsersModule } from '../users/users.module';
import { User } from '../users/entities/user.entity';
import { VendorLead } from '../vendor-leads/entities/vendor-lead.entity';
import { VendorsPublicController } from './vendors.public.controller';
import { Category } from '../categories/entities/category.entity';
import { CategoryServiceMapping } from '../categories/entities/category-service-mapping.entity';
import { ServiceRequest } from '../service-requests/entities/service-request.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      VendorProfile,
      User,
      VendorLead,
      Category,
      CategoryServiceMapping,
      ServiceRequest,
    ]),
    UsersModule,
  ],
  controllers: [VendorsController, VendorsAdminController, VendorsPublicController],
  providers: [VendorsService, VendorsNotifier],
  exports: [VendorsService],
})
export class VendorsModule {}
