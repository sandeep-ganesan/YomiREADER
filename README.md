# 読READER

A minimalist React Native application for reading EPUB files and conversing with an on-device AI assistant—completely offline.

The application eliminates reliance on cloud APIs by running large language models (LLMs) and vector retrieval systems directly on mobile hardware, ensuring privacy and zero operational costs.

## Features

* **On-Device RAG:** Local Retrieval-Augmented Generation for book-specific chatting.
* **Vector Caching:** Optimized local storage for book embeddings.
* **Neighborhood Retrieval:** Context-aware search that captures surrounding story flow.
* **Native C++ Engine:** Powered by `llama.rn` for high-performance inference.
* **Reader Core:** Custom themes, typography settings, and gesture-based navigation.

## Technical Architecture

To maintain performance on mobile hardware, the system follows a specific pipeline:

1. **Extraction:** The EPUB is unzipped and cleaned into 300-word text chunks.
2. **Embedding:** Chunks are processed via Nomic Embed Text v1.5 into mathematical vectors.
3. **Retrieval:** User queries trigger a cosine similarity search to find relevant book segments.
4. **Generation:** Meta Llama 3.2 3B processes the retrieved segments to generate a grounded response.

## Tech Stack

* **Framework:** React Native / Expo (Custom Development Client)
* **Inference:** `llama.rn` (llama.cpp bindings)
* **Models:** Llama 3.2 3B Instruct & Nomic Embed v1.5 (GGUF Q4_K_M)
* **Parser:** `@epubjs-react-native/core`, `jszip`
* **Storage:** `expo-file-system`, `AsyncStorage`

## Installation

This project requires a native build environment and cannot run in the standard Expo Go app.

1. Clone the repository:
   ```bash
   git clone [https://github.com/username/offline-ai-reader.git](https://github.com/username/offline-ai-reader.git)
   cd offline-ai-reader
   ```
2. Install dependencies:

   ```bash
   npm install
   ```

3. Compile the native Android application:
   ```bash
   npx expo run:android
   ```

> **Note:** On the initial use of the "Ask AI" feature, the application will download approximately 2.2GB of model weights to the device's local storage. This requires a stable internet connection. Once downloaded, all AI processing is performed 100% offline.
