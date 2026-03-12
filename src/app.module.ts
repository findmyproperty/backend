import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { UsersModule } from './users/users.module';
import { User } from './users/entities/user.entity';
import { PropertiesModule } from './properties/properties.module';
import { Property } from './properties/entities/property.entity';
import { UploadsModule } from './uploads/uploads.module';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TypeOrmModule.forRoot({
      type: 'sqlite',
      database: 'db.sqlite',
      entities: [User, Property],
      synchronize: true, // Only for development!
    }),
    UsersModule,
    PropertiesModule,
    UploadsModule,
    AuthModule,
  ],
})
export class AppModule { }
