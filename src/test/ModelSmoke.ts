// ModelSmoke.ts

import { performance } from 'node:perf_hooks';
import { ConfigurationLoader } from '@core/Configuration/ConfigurationLoader';

interface SmokeResponse {
  choices?: Array<{
    message?: {
      content?: string;
      reasoning_content?: string;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  error?: {
    message?: string;
  };
}

const configPath = process.argv[2] ?? 'nodus.config.json';
const configuration = await ConfigurationLoader.load(configPath);

if (configuration.model.provider !== 'openai-compatible') {
  throw new Error('Model smoke test requires model.provider=openai-compatible');
}

if (!configuration.model.endpoint) {
  throw new Error('Model smoke test requires model.endpoint');
}

const endpoint = `${configuration.model.endpoint.replace(/\/$/, '')}/chat/completions`;
const startedAt = performance.now();
const response = await fetch(endpoint, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    ...(configuration.model.apiKey ? { authorization: `Bearer ${configuration.model.apiKey}` } : {}),
  },
  body: JSON.stringify({
    model: configuration.model.model,
    temperature: 0,
    max_tokens: 64,
    messages: [
      {
        role: 'system',
        content: '/no_think\nAnswer immediately. Do not reason step by step. Return only the requested JSON.',
      },
      {
        role: 'user',
        content: 'Return exactly this JSON object and nothing else: {"ok":true,"mode":"no_think"}',
      },
    ],
  }),
});
const elapsedMs = Math.round(performance.now() - startedAt);
const payload = await response.json() as SmokeResponse;

if (!response.ok) {
  throw new Error(payload.error?.message ?? `Model request failed with HTTP ${response.status}`);
}

const message = payload.choices?.[0]?.message;
const content = message?.content?.trim() ?? '';
const reasoning = message?.reasoning_content?.trim() ?? '';
const exposedThinking = reasoning.length > 0 || /<think>[\s\S]*?<\/think>/i.test(content);

console.log(`Endpoint: ${endpoint}`);
console.log(`Elapsed: ${elapsedMs} ms`);
console.log(`Prompt tokens: ${payload.usage?.prompt_tokens ?? 'unknown'}`);
console.log(`Completion tokens: ${payload.usage?.completion_tokens ?? 'unknown'}`);
console.log(`Reasoning exposed: ${exposedThinking ? 'YES' : 'NO'}`);
console.log(`Response: ${content}`);

if (exposedThinking) {
  process.exitCode = 2;
  console.error('FAIL: model exposed a reasoning/thinking block.');
} else if (!content.includes('"ok":true')) {
  process.exitCode = 1;
  console.error('FAIL: model did not return the expected compact response.');
} else {
  console.log('PASS: compact no-think response received.');
}
