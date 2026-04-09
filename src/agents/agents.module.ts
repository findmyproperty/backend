import { Module } from '@nestjs/common';
import { AgentsController } from './agents.controller';
import { UsersModule } from '../users/users.module';
import { AuthModule } from '../auth/auth.module';
import { PropertiesModule } from '../properties/properties.module';

@Module({
  imports: [UsersModule, AuthModule, PropertiesModule],
  controllers: [AgentsController],
})
export class AgentsModule {}
