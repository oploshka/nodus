import test from 'node:test';
import assert from 'node:assert/strict';
import { ConfigurationLoader } from '@core/Configuration/ConfigurationLoader';

interface ResponsePayload {
  choices?: Array<{ message?: { content?: string; reasoning_content?: string } }>;
  error?: { message?: string };
}

test('real model: compact no-think contract', { timeout: 120_000 }, async () => {
  const configPath = process.env.NODUS_TEST_CONFIG ?? 'nodus.config.json';
  const configuration = await ConfigurationLoader.load(configPath);
  assert.equal(configuration.model.provider, 'openai-compatible');
  assert.ok(configuration.model.endpoint);

  const response = await fetch(`${configuration.model.endpoint!.replace(/\/$/, '')}/chat/completions`, {
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
        { role: 'system', content: '/no_think\nReturn only the requested JSON.' },
        { role: 'user', content: 'Return exactly: {"ok":true,"mode":"no_think"}' },
      ],
    }),
  });
  const payload = await response.json() as ResponsePayload;
  assert.ok(response.ok, payload.error?.message ?? `HTTP ${response.status}`);
  const content = payload.choices?.[0]?.message?.content?.trim() ?? '';
  const reasoning = payload.choices?.[0]?.message?.reasoning_content?.trim() ?? '';
  assert.equal(reasoning, '');
  assert.match(content, /"ok"\s*:\s*true/);
});
