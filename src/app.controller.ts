import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service.js';
import {
  RateLimitPolicy,
  UseRateLimit,
} from './infrastructure/rate-limit/rate-limit.decorator.js';

@Controller()
@UseRateLimit(RateLimitPolicy.Default)
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }
}
