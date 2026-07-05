import { Controller, Get, Param, Query } from '@nestjs/common';
import { VendorsService } from './vendors.service';
import { ServiceType } from '../service-requests/entities/service-request.entity';

@Controller('vendors/public')
export class VendorsPublicController {
  constructor(private readonly vendorsService: VendorsService) {}

  @Get('select')
  async selectPublic(
    @Query('categoryId') categoryId?: string,
  ) {
    return this.vendorsService.listPublicVendorOptions(categoryId);
  }

  @Get(':idOrSlug')
  async getPublic(@Param('idOrSlug') idOrSlug: string) {
    return this.vendorsService.getPublicProfile(idOrSlug);
  }
}