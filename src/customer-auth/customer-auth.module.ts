import { Module } from '@nestjs/common';
import { AuthModule } from '@thallesp/nestjs-better-auth';
import { initAuth } from './auth';

@Module({
  imports: [
    AuthModule.forRootAsync({
      useFactory: async () => {
        const auth = await initAuth();
        return {
          auth,
          disableGlobalAuthGuard: true,
          disableTrustedOriginsCors: true,
          bodyParser: {
            json: { limit: '2mb' },
            urlencoded: { limit: '2mb', extended: true },
          },
        };
      },
    }),
  ],
})
export class CustomerAuthModule {}
