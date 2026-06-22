// src/auth/auth.service.ts
import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { OAuth2Client } from 'google-auth-library';
import * as bcrypt from 'bcrypt';
import { UserEntity } from '../users/user.entity';
import { UsersService } from '../users/users.service';
import { JwtPayload } from './interfaces/jwt-payload.interface';

@Injectable()
export class AuthService {
  private readonly googleClient: OAuth2Client | null;

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {
    const googleEnabled = this.config.get<string>('GOOGLE_AUTH_ENABLED') === 'true';
    const clientId = this.config.get<string>('GOOGLE_OAUTH_CLIENT_ID');
    if (googleEnabled && !clientId) {
      throw new Error('GOOGLE_OAUTH_CLIENT_ID is required when GOOGLE_AUTH_ENABLED=true');
    }
    this.googleClient = clientId ? new OAuth2Client(clientId) : null;
  }

  async login(email: string, password: string) {
    if (this.config.get<string>('AUTH_EMAIL_PASSWORD_ENABLED') !== 'true') {
      throw new ForbiddenException('Email/password login is disabled');
    }

    const user = await this.usersService.findActiveByEmailWithPassword(email);
    if (!user || !user.passwordHash) throw new UnauthorizedException('Invalid credentials');

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid credentials');

    return await this.issueTokenForUser(user);
  }

  async loginWithGoogle(credential: string) {
    if (this.config.get<string>('GOOGLE_AUTH_ENABLED') !== 'true') {
      throw new ForbiddenException('Google authentication is disabled');
    }

    const clientId = this.config.get<string>('GOOGLE_OAUTH_CLIENT_ID');
    if (!this.googleClient || !clientId) {
      throw new ForbiddenException('Google authentication is not configured');
    }

    let payload;
    try {
      const ticket = await this.googleClient.verifyIdToken({
        idToken: credential,
        audience: clientId,
      });
      payload = ticket.getPayload();
    } catch {
      throw new UnauthorizedException('Invalid Google credential');
    }

    if (!payload) {
      throw new UnauthorizedException('Invalid Google credential');
    }

    const { email, email_verified: emailVerified, picture } = payload;

    if (emailVerified === false) {
      throw new ForbiddenException('Google email is not verified');
    }

    if (!email) {
      throw new UnauthorizedException('Google account has no email');
    }

    const user = await this.usersService.findActiveByEmail(email);
    if (!user) {
      throw new ForbiddenException(
        'Tu correo no tiene permisos para acceder a la plataforma.',
      );
    }

    return await this.issueTokenForUser(
      user,
      typeof picture === 'string' ? picture : null,
    );
  }

  async loginWithDevEmail(rawEmail: string) {
    const devEnabled = this.isDevEmailLoginEnabled();
    const normalizedEmail = this.normalizeEmail(rawEmail);

    if (!devEnabled) {
      throw new ForbiddenException('Login por correo deshabilitado.');
    }

    const user = await this.usersService.findActiveByEmail(normalizedEmail);

    if (!user) {
      throw new ForbiddenException(
        'Este correo no tiene permisos para acceder a Operación Académica CUN.',
      );
    }

    return await this.issueTokenForUser(user);
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private isDevEmailLoginEnabled(): boolean {
    if (this.config.get<string>('NODE_ENV') === 'production') {
      return false;
    }
    const fromConfig = this.config.get<string>('AUTH_DEV_EMAIL_LOGIN_ENABLED');
    const fromEnv = process.env.AUTH_DEV_EMAIL_LOGIN_ENABLED;
    return fromConfig === 'true' || fromEnv === 'true';
  }

  async issueTokenForUser(user: UserEntity, avatarUrl?: string | null) {
    const jwtPayload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    const accessToken = await this.jwtService.signAsync(jwtPayload);

    return {
      accessToken,
      user: {
        ...this.usersService.toSafeUser(user),
        ...(avatarUrl ? { avatarUrl } : {}),
      },
      role: user.role,
    };
  }
}
