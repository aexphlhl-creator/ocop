export class CertificateFileResponseDto {
  id: string;
  fileName: string;
  fileUrl: string;
  mimeType: string;
  fileSize: number;
  uploadedAt: Date;
}

export class CertificateResponseDto {
  id: string;
  certificateNumber: string;
  issuingOrganization: string;
  issueDate: Date;
  expiryDate: Date;
  status: string;
  verificationUrl?: string | null;
  note?: string | null;
  documentHash: string;
  blockchainTxHash?: string | null;
  files: CertificateFileResponseDto[];
}
