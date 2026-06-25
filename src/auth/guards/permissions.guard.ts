import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserEntity } from '../../users/user.entity';
import { ANY_PERMISSIONS_KEY, PERMISSIONS_KEY } from '../decorators/permissions.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const anyPermissions = this.reflector.getAllAndOverride<string[]>(ANY_PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (
      (!requiredPermissions || requiredPermissions.length === 0) &&
      (!anyPermissions || anyPermissions.length === 0)
    ) {
      return true;
    }

    const req = context.switchToHttp().getRequest();
    const user = req.user as UserEntity | undefined;
    if (!user) return false;

    const userPermissions = new Set(user.permissions ?? []);
    const allowedAll =
      !requiredPermissions?.length ||
      requiredPermissions.every((permission) => userPermissions.has(permission));
    const allowedAny =
      !anyPermissions?.length ||
      anyPermissions.some((permission) => userPermissions.has(permission));

    if (!allowedAll || !allowedAny) {
      throw new ForbiddenException('No tienes permiso para acceder a este recurso');
    }

    return true;
  }
}
