import * as FileSystemLegacy from 'expo-file-system/legacy';
import JSZip from 'jszip';

export interface Chunk {
  id: string;
  text: string;
  index: number;
  wordCount: number;
}

const yieldToUI = () => new Promise(resolve => setTimeout(resolve, 0));

export const extractAndChunkEpub = async (
  fileUri: string, 
  bookTitle: string,
  onProgress?: (status: string) => void
): Promise<Chunk[]> => {
  
  onProgress?.("Unzipping book...");

const fileContent = await FileSystemLegacy.readAsStringAsync(fileUri, {
    encoding: FileSystemLegacy.EncodingType.Base64,
  });

  const zip = new JSZip();
  const loadedZip = await zip.loadAsync(fileContent, { base64: true });

  const htmlFiles = Object.keys(loadedZip.files)
    .filter(path => path.endsWith('.html') || path.endsWith('.xhtml'))
    .sort();

  let fullRawText = "";

  onProgress?.("Extracting text...");

  for (let i = 0; i < htmlFiles.length; i++) {
    const filename = htmlFiles[i];
    const rawHtml = await loadedZip.file(filename)?.async('string');
    
    if (rawHtml) {
      let cleanText = rawHtml
        .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<[^>]+>/g, ' ') 
        .replace(/\s+/g, ' ') 
        .trim();
      
      fullRawText += cleanText + "\n\n";
    }

    if (i % 5 === 0) await yieldToUI();
  }

  onProgress?.("Chunking data for AI...");
  

  const CHUNK_SIZE = 300; 
  const OVERLAP = 50; 
  
  const words = fullRawText.split(' ');
  const chunks: Chunk[] = [];
  let currentWordIndex = 0;

  while (currentWordIndex < words.length) {
    const chunkWords = words.slice(currentWordIndex, currentWordIndex + CHUNK_SIZE);
    
    const chunkText = `[Source: The book "${bookTitle}"] Context excerpt: ` + chunkWords.join(' ');

    chunks.push({
      id: `chunk_${chunks.length}`,
      index: chunks.length,
      text: chunkText,
      wordCount: chunkWords.length,
    });

    currentWordIndex += (CHUNK_SIZE - OVERLAP);

    if (chunks.length % 100 === 0) await yieldToUI();
  }

  onProgress?.("Done!");
  return chunks;
};