import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Req,
  ForbiddenException,
  ParseIntPipe,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

interface RequestWithUser extends Request {
  user?: {
    userId: number;
    role: string;
  };
}

function assertAdmin(req: RequestWithUser): void {
  if (req.user?.role !== 'admin') {
    throw new ForbiddenException('Only admins can manage categories');
  }
}

@UseGuards(JwtAuthGuard)
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  async findAll(@Req() req: RequestWithUser) {
    // Any authenticated user can read the list (frontend falls back for non-admins anyway).
    // Management UI is only shown to admins.
    return this.categoriesService.findAll();
  }

  @Post()
  async create(
    @Body() createCategoryDto: CreateCategoryDto,
    @Req() req: RequestWithUser,
  ) {
    assertAdmin(req);
    return this.categoriesService.create(createCategoryDto);
  }

  @Patch(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateCategoryDto: UpdateCategoryDto,
    @Req() req: RequestWithUser,
  ) {
    assertAdmin(req);
    return this.categoriesService.update(id, updateCategoryDto);
  }

  @Delete(':id')
  async remove(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: RequestWithUser,
  ) {
    assertAdmin(req);
    return this.categoriesService.remove(id);
  }
}
