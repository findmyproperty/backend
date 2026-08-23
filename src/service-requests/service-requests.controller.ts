import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { CreatePackersMoversDto } from './dto/create-packers-movers.dto';
import { CreatePaintingCleaningDto } from './dto/create-painting-cleaning.dto';
import { CreateHomeServicesDto } from './dto/create-home-services.dto';
import { CreateItServicesDto } from './dto/create-it-services.dto';
import { CreateGeneralServicesDto } from './dto/create-general-services.dto';
import { CreateEventManagementDto } from './dto/create-event-management.dto';
import { TripEstimateQueryDto } from './dto/trip-estimate.query.dto';
import { SubmitServiceRequestFeedbackDto } from './dto/submit-service-request-feedback.dto';
import { DistanceService } from './distance.service';
import { ServiceRequestsService } from './service-requests.service';

interface RequestWithUser extends Request {
  user?: {
    userId: number;
    role: string;
  };
}

@Controller('service-requests')
export class ServiceRequestsController {
  constructor(
    private readonly service: ServiceRequestsService,
    private readonly distance: DistanceService,
  ) {}

  @Get('reactions')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async getCustomerReactions() {
    return this.service.getCustomerReactions();
  }

  /** Public + optional auth. If logged in, request is auto-linked to the user. */
  @UseGuards(OptionalJwtAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 900_000 } })
  @Post('packers-movers')
  @HttpCode(HttpStatus.CREATED)
  async submitPackersMovers(
    @Req() req: RequestWithUser,
    @Body() dto: CreatePackersMoversDto,
  ) {
    const userId = req.user?.userId ?? null;
    return this.service.createPackersMovers(dto, userId);
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 900_000 } })
  @Post('painting-cleaning')
  @HttpCode(HttpStatus.CREATED)
  async submitPaintingCleaning(
    @Req() req: RequestWithUser,
    @Body() dto: CreatePaintingCleaningDto,
  ) {
    const userId = req.user?.userId ?? null;
    return this.service.createPaintingCleaning(dto, userId);
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 900_000 } })
  @Post('home-services')
  @HttpCode(HttpStatus.CREATED)
  async submitHomeServices(
    @Req() req: RequestWithUser,
    @Body() dto: CreateHomeServicesDto,
  ) {
    const userId = req.user?.userId ?? null;
    return this.service.createHomeServices(dto, userId);
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 900_000 } })
  @Post('it-services')
  @HttpCode(HttpStatus.CREATED)
  async submitItServices(
    @Req() req: RequestWithUser,
    @Body() dto: CreateItServicesDto,
  ) {
    const userId = req.user?.userId ?? null;
    return this.service.createItServices(dto, userId);
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 900_000 } })
  @Post('general-services')
  @HttpCode(HttpStatus.CREATED)
  async submitGeneralServices(
    @Req() req: RequestWithUser,
    @Body() dto: CreateGeneralServicesDto,
  ) {
    const userId = req.user?.userId ?? null;
    return this.service.createGeneralServices(dto, userId);
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 900_000 } })
  @Post('event-management')
  @HttpCode(HttpStatus.CREATED)
  async submitEventManagement(
    @Req() req: RequestWithUser,
    @Body() dto: CreateEventManagementDto,
  ) {
    const userId = req.user?.userId ?? null;
    return this.service.createEventManagement(dto, userId);
  }

  /** Authenticated user: their own service requests across both types. */
  @UseGuards(JwtAuthGuard)
  @Get('mine')
  async findMine(@Req() req: RequestWithUser) {
    const userId = req.user?.userId;
    if (!userId) {
      throw new ForbiddenException('User not authenticated properly');
    }
    return this.service.findMine(userId);
  }

  /** Authenticated customer: rate a completed service request once. */
  @UseGuards(JwtAuthGuard)
  @Post(':id/feedback')
  @HttpCode(HttpStatus.OK)
  async submitFeedback(
    @Req() req: RequestWithUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SubmitServiceRequestFeedbackDto,
  ) {
    const userId = req.user?.userId;
    if (!userId) {
      throw new ForbiddenException('User not authenticated properly');
    }
    return this.service.submitFeedback(id, userId, dto);
  }

  /**
   * Public rate-limited trip estimate used by the Packers & Movers form.
   *
   * Body shape is query-based to make it cache-friendly and cheap to call
   * repeatedly as the user tweaks their stops. Results from the underlying
   * Distance Matrix call are cached server-side per rounded coord tuple.
   */
  @UseGuards(OptionalJwtAuthGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get('trip-estimate')
  async tripEstimate(@Query() query: TripEstimateQueryDto) {
    const pickup = parseCoord(query.pickup);
    if (!pickup) throw new BadRequestException('Invalid pickup coordinate');
    const dropParts = query.drops.split('|').filter(Boolean);
    if (dropParts.length === 0 || dropParts.length > 5) {
      throw new BadRequestException('drops must contain 1-5 coordinates');
    }
    const drops = dropParts.map(parseCoord);
    if (drops.some((d) => !d)) {
      throw new BadRequestException('One or more drop coordinates are invalid');
    }
    const estimate = await this.distance.estimate(
      pickup,
      drops as Array<{ lat: number; lng: number }>,
    );
    return { estimate };
  }
}

function parseCoord(
  raw: string,
): { lat: number; lng: number } | null {
  const [latStr, lngStr] = raw.split(',');
  const lat = Number(latStr);
  const lng = Number(lngStr);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}
