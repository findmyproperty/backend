import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { CreateLoanRequestDto } from './dto/create-loan-request.dto';
import { LoanRequestsService } from './loan-requests.service';

interface RequestWithUser extends Request {
  user?: {
    userId: number;
    role: string;
  };
}

@Controller('loan-requests')
export class LoanRequestsController {
  constructor(private readonly service: LoanRequestsService) {}

  @UseGuards(OptionalJwtAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 900_000 } })
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async submit(
    @Req() req: RequestWithUser,
    @Body() dto: CreateLoanRequestDto,
  ) {
    const userId = req.user?.userId ?? null;
    return this.service.create(dto, userId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('mine')
  async findMine(@Req() req: RequestWithUser) {
    const userId = req.user?.userId;
    if (!userId) {
      throw new ForbiddenException('User not authenticated properly');
    }
    return this.service.findMine(userId);
  }
}