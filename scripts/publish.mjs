#!/usr/bin/env node
// Publishes a reviewed blog post (final.md) to either a local markdown "site"
// (posts/ + posts/index.json as a mock DB) or a Notion database via the
// Notion REST API. Called by the blog-publisher subagent.
//
// Usage:
//   node scripts/publish.mjs --final <path> --slug <slug> --title <title> \
//     --tags <tag1,tag2> [--target local|notion]

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const value = argv[i + 1];
      out[key] = value;
      i++;
    }
  }
  return out;
}

function fail(message, extra = {}) {
  console.log(JSON.stringify({ ok: false, error: message, ...extra }));
  process.exit(1);
}

function loadConfig() {
  const configPath = resolve(REPO_ROOT, "config/publish.config.json");
  if (!existsSync(configPath)) return { target: "local", local: {}, notion: {} };
  return JSON.parse(readFileSync(configPath, "utf8"));
}

// Very small markdown -> Notion block converter. Handles headings,
// bullet lists, and paragraphs. Anything fancier (tables, nested lists)
// is passed through as a plain paragraph, which is a safe degrade.
function markdownToNotionBlocks(markdown) {
  const lines = markdown.split("\n");
  const blocks = [];
  let paragraphBuffer = [];

  const flushParagraph = () => {
    if (paragraphBuffer.length === 0) return;
    const text = paragraphBuffer.join(" ").trim();
    paragraphBuffer = [];
    if (!text) return;
    blocks.push({
      object: "block",
      type: "paragraph",
      paragraph: { rich_text: [{ type: "text", text: { content: text.slice(0, 2000) } }] },
    });
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line === "") {
      flushParagraph();
      continue;
    }
    const headingMatch = line.match(/^(#{1,3})\s+(.*)$/);
    if (headingMatch) {
      flushParagraph();
      const level = headingMatch[1].length;
      const headingType = level === 1 ? "heading_1" : level === 2 ? "heading_2" : "heading_3";
      blocks.push({
        object: "block",
        type: headingType,
        [headingType]: { rich_text: [{ type: "text", text: { content: headingMatch[2].slice(0, 2000) } }] },
      });
      continue;
    }
    const bulletMatch = line.match(/^[-*]\s+(.*)$/);
    if (bulletMatch) {
      flushParagraph();
      blocks.push({
        object: "block",
        type: "bulleted_list_item",
        bulleted_list_item: { rich_text: [{ type: "text", text: { content: bulletMatch[1].slice(0, 2000) } }] },
      });
      continue;
    }
    paragraphBuffer.push(line);
  }
  flushParagraph();

  // Notion caps a single page creation request at 100 blocks.
  return blocks.slice(0, 100);
}

function extractBody(markdown) {
  // Drop the leading "# Title" line so the title isn't duplicated in the body.
  return markdown.replace(/^#\s+.*\n/, "");
}

function publishLocal({ finalContent, slug, title, tags, config }) {
  const postsDir = resolve(REPO_ROOT, config.local?.postsDir || "posts");
  const baseUrl = config.local?.baseUrl || "http://localhost:3000/blog";
  mkdirSync(postsDir, { recursive: true });

  const date = new Date().toISOString().slice(0, 10);
  const frontmatter = [
    "---",
    `title: "${title.replace(/"/g, '\\"')}"`,
    `slug: "${slug}"`,
    `date: "${date}"`,
    `tags: [${tags.map((t) => `"${t.replace(/"/g, '\\"')}"`).join(", ")}]`,
    "---",
    "",
  ].join("\n");

  const postPath = resolve(postsDir, `${slug}.md`);
  writeFileSync(postPath, frontmatter + extractBody(finalContent), "utf8");

  const indexPath = resolve(postsDir, "index.json");
  const index = existsSync(indexPath) ? JSON.parse(readFileSync(indexPath, "utf8")) : [];
  const url = `${baseUrl.replace(/\/$/, "")}/${slug}`;
  const entry = { slug, title, tags, date, path: `posts/${slug}.md`, url };
  const filtered = index.filter((e) => e.slug !== slug);
  filtered.push(entry);
  writeFileSync(indexPath, JSON.stringify(filtered, null, 2) + "\n", "utf8");

  return { ok: true, target: "local", url, path: `posts/${slug}.md` };
}

async function publishNotion({ finalContent, slug, title, tags, config }) {
  const tokenEnvVar = config.notion?.tokenEnvVar || "NOTION_TOKEN";
  const dbEnvVar = config.notion?.databaseIdEnvVar || "NOTION_DATABASE_ID";
  const token = process.env[tokenEnvVar];
  const databaseId = process.env[dbEnvVar];

  if (!token || !databaseId) {
    return {
      ok: false,
      target: "notion",
      error: `missing ${tokenEnvVar} and/or ${dbEnvVar} environment variables`,
    };
  }

  const titleProperty = config.notion?.titleProperty || "제목";
  const tagsProperty = config.notion?.tagsProperty || "태그";
  const statusProperty = config.notion?.statusProperty || "상태";
  const publishedStatusValue = config.notion?.publishedStatusValue || "발행됨";

  const body = {
    parent: { database_id: databaseId },
    properties: {
      [titleProperty]: { title: [{ text: { content: title } }] },
      [tagsProperty]: { multi_select: tags.map((t) => ({ name: t })) },
      [statusProperty]: { select: { name: publishedStatusValue } },
    },
    children: markdownToNotionBlocks(extractBody(finalContent)),
  };

  const res = await fetch("https://api.notion.com/v1/pages", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": "2022-06-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const json = await res.json();
  if (!res.ok) {
    return { ok: false, target: "notion", error: json?.message || `Notion API error (${res.status})` };
  }

  return { ok: true, target: "notion", url: json.url, pageId: json.id };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { final: finalPath, slug, title, tags: tagsArg, target: targetArg } = args;

  if (!finalPath || !slug || !title) {
    fail("missing required args: --final, --slug, --title are required");
    return;
  }

  const resolvedFinalPath = resolve(REPO_ROOT, finalPath);
  if (!existsSync(resolvedFinalPath)) {
    fail(`final.md not found at ${finalPath}`);
    return;
  }

  const finalContent = readFileSync(resolvedFinalPath, "utf8");
  const tags = (tagsArg || "").split(",").map((t) => t.trim()).filter(Boolean);
  const config = loadConfig();
  const target = targetArg || config.target || "local";

  let result;
  if (target === "notion") {
    result = await publishNotion({ finalContent, slug, title, tags, config });
  } else {
    result = publishLocal({ finalContent, slug, title, tags, config });
  }

  console.log(JSON.stringify(result));
  process.exit(result.ok ? 0 : 1);
}

main();
