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
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
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
          entities: [
            User,
            Property,
            SystemLog,
            Setting,
            PropertyLead,
            PropertyComment,
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
  ],
  providers: [
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },
  ],
})
export class AppModule {}
