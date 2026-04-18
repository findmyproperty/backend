import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersModule } from '../users/users.module';
import { ServiceRequest } from './entities/service-request.entity';
import { ServiceRequestsController } from './service-requests.controller';
import { ServiceRequestsAdminController } from './service-requests.admin.controller';
import { ServiceRequestsService } from './service-requests.service';
import { ServiceRequestsNotifier } from './service-requests.notifier';
import { DistanceService } from './distance.service';

@Module({
  imports: [TypeOrmModule.forFeature([ServiceRequest]), UsersModule],
  controllers: [ServiceRequestsController, ServiceRequestsAdminController],
  providers: [ServiceRequestsService, ServiceRequestsNotifier, DistanceService],
  exports: [ServiceRequestsService],
})
export class ServiceRequestsModule {}
