
import { SignJWT, jwtVerify } from 'jose';

const secretKey = process.env.SESSION_SECRET;

// No build do Docker ou em desenvolvimento local, essa variável pode não estar disponível.
// Usamos um fallback para evitar erros de compilação, mas o segredo real deve ser passado em runtime.
const fallbackSecret = 'chave-temporaria-de-seguranca-para-ambiente-de-build';
const key = new TextEncoder().encode(secretKey || fallbackSecret);

export async function encrypt(payload: any) {
  // Aviso apenas no servidor para não expor em logs de cliente se for o caso
  if (process.env.NODE_ENV === 'production' && !secretKey && typeof window === 'undefined') {
    console.warn('[WARNING] SESSION_SECRET não definida. Usando chave de fallback insegura para o build.');
  }

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
