import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersModule } from '../users/users.module';
import { JobConsultancyRequest } from './entities/job-consultancy-request.entity';
import { JobConsultancyAdminController } from './job-consultancy.admin.controller';
import { JobConsultancyController } from './job-consultancy.controller';
import { JobConsultancyNotifier } from './job-consultancy.notifier';
import { JobConsultancyService } from './job-consultancy.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([JobConsultancyRequest]),
    UsersModule,
  ],
  controllers: [JobConsultancyController, JobConsultancyAdminController],
  providers: [JobConsultancyService, JobConsultancyNotifier],
  exports: [JobConsultancyService],
})
export class JobConsultancyModule {}