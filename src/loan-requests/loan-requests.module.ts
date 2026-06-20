import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersModule } from '../users/users.module';
import { LoanRequest } from './entities/loan-request.entity';
import { LoanRequestsAdminController } from './loan-requests.admin.controller';
import { LoanRequestsController } from './loan-requests.controller';
import { LoanRequestsNotifier } from './loan-requests.notifier';
import { LoanRequestsService } from './loan-requests.service';

@Module({
  imports: [TypeOrmModule.forFeature([LoanRequest]), UsersModule],
  controllers: [LoanRequestsController, LoanRequestsAdminController],
  providers: [LoanRequestsService, LoanRequestsNotifier],
  exports: [LoanRequestsService],
})
export class LoanRequestsModule {}