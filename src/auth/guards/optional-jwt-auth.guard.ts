import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Like JwtAuthGuard, but allows unauthenticated requests: `req.user` is set when a
 * valid Bearer token is present, otherwise the route still runs with `req.user` undefined.
 */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  override async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      await super.canActivate(context);
    } catch {
      // Missing or invalid token — continue without a user
    }
    return true;
  }

  override handleRequest<TUser>(
    err: Error | null,
    user: TUser,
    _info: unknown,
    _context: ExecutionContext,
    _status?: unknown,
  ): TUser | null {
    if (err || !user) {
      return null;
    }
    return user;
  }
}
