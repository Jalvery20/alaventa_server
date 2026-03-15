import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AppConfigService {
  constructor(private configService: ConfigService) {}

  get dbConnection(): string {
    return this.configService.get<string>('MONGODB_CLOUD');
  }

  get gaPropertyId(): string {
    return this.configService.get<string>('GA4_PROPERTY_ID');
  }

  get gaClientEmail(): string {
    return this.configService.get<string>('GA_CLIENT_EMAIL');
  }

  get gaPrivateKey(): string {
    return this.configService
      .get<string>('GA_PRIVATE_KEY')
      ?.replace(/\\n/g, '\n');
  }
}
