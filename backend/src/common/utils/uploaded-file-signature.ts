const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export function matchesUploadedFileSignature(
  file: Pick<Express.Multer.File, 'buffer' | 'mimetype' | 'originalname'>,
): boolean {
  const bytes = file.buffer;
  if (!Buffer.isBuffer(bytes)) return false;
  const extension = file.originalname.split('.').pop()?.toLowerCase();
  const mime = file.mimetype.toLowerCase();
  if (
    (extension === 'jpg' || extension === 'jpeg') &&
    (mime === 'image/jpeg' || mime === 'image/jpg')
  ) {
    return (
      bytes.length >= 3 &&
      bytes[0] === 0xff &&
      bytes[1] === 0xd8 &&
      bytes[2] === 0xff
    );
  }
  if (extension === 'png' && mime === 'image/png') {
    return bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'));
  }
  if (extension === 'webp' && mime === 'image/webp') {
    return (
      bytes.length >= 12 &&
      bytes.toString('ascii', 0, 4) === 'RIFF' &&
      bytes.toString('ascii', 8, 12) === 'WEBP'
    );
  }
  if (extension === 'pdf' && mime === 'application/pdf') {
    return bytes.length >= 5 && bytes.toString('ascii', 0, 5) === '%PDF-';
  }
  if (extension === 'doc' && mime === 'application/msword') {
    return bytes.subarray(0, 8).equals(Buffer.from('d0cf11e0a1b11ae1', 'hex'));
  }
  if (extension === 'docx' && mime === DOCX_MIME) {
    return (
      bytes.length >= 22 &&
      bytes.subarray(0, 4).equals(Buffer.from('504b0304', 'hex')) &&
      bytes.includes(Buffer.from('word/document.xml')) &&
      bytes.includes(Buffer.from('504b0506', 'hex'))
    );
  }
  return false;
}
