
'use server';

import { getDB, findUserByUsername, verifyPassword, hashPassword, findUserById as dbFindUserById, findUserByEmail, generatePasswordResetToken, getUserByResetToken } from './database';
import { z } from 'zod';
import type { User } from './types';
import nodemailer from 'nodemailer';

const LoginSchema = z.object({
    username: z.string(),
    password: z.string(),
});

async function sendPasswordResetEmail(email: string, token: string) {
    const emailVars = ['EMAIL_HOST', 'EMAIL_PORT', 'EMAIL_USER', 'EMAIL_PASS', 'EMAIL_FROM'];
    for (const v of emailVars) {
        if (!process.env[v]) {
            throw new Error(`Configuração de e-mail incompleta. Variável ${v} não definida.`);
        }
    }
    
    // TODO: A URL precisa ser a URL pública da aplicação
    const resetLink = `http://localhost:9002/reset-password?token=${token}`;

    const transporter = nodemailer.createTransport({
        host: process.env.EMAIL_HOST,
        port: parseInt(process.env.EMAIL_PORT!, 10),
        secure: parseInt(process.env.EMAIL_PORT!, 10) === 465, // true for 465, false for other ports
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS,
        },
    });

    const mailOptions = {
        from: `UFC Data Scraper <${process.env.EMAIL_FROM}>`,
        to: email,
        subject: 'Redefinição de Senha - UFC Data Scraper',
        text: `Você solicitou a redefinição de senha. Clique no link para criar uma nova senha: ${resetLink}`,
        html: `<p>Você solicitou a redefinição de senha. Clique no link abaixo para criar uma nova senha:</p><a href="${resetLink}">Redefinir Senha</a><p>Se você não solicitou isso, por favor ignore este email.</p>`,
    };

    await transporter.sendMail(mailOptions);
}


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

        return { success: true, userId: user.id };
    } catch (e) {
        const error = e instanceof Error ? e.message : "Um erro desconhecido ocorreu.";
        return { success: false, error: `Erro no servidor: ${error}` };
    }
}

const SignupSchema = z.object({
  name: z.string().min(3, "O nome deve ter pelo menos 3 caracteres."),
  username: z.string().min(3, "O usuário deve ter pelo menos 3 caracteres."),
  email: z.string().email("Formato de email inválido."),
  password: z.string().min(6, "A senha deve ter pelo menos 6 caracteres."),
});

export async function signupUser(data: z.infer<typeof SignupSchema>) {
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
    try {
        const validation = UpdateProfileSchema.safeParse(data);
        if (!validation.success) {
            return { success: false, error: validation.error.errors.map(e => e.message).join(', ') };
        }

        const db = getDB();

        // Check if new username or email is already in use by another user
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

export async function forgotPassword(email: string) {
    try {
        const user = findUserByEmail(email);

        if (!user) {
            // For security, don't reveal if the user exists or not
            return { success: true, message: "Se o email estiver cadastrado, um link de redefinição será enviado." };
        }
        
        const token = generatePasswordResetToken(user.id);

        await sendPasswordResetEmail(email, token);

        return { success: true, message: "Um link de redefinição de senha foi enviado para o seu email." };
    } catch (e) {
        const error = e instanceof Error ? e.message : "Um erro desconhecido ocorreu.";
        console.error("[FORGOT_PASSWORD_ERROR]", error);
        // Don't expose detailed server errors to the client here
        return { success: false, error: "Não foi possível enviar o email de redefinição. Por favor, tente novamente mais tarde ou contate o suporte." };
    }
}


export async function findUserById(id: number): Promise<Omit<User, 'salt' | 'hash'> | null> {
    try {
        const user = dbFindUserById(id);
        return user;
    } catch (e) {
        // In a real app, you'd want to log this error.
        console.error("Error finding user by ID:", e);
        return null;
    }
}

type SafeUser = Omit<User, 'salt' | 'hash' | 'createdAt'> & { createdAt?: string };

export async function fetchAllUsers(): Promise<{ success: boolean; users?: SafeUser[]; error?: string }> {
    try {
        const db = getDB();
        const users = db.prepare('SELECT id, name, username, email, createdAt FROM users').all() as SafeUser[];
        return { success: true, users };
    } catch (e) {
        const error = e instanceof Error ? e.message : 'Falha ao buscar usuários.';
        return { success: false, error };
    }
}

export async function deleteUser(userId: number): Promise<{ success: boolean; error?: string }> {
    try {
        const db = getDB();
        
        const userCountResult = db.prepare('SELECT count(*) as count FROM users').get() as { count: number };
        if (userCountResult.count <= 1) {
            return { success: false, error: "Não é possível excluir o último usuário do sistema." };
        }

        const result = db.prepare('DELETE FROM users WHERE id = ?').run(userId);
        if (result.changes === 0) {
            return { success: false, error: 'Usuário não encontrado.' };
        }

        return { success: true };
    } catch (e) {
        const error = e instanceof Error ? e.message : 'Falha ao excluir usuário.';
        return { success: false, error };
    }
}
