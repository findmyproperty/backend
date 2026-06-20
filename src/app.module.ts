import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { UsersModule } from './users/users.module';
import { User } from './users/entities/user.entity';
import { PropertiesModule } from './properties/properties.module';
import { Property } from './properties/entities/property.entity';
import { UploadsModule } from './uploads/uploads.module';
import { AuthModule } from './auth/auth.module';
import { CheckApiController } from './check-api.controller';
import { SystemLogsModule } from './system-logs/system-logs.module';
import { SystemLog } from './system-logs/entities/system-log.entity';
import { SettingsModule } from './settings/settings.module';
import { Setting } from './settings/entities/setting.entity';
import { AgentsModule } from './agents/agents.module';
import { LeadsModule } from './leads/leads.module';
import { AdminModule } from './admin/admin.module';
import { ContactModule } from './contact/contact.module';
import { PropertyLead } from './leads/entities/property-lead.entity';
import { PropertyComment } from './properties/entities/property-comment.entity';
import { ServiceRequestsModule } from './service-requests/service-requests.module';
import { ServiceRequest } from './service-requests/entities/service-request.entity';
import { LoanRequestsModule } from './loan-requests/loan-requests.module';
import { LoanRequest } from './loan-requests/entities/loan-request.entity';
import { JobConsultancyModule } from './job-consultancy/job-consultancy.module';
import { JobConsultancyRequest } from './job-consultancy/entities/job-consultancy-request.entity';
import { VendorProfile } from './vendors/entities/vendor-profile.entity';
import { VendorLead } from './vendor-leads/entities/vendor-lead.entity';
import { VendorLeadUpdate } from './vendor-leads/entities/vendor-lead-update.entity';
import { VendorLedgerEntry } from './vendor-wallet/entities/vendor-ledger-entry.entity';
import { VendorPayoutAccount } from './vendor-wallet/entities/vendor-payout-account.entity';
import { VendorWithdrawal } from './vendor-wallet/entities/vendor-withdrawal.entity';
import { VendorsModule } from './vendors/vendors.module';
import { VendorLeadsModule } from './vendor-leads/vendor-leads.module';
import { VendorWalletModule } from './vendor-wallet/vendor-wallet.module';
import { AdminWalletEntry } from './admin-wallet/entities/admin-wallet-entry.entity';
import { AdminWalletModule } from './admin-wallet/admin-wallet.module';
import { RazorpayWebhookEvent } from './razorpay/entities/razorpay-webhook-event.entity';
import { PaymentsModule } from './payments/payments.module';
import { Notification } from './notifications/entities/notification.entity';
import { NotificationsModule } from './notifications/notifications.module';
import { SupportTicket } from './support-tickets/entities/support-ticket.entity';
import { SupportTicketsModule } from './support-tickets/support-tickets.module';
import { MailModule } from './mail/mail.module';
import { EmailLog } from './mail/entities/email-log.entity';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';

@Module({
  controllers: [CheckApiController],
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '.env.local'],
      expandVariables: true,
    }),
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60_000,
        limit: 200,
      },
    ]),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        return {
          type: 'mysql',
          host: configService.get<string>('DB_HOST'),
          port: configService.get<number>('DB_PORT'),
          username: configService.get<string>('DB_USERNAME'),
          password: configService.get<string>('DB_PASSWORD'),
          database: configService.get<string>('DB_DATABASE'),
          // Force UTC on the wire so timestamps survive round-trips unchanged
          // regardless of the OS / MySQL server timezone. Without this,
          // `mysql2` defaults to 'local' and shifts DATETIMEs by the local
          // offset, producing "6 hours ago" on freshly-created rows in IST.
          timezone: 'Z',
          dateStrings: false,
          entities: [
            User,
            Property,
            SystemLog,
            Setting,
            PropertyLead,
            PropertyComment,
            ServiceRequest,
            LoanRequest,
            JobConsultancyRequest,
            VendorProfile,
            VendorLead,
            VendorLeadUpdate,
            VendorLedgerEntry,
            VendorPayoutAccount,
            VendorWithdrawal,
            AdminWalletEntry,
            RazorpayWebhookEvent,
            Notification,
            SupportTicket,
            EmailLog,
          ],
          synchronize: true, // Only for development!
        };
      },
    }),
    UsersModule,
    PropertiesModule,
    UploadsModule,
    AuthModule,
    SystemLogsModule,
    SettingsModule,
    AgentsModule,
    LeadsModule,
    AdminModule,
    ContactModule,
    ServiceRequestsModule,
    LoanRequestsModule,
    JobConsultancyModule,
    VendorsModule,
    VendorLeadsModule,
    AdminWalletModule,
    VendorWalletModule,
    PaymentsModule,
    NotificationsModule,
    SupportTicketsModule,
    MailModule,
  ],
  providers: [
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },
  ],
})
export class AppModule {}
