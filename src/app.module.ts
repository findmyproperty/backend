import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { UsersModule } from './users/users.module';
import { User } from './users/entities/user.entity';
import { PropertiesModule } from './properties/properties.module';
import { Property } from './properties/entities/property.entity';
import { UploadsModule } from './uploads/uploads.module';
import { AuthModule } from './auth/auth.module';
import * as fs from 'fs';
import * as path from 'path';
import { CheckApiController } from './check-api.controller';

@Module({
  controllers: [CheckApiController],
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const caPath = path.resolve(process.cwd(), 'ca.pem');
        const ca = fs.existsSync(caPath) ? fs.readFileSync(caPath).toString() : undefined;

        return {
          type: 'postgres',
          host: configService.get<string>('DB_HOST'),
          port: configService.get<number>('DB_PORT'),
          username: configService.get<string>('DB_USERNAME'),
          password: configService.get<string>('DB_PASSWORD'),
          database: configService.get<string>('DB_DATABASE'),
          entities: [User, Property],
          synchronize: true, // Only for development!
          ssl: ca
            ? { ca, rejectUnauthorized: true }
            : { rejectUnauthorized: false },
        };
      },
    }),
    UsersModule,
    PropertiesModule,
    UploadsModule,
    AuthModule,
  ],
})
export class AppModule { }
