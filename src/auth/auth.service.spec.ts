import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { UserRole } from '../users/entities/user.entity';

const tenant = {
  id: 41,
  name: 'Mobile tenant',
  email: null,
  pendingEmail: null,
  phone: '+919999999999',
  avatarUrl: null,
  role: UserRole.TENANT,
  defaultRole: UserRole.TENANT,
  isEmailVerified: false,
  isPhoneVerified: true,
  onboardingCompleted: false,
  locationAddress: null,
  locationCity: null,
  locationState: null,
  locationCountry: null,
  latitude: null,
  longitude: null,
  favorites: [3],
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('AuthService native sessions', () => {
  const users = { findOne: jest.fn() };
  const jwt = { sign: jest.fn(), verify: jest.fn() };
  const config = { get: jest.fn() };
  const refreshTokens = {
    create: jest.fn((value) => value),
    save: jest.fn(),
    delete: jest.fn(),
  };
  let service: AuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    users.findOne.mockResolvedValue(tenant);
    jwt.sign.mockImplementation((payload: object) =>
      'jti' in payload ? `refresh-${String(payload.jti)}` : 'access-token',
    );
    refreshTokens.delete.mockResolvedValue({ affected: 1 });
    service = new AuthService(
      users as never,
      jwt as never,
      config as never,
      {} as never,
      {} as never,
      refreshTokens as never,
    );
  });

  it('returns a native SecureStore session with a persisted, single-use refresh hash', async () => {
    jest.spyOn(service, 'verifyPhoneOtp').mockResolvedValue({ user: { id: tenant.id } } as never);

    const result = await service.verifyMobilePhoneOtp({
      phone: tenant.phone,
      code: '456789',
      role: UserRole.TENANT,
    });

    expect(result.access_token).toBe('access-token');
    expect(result.refresh_token).toMatch(/^refresh-/);
    expect(result.user.favorites).toEqual([3]);
    expect(refreshTokens.save).toHaveBeenCalledWith(expect.objectContaining({ userId: tenant.id }));
  });

  it('consumes a mobile refresh token before issuing its replacement', async () => {
    jwt.verify.mockReturnValue({ sub: tenant.id, typ: 'refresh', jti: 'once' });

    const result = await service.refreshMobileWithRefreshToken('old-token');

    expect(result.refresh_token).toMatch(/^refresh-/);
    expect(refreshTokens.delete).toHaveBeenCalledWith(expect.objectContaining({ userId: tenant.id }));
  });

  it('rejects replay of an already-consumed mobile refresh token', async () => {
    jwt.verify.mockReturnValue({ sub: tenant.id, typ: 'refresh', jti: 'once' });
    refreshTokens.delete.mockResolvedValueOnce({ affected: 0 });

    await expect(service.refreshMobileWithRefreshToken('replayed-token')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('does not issue a native session for an admin account', async () => {
    users.findOne.mockResolvedValue({ ...tenant, role: UserRole.ADMIN });
    jest.spyOn(service, 'verifyPhoneOtp').mockResolvedValue({ user: { id: tenant.id } } as never);

    await expect(service.verifyMobilePhoneOtp({ phone: tenant.phone, code: '456789' })).rejects.toBeInstanceOf(ForbiddenException);
  });
});
