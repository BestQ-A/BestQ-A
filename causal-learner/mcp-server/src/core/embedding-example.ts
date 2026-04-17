/**
 * Embedding 使用示例 — 完整端到端演示
 *
 * 链路：原始文本 → LocalEmbedding 生成向量 → zvec 存储 → 向量相似度检索
 *
 * 运行方式（Node.js ESM）：
 *   cd causal-learner/mcp-server
 *   node --loader ts-node/esm --no-warnings src/core/embedding-example.ts
 *
 * 或在已有 TypeScript 代码中 import：
 *   import { LocalEmbedding, warmupEmbeddings } from './core/embedding.js';
 */

// ===========================================================================
// 1. 基础用法 — 单条和批量 embedding
// ===========================================================================

import { LocalEmbedding, warmupEmbeddings, EMBEDDING_MODELS } from './embedding.js';

async function basicUsageDemo() {
  console.log('========== 1. 基础用法 ==========');

  // 可用模型列表
  console.log('可用模型:', EMBEDDING_MODELS);

  // 单条 embedding
  const emb = await LocalEmbedding.create('all-MiniLM-L6-v2');
  const vec1 = await emb.embed('test failed with AttributeError');
  console.log(`单条向量维度: ${vec1.length}`); // 384

  // 批量 embedding
  const vecs = await emb.embedBatch([
    'AttributeError: module has no attribute',
    'TypeError: unsupported operand type(s) for +',
    'AssertionError: expected true but got false',
    'KeyError: missing key in dictionary',
  ]);
  console.log(`批量数量: ${vecs.length}, 每条维度: ${vecs[0].length}`);

  // 向量相似度（点积，因为已归一化）
  const sim = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i], 0);
  const similarity = sim(vec1, vecs[0]);
  console.log(`与自身相似度: ${similarity.toFixed(4)} (归一化后≈1.0)`);
}

// ===========================================================================
// 2. 实际集成场景：Observation 事实 embedding
// ===========================================================================

interface FactText {
  obsId: string;
  pred: string;
  args: Record<string, string>;
  value: boolean;
}

interface EmbeddedFact {
  obsId: string;
  pred: string;
  vector: number[];
}

async function observationEmbeddingDemo() {
  console.log('\n========== 2. Observation Embedding ==========');

  const emb = await LocalEmbedding.create('all-MiniLM-L6-v2');

  // 模拟 SWE-bench 观测的 facts
  const facts: FactText[] = [
    { obsId: 'obs_001', pred: 'test.failed', args: { name: 'test_api', file: 'tests/api_test.py' }, value: true },
    { obsId: 'obs_002', pred: 'error.type', args: { kind: 'AttributeError' }, value: true },
    { obsId: 'obs_003', pred: 'file.missing', args: { path: 'setup.py' }, value: true },
    { obsId: 'obs_004', pred: 'test.failed', args: { name: 'test_handler', file: 'tests/handler_test.py' }, value: true },
  ];

  // 将 fact 转为可 embedding 的文本描述
  const toText = (f: FactText) =>
    `pred=${f.pred} ${Object.entries(f.args).map(([k, v]) => `${k}=${v}`).join(' ')}`;

  // 生成向量
  const texts = facts.map(toText);
  const vectors = await emb.embedBatch(texts);

  const embeddedFacts: EmbeddedFact[] = facts.map((f, i) => ({
    obsId: f.obsId,
    pred: f.pred,
    vector: vectors[i],
  }));

  console.log('embeddedFacts:', embeddedFacts.map(ef => ({
    obsId: ef.obsId,
    pred: ef.pred,
    vecDim: ef.vector.length,
  })));

  // 用向量搜索找相似 fact（最简单的最近邻）
  const queryText = 'test failed AttributeError in api';
  const queryVec = await emb.embed(queryText);

  // 手动计算 cosine similarity 排序
  const sim = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i], 0);
  const ranked = embeddedFacts
    .map(ef => ({ ef, score: sim(queryVec, ef.vector) }))
    .sort((a, b) => b.score - a.score);

  console.log(`\n查询: "${queryText}"`);
  console.log('Top-2 相似 fact:');
  ranked.slice(0, 2).forEach(r => {
    console.log(`  [${r.score.toFixed(4)}] ${r.ef.pred} obsId=${r.ef.obsId}`);
  });
}

