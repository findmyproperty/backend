import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Category } from '../categories/entities/category.entity';
import { UsersModule } from '../users/users.module';
import { VendorProfile } from '../vendors/entities/vendor-profile.entity';
import { ServiceRequest } from './entities/service-request.entity';
import { ServiceRequestsController } from './service-requests.controller';
import { ServiceRequestsAdminController } from './service-requests.admin.controller';
import { ServiceRequestsService } from './service-requests.service';
import { ServiceRequestsNotifier } from './service-requests.notifier';
import { DistanceService } from './distance.service';
import { VendorLeadsModule } from '../vendor-leads/vendor-leads.module';
import { VendorsModule } from '../vendors/vendors.module';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ServiceRequest, VendorProfile, Category]),
    UsersModule,
    VendorLeadsModule,
    VendorsModule,
    SettingsModule,
  ],
  controllers: [ServiceRequestsController, ServiceRequestsAdminController],
  providers: [ServiceRequestsService, ServiceRequestsNotifier, DistanceService],
  exports: [ServiceRequestsService],
})
export class ServiceRequestsModule {}
