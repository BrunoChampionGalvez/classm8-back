import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';

type User = {
  id: number;
  email: string;
  passwordHash: string;
};

@Injectable()
export class AuthService {
  private users: User[] = [];
  private nextId = 1;

  constructor(private readonly jwt: JwtService) {}

  async signup(email: string, password: string) {
    const exists = this.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
    if (exists) {
      throw new BadRequestException('Email already registered');
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const user: User = { id: this.nextId++, email, passwordHash };
    this.users.push(user);
    const token = await this.jwt.signAsync({ sub: user.id, email: user.email });
    return { token };
  }

  async login(email: string, password: string) {
    const user = this.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
    if (!user) throw new UnauthorizedException('Invalid credentials');
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid credentials');
    const token = await this.jwt.signAsync({ sub: user.id, email: user.email });
    return { token };
  }
}
