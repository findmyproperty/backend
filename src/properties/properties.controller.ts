import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  ParseIntPipe,
  UseGuards,
  Req,
  ForbiddenException,
} from '@nestjs/common';
import { PropertiesService } from './properties.service';
import { CreatePropertyDto, PropertyStatus } from './dto/create-property.dto';
import { UpdatePropertyDto } from './dto/update-property.dto';
import { ApprovePropertyDto } from './dto/approve-property.dto';
import { RejectPropertyDto } from './dto/reject-property.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Request } from 'express';

interface RequestWithUser extends Request {
  user?: {
    userId: number;
    role: string;
  };
}

@Controller('properties')
export class PropertiesController {
  constructor(private readonly propertiesService: PropertiesService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  create(
    @Body() createPropertyDto: CreatePropertyDto,
    @Req() req: RequestWithUser,
  ) {
    const userId = req.user?.userId;
    // Enforce default status
    if (req.user?.role !== 'admin') {
      createPropertyDto.status = PropertyStatus.PENDING;
    } else if (!createPropertyDto.status) {
      createPropertyDto.status = PropertyStatus.APPROVED;
    }

    return this.propertiesService.create(
      createPropertyDto,
      userId,
      req.user?.role,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get('my-properties')
  findMyProperties(@Req() req: RequestWithUser) {
    const userId = req.user?.userId;
    if (!userId) {
      throw new ForbiddenException('User not authenticated properly');
    }
    return this.propertiesService.findMyProperties(userId);
  }

  @Get()
  findAll() {
    return this.propertiesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.propertiesService.findOne(id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id/approve')
  approve(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: RequestWithUser,
    @Body() body: ApprovePropertyDto,
  ) {
    if (req.user?.role !== 'admin') {
      throw new ForbiddenException('Only admins can approve properties');
    }
    return this.propertiesService.approve(id, body);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id/reject')
  reject(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: RequestWithUser,
    @Body() body: RejectPropertyDto,
  ) {
    if (req.user?.role !== 'admin') {
      throw new ForbiddenException('Only admins can reject properties');
    }
    return this.propertiesService.reject(id, body);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updatePropertyDto: UpdatePropertyDto,
  ) {
    return this.propertiesService.update(id, updatePropertyDto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @Req() req: RequestWithUser) {
    const userId = req.user?.userId;
    if (!userId) {
      throw new ForbiddenException('User not authenticated properly');
    }
    return this.propertiesService.remove(id, userId, req.user?.role);
  }
}
