
import { SignJWT, jwtVerify } from 'jose';

const secretKey = process.env.SESSION_SECRET;
if (!secretKey && process.env.NODE_ENV === 'production') {
  throw new Error('A variável de ambiente SESSION_SECRET deve estar definida em produção.');
}
const key = new TextEncoder().encode(secretKey || 'chave-temporaria-desenvolvimento');

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
