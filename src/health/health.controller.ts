import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';

@ApiTags('health')
@Controller('health')
export class HealthController {
  @ApiOkResponse({
    schema: {
      example: {
        status: 'ok',
        service: 'producto-backend',
      },
    },
  })
  @Get()
  getHealth() {
    return {
      status: 'ok',
      service: 'producto-backend',
    };
  }
}
