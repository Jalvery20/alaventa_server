const DEFAULT_ALLOWED_ORIGINS = [
  'http://127.0.0.1:3000',
  'http://localhost:3000',
  'https://alaventaencuba.com',
  'https://alaventasc.vercel.app',
];

function splitOrigins(value?: string): string[] {
  if (!value) return [];

  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function getAllowedOrigins(): string[] {
  const listFromEnv = splitOrigins(process.env.CLIENT_URLS);
  const singleFromEnv = process.env.CLIENT_URL?.trim();

  return Array.from(
    new Set([
      ...listFromEnv,
      ...(singleFromEnv ? [singleFromEnv] : []),
      ...DEFAULT_ALLOWED_ORIGINS,
    ]),
  );
}

export function getPrimaryClientUrl(): string {
  return (
    process.env.CLIENT_URL?.trim() ||
    splitOrigins(process.env.CLIENT_URLS)[0] ||
    DEFAULT_ALLOWED_ORIGINS[0]
  );
}
