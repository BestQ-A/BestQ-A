/**
 * Keyword-based relevance system for predicate evolution
 *
 * Phase 1: Extract keywords like a search engine
 * Phase 2: Cluster by keyword similarity
 * Phase 3: Gradually discover structured predicates from clusters
 *
 * This follows the philosophy: accumulate similar experiences first,
 * then let structure emerge from data.
 */

/**
 * Keyword with TF-IDF score
 */
export interface Keyword {
  term: string;
  tf: number;      // Term frequency
  idf: number;     // Inverse document frequency
  tfidf: number;   // TF-IDF score
}

/**
 * Document for keyword extraction
 */
export interface Document {
  id: string;
  text: string;
  metadata?: Record<string, unknown>;
}

/**
 * Tokenize text into words (simple version)
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')  // Remove punctuation
    .split(/\s+/)
    .filter(word => word.length > 2);  // Filter short words
}

/**
 * Common stopwords to filter out
 */
const STOPWORDS = new Set([
  'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'her',
  'was', 'one', 'our', 'out', 'day', 'get', 'has', 'him', 'his', 'how',
  'man', 'new', 'now', 'old', 'see', 'two', 'way', 'who', 'boy', 'did',
  'its', 'let', 'put', 'say', 'she', 'too', 'use', 'this', 'that', 'with',
  'have', 'from', 'they', 'been', 'will', 'more', 'when', 'your', 'said',
  'each', 'which', 'their', 'there', 'would', 'about', 'could', 'other',
]);

/**
 * Extract keywords from a single document
 */
export function extractKeywords(text: string, topN: number = 20): string[] {
  const tokens = tokenize(text);
  const filtered = tokens.filter(word => !STOPWORDS.has(word));

  // Count term frequency
  const counts = new Map<string, number>();
  for (const token of filtered) {
    counts.set(token, (counts.get(token) || 0) + 1);
  }

  // Sort by frequency and return top N
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([word]) => word);
}

/**
 * Calculate TF (Term Frequency) for a document
 */
function calculateTF(text: string): Map<string, number> {
  const tokens = tokenize(text).filter(word => !STOPWORDS.has(word));
  const counts = new Map<string, number>();

  for (const token of tokens) {
    counts.set(token, (counts.get(token) || 0) + 1);
  }

  // Normalize by total tokens
  const total = tokens.length;
  for (const [term, count] of counts.entries()) {
    counts.set(term, count / total);
  }

  return counts;
}

/**
 * Calculate IDF (Inverse Document Frequency) across documents
 */
function calculateIDF(documents: Document[]): Map<string, number> {
  const N = documents.length;
  const docFreq = new Map<string, number>();

  // Count documents containing each term
  for (const doc of documents) {
    const terms = new Set(tokenize(doc.text).filter(w => !STOPWORDS.has(w)));
    for (const term of terms) {
      docFreq.set(term, (docFreq.get(term) || 0) + 1);
    }
  }

  // Calculate IDF: log(N / df)
  const idf = new Map<string, number>();
  for (const [term, df] of docFreq.entries()) {
    idf.set(term, Math.log(N / df));
  }

  return idf;
}

/**
 * Extract keywords with TF-IDF scores from a corpus
 */
export function extractKeywordsWithTFIDF(
  documents: Document[],
  topNPerDoc: number = 10
): Map<string, Keyword[]> {
  const idf = calculateIDF(documents);
  const result = new Map<string, Keyword[]>();

  for (const doc of documents) {
    const tf = calculateTF(doc.text);
    const keywords: Keyword[] = [];

    for (const [term, tfScore] of tf.entries()) {
      const idfScore = idf.get(term) || 0;
      keywords.push({
        term,
        tf: tfScore,
        idf: idfScore,
        tfidf: tfScore * idfScore,
      });
    }

    // Sort by TF-IDF and take top N
    keywords.sort((a, b) => b.tfidf - a.tfidf);
    result.set(doc.id, keywords.slice(0, topNPerDoc));
  }

  return result;
}

/**
 * Calculate cosine similarity between two keyword vectors
 */
export function keywordSimilarity(
  keywords1: Keyword[],
  keywords2: Keyword[]
): number {
  // Build term-to-score maps
  const vec1 = new Map(keywords1.map(k => [k.term, k.tfidf]));
  const vec2 = new Map(keywords2.map(k => [k.term, k.tfidf]));

  // Calculate dot product
  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;

  for (const [term, score] of vec1.entries()) {
    norm1 += score * score;
    if (vec2.has(term)) {
      dotProduct += score * vec2.get(term)!;
    }
  }

  for (const score of vec2.values()) {
    norm2 += score * score;
  }

  if (norm1 === 0 || norm2 === 0) return 0;

  return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
}

