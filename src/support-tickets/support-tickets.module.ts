import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SupportTicket } from './entities/support-ticket.entity';
import { SupportTicketsService } from './support-tickets.service';
import { SupportTicketsController } from './support-tickets.controller';
import { SupportTicketsAdminController } from './support-tickets.admin.controller';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [TypeOrmModule.forFeature([SupportTicket]), UsersModule],
  controllers: [SupportTicketsController, SupportTicketsAdminController],
  providers: [SupportTicketsService],
})
export class SupportTicketsModule {}
