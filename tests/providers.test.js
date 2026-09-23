import test from 'node:test';
import assert from 'node:assert/strict';
import { OpenAIProvider } from '../server/providers.js';
test('OpenAI adapter contract: server request, no storage, parse usage; transport mocked', async (t) => {
  const previous = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url, body: JSON.parse(options.body) });
    return {
      ok: true,
      json: async () => ({
        output: [{ type: 'message', content: [{ type: 'output_text', text: 'Texto de prueba' }] }],
        usage: { input_tokens: 100, output_tokens: 200 },
      }),
    };
  };
  t.after(() => (globalThis.fetch = previous));
  const p = new OpenAIProvider({
    ALLOW_PAID_AI: 'true',
    OPENAI_API_KEY: 'fixture-only',
    OPENAI_TEXT_MODEL: 'configured-model',
    TEXT_INPUT_USD_PER_MILLION: '2',
    TEXT_OUTPUT_USD_PER_MILLION: '10',
  });
  assert.ok(p.estimate('copy', 'brief') > 0);
  const r = await p.generate({ kind: 'copy', prompt: '{}' });
  assert.equal(r.text, 'Texto de prueba');
  assert.equal(r.costUSD, 0.0022);
  assert.equal(requests[0].body.store, false);
  assert.equal(requests[0].body.max_output_tokens, 1500);
});