/**
 * Cluster documents by keyword similarity
 */
export function clusterByKeywords(
  docKeywords: Map<string, Keyword[]>,
  minSimilarity: number = 0.3
): string[][] {
  const docIds = [...docKeywords.keys()];
  const clusters: string[][] = [];
  const assigned = new Set<string>();

  for (const docId of docIds) {
    if (assigned.has(docId)) continue;

    const cluster: string[] = [docId];
    const docKw = docKeywords.get(docId)!;

    // Find similar documents
    for (const otherId of docIds) {
      if (otherId === docId || assigned.has(otherId)) continue;

      const otherKw = docKeywords.get(otherId)!;
      const similarity = keywordSimilarity(docKw, otherKw);

      if (similarity >= minSimilarity) {
        cluster.push(otherId);
      }
    }

    // Mark as assigned
    for (const id of cluster) {
      assigned.add(id);
    }

    if (cluster.length > 1) {
      clusters.push(cluster);
    }
  }

  return clusters;
}

/**
 * Discover predicates from a keyword cluster
 * Finds the most representative keywords that define the cluster
 */
export function discoverPredicatesFromCluster(
  clusterDocs: Document[],
  clusterKeywords: Map<string, Keyword[]>
): { predicate: string; keywords: string[]; score: number }[] {
  if (clusterDocs.length < 2) return [];

  // Count keyword occurrences across cluster
  const keywordCounts = new Map<string, number>();
  const keywordScores = new Map<string, number>();

  for (const doc of clusterDocs) {
    const docKw = clusterKeywords.get(doc.id) || [];
    for (const kw of docKw) {
      keywordCounts.set(kw.term, (keywordCounts.get(kw.term) || 0) + 1);
      keywordScores.set(kw.term, (keywordScores.get(kw.term) || 0) + kw.tfidf);
    }
  }

  // Find keywords that appear in most documents (cluster signature)
  const clusterSize = clusterDocs.length;
  const signatures: { predicate: string; keywords: string[]; score: number }[] = [];

  for (const [term, count] of keywordCounts.entries()) {
    const coverage = count / clusterSize;
    if (coverage >= 0.5) {  // Appears in at least 50% of cluster
      const avgScore = keywordScores.get(term)! / count;
      signatures.push({
        predicate: `keyword.${term}`,
        keywords: [term],
        score: coverage * avgScore,
      });
    }
  }

  // Sort by score and return top predicates
  signatures.sort((a, b) => b.score - a.score);
  return signatures.slice(0, 5);
}

/**
 * Extract error patterns from text (specific to code errors)
 */
export function extractErrorPatterns(text: string): string[] {
  const patterns: string[] = [];

  // Common error types
  const errorTypes = [
    'AttributeError', 'TypeError', 'ValueError', 'KeyError', 'IndexError',
    'ImportError', 'ModuleNotFoundError', 'NameError', 'SyntaxError',
    'AssertionError', 'RuntimeError', 'RecursionError',
  ];

  for (const errorType of errorTypes) {
    if (text.includes(errorType)) {
      patterns.push(`error_type:${errorType}`);
    }
  }

  // File extensions
  const extMatch = text.match(/\.(py|js|ts|java|cpp|go|rs|rb)\b/g);
  if (extMatch) {
    const exts = new Set(extMatch.map(e => e.substring(1)));
    for (const ext of exts) {
      patterns.push(`file_ext:${ext}`);
    }
  }

  // Test-related keywords
  if (text.match(/\btest[_\s]/i)) {
    patterns.push('has_test');
  }
  if (text.match(/\bfail(ed|ing)?\b/i)) {
    patterns.push('has_failure');
  }

  return patterns;
}

/**
 * Hybrid keyword + pattern extraction
 * Combines free-text keywords with structured error patterns
 */
export function extractHybridFeatures(text: string, topN: number = 15): {
  keywords: string[];
  patterns: string[];
  combined: string[];
} {
  const keywords = extractKeywords(text, topN);
  const patterns = extractErrorPatterns(text);
  const combined = [...patterns, ...keywords.slice(0, topN - patterns.length)];

  return { keywords, patterns, combined };
}