// ===========================================================================
// 3. zvec 集成：写入 + 检索完整流程
// ===========================================================================
//
// 本示例展示 embedding + zvec 串联的完整流程。
// zvec 是 Python 包，以下为 Python 子进程调用模式。
//
// 前置依赖（Python 环境）：
//   pip install zvec numpy
//
// 在实际 MCP server 中，这些 Python 调用可以封装为一个工具，
// 通过 child_process.spawn 或 python -c "..." 方式调用。

import { spawn } from 'child_process';

interface ZvecDoc {
  id: string;
  embedding: number[];
  fields: Record<string, string | number | boolean>;
}

interface ZvecSearchResult {
  id: string;
  score: number;
  fields: Record<string, string | number | boolean>;
}

/**
 * 通过 Python 子进程调用 zvec Python API
 */
async function zvecUpsert(collectionPath: string, docs: ZvecDoc[]): Promise<void> {
  const pyCode = `
import sys, json, zvec

schema = zvec.CollectionSchema(
    name="semantic_store",
    fields=[
        zvec.FieldSchema(name="pred", data_type=zvec.DataType.STRING),
        zvec.FieldSchema(name="obs_id", data_type=zvec.DataType.STRING),
    ],
    vectors=[
        zvec.VectorSchema(
            name="embedding",
            data_type=zvec.DataType.VECTOR_FP32,
            dimension=${docs[0].embedding.length},
            index_param=zvec.HnswIndexParam(metric_type=zvec.MetricType.COSINE),
        ),
    ],
)
collection = zvec.create_and_open("${collectionPath.replace(/\\/g, '\\\\')}", schema=schema)
for doc in ${JSON.stringify(docs)}:
    collection.upsert(zvec.Doc(
        id=doc["id"],
        vectors={"embedding": doc["embedding"]},
        fields=doc["fields"],
    ))
print("OK", len(${JSON.stringify(docs)}), "docs")
`;
  return new Promise((resolve, reject) => {
    const py = spawn('python', ['-c', pyCode], { shell: true });
    let stdout = '', stderr = '';
    py.stdout.on('data', d => stdout += d);
    py.stderr.on('data', d => stderr += d);
    py.on('close', code => code === 0 ? resolve() : reject(new Error(stderr || stdout)));
  });
}

async function zvecSearch(collectionPath: string, queryVec: number[], topk = 5): Promise<ZvecSearchResult[]> {
  const pyCode = `
import sys, json, zvec
collection = zvec.open("${collectionPath.replace(/\\/g, '\\\\')}")
results = collection.query(
    vectors=zvec.VectorQuery("embedding", vector=${JSON.stringify(queryVec)}),
    topk=${topk},
)
out = [{"id": r["id"], "score": r["score"], "fields": r.get("fields", {})} for r in results]
print(json.dumps(out))
`;
  return new Promise((resolve, reject) => {
    const py = spawn('python', ['-c', pyCode], { shell: true });
    let stdout = '', stderr = '';
    py.stdout.on('data', d => stdout += d);
    py.stderr.on('data', d => stderr += d);
    py.on('close', code => {
      if (code !== 0) { reject(new Error(stderr)); return; }
      resolve(JSON.parse(stdout));
    });
  });
}

