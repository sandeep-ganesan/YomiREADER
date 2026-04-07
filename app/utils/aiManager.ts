import * as FileSystemLegacy from 'expo-file-system/legacy';
import { initLlama, LlamaContext } from 'llama.rn';

// change the Models if needed!
const EMBEDDING_MODEL_URL = "https://huggingface.co/second-state/Nomic-embed-text-v1.5-Embedding-GGUF/resolve/main/nomic-embed-text-v1.5-Q4_K_M.gguf"; // ~90MB
const GENERATION_MODEL_URL = "https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf";

const verifyAndDownload = async (url: string, path: string, onProgress: (s: string) => void, modelName: string) => {
  const fileInfo = await FileSystemLegacy.getInfoAsync(path);
  
  if (fileInfo.exists && fileInfo.size !== undefined && fileInfo.size < 1000000) { 
     await FileSystemLegacy.deleteAsync(path);
  }

  const newFileInfo = await FileSystemLegacy.getInfoAsync(path);
  
  if (!newFileInfo.exists) {
    onProgress(`Downloading ${modelName}... (Keep the app open)`);
    await FileSystemLegacy.downloadAsync(url, path);
    
    const finalCheck = await FileSystemLegacy.getInfoAsync(path);
    if (finalCheck.exists && finalCheck.size !== undefined && finalCheck.size < 1000000) {
      await FileSystemLegacy.deleteAsync(path);
      throw new Error("Download failed or timed out. Please check your connection and try again.");
    }
  }
}

export const getEmbeddingModel = async (onProgress: (status: string) => void): Promise<LlamaContext> => {
  const modelPath = `${FileSystemLegacy.documentDirectory}embedding_model.gguf`;
  const nativePath = modelPath.replace(/^file:\/\//, '');
  
  await verifyAndDownload(EMBEDDING_MODEL_URL, modelPath, onProgress, "AI Embedding Model (~90MB)");

  onProgress("Booting up AI Engine...");
  
  try {
    const context = await initLlama({
      model: nativePath, 
      use_mlock: false, // Disabled memory locking for strict Android OS compatibility
      n_ctx: 512, 
      embedding: true, 
    });
    return context;
  } catch (error) {
    await FileSystemLegacy.deleteAsync(modelPath, { idempotent: true });
    throw new Error(`Embedding model corrupted. Deleted cached file. Please try again. Error: ${error}`);
  }
};

export const getGenerationModel = async (onProgress: (status: string) => void): Promise<LlamaContext> => {
  const modelPath = `${FileSystemLegacy.documentDirectory}generation_model.gguf`;
  const nativePath = modelPath.replace(/^file:\/\//, '');
  
  await verifyAndDownload(GENERATION_MODEL_URL, modelPath, onProgress, "AI Chat Model (~600MB)");

  onProgress("Booting Chat Engine...");
  
  try {
    const context = await initLlama({
      model: nativePath, 
      use_mlock: false, 
      n_ctx: 2048, // change if needed, but remember this affects how much of the book's context the AI can consider when answering
    });
    return context;
  } catch (error) {
    await FileSystemLegacy.deleteAsync(modelPath, { idempotent: true });
    throw new Error(`Chat model corrupted. Deleted cached file. Please try again. Error: ${error}`);
  }
};