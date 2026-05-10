/**
 * Local Embedding Module
 *
 * Uses @xenova/transformers (Transformers.js) to run ONNX embedding models
 * entirely locally in Node.js — no API key required.
 *
 * Supported models:
 *  - Xenova/all-MiniLM-L6-v2       (384 dim, ~80MB, fast, English-optimized)
 *  - Xenova/all-mpnet-base-v2       (768 dim, ~420MB, higher quality)
 *  - Xenova/bge-base-zh-v1.5       (768 dim, ~420MB, Chinese-optimized)
 *
 * Usage:
 *   const emb = await LocalEmbedding.create();
 *   const vec = await emb.embed("hello world");
 *   const mats = await emb.embedBatch(["a", "b", "c"]);
 */

import { pipeline, env, FeatureExtractionPipeline } from '@xenova/transformers';

// Skip local model download check — models auto-download from HuggingFace
env.allowLocalModels = false;
env.useBrowserCache = false;

/** Embedding model registry */
export const EMBEDDING_MODELS = {
  'all-MiniLM-L6-v2': {
    model: 'Xenova/all-MiniLM-L6-v2',
    dimension: 384,
    description: 'Fast, 384d, English-optimized (~80MB)',
  },
  'all-mpnet-base-v2': {
    model: 'Xenova/all-mpnet-base-v2',
    dimension: 768,
    description: 'Higher quality, 768d, English (~420MB)',
  },
  'bge-base-zh-v1.5': {
    model: 'Xenova/bge-base-zh-v1.5',
    dimension: 768,
    description: 'Chinese-optimized, 768d (~420MB)',
  },
} as const;

export type EmbeddingModelName = keyof typeof EMBEDDING_MODELS;

export interface EmbeddingResult {
  /** Normalized embedding vector */
  embedding: number[];
  /** Model name used */
  model: string;
  /** Dimension of the vector */
  dimension: number;
}

/**
 * LocalEmbedding — singleton wrapper around Transformers.js feature extraction pipeline.
 *
 * Thread-safety: one pipeline per instance; instances are cached after first call.
 */
export class LocalEmbedding {
  private static _instances = new Map<string, LocalEmbedding>();
  private static _initPromises = new Map<string, Promise<LocalEmbedding>>();

  private _pipeline: FeatureExtractionPipeline | null = null;
  private _modelName: string;
  private _dimension: number;

  private constructor(modelName: string, dimension: number) {
    this._modelName = modelName;
    this._dimension = dimension;
  }

  /** Get (or create) a cached LocalEmbedding instance for the given model. */
  static async create(
    modelName: EmbeddingModelName = 'all-MiniLM-L6-v2',
  ): Promise<LocalEmbedding> {
    if (LocalEmbedding._initPromises.has(modelName)) {
      return LocalEmbedding._initPromises.get(modelName)!;
    }
    const promise = (async () => {
      const cfg = EMBEDDING_MODELS[modelName];
      const inst = new LocalEmbedding(cfg.model, cfg.dimension);
      inst._pipeline = await pipeline('feature-extraction', cfg.model, {
        progress_callback: (info: { progress?: number; status?: string }) => {
          if (info.status === 'progress' && info.progress !== undefined) {
            // Suppress noisy progress logs in CI; emit in dev if desired
          }
        },
      });
      LocalEmbedding._instances.set(modelName, inst);
      return inst;
    })();
    LocalEmbedding._initPromises.set(modelName, promise);
    return promise;
  }

  /** Embed a single text string into a normalized vector. */
  async embed(text: string): Promise<number[]> {
    if (!this._pipeline) throw new Error('Not initialized');
    const out = await this._pipeline(text, {
      normalize: true,
      pooling: 'mean',
    });
    // out is a 2D array; flatten to 1D
    return Array.from(out.data as Float32Array);
  }

  /** Embed a batch of texts. Returns array of normalized vectors. */
  async embedBatch(texts: string[]): Promise<number[][]> {
    if (!this._pipeline) throw new Error('Not initialized');
    const out = await this._pipeline(texts, {
      normalize: true,
      pooling: 'mean',
    });
    const dim = out.dims[1];
    const flat = out.data as Float32Array;
    const results: number[][] = [];
    for (let i = 0; i < texts.length; i++) {
      results.push(Array.from(flat.slice(i * dim, (i + 1) * dim)));
    }
    return results;
  }

  get dimension(): number {
    return this._dimension;
  }

  get modelName(): string {
    return this._modelName;
  }
}

/**
 * Pre-warmed singleton instances so first query is fast.
 * Call this once at server startup (e.g., in index.ts).
 */
export async function warmupEmbeddings(
  models: EmbeddingModelName[] = ['all-MiniLM-L6-v2'],
): Promise<void> {
  await Promise.all(models.map((m) => LocalEmbedding.create(m)));
}
