import type { VectorSearchResult } from "@openclaw-enhanced/memory-core";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const GLOBAL_VECTOR_API_KEY = "__OPENCLAW_BAMDRA_MEMORY_VECTOR__";

export interface MemoryVectorConfig {
  enabled: boolean;
  markdownRoot: string;
  indexPath: string;
  dimensions: number;
}

interface ToolDefinition<TParams> {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute(invocationId: string, params: TParams): Promise<{ content: Array<{ type: "text"; text: string }> }>;
}

interface VectorPluginHost {
  registerTool?<TParams>(definition: ToolDefinition<TParams>): void;
  pluginConfig?: Partial<MemoryVectorConfig>;
  config?: Partial<MemoryVectorConfig>;
  plugin?: { config?: Partial<MemoryVectorConfig> };
}

interface VectorRecord {
  id: string;
  userId: string | null;
  topicId: string | null;
  sessionId: string | null;
  sourcePath: string;
  title: string;
  text: string;
  tags: string[];
  embedding: number[];
  updatedAt: string;
}

class LocalVectorIndex {
  private readonly config: MemoryVectorConfig;
  private readonly records = new Map<string, VectorRecord>();

  constructor(inputConfig: Partial<MemoryVectorConfig> | undefined) {
    this.config = normalizeConfig(inputConfig);
    mkdirSync(dirname(this.config.indexPath), { recursive: true });
    mkdirSync(this.config.markdownRoot, { recursive: true });
    this.load();
  }

  upsert(args: {
    userId: string | null;
    sessionId: string | null;
    topicId: string | null;
    sourcePath: string;
    title: string;
    text: string;
    tags?: string[];
  }): void {
    const id = hashId(`${args.userId ?? "shared"}:${args.sourcePath}:${args.title}`);
    const record: VectorRecord = {
      id,
      userId: args.userId,
      sessionId: args.sessionId,
      topicId: args.topicId,
      sourcePath: args.sourcePath,
      title: args.title,
      text: args.text,
      tags: args.tags ?? [],
      embedding: embed(`${args.title}\n${args.text}`, this.config.dimensions),
      updatedAt: new Date().toISOString(),
    };
    this.records.set(id, record);
    const markdownPath = join(this.config.markdownRoot, args.sourcePath);
    mkdirSync(dirname(markdownPath), { recursive: true });
    writeFileSync(markdownPath, `# ${args.title}\n\n${args.text}\n`, "utf8");
    this.flush();
  }

  search(args: {
    query: string;
    userId: string | null;
    topicId?: string | null;
    limit?: number;
  }): VectorSearchResult[] {
    const limit = args.limit ?? 5;
    const queryEmbedding = embed(args.query, this.config.dimensions);
    return [...this.records.values()]
      .filter((record) => {
        if (args.userId == null) {
          return record.userId == null;
        }
        return record.userId === args.userId;
      })
      .map((record) => ({
        id: record.id,
        userId: record.userId,
        topicId: record.topicId,
        sessionId: record.sessionId,
        sourcePath: record.sourcePath,
        title: record.title,
        text: record.text,
        tags: record.tags,
        score: cosineSimilarity(queryEmbedding, record.embedding),
        matchReasons: inferMatchReasons(args.query, record),
        source: "vector" as const,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  private flush(): void {
    const payload = JSON.stringify([...this.records.values()], null, 2);
    writeFileSync(this.config.indexPath, `${payload}\n`, "utf8");
  }

  private load(): void {
    if (!existsSync(this.config.indexPath)) {
      return;
    }
    const payload = JSON.parse(readFileSync(this.config.indexPath, "utf8")) as VectorRecord[];
    for (const record of payload) {
      this.records.set(record.id, record);
    }
  }
}

export function register(api: VectorPluginHost): void {
  const runtime = new LocalVectorIndex(api.pluginConfig ?? api.config ?? api.plugin?.config);
  exposeVectorApi(runtime);
  api.registerTool?.({
    name: "memory_vector_search",
    description: "Search the current user's vector memory index",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["query"],
      properties: {
        query: { type: "string" },
        userId: { type: ["string", "null"] },
        topicId: { type: ["string", "null"] },
        limit: { type: "integer", minimum: 1, maximum: 20 }
      }
    },
    async execute(_id, params: Record<string, unknown>) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(runtime.search({
              query: String(params.query ?? ""),
              userId: typeof params.userId === "string" ? params.userId : null,
              topicId: typeof params.topicId === "string" ? params.topicId : null,
              limit: typeof params.limit === "number" ? params.limit : undefined,
            }), null, 2),
          },
        ],
      };
    },
  });
}

export async function activate(api: VectorPluginHost): Promise<void> {
  register(api);
}

function exposeVectorApi(runtime: LocalVectorIndex): void {
  (globalThis as Record<string, unknown>)[GLOBAL_VECTOR_API_KEY] = {
    upsertMemoryRecord(args: {
      userId: string | null;
      sessionId: string | null;
      topicId: string | null;
      sourcePath: string;
      title: string;
      text: string;
      tags?: string[];
    }) {
      runtime.upsert(args);
    },
    search(args: {
      query: string;
      userId: string | null;
      topicId?: string | null;
      limit?: number;
    }) {
      return runtime.search(args);
    },
  };
}

function normalizeConfig(input: Partial<MemoryVectorConfig> | undefined): MemoryVectorConfig {
  const root = join(homedir(), ".openclaw", "memory", "vector");
  return {
    enabled: input?.enabled ?? true,
    markdownRoot: input?.markdownRoot ?? join(root, "markdown"),
    indexPath: input?.indexPath ?? join(root, "index.json"),
    dimensions: input?.dimensions ?? 64,
  };
}

function embed(text: string, dimensions: number): number[] {
  const vector = Array.from({ length: dimensions }, () => 0);
  const tokens = text.toLowerCase().split(/[^a-z0-9_\u4e00-\u9fff]+/i).filter(Boolean);
  for (const token of tokens) {
    const digest = createHash("sha1").update(token).digest();
    const index = digest[0] % dimensions;
    vector[index] += 1;
  }
  const magnitude = Math.sqrt(vector.reduce((sum, item) => sum + (item * item), 0)) || 1;
  return vector.map((item) => item / magnitude);
}

function cosineSimilarity(a: number[], b: number[]): number {
  let sum = 0;
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    sum += a[index] * b[index];
  }
  return Number(sum.toFixed(6));
}

function inferMatchReasons(query: string, record: VectorRecord): string[] {
  const reasons: string[] = [];
  const normalized = query.toLowerCase();
  if (record.title.toLowerCase().includes(normalized)) {
    reasons.push("title");
  }
  if (record.text.toLowerCase().includes(normalized)) {
    reasons.push("text");
  }
  if (reasons.length === 0) {
    reasons.push("semantic");
  }
  return reasons;
}

function hashId(value: string): string {
  return createHash("sha1").update(value).digest("hex").slice(0, 24);
}
