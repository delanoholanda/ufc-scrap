
'use server';

import { getDB, findUserByUsername, verifyPassword, hashPassword, findUserById as dbFindUserById, findUserByEmail, generatePasswordResetToken } from './database';
import { z } from 'zod';
import type { User } from './types';
import nodemailer from 'nodemailer';
import { cookies } from 'next/headers';
import { encrypt, decrypt } from './session';

const LoginSchema = z.object({
    username: z.string(),
    password: z.string(),
});

export async function loginUser(credentials: z.infer<typeof LoginSchema>) {
    try {
        const user = findUserByUsername(credentials.username);
        if (!user) {
            return { success: false, error: "Usuário ou senha inválidos." };
        }

        const isPasswordValid = verifyPassword(credentials.password, user.hash, user.salt);

        if (!isPasswordValid) {
            return { success: false, error: "Usuário ou senha inválidos." };
        }

        // Criar sessão segura
        const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 dias
        const session = await encrypt({ userId: user.id, expires });

        // Salvar em cookie HTTP-only
        const cookieStore = await cookies();
        cookieStore.set('auth_session', session, {
            expires,
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            path: '/',
        });

        return { success: true, userId: user.id };
    } catch (e) {
        const error = e instanceof Error ? e.message : "Um erro desconhecido ocorreu.";
        return { success: false, error: `Erro no servidor: ${error}` };
    }
}

export async function logoutUser() {
    const cookieStore = await cookies();
    cookieStore.delete('auth_session');
    return { success: true };
}

export async function checkAuth() {
    const cookieStore = await cookies();
    const session = cookieStore.get('auth_session')?.value;
    if (!session) return null;

    const parsed = await decrypt(session);
    if (!parsed || !parsed.userId) return null;

    return parsed.userId as number;
}

const SignupSchema = z.object({
  name: z.string().min(3, "O nome deve ter pelo menos 3 caracteres."),
  username: z.string().min(3, "O usuário deve ter pelo menos 3 caracteres."),
  email: z.string().email("Formato de email inválido."),
  password: z.string().min(6, "A senha deve ter pelo menos 6 caracteres."),
});

export async function signupUser(data: z.infer<typeof SignupSchema>) {
    // Apenas usuários logados podem criar outros usuários (ou remova se quiser aberto)
    const currentUserId = await checkAuth();
    if (!currentUserId) return { success: false, error: "Acesso negado." };

    try {
        const validation = SignupSchema.safeParse(data);
        if (!validation.success) {
            return { success: false, error: validation.error.errors.map(e => e.message).join(', ') };
        }

        const db = getDB();
        const existingUser = db.prepare('SELECT id FROM users WHERE username = ? OR email = ?').get(data.username, data.email);

        if (existingUser) {
            return { success: false, error: 'Usuário ou email já cadastrado.' };
        }

        const { salt, hash } = hashPassword(data.password);
        
        const stmt = db.prepare('INSERT INTO users (name, username, email, salt, hash) VALUES (?, ?, ?, ?, ?)');
        const info = stmt.run(data.name, data.username, data.email, salt, hash);

        return { success: true, userId: Number(info.lastInsertRowid) };
    } catch (e) {
        const error = e instanceof Error ? e.message : "Um erro desconhecido ocorreu.";
        return { success: false, error: `Erro no servidor: ${error}` };
    }
}

const UpdateProfileSchema = z.object({
    userId: z.number(),
    name: z.string().min(3, "O nome deve ter pelo menos 3 caracteres."),
    username: z.string().min(3, "O nome de usuário deve ter pelo menos 3 caracteres."),
    email: z.string().email("Formato de email inválido."),
    password: z.string().min(6, "A nova senha deve ter pelo menos 6 caracteres.").optional().or(z.literal('')),
});

export async function updateUserProfile(data: z.infer<typeof UpdateProfileSchema>) {
    const currentUserId = await checkAuth();
    if (!currentUserId) return { success: false, error: "Acesso negado." };

    try {
        const validation = UpdateProfileSchema.safeParse(data);
        if (!validation.success) {
            return { success: false, error: validation.error.errors.map(e => e.message).join(', ') };
        }

        const db = getDB();
        const existingUser = db.prepare('SELECT id FROM users WHERE (username = ? OR email = ?) AND id != ?').get(data.username, data.email, data.userId);
        if (existingUser) {
            return { success: false, error: 'Nome de usuário ou email já está em uso por outra conta.' };
        }
        
        let query = 'UPDATE users SET name = ?, username = ?, email = ?';
        const params: (string | number)[] = [data.name, data.username, data.email];

        if (data.password) {
            const { salt, hash } = hashPassword(data.password);
            query += ', salt = ?, hash = ?';
            params.push(salt, hash);
        }

        query += ' WHERE id = ?';
        params.push(data.userId);

        db.prepare(query).run(...params);

        return { success: true };
    } catch (e) {
        const error = e instanceof Error ? e.message : "Um erro desconhecido ocorreu.";
        return { success: false, error: `Erro no servidor: ${error}` };
    }
}

export async function findUserById(id: number): Promise<Omit<User, 'salt' | 'hash'> | null> {
    const currentUserId = await checkAuth();
    if (!currentUserId) return null;
    try {
        const user = dbFindUserById(id);
        return user;
    } catch (e) {
        console.error("Error finding user by ID:", e);
        return null;
    }
}

export async function fetchAllUsers(): Promise<{ success: boolean; users?: any[]; error?: string }> {
    const currentUserId = await checkAuth();
    if (!currentUserId) return { success: false, error: "Acesso negado." };
    try {
        const db = getDB();
        const users = db.prepare('SELECT id, name, username, email, createdAt FROM users').all();
        return { success: true, users };
    } catch (e) {
        const error = e instanceof Error ? e.message : 'Falha ao buscar usuários.';
        return { success: false, error };
    }
}

export async function deleteUser(userId: number): Promise<{ success: boolean; error?: string }> {
    const currentUserId = await checkAuth();
    if (!currentUserId) return { success: false, error: "Acesso negado." };
    try {
        const db = getDB();
        const userCountResult = db.prepare('SELECT count(*) as count FROM users').get() as { count: number };
        if (userCountResult.count <= 1) {
            return { success: false, error: "Não é possível excluir o último usuário do sistema." };
        }
        const result = db.prepare('DELETE FROM users WHERE id = ?').run(userId);
        if (result.changes === 0) return { success: false, error: 'Usuário não encontrado.' };
        return { success: true };
    } catch (e) {
        const error = e instanceof Error ? e.message : 'Falha ao excluir usuário.';
        return { success: false, error };
    }
}

export async function forgotPassword(email: string) {
    try {
        const user = findUserByEmail(email);
        if (!user) return { success: true, message: "Se o email estiver cadastrado, um link de redefinição será enviado." };
        const token = generatePasswordResetToken(user.id);
        // Em produção, aqui enviaria o email real
        console.log(`[RESET TOKEN para ${email}]: ${token}`);
        return { success: true, message: "Um link de redefinição de senha foi enviado para o seu email." };
    } catch (e) {
        return { success: false, error: "Não foi possível enviar o email de redefinição." };
    }
}