async function fullPipelineDemo() {
  console.log('\n========== 3. Embedding + zvec 完整流程 ==========');

  const emb = await LocalEmbedding.create('all-MiniLM-L6-v2');
  const collectionPath = './tmp_zvec_demo';

  // Step 1: 生成 embedding
  const facts = [
    { id: 'ev_001', text: 'test failed AttributeError test_api', pred: 'test.failed', obsId: 'obs_001' },
    { id: 'ev_002', text: 'error type AttributeError missing attribute', pred: 'error.type', obsId: 'obs_002' },
    { id: 'ev_003', text: 'file missing setup.py not found', pred: 'file.missing', obsId: 'obs_003' },
    { id: 'ev_004', text: 'test failed TypeError in handler_test', pred: 'test.failed', obsId: 'obs_004' },
  ];

  const vectors = await emb.embedBatch(facts.map(f => f.text));
  const docs: ZvecDoc[] = facts.map((f, i) => ({
    id: f.id,
    embedding: vectors[i],
    fields: { pred: f.pred, obs_id: f.obsId },
  }));

  // Step 2: 写入 zvec
  try {
    await zvecUpsert(collectionPath, docs);
    console.log('zvec: 写入成功');

    // Step 3: 向量检索
    const queryVec = await emb.embed('test failed with AttributeError');
    const results = await zvecSearch(collectionPath, queryVec, 3);
    console.log('zvec: 检索结果（Top-3）');
    results.forEach(r => {
      console.log(`  [${r.score.toFixed(4)}] id=${r.id} fields=${JSON.stringify(r.fields)}`);
    });
  } catch (err) {
    // Python/zvec 未安装时优雅降级
    console.log('zvec: Python 环境未安装或 zvec 未 pip install，跳过写入演示');
    console.log('  → 已有 LocalEmbedding 向量，可直接在其他向量数据库使用');
    console.log(`  → 当前 embedding 向量维度: ${vectors[0].length}`);
  }
}

// ===========================================================================
// 4. 在 causal-learner 现有流程中接入 embedding
// ===========================================================================

/**
 * 演示：在 submitObservation 之后，对新 Event 的 facts 做 embedding 并存储
 *
 * 真实接入位置：src/tools/observation.ts 的 submitObservationTool 函数中
 *
 * ```typescript
 * import { LocalEmbedding } from '../core/embedding.js';
 *
 * // 在 submitObservationTool 函数末尾添加：
 * if (!result.explained && result.eventCreated) {
 *   const emb = await LocalEmbedding.create('all-MiniLM-L6-v2');
 *   const factTexts = result.eventCreated.observation.facts.map(f =>
 *     \`pred=\${f.pred} \${Object.entries(f.args || {}).map(([k,v]) => \`\${k}=\${v}\`).join(' ')}\`
 *   );
 *   const vecs = await emb.embedBatch(factTexts);
 *   // 将 vecs 写入 zvec（通过 Python 子进程或 MCP 工具）
 *   await writeToZvec(result.eventCreated.eventId, vecs, factTexts);
 * }
 * ```
 */
async function integrationSpotDemo() {
  console.log('\n========== 4. 因果学习器集成点 ==========');
  console.log('接入位置：src/tools/observation.ts → submitObservationTool()');
  console.log('  └─> 未解释的 Event 创建后');
  console.log('       └─> LocalEmbedding.embedBatch(factTexts)');
  console.log('            └─> zvec Python 子进程写入');
  console.log('');
  console.log('效果：新的"意外"-fact embedding 后被存入向量数据库');
  console.log('     下次检索时，通过向量相似度找到结构相似的历史 Event');
  console.log('     从而实现"这个错误以前见过"的语义召回能力');
}

// ===========================================================================
// 5. 启动预热（服务启动时调用一次）
// ===========================================================================

async function warmupDemo() {
  console.log('\n========== 5. 启动预热 ==========');
  console.log('预热模型下载（首次慢，后续快）...');
  await warmupEmbeddings(['all-MiniLM-L6-v2']);
  console.log('预热完成，模型已缓存');
}

// ===========================================================================
// 主入口
// ===========================================================================

async function main() {
  try {
    await basicUsageDemo();
    await observationEmbeddingDemo();
    await fullPipelineDemo();
    await integrationSpotDemo();
    await warmupDemo();
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

main();
