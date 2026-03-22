import type { VectorSearchResult } from "@openclaw-enhanced/memory-core";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const GLOBAL_VECTOR_API_KEY = "__OPENCLAW_BAMDRA_MEMORY_VECTOR__";
const PLUGIN_ID = "bamdra-memory-vector";
const SKILL_ID = "bamdra-memory-vector-operator";
const SEARCH_TOOL_NAME = "bamdra_memory_vector_search";
const REINDEX_TOOL_NAME = "bamdra_memory_vector_reindex";
const DEFAULT_LIBRARY_DIRS = ["knowledge", "docs", "notes", "ideas", "06_Interest"] as const;
const RUNTIME_DIR = "_runtime";
const SUPPORTED_TEXT_EXTENSIONS = new Set([
  ".md",
  ".mdx",
  ".txt",
  ".text",
  ".json",
  ".yaml",
  ".yml",
  ".csv",
  ".tsv",
  ".docx",
  ".pdf",
]);

export interface MemoryVectorConfig {
  enabled: boolean;
  markdownRoot: string;
  privateMarkdownRoot: string;
  sharedMarkdownRoot: string;
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
  visibility: "private" | "shared";
  sourceKind: "knowledge" | "runtime";
  absolutePath: string;
}

interface IndexedDocument {
  absolutePath: string;
  relativePath: string;
  visibility: "private" | "shared";
  sourceKind: "knowledge" | "runtime";
  userId: string | null;
  topicId: string | null;
  sessionId: string | null;
  updatedAt: string;
  title: string;
  tags: string[];
  text: string;
}

interface ChunkRecord {
  title: string;
  text: string;
  tags: string[];
}

class LocalVectorIndex {
  private readonly config: MemoryVectorConfig;
  private records = new Map<string, VectorRecord>();

  constructor(inputConfig: Partial<MemoryVectorConfig> | undefined) {
    this.config = normalizeConfig(inputConfig);
    mkdirSync(dirname(this.config.indexPath), { recursive: true });
    this.ensureLibraryRoots();
    this.syncFilesystemIndex();
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
    const visibility: "private" | "shared" = args.userId == null ? "shared" : "private";
    const runtimeRoot = visibility === "shared" ? this.config.sharedMarkdownRoot : this.config.privateMarkdownRoot;
    const runtimeRelativePath = normalizeRuntimeSourcePath({
      visibility,
      userId: args.userId,
      topicId: args.topicId,
      sourcePath: args.sourcePath,
      title: args.title,
    });
    const absolutePath = join(runtimeRoot, runtimeRelativePath);
    mkdirSync(dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, renderRuntimeMarkdown(args.title, args.text, args.tags ?? []), "utf8");
    this.syncFilesystemIndex();
  }

