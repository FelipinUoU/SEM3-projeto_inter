import path from 'path';
import yauzl from 'yauzl';

const archiveImageTypes = new Map([
  ['.avif', 'image/avif'],
  ['.gif', 'image/gif'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.png', 'image/png'],
  ['.webp', 'image/webp']
]);

function isImageBuffer(buffer, format) {
  if (format === 'image/png') {
    return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  }
  if (format === 'image/jpeg') return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (format === 'image/gif') {
    const header = buffer.subarray(0, 6).toString('ascii');
    return header === 'GIF87a' || header === 'GIF89a';
  }
  if (format === 'image/webp') {
    return buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF'
      && buffer.toString('ascii', 8, 12) === 'WEBP';
  }
  if (format === 'image/avif') {
    return buffer.length >= 12 && buffer.toString('ascii', 4, 8) === 'ftyp'
      && ['avif', 'avis'].includes(buffer.toString('ascii', 8, 12));
  }
  return false;
}

export function readChapterArchive(buffer, {
  maxImageBytes,
  maxPages,
  maxUnpackedBytes
}) {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(buffer, {
      lazyEntries: true,
      validateEntrySizes: true
    }, (openError, archive) => {
      if (openError) {
        reject(new Error('O arquivo enviado não é um ZIP válido.'));
        return;
      }

      const pages = [];
      let unpackedBytes = 0;
      let settled = false;
      const fail = (error) => {
        if (settled) return;
        settled = true;
        archive.close();
        reject(error);
      };

      archive.on('error', (error) => fail(new Error(`Não foi possível ler o ZIP: ${error.message}`)));
      archive.on('end', () => {
        if (settled) return;
        settled = true;
        pages.sort((left, right) => left.archiveName.localeCompare(right.archiveName, 'pt-BR', {
          numeric: true,
          sensitivity: 'base'
        }));
        resolve(pages);
      });
      archive.on('entry', (entry) => {
        const normalizedName = entry.fileName.replace(/\\/g, '/');
        if (normalizedName.endsWith('/')) {
          archive.readEntry();
          return;
        }
        const basename = path.posix.basename(normalizedName);
        if (normalizedName.startsWith('__MACOSX/') || basename.startsWith('._')
          || ['.DS_Store', 'Thumbs.db', 'desktop.ini'].includes(basename)) {
          archive.readEntry();
          return;
        }

        const originalName = basename;
        const format = archiveImageTypes.get(path.posix.extname(originalName).toLowerCase());
        if (!format) {
          fail(new Error(`O ZIP deve conter apenas imagens PNG, JPG, JPEG, WEBP, GIF ou AVIF. Arquivo inválido: ${originalName}`));
          return;
        }
        if (originalName.length > 255) {
          fail(new Error(`O nome da página ${originalName} excede o limite de 255 caracteres.`));
          return;
        }
        if (entry.generalPurposeBitFlag & 0x1) {
          fail(new Error(`O arquivo ${originalName} está protegido por senha. Envie um ZIP sem criptografia.`));
          return;
        }
        const unixFileType = (entry.externalFileAttributes >>> 16) & 0xf000;
        if (unixFileType === 0xa000) {
          fail(new Error('O ZIP contém um link simbólico, que não é aceito.'));
          return;
        }
        if (entry.uncompressedSize > maxImageBytes) {
          fail(new Error(`A imagem ${originalName} excede o limite de ${maxImageBytes} bytes.`));
          return;
        }
        if (pages.length >= maxPages) {
          fail(new Error(`O ZIP excede o limite de ${maxPages} páginas por capítulo.`));
          return;
        }
        unpackedBytes += entry.uncompressedSize;
        if (unpackedBytes > maxUnpackedBytes) {
          fail(new Error(`O conteúdo descompactado excede o limite de ${maxUnpackedBytes} bytes.`));
          return;
        }

        archive.openReadStream(entry, (streamError, stream) => {
          if (streamError) {
            fail(new Error(`Não foi possível ler ${originalName}: ${streamError.message}`));
            return;
          }
          const chunks = [];
          let size = 0;
          stream.on('data', (chunk) => {
            size += chunk.length;
            if (size > maxImageBytes) {
              stream.destroy(new Error(`A imagem ${originalName} excede o limite permitido.`));
              return;
            }
            chunks.push(chunk);
          });
          stream.on('error', (error) => fail(new Error(`Não foi possível ler ${originalName}: ${error.message}`)));
          stream.on('end', () => {
            if (settled) return;
            const image = Buffer.concat(chunks);
            if (!isImageBuffer(image, format)) {
              fail(new Error(`O arquivo ${originalName} não corresponde ao formato de imagem indicado pela extensão.`));
              return;
            }
            pages.push({ archiveName: normalizedName, name: originalName, format, buffer: image });
            archive.readEntry();
          });
        });
      });
      archive.readEntry();
    });
  });
}
