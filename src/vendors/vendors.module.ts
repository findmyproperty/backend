import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VendorProfile } from './entities/vendor-profile.entity';
import { VendorsService } from './vendors.service';
import { VendorsController } from './vendors.controller';
import { VendorsAdminController } from './vendors.admin.controller';
import { UsersModule } from '../users/users.module';
import { User } from '../users/entities/user.entity';
import { VendorLead } from '../vendor-leads/entities/vendor-lead.entity';
import { VendorsPublicController } from './vendors.public.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([VendorProfile, User, VendorLead]),
    UsersModule,
  ],
  controllers: [VendorsController, VendorsAdminController, VendorsPublicController],
  providers: [VendorsService],
  exports: [VendorsService],
})
export class VendorsModule {}
