import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { User, UserRole } from './entities/user.entity';
import * as bcrypt from 'bcrypt';

const PASSWORD_SALT_ROUNDS = 10;

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
  ) {}

  async create(createUserDto: CreateUserDto): Promise<User> {
    const email = this.normalizeEmail(createUserDto.email);
    const phone = this.normalizePhone(createUserDto.phone);

    if (email) {
      const existingByEmail = await this.findByEmail(email);
      if (existingByEmail) {
        throw new ConflictException('Email already exists');
      }
    }

    if (phone) {
      const existingByPhone = await this.findByPhone(phone);
      if (existingByPhone) {
        throw new ConflictException('Phone number already exists');
      }
    }

    const password = await this.hashPassword(createUserDto.password);
    const pendingEmail = this.normalizeEmail(createUserDto.pendingEmail);
    const role = createUserDto.role ?? UserRole.TENANT;
    const user = this.usersRepository.create({
      ...createUserDto,
      email,
      phone,
      password,
      pendingEmail,
      role,
      defaultRole: role,
    });
    const savedUser = await this.usersRepository.save(user);
    return this.stripPassword(savedUser);
  }

  async findAll(): Promise<User[]> {
    return await this.usersRepository.find();
  }

  async findAllAdmins(): Promise<User[]> {
    return await this.usersRepository.find({ where: { role: UserRole.ADMIN } });
  }

  async findByRole(role: UserRole): Promise<User[]> {
    return await this.usersRepository.find({ where: { role } });
  }

  async findOne(id: number): Promise<User> {
    const user = await this.usersRepository.findOneBy({ id });
    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }
    return user;
  }

  /** Batch load users by primary key (e.g. populate property creators). */
  async findByIds(ids: number[]): Promise<User[]> {
    const unique = [...new Set(ids.filter((id) => id != null))] as number[];
    if (unique.length === 0) {
      return [];
    }
    return this.usersRepository.findBy({ id: In(unique) });
  }

  async findByEmail(email: string): Promise<User | null> {
    const normalizedEmail = this.normalizeEmail(email);
    if (!normalizedEmail) {
      return null;
    }

    return await this.usersRepository.findOne({
      where: { email: normalizedEmail },
      select: [
        'id',
        'email',
        'password',
        'name',
        'role',
        'phone',
        'isEmailVerified',
        'isPhoneVerified',
        'locationAddress',
        'locationCity',
        'locationState',
        'locationCountry',
        'latitude',
        'longitude',
        'onboardingCompleted',
        'defaultRole',
      ],
    });
  }

  async findByPhone(phone: string): Promise<User | null> {
    const normalizedPhone = this.normalizePhone(phone);
    if (!normalizedPhone) {
      return null;
    }
    return await this.usersRepository.findOneBy({ phone: normalizedPhone });
  }

  async findOneWithEmailOtp(id: number): Promise<User | null> {
    return await this.usersRepository.findOne({
      where: { id },
      select: [
        'id',
        'email',
        'pendingEmail',
        'emailOtpHash',
        'emailOtpExpiresAt',
        'isEmailVerified',
        'name',
        'role',
        'phone',
        'isPhoneVerified',
        'locationAddress',
        'locationCity',
        'locationState',
        'locationCountry',
        'latitude',
        'longitude',
        'onboardingCompleted',
        'defaultRole',
      ],
    });
  }

  async findByGoogleId(googleId: string): Promise<User | null> {
    return await this.usersRepository.findOneBy({ googleId });
  }

  async update(id: number, updateUserDto: UpdateUserDto): Promise<User> {
    const user = await this.findOne(id);
    const email = this.normalizeEmail(updateUserDto.email);
    const phone = this.normalizePhone(updateUserDto.phone);

    if (email) {
      const existingByEmail = await this.findByEmail(email);
      if (existingByEmail && existingByEmail.id !== id) {
        throw new ConflictException('Email already exists');
      }
    }

    if (phone) {
      const existingByPhone = await this.findByPhone(phone);
      if (existingByPhone && existingByPhone.id !== id) {
        throw new ConflictException('Phone number already exists');
      }
    }

    Object.assign(user, {
      ...updateUserDto,
      ...(email !== undefined ? { email } : {}),
      ...(phone !== undefined ? { phone } : {}),
      ...(updateUserDto.pendingEmail !== undefined
        ? { pendingEmail: this.normalizeEmail(updateUserDto.pendingEmail) }
        : {}),
      ...(updateUserDto.password
        ? { password: await this.hashPassword(updateUserDto.password) }
        : {}),
    });

    const savedUser = await this.usersRepository.save(user);
    return this.stripPassword(savedUser);
  }

  async toggleFavorite(userId: number, propertyId: number): Promise<User> {
    const user = await this.findOne(userId);
    const favs = (user.favorites || []).map(Number);

    const index = favs.indexOf(propertyId);
    if (index > -1) {
      favs.splice(index, 1);
    } else {
      favs.push(propertyId);
    }

    user.favorites = favs;
    const savedUser = await this.usersRepository.save(user);
    return this.stripPassword(savedUser);
  }

  async remove(id: number): Promise<void> {
    const user = await this.findOne(id);
    await this.usersRepository.remove(user);
  }

  private normalizeEmail(email?: string | null): string | null | undefined {
    if (email === null) {
      return null;
    }
    if (email === undefined) {
      return undefined;
    }
    const normalized = email.trim().toLowerCase();
    return normalized || undefined;
  }

  private normalizePhone(phone?: string | null): string | null | undefined {
    if (phone === null) {
      return null;
    }
    if (phone === undefined) {
      return undefined;
    }
    const normalized = phone.trim();
    return normalized || undefined;
  }

  private async hashPassword(password?: string): Promise<string | undefined> {
    if (!password) {
      return undefined;
    }
    return bcrypt.hash(password, PASSWORD_SALT_ROUNDS);
  }

  private stripPassword(user: User): User {
    const safeUser = { ...user } as Partial<User>;
    delete safeUser.password;
    return safeUser as User;
  }
}
