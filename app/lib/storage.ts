import { put } from '@vercel/blob';

import sharp from 'sharp';

/**
 * Uploads a file to the configured storage provider (Vercel Blob).
 * Designed to be swappable for Cloudflare R2 or S3 in the future.
 */
export async function uploadImage(file: File, folder: string = 'uploads'): Promise<string | null> {
    try {
        // Unique filename strategy
        const filename = `${folder}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
        let fileToUpload: File | Buffer = file;
        let contentType = file.type;

        // Auto-Resize and Compress if Image (and not SVG/GIF maybe? mostly just standard photos)
        if (file.type.startsWith('image/') && !file.type.includes('svg') && !file.type.includes('gif')) {
            try {
                const buffer = Buffer.from(await file.arrayBuffer());
                const resized = await sharp(buffer)
                    .rotate() // Auto-rotate
                    .resize(800, 800, { fit: 'inside', withoutEnlargement: true }) // Max 800x800 is good for receipts/docs
                    .jpeg({ quality: 80 })
                    .toBuffer();

                fileToUpload = resized;
                contentType = 'image/jpeg'; // Force JPEG content type for processed images
            } catch (imgErr) {
                console.error("Image processing failed, uploading original.", imgErr);
            }
        }

        // Vercel Blob Implementation
        // For R2 later: Switch this logic to use S3Client.send(PutObjectCommand)
        const blob = await put(filename, fileToUpload, {
            access: 'public',
            contentType: contentType,
        });

        return blob.url;
    } catch (error) {
        console.error("Storage Upload Failed:", error);
        return null;
    }
}
