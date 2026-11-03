#!/usr/bin/env node
/**
 * Minimal MCP stdio client for Paper Desktop.
 *
 * The DeepSeek Harness runtime does not currently expose Paper's MCP tools in
 * the agent tool list. Paper Desktop ships a stdio relay (`paper mcp`); this
 * script speaks JSON-RPC to it so agents can still read, screenshot and edit
 * Paper files with the same tools described in Paper's MCP docs.
 *
 * Usage:
 *   node scripts/paper-mcp.mjs list
 *   node scripts/paper-mcp.mjs schema get_basic_info
 *   node scripts/paper-mcp.mjs call get_basic_info '{"fileId":"..."}'
 *   node scripts/paper-mcp.mjs call get_screenshot '{"fileId":"...","nodeId":"..."}' --out shot.jpg
 *
 * Requires Paper Desktop to be running with a file open. Override the CLI path
 * with PAPER_CLI if it is not at ~/.paper/bin/paper.
 */
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { homedir } from 'node:os';

const PAPER_CLI = process.env.PAPER_CLI || `${homedir()}/.paper/bin/paper`;
const [, , command, toolName, argsJson, ...rest] = process.argv;
const outIndex = rest.indexOf('--out');
const outPath = outIndex >= 0 ? rest[outIndex + 1] : null;

const child = spawn(PAPER_CLI, ['mcp'], { stdio: ['pipe', 'pipe', 'inherit'] });
const pending = new Map();
let nextId = 1;

const lines = createInterface({ input: child.stdout });
lines.on('line', (line) => {
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    return;
  }
  const entry = message.id && pending.get(message.id);
  if (!entry) return;
  pending.delete(message.id);
  if (message.error) entry.reject(new Error(JSON.stringify(message.error)));
  else entry.resolve(message.result);
});

function request(method, params = {}) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
  });
}

function notify(method, params = {}) {
  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`);
}

function print(result) {
  const content = result?.content ?? [];
  const text = content.filter((item) => item.type === 'text').map((item) => item.text).join('\n');
  if (text) console.log(text);
  for (const item of content) {
    if (item.type !== 'image') continue;
    if (outPath) {
      writeFileSync(outPath, Buffer.from(item.data, 'base64'));
      console.error(`saved ${item.mimeType || 'image'} → ${outPath}`);
    } else {
      console.log(JSON.stringify({ image: item.mimeType, bytes: item.data.length }));
    }
  }
  if (!text && !content.some((item) => item.type === 'image')) console.log(JSON.stringify(result, null, 2));
}

async function main() {
  await request('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'jelly-paper-mcp', version: '1.0' },
  });
  notify('notifications/initialized');

  if (command === 'list') {
    const result = await request('tools/list');
    for (const tool of result.tools) {
      console.log(tool.name, '|', (tool.description || '').split('\n')[0].slice(0, 110));
    }
    return;
  }

  if (command === 'schema') {
    const result = await request('tools/list');
    const tool = result.tools.find((item) => item.name === toolName);
    if (!tool) throw new Error(`unknown tool: ${toolName}`);
    console.log(JSON.stringify(tool, null, 2));
    return;
  }

  if (command === 'call') {
    const args = argsJson ? JSON.parse(argsJson) : {};
    const result = await request('tools/call', { name: toolName, arguments: args });
    print(result);
    return;
  }

  throw new Error(`unknown command: ${command || '(none)'}`);
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => child.kill());
