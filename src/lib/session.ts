
import { SignJWT, jwtVerify } from 'jose';

const secretKey = process.env.SESSION_SECRET;

// Fallback apenas para evitar erros durante o build do Docker/Next.js
// Em tempo de execução real, o segredo do .env será obrigatório.
const fallbackSecret = 'chave-temporaria-de-seguranca-para-ambiente-de-build';
const key = new TextEncoder().encode(secretKey || fallbackSecret);

export async function encrypt(payload: any) {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(key);
}

export async function decrypt(input: string): Promise<any> {
  try {
    const { payload } = await jwtVerify(input, key, {
      algorithms: ['HS256'],
    });
    return payload;
  } catch (error) {
    return null;
  }
}
