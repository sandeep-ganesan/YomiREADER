import * as FileSystemLegacy from 'expo-file-system/legacy';

export interface VectorRecord {
  id: string;
  text: string;
  index: number;
  embedding: number[];
}

const cosineSimilarity = (vecA: number[], vecB: number[]) => {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
};

export const saveVectorCache = async (bookTitle: string, records: VectorRecord[]) => {
  const cleanTitle = bookTitle.replace(/[^a-zA-Z0-9]/g, '_');
  const path = `${FileSystemLegacy.documentDirectory}${cleanTitle}_vectors.json`;
  
  await FileSystemLegacy.writeAsStringAsync(path, JSON.stringify(records));
  return path;
};

export const searchBook = async (
  bookTitle: string, 
  questionEmbedding: number[], 
  topK: number = 2 
): Promise<string[]> => {
  
  const cleanTitle = bookTitle.replace(/[^a-zA-Z0-9]/g, '_');
  const path = `${FileSystemLegacy.documentDirectory}${cleanTitle}_vectors.json`;

  try {
    const data = await FileSystemLegacy.readAsStringAsync(path);
    const records: VectorRecord[] = JSON.parse(data);


    const scoredChunks = records.map(record => ({
      index: record.index,
      text: record.text,
      score: cosineSimilarity(questionEmbedding, record.embedding)
    }));

    scoredChunks.sort((a, b) => b.score - a.score);

    const topHits = scoredChunks.slice(0, topK);
    
    const expandedContext: string[] = [];

    for (const hit of topHits) {
      const idx = hit.index;

      const prevText = idx > 0 ? records[idx - 1].text : "";
      const currentText = records[idx].text;
      const nextText = idx < records.length - 1 ? records[idx + 1].text : "";

      expandedContext.push(`${prevText}\n\n${currentText}\n\n${nextText}`);
    }

    return expandedContext;

  } catch (error) {
    console.error("No AI cache found for this book.");
    return [];
  }
};