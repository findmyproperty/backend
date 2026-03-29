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
  ConflictException,
  ParseIntPipe,
} from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { AuthService } from '../auth/auth.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateUserDto } from '../users/dto/create-user.dto';
import { UpdateUserDto } from '../users/dto/update-user.dto';
import { Request } from 'express';

interface RequestWithUser extends Request {
  user?: {
    userId: number;
    role: string;
  };
}

@UseGuards(JwtAuthGuard)
@Controller('agents')
export class AgentsController {
  constructor(
    private readonly usersService: UsersService,
    private readonly authService: AuthService,
  ) {}

  @Post()
  async create(
    @Body() createUserDto: CreateUserDto,
    @Req() req: RequestWithUser,
  ) {
    if (req.user?.role !== 'admin') {
      throw new ForbiddenException('Only admins can create agents');
    }

    if (!createUserDto.email) {
      throw new ConflictException('Email is required for agents');
    }

    const existingUser = await this.usersService.findByEmail(
      createUserDto.email,
    );
    if (existingUser) {
      throw new ConflictException('Email already exists');
    }

    // Force role to agent
    createUserDto.role = 'agent';
    createUserDto.isEmailVerified = false;

    const user = await this.usersService.create(createUserDto);

    // Generate and send verification email
    const token = this.authService.generateVerificationToken(
      user.id,
      user.email!,
    );
    await this.authService.sendAgentVerificationEmail(
      user.email!,
      user.name,
      token,
    );

    return {
      message: 'Agent created successfully. Verification email sent.',
      user,
    };
  }

  @Get()
  async findAll(@Req() req: RequestWithUser) {
    if (req.user?.role !== 'admin') {
      throw new ForbiddenException('Only admins can list agents');
    }
    return this.usersService.findByRole('agent');
  }

  @Get(':id')
  async findOne(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: RequestWithUser,
  ) {
    if (req.user?.role !== 'admin') {
      throw new ForbiddenException('Only admins can view agent details');
    }
    const user = await this.usersService.findOne(id);
    if (user.role !== 'agent') {
      throw new ConflictException('User is not an agent');
    }
    return user;
  }

  @Patch(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateUserDto: UpdateUserDto,
    @Req() req: RequestWithUser,
  ) {
    if (req.user?.role !== 'admin') {
      throw new ForbiddenException('Only admins can update agents');
    }
    return this.usersService.update(id, updateUserDto);
  }

  @Delete(':id')
  async remove(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: RequestWithUser,
  ) {
    if (req.user?.role !== 'admin') {
      throw new ForbiddenException('Only admins can delete agents');
    }
    await this.usersService.remove(id);
    return { message: 'Agent deleted successfully' };
  }
}
