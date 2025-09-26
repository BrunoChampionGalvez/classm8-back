import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class JwtGuard implements CanActivate {
  private readonly logger = new Logger(JwtGuard.name);
  constructor(private readonly jwt: JwtService) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const auth = req.headers['authorization'] as string | undefined;
    if (!auth || !auth.startsWith('Bearer ')) {
      this.logger.warn('Missing or malformed Authorization header');
      throw new UnauthorizedException('Missing token');
    }
    const token = auth.slice('Bearer '.length);
    try {
      const payload = await this.jwt.verifyAsync(token);
      req.user = payload;
      return true;
    } catch (e: any) {
      this.logger.warn(`Token verification failed: ${e?.message}`);
      throw new UnauthorizedException('Invalid token');
    }
  }
}
