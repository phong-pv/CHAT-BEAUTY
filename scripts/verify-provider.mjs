// Kiểm chứng thật với provider (R1). Không đụng runtime, không commit key.
//   npm run verify:provider -- --provider groq --key gsk_xxx
//   CHATBEAUTY_PROVIDER=openai CHATBEAUTY_KEY=sk-xxx npm run verify:provider
// Flags: --provider --key --model --base-url --text
import {
  PROVIDER_PRESETS,
  generate,
  request,
  testConnection,
  validateConfig,
} from '../lib/providers.js';
import { PROMPT_VERSION, buildExplainMessages, buildMessages } from '../lib/prompt.js';
import { maskKey } from '../lib/storage.js';

const args = process.argv.slice(2);
const flag = (name, fallback = '') => {
  const index = args.indexOf(`--${name}`);
  return index !== -1 && args[index + 1] ? args[index + 1] : fallback;
};
const env = process.env;

const providerId = flag('provider', env.CHATBEAUTY_PROVIDER ?? 'openai');
const preset = PROVIDER_PRESETS[providerId];

if (!preset) {
  console.error(`✗ provider không tồn tại: ${providerId}`);
  console.error(`  chọn một trong: ${Object.keys(PROVIDER_PRESETS).join(', ')}`);
  process.exit(1);
}

/** @type {{provider:string, protocol:string, baseUrl:string, model:string, apiKey:string}} */
const config = {
  provider: providerId,
  protocol: preset.protocol,
  baseUrl: flag('base-url', env.CHATBEAUTY_BASE_URL ?? preset.baseUrl),
  model: flag('model', env.CHATBEAUTY_MODEL ?? preset.model),
  apiKey: flag('key', env.CHATBEAUTY_KEY ?? ''),
};

const sampleText = flag('text', 'toi muon hoi la ngay mai minh hop luc may gio');

console.log(`ChatBeauty verify · prompt ${PROMPT_VERSION}`);
console.log(`  provider : ${providerId} (${config.protocol})`);
console.log(`  baseUrl  : ${config.baseUrl}`);
console.log(`  model    : ${config.model}`);
console.log(`  key      : ${maskKey(config.apiKey) || '(không có)'}`);
console.log('');

const invalid = validateConfig(config);
if (invalid) {
  console.error(`✗ ${invalid}`);
  console.error('  (thiếu key? dùng --key hoặc CHATBEAUTY_KEY)');
  process.exit(1);
}

let failures = 0;

/** Chạy 1 bước, in ✓/✗, trả về true nếu OK. */
async function step(label, fn) {
  const startedAt = Date.now();
  try {
    return await fn();
  } catch (error) {
    failures += 1;
    console.error(`✗ ${label} · ${Date.now() - startedAt}ms`);
    console.error(`  ${error?.message ?? error}`);
    if (error?.status) console.error(`  status: ${error.status} · retryable: ${Boolean(error.retryable)}`);
    return false;
  }
}

const connectionOk = await step('test connection', async () => {
  const { ms, sample } = await testConnection(config);
  console.log(`✓ test connection · ${ms}ms · trả lời: "${sample || '(rỗng)'}"`);
  return true;
});

if (connectionOk) {
  const plan = buildMessages({ text: sampleText, direction: 'auto', tone: 'natural' });
  let improved = '';

  const improveOk = await step(`viết lại (${plan.direction})`, async () => {
    const chunks = [];
    const result = await generate({
      config,
      messages: plan.messages,
      maxTokens: plan.maxTokens,
      onDelta: (chunk) => chunks.push(chunk),
    });
    improved = result.text;
    console.log(
      `✓ viết lại · ${result.ms}ms · finish=${result.finishReason || 'n/a'} · ${result.text.length} ký tự · ${chunks.length} chunk`,
    );
    console.log(`  input : ${sampleText}`);
    console.log(`  output: ${result.text}`);
    if (result.truncated) console.log('  ⚠ output bị cắt vì hết budget token (thử model khác)');
    return true;
  });

  if (improveOk && improved) {
    await step('giải thích', async () => {
      const explainPlan = buildExplainMessages({ original: sampleText, improved });
      const explained = await request({
        config,
        messages: explainPlan.messages,
        maxTokens: explainPlan.maxTokens,
        temperature: 0,
      });
      const bullets = String(explained.text)
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => line.replace(/^([-*•]|\d+[.)])\s+/, ''));
      console.log(`✓ giải thích · ${bullets.length} dòng`);
      for (const line of bullets.slice(0, 4)) console.log(`  · ${line}`);
      return true;
    });
  }
}

console.log('');
if (failures > 0) {
  console.error(`✗ ${failures} bước lỗi — xem message ở trên.`);
  process.exit(1);
}
console.log('✓ tất cả bước OK');
