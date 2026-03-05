'use server';

import { promises as fs } from 'fs';
import path from 'path';
import sharp from 'sharp';
import { formidable } from 'formidable';
import type { NextApiRequest } from 'next';

const uploadDir = path.join(process.cwd(), 'public', 'uploads');

async function ensureUploadDirExists() {
  try {
    await fs.access(uploadDir);
  } catch {
    await fs.mkdir(uploadDir, { recursive: true });
  }
}

export async function getUploadedImages() {
  await ensureUploadDirExists();
  try {
    const files = await fs.readdir(uploadDir);
    const imageFiles = files.filter(file => /\.(webp|jpg|jpeg|png|gif)$/i.test(file));
    return { success: true, images: imageFiles };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha ao ler imagens.';
    console.error('[GET_IMAGES_ERROR]', message);
    return { success: false, error: message, images: [] };
  }
}

export async function handleImageUpload(req: Request) {
    await ensureUploadDirExists();

    const form = formidable({});

    try {
        const [fields, files] = await form.parse(req as unknown as NextApiRequest);

        const uploadedFile = Array.isArray(files.file) ? files.file[0] : files.file;

        if (!uploadedFile) {
            return { success: false, error: 'Nenhum arquivo enviado.' };
        }

        const tempPath = uploadedFile.filepath;
        const originalFilename = uploadedFile.originalFilename || 'unnamed.webp';
        const extension = path.extname(originalFilename);
        const filename = path.basename(originalFilename, extension);
        const webpFilename = `${filename}-${Date.now()}.webp`;
        const savePath = path.join(uploadDir, webpFilename);

        await sharp(tempPath)
            .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
            .webp({ quality: 80 })
            .toFile(savePath);

        // Optionally remove the temporary file
        await fs.unlink(tempPath);

        return { success: true, message: `Arquivo ${webpFilename} salvo.`, filename: webpFilename };
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Falha no processamento do upload.';
        console.error('[UPLOAD_ERROR]', message);
        return { success: false, error: message };
    }
}
