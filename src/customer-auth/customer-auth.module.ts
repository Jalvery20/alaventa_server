import { Module } from '@nestjs/common';
import { AuthModule } from '@thallesp/nestjs-better-auth';
import { initAuth } from './auth';

@Module({
  imports: [
    AuthModule.forRootAsync({
      disableGlobalAuthGuard: true,
      useFactory: async () => {
        const auth = await initAuth();
        return {
          auth,
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