  search(args: {
    query: string;
    userId: string | null;
    topicId?: string | null;
    limit?: number;
  }): VectorSearchResult[] {
    this.syncFilesystemIndex();
    const limit = args.limit ?? 5;
    const queryEmbedding = embed(args.query, this.config.dimensions);
    return [...this.records.values()]
      .filter((record) => canAccessRecord(record, args.userId))
      .filter((record) => !args.topicId || record.topicId === args.topicId || record.topicId == null)
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

  rebuild(): { records: number; privateRoot: string; sharedRoot: string } {
    this.syncFilesystemIndex();
    return {
      records: this.records.size,
      privateRoot: this.config.privateMarkdownRoot,
      sharedRoot: this.config.sharedMarkdownRoot,
    };
  }

  private ensureLibraryRoots(): void {
    mkdirSync(this.config.privateMarkdownRoot, { recursive: true });
    mkdirSync(this.config.sharedMarkdownRoot, { recursive: true });
    for (const root of [this.config.privateMarkdownRoot, this.config.sharedMarkdownRoot]) {
      for (const dirName of DEFAULT_LIBRARY_DIRS) {
        mkdirSync(join(root, dirName), { recursive: true });
      }
      mkdirSync(join(root, RUNTIME_DIR), { recursive: true });
    }
  }

  private syncFilesystemIndex(): void {
    const nextRecords = new Map<string, VectorRecord>();
    const documents = [
      ...scanRoot(this.config.privateMarkdownRoot, "private"),
      ...scanRoot(this.config.sharedMarkdownRoot, "shared"),
    ];
    for (const document of documents) {
      const chunks = chunkDocument(document);
      chunks.forEach((chunk, index) => {
        const id = hashId(`${document.visibility}:${document.relativePath}:${index}`);
        nextRecords.set(id, {
          id,
          userId: document.userId,
          topicId: document.topicId,
          sessionId: document.sessionId,
          sourcePath: document.relativePath,
          title: chunk.title,
          text: chunk.text,
          tags: dedupeTextItems([...document.tags, ...chunk.tags]),
          embedding: embed(`${chunk.title}\n${chunk.text}`, this.config.dimensions),
          updatedAt: document.updatedAt,
          visibility: document.visibility,
          sourceKind: document.sourceKind,
          absolutePath: document.absolutePath,
        });
      });
    }
    this.records = nextRecords;
    this.flush();
  }

  private flush(): void {
    const payload = JSON.stringify([...this.records.values()], null, 2);
    writeFileSync(this.config.indexPath, `${payload}\n`, "utf8");
  }
}

export function register(api: VectorPluginHost): void {
  queueMicrotask(() => {
    try {
      bootstrapOpenClawHost();
    } catch {
      // Keep vector retrieval available even when host bootstrap cannot complete.
    }
  });
  const runtime = new LocalVectorIndex(api.pluginConfig ?? api.config ?? api.plugin?.config);
  exposeVectorApi(runtime);
  api.registerTool?.({
    name: SEARCH_TOOL_NAME,
    description: "Search the current user's local vector-backed knowledge and memory index before falling back to web lookup",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["query"],
      properties: {
        query: { type: "string" },
        userId: { type: ["string", "null"] },
        topicId: { type: ["string", "null"] },
        limit: { type: "integer", minimum: 1, maximum: 20 },
      },
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
  api.registerTool?.({
    name: REINDEX_TOOL_NAME,
    description: "Rebuild the vector knowledge index from the private and shared library roots",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {},
    },
    async execute() {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(runtime.rebuild(), null, 2),
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
    rebuild() {
      return runtime.rebuild();
    },
  };
}

function normalizeConfig(input: Partial<MemoryVectorConfig> | undefined): MemoryVectorConfig {
  const root = join(homedir(), ".openclaw", "memory", "vector");
  const markdownRoot = input?.markdownRoot ?? join(root, "markdown");
  return {
    enabled: input?.enabled ?? true,
    markdownRoot,
    privateMarkdownRoot: input?.privateMarkdownRoot ?? join(markdownRoot, "private"),
    sharedMarkdownRoot: input?.sharedMarkdownRoot ?? join(markdownRoot, "shared"),
    indexPath: input?.indexPath ?? join(root, "index.json"),
    dimensions: input?.dimensions ?? 64,
  };
}

function bootstrapOpenClawHost(): void {
  const currentFile = fileURLToPath(import.meta.url);
  const runtimeDir = dirname(currentFile);
  const packageRoot = resolve(runtimeDir, "..");
  const openclawHome = resolve(homedir(), ".openclaw");
  const configPath = join(openclawHome, "openclaw.json");
  const extensionRoot = join(openclawHome, "extensions");
  const globalSkillsDir = join(openclawHome, "skills");
  const skillSource = join(packageRoot, "skills", SKILL_ID);
  const skillTarget = join(globalSkillsDir, SKILL_ID);

  if (!runtimeDir.startsWith(extensionRoot) || !existsSync(configPath)) {
    return;
  }

  if (existsSync(skillSource) && !existsSync(skillTarget)) {
    mkdirSync(dirname(skillTarget), { recursive: true });
    cpSync(skillSource, skillTarget, { recursive: true });
  }

  const original = readFileSync(configPath, "utf8");
  const config = JSON.parse(original) as Record<string, unknown>;
  const changed = ensureHostConfig(config);
  if (!changed) {
    return;
  }
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

function ensureHostConfig(config: Record<string, unknown>): boolean {
  let changed = false;
  const plugins = ensureObject(config, "plugins");
  const entries = ensureObject(plugins, "entries");
  const load = ensureObject(plugins, "load");
  const tools = ensureObject(config, "tools");
  const skills = ensureObject(config, "skills");
  const skillsLoad = ensureObject(skills, "load");
  const agents = ensureObject(config, "agents");
  const entry = ensureObject(entries, PLUGIN_ID);
  const entryConfig = ensureObject(entry, "config");

  changed = ensureArrayIncludes(plugins, "allow", PLUGIN_ID) || changed;
  changed = ensureArrayIncludes(load, "paths", join(homedir(), ".openclaw", "extensions")) || changed;
  changed = ensureArrayIncludes(skillsLoad, "extraDirs", join(homedir(), ".openclaw", "skills")) || changed;
  changed = ensureArrayIncludes(tools, "allow", SEARCH_TOOL_NAME) || changed;
  changed = ensureArrayIncludes(tools, "allow", REINDEX_TOOL_NAME) || changed;

  if (typeof entry.enabled !== "boolean") {
    entry.enabled = false;
    changed = true;
  }
  if (typeof entryConfig.enabled !== "boolean") {
    entryConfig.enabled = false;
    changed = true;
  }
  if (typeof entryConfig.privateMarkdownRoot !== "string" || entryConfig.privateMarkdownRoot.length === 0) {
    entryConfig.privateMarkdownRoot = "~/.openclaw/memory/vector/markdown/private";
    changed = true;
  }
  if (typeof entryConfig.sharedMarkdownRoot !== "string" || entryConfig.sharedMarkdownRoot.length === 0) {
    entryConfig.sharedMarkdownRoot = "~/.openclaw/memory/vector/markdown/shared";
    changed = true;
  }
  if (typeof entryConfig.indexPath !== "string" || entryConfig.indexPath.length === 0) {
    entryConfig.indexPath = "~/.openclaw/memory/vector/index.json";
    changed = true;
  }

  changed = ensureAgentSkills(agents, SKILL_ID) || changed;
  return changed;
}

function ensureObject(parent: Record<string, unknown>, key: string): Record<string, unknown> {
  const current = parent[key];
  if (current && typeof current === "object" && !Array.isArray(current)) {
    return current as Record<string, unknown>;
  }
  const next: Record<string, unknown> = {};
  parent[key] = next;
  return next;
}

function ensureArrayIncludes(parent: Record<string, unknown>, key: string, value: string): boolean {
  const current = Array.isArray(parent[key]) ? [...(parent[key] as string[])] : [];
  if (current.includes(value)) {
    if (!Array.isArray(parent[key])) {
      parent[key] = current;
    }
    return false;
  }
  current.push(value);
  parent[key] = current;
  return true;
}

function ensureAgentSkills(agents: Record<string, unknown>, skillId: string): boolean {
  const list = Array.isArray(agents.list) ? agents.list : [];
  let changed = false;
  for (const item of list) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const agent = item as Record<string, unknown>;
    const current = Array.isArray(agent.skills) ? [...(agent.skills as string[])] : [];
    if (!current.includes(skillId)) {
      current.push(skillId);
      agent.skills = current;
      changed = true;
    }
  }
  return changed;
}

function scanRoot(rootDir: string, visibility: "private" | "shared"): IndexedDocument[] {
  if (!existsSync(rootDir)) {
    return [];
  }
  const files = walkFiles(rootDir);
  const documents: IndexedDocument[] = [];
  for (const absolutePath of files) {
    const extension = extname(absolutePath).toLowerCase();
    if (!SUPPORTED_TEXT_EXTENSIONS.has(extension)) {
      continue;
    }
    const relativePath = relative(rootDir, absolutePath).split(sep).join("/");
    const stat = statSync(absolutePath);
    const text = extractFileText(absolutePath);
    if (!text || !text.trim()) {
      continue;
    }
    const metadata = inferDocumentMetadata(relativePath, visibility);
    documents.push({
      absolutePath,
      relativePath,
      visibility,
      sourceKind: relativePath.startsWith(`${RUNTIME_DIR}/`) ? "runtime" : "knowledge",
      userId: metadata.userId,
      topicId: metadata.topicId,
      sessionId: metadata.sessionId,
      updatedAt: stat.mtime.toISOString(),
      title: inferDocumentTitle(relativePath, text),
      tags: metadata.tags,
      text,
    });
  }
  return documents;
}

function walkFiles(rootDir: string): string[] {
  const results: string[] = [];
  const stack = [rootDir];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (entry.name.startsWith(".") || entry.name === "node_modules") {
        continue;
      }
      const absolutePath = join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(absolutePath);
      } else if (entry.isFile()) {
        results.push(absolutePath);
      }
    }
  }
  return results;
}

function inferDocumentMetadata(
  relativePath: string,
  visibility: "private" | "shared",
): { userId: string | null; topicId: string | null; sessionId: string | null; tags: string[] } {
  const segments = relativePath.split("/");
  const tags = segments
    .filter((segment) => segment && segment !== RUNTIME_DIR)
    .slice(0, 4)
    .map((segment) => sanitizeTag(segment));
  if (visibility === "shared") {
    return { userId: null, topicId: extractTopicId(segments), sessionId: extractSessionId(segments), tags };
  }
  const userSegmentIndex = segments.findIndex((segment) => segment === "user");
  const userId = userSegmentIndex >= 0 ? segments[userSegmentIndex + 1] ?? null : null;
  return {
    userId,
    topicId: extractTopicId(segments),
    sessionId: extractSessionId(segments),
    tags,
  };
}

function extractTopicId(segments: string[]): string | null {
  const topicSegment = segments.find((segment) => segment.startsWith("topic-"));
  return topicSegment ?? null;
}

function extractSessionId(segments: string[]): string | null {
  const sessionIndex = segments.findIndex((segment) => segment === "sessions");
  if (sessionIndex < 0) {
    return null;
  }
  return segments[sessionIndex + 1] ?? null;
}

function inferDocumentTitle(relativePath: string, text: string): string {
  const headingMatch = text.match(/^#\s+(.+)$/m);
  if (headingMatch?.[1]) {
    return headingMatch[1].trim();
  }
  const firstNonEmpty = text.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
  if (firstNonEmpty) {
    return firstNonEmpty.slice(0, 80);
  }
  return basename(relativePath, extname(relativePath));
}

function chunkDocument(document: IndexedDocument): ChunkRecord[] {
  if (extname(document.absolutePath).toLowerCase().startsWith(".md")) {
    return chunkMarkdown(document.text, document.title, document.tags);
  }
  return chunkPlainText(document.text, document.title, document.tags);
}

function chunkMarkdown(text: string, fallbackTitle: string, baseTags: string[]): ChunkRecord[] {
  const lines = text.split(/\r?\n/);
  const chunks: ChunkRecord[] = [];
  let headingTrail: string[] = [];
  let buffer: string[] = [];

  const flush = () => {
    const content = buffer.join("\n").trim();
    if (!content) {
      buffer = [];
      return;
    }
    chunks.push({
      title: headingTrail.length > 0 ? headingTrail.join(" / ") : fallbackTitle,
      text: content,
      tags: baseTags,
    });
    buffer = [];
  };

  for (const line of lines) {
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      flush();
      const depth = heading[1].length;
      headingTrail = [...headingTrail.slice(0, depth - 1), heading[2].trim()];
      continue;
    }
    buffer.push(line);
    if (buffer.join("\n").length > 900) {
      flush();
    }
  }
  flush();
  return chunks.length > 0 ? chunks : chunkPlainText(text, fallbackTitle, baseTags);
}

function chunkPlainText(text: string, title: string, tags: string[]): ChunkRecord[] {
  const normalized = text.replace(/\r/g, "").trim();
  if (!normalized) {
    return [];
  }
  const paragraphs = normalized.split(/\n{2,}/).map((item) => item.trim()).filter(Boolean);
  const chunks: ChunkRecord[] = [];
  let buffer = "";
  for (const paragraph of paragraphs.length > 0 ? paragraphs : [normalized]) {
    const next = buffer ? `${buffer}\n\n${paragraph}` : paragraph;
    if (next.length > 900 && buffer) {
      chunks.push({ title, text: buffer, tags });
      buffer = paragraph;
    } else {
      buffer = next;
    }
  }
  if (buffer) {
    chunks.push({ title, text: buffer, tags });
  }
  return chunks;
}

function extractFileText(absolutePath: string): string {
  const extension = extname(absolutePath).toLowerCase();
  if (extension === ".docx") {
    return extractDocxText(absolutePath);
  }
  if (extension === ".pdf") {
    return extractPdfText(absolutePath);
  }
  return readFileSync(absolutePath, "utf8");
}

function extractDocxText(absolutePath: string): string {
  try {
    const xml = execFileSync("unzip", ["-p", absolutePath, "word/document.xml"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return stripXmlText(xml);
  } catch {
    return "";
  }
}

function extractPdfText(absolutePath: string): string {
  try {
    return execFileSync("pdftotext", ["-layout", "-nopgbrk", absolutePath, "-"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    try {
      return execFileSync("mdls", ["-raw", "-name", "kMDItemTextContent", absolutePath], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
    } catch {
      return "";
    }
  }
}

function stripXmlText(xml: string): string {
  return xml
    .replace(/<\/w:p>/g, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function normalizeRuntimeSourcePath(args: {
  visibility: "private" | "shared";
  userId: string | null;
  topicId: string | null;
  sourcePath: string;
  title: string;
}): string {
  const topicSegment = args.topicId ?? "general";
  const slug = slugify(args.title) || "memory-note";
  const baseName = `${slug}.md`;
  if (args.visibility === "shared") {
    return join(RUNTIME_DIR, "shared", "topics", topicSegment, baseName);
  }
  return join(RUNTIME_DIR, "user", args.userId ?? "current", "topics", topicSegment, baseName);
}

function renderRuntimeMarkdown(title: string, text: string, tags: string[]): string {
  const frontmatter = [
    "---",
    `title: ${JSON.stringify(title)}`,
    `tags: ${JSON.stringify(tags)}`,
    "---",
  ].join("\n");
  return `${frontmatter}\n\n# ${title}\n\n${text.trim()}\n`;
}

function canAccessRecord(record: VectorRecord, userId: string | null): boolean {
  if (record.visibility === "shared") {
    return true;
  }
  if (record.userId == null) {
    return userId != null;
  }
  return record.userId === userId;
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
  if (record.sourcePath.toLowerCase().includes(normalized)) {
    reasons.push("path");
  }
  if (reasons.length === 0) {
    reasons.push("semantic");
  }
  return reasons;
}

function dedupeTextItems(items: string[]): string[] {
  return [...new Set(items.map((item) => item.trim()).filter(Boolean))];
}

function sanitizeTag(value: string): string {
  return value.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function hashId(value: string): string {
  return createHash("sha1").update(value).digest("hex").slice(0, 24);
}
