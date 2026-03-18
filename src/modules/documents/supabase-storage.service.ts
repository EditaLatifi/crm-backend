import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';

const BUCKET = 'project-documents';

@Injectable()
export class SupabaseStorageService {
  private client: SupabaseClient;

  constructor() {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY;
    if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY must be set');
    this.client = createClient(url, key);
  }

  async uploadFile(projectId: string, file: Express.Multer.File): Promise<string> {
    const ext = file.originalname.split('.').pop() || 'bin';
    const path = `${projectId}/${uuidv4()}.${ext}`;

    const { error } = await this.client.storage
      .from(BUCKET)
      .upload(path, file.buffer, {
        contentType: file.mimetype,
        upsert: false,
      });

    if (error) throw new InternalServerErrorException(`Upload fehlgeschlagen: ${error.message}`);

    const { data } = this.client.storage.from(BUCKET).getPublicUrl(path);
    return data.publicUrl;
  }

  async deleteFile(url: string): Promise<void> {
    // Extract path from public URL: .../storage/v1/object/public/project-documents/PATH
    const marker = `/project-documents/`;
    const idx = url.indexOf(marker);
    if (idx === -1) return;
    const path = url.slice(idx + marker.length);
    await this.client.storage.from(BUCKET).remove([path]);
  }
}
