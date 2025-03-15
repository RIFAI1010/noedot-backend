// src/common/config/multer.config.ts
import { diskStorage } from 'multer';
import { BadRequestException } from '@nestjs/common';
import { extname } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { unlink } from 'fs/promises';

export const multerConfig = {
    dest: './uploads',
    path: 'uploads',
};

if (!existsSync(multerConfig.dest)) {
    mkdirSync(multerConfig.dest, { recursive: true });
}

export const multerOptions = {
    storage: diskStorage({
        destination: (req, file, cb) => {
            cb(null, multerConfig.dest); // Folder penyimpanan file
        },
        filename: (req, file, cb) => {
            const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
            const fileExt = extname(file.originalname);
            const fileName = `${file.fieldname}-${uniqueSuffix}${fileExt}`;
            cb(null, fileName);
        },
    }),
    fileFilter: (req, file, cb) => {
        const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/gif'];
        if (!allowedMimeTypes.includes(file.mimetype)) {
            cb(new BadRequestException('Only image files are allowed!'), false);
        } else {
            cb(null, true);
        }
    },
    limits: {
        fileSize: 5 * 1024 * 1024,
    },
};


export const removeFiles = async (filePaths: string[]) => {
    try {
        for (const filePath of filePaths) {
            await unlink(filePath);
        }
    } catch (error) {
        console.error('Error removing files:', error);
    }
};