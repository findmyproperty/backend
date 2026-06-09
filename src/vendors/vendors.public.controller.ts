import { Controller, Get, Param } from '@nestjs/common';
import { VendorsService } from './vendors.service';

@Controller('vendors/public')
export class VendorsPublicController {
  constructor(private readonly vendorsService: VendorsService) {}

  @Get(':idOrSlug')
  async getPublic(@Param('idOrSlug') idOrSlug: string) {
    return this.vendorsService.getPublicProfile(idOrSlug);
  }
}
