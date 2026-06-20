import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersModule } from '../users/users.module';
import { EmailLog } from './entities/email-log.entity';
import { EmailLogsAdminController } from './email-logs.admin.controller';
import { EmailLogsService } from './email-logs.service';
import { MailService } from './mail.service';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([EmailLog]), UsersModule],
  controllers: [EmailLogsAdminController],
  providers: [MailService, EmailLogsService],
  exports: [MailService, EmailLogsService],
})
export class MailModule {}