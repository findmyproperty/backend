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
  Query,
} from '@nestjs/common';
import { PropertiesService } from './properties.service';
import { CreatePropertyDto, PropertyStatus } from './dto/create-property.dto';
import { UpdatePropertyDto } from './dto/update-property.dto';
import { ApprovePropertyDto } from './dto/approve-property.dto';
import { RejectPropertyDto } from './dto/reject-property.dto';
import { CreatePropertyCommentDto } from './dto/create-property-comment.dto';
import {
  AdminPropertyStatsQueryDto,
  ListAdminPropertiesQueryDto,
} from './dto/list-admin-properties.query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { Request } from 'express';
import { UserRole } from '../users/entities/user.entity';

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

  @UseGuards(JwtAuthGuard)
  @Get('admin/stats')
  adminStats(
    @Query() query: AdminPropertyStatsQueryDto,
    @Req() req: RequestWithUser,
  ) {
    if (req.user?.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Only admins can view property stats');
    }
    return this.propertiesService.adminStats(query);
  }

  @UseGuards(JwtAuthGuard)
  @Get('admin')
  adminList(
    @Query() query: ListAdminPropertiesQueryDto,
    @Req() req: RequestWithUser,
  ) {
    if (req.user?.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Only admins can list all properties');
    }
    return this.propertiesService.adminList(query);
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Get()
  findAll(@Req() req: RequestWithUser) {
    const isAdmin = req.user?.role === UserRole.ADMIN;
    return this.propertiesService.findAll(isAdmin);
  }

  @Get(':id/comments')
  listComments(@Param('id', ParseIntPipe) id: number) {
    return this.propertiesService.findCommentsForProperty(id);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/comments')
  createComment(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreatePropertyCommentDto,
    @Req() req: RequestWithUser,
  ) {
    const userId = req.user?.userId;
    if (!userId) {
      throw new ForbiddenException('User not authenticated properly');
    }
    return this.propertiesService.createComment(id, userId, dto);
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @Req() req: RequestWithUser) {
    console.log('req.user?.role', req.user);
    return this.propertiesService.findOneWithAgent(id, {
      viewerRole: req.user?.role,
    });
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

  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updatePropertyDto: UpdatePropertyDto,
    @Req() req: RequestWithUser,
  ) {
    const userId = req.user?.userId;
    if (!userId) {
      throw new ForbiddenException('User not authenticated properly');
    }
    return this.propertiesService.update(
      id,
      updatePropertyDto,
      userId,
      req.user?.role ?? '',
    );
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
