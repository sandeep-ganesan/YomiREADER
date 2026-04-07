import { File } from 'expo-file-system';
import JSZip from 'jszip';
import { DOMParser } from '@xmldom/xmldom';

export const parseEpub = async (uri: string) => {
  try {
    const file = new File(uri);

    const arrayBuffer = await file.arrayBuffer();

    const zip = await JSZip.loadAsync(arrayBuffer);

    const containerFile = await zip.file('META-INF/container.xml')?.async('string');
    if (!containerFile) throw new Error('No container.xml found');

    const parser = new DOMParser();
    const containerDoc = parser.parseFromString(containerFile, 'text/xml');
    const opfPath = containerDoc.getElementsByTagName('rootfile')[0].getAttribute('full-path');
    if (!opfPath) throw new Error('No OPF path found');

    const opfFile = await zip.file(opfPath)?.async('string');
    if (!opfFile) throw new Error('OPF file missing');
    const opfDoc = parser.parseFromString(opfFile, 'text/xml');

    const titleNode = opfDoc.getElementsByTagName('dc:title')[0];
    const authorNode = opfDoc.getElementsByTagName('dc:creator')[0];

    const title = titleNode?.textContent || 'Unknown Title';
    const author = authorNode?.textContent || 'Unknown Author';

    let coverBase64 = null;
    const metaTags = opfDoc.getElementsByTagName('meta');
    let coverId = '';

    for (let i = 0; i < metaTags.length; i++) {
      if (metaTags[i].getAttribute('name') === 'cover') {
        coverId = metaTags[i].getAttribute('content') || '';
        break;
      }
    }

    if (coverId) {
      const itemTags = opfDoc.getElementsByTagName('item');
      let coverHref = '';
      
      for (let i = 0; i < itemTags.length; i++) {
        if (itemTags[i].getAttribute('id') === coverId) {
          coverHref = itemTags[i].getAttribute('href') || '';
          break;
        }
      }

      if (coverHref) {
        const opfDir = opfPath.split('/').slice(0, -1).join('/');
        const fullCoverPath = opfDir ? `${opfDir}/${coverHref}` : coverHref;
        
        const coverFile = zip.file(decodeURIComponent(fullCoverPath));
        if (coverFile) {
          const coverData = await coverFile.async('base64');
          coverBase64 = `data:image/jpeg;base64,${coverData}`;
        }
      }
    }

    return { title, author, cover: coverBase64 };
    
  } catch (error) {
    console.warn(`Failed to parse EPUB at ${uri}:`, error);
    return { title: 'Unknown Book', author: 'Unknown Author', cover: null };
  }
};