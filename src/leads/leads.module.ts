import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LeadsController } from './leads.controller';
import { LeadsNotifier } from './leads.notifier';
import { LeadsService } from './leads.service';
import { PropertyLead } from './entities/property-lead.entity';
import { PropertiesModule } from '../properties/properties.module';
import { User } from '../users/entities/user.entity';
import { Property } from '../properties/entities/property.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([PropertyLead, User, Property]),
    PropertiesModule,
  ],
  controllers: [LeadsController],
  providers: [LeadsService, LeadsNotifier],
})
export class LeadsModule {}
