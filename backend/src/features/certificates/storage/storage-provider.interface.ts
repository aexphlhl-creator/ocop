export interface StoredFile {
  fileName: string;
  fileUrl: string;
  mimeType: string;
  fileSize: number;
  documentHash: string;
}

export const STORAGE_PROVIDER = 'STORAGE_PROVIDER';

export interface StorageProvider {
  upload(file: Express.Multer.File, folder: string): Promise<StoredFile>;
  getDownloadUrl(fileUrl: string): Promise<string>;
}
