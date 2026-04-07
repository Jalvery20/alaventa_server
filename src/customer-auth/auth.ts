import { betterAuth } from 'better-auth';
import { mongodbAdapter } from 'better-auth/adapters/mongodb';
import { phoneNumber } from 'better-auth/plugins';
import mongoose from 'mongoose';
import {
  getAllowedOrigins,
  getPrimaryClientUrl,
} from '../config/allowed-origins';

let authInstance: any;

export async function initAuth() {
  if (authInstance) return authInstance;

  const allowedOrigins = getAllowedOrigins();

  const connection = mongoose.createConnection(process.env.MONGODB_CLOUD);
  const conn = await connection.asPromise();
  const mongoClient = conn.getClient();
  const db = mongoClient.db();

  authInstance = betterAuth({
    baseURL: getPrimaryClientUrl(),
    basePath: '/api/customer-auth',
    database: mongodbAdapter(db, { client: mongoClient as any }),
    emailAndPassword: {
      enabled: true,
    },
    socialProviders: {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID as string,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
      },
    },
    plugins: [
      phoneNumber({
        sendOTP: ({ phoneNumber, code }) => {
          // TODO: Implementar envío de OTP por SMS (ej: Twilio, AWS SNS)
          console.log(`OTP para ${phoneNumber}: ${code}`);
        },
        signUpOnVerification: {
          getTempEmail: (phoneNumber) => {
            return `${phoneNumber.replace(/\+/g, '')}@phone.alaventa.local`;
          },
        },
      }),
    ],
    trustedOrigins: allowedOrigins,
  });

  return authInstance;
}

export function getAuth() {
  if (!authInstance) {
    throw new Error('Auth not initialized. Call initAuth() first.');
  }
  return authInstance;
}
