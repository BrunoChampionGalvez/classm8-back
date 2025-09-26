import { Body, Controller, Get, Post, UseGuards, Req } from '@nestjs/common';
import { JwtGuard } from './jwt.guard';
import { AuthService } from './auth.service';

class AuthDto {
  email!: string;
  password!: string;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('signup')
  signup(@Body() body: AuthDto) {
    return this.auth.signup(body.email, body.password);
  }

  @Post('login')
  login(@Body() body: AuthDto) {
    return this.auth.login(body.email, body.password);
  }

  @Get('me')
  @UseGuards(JwtGuard)
  me(@Req() req: any) {
    return { user: req.user };
  }
}
