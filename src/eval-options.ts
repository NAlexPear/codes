import { parseArgs } from 'node:util';

import type { ProviderName, ProviderSpec } from './eval-providers.ts';

const ONE = 1;
const DEFAULT_REPETITIONS = 1;

const HELP = `Usage: pnpm eval [options]

Options:
  --evidence                 Run the Jev evidence-quality benchmark
  --provider <jev|openai>  Provider to evaluate; repeat for a comparison
  --model <model>          Model for each provider, in matching order
  --repetitions <count>    Runs per provider/model pair (default: 1)
  -h, --help               Show this help

Without options, eval runs jev:jev-latest. OpenAI runs require OPENAI_API_KEY.
Examples:
  pnpm eval
  pnpm eval --provider openai --model gpt-6-astra
  pnpm eval --provider jev --provider openai --model jev-1.13.0 --model gpt-6-astra --repetitions 3
`;

interface EvalOptions {
  evidence: boolean;
  help: boolean;
  repetitions: number;
  specs: ProviderSpec[];
}

const isProvider = (value: string): value is ProviderName =>
  value === 'jev' || value === 'openai';

const parseRepetitions = (value: string | undefined): number => {
  const repetitions = Number(value ?? DEFAULT_REPETITIONS);
  if (!Number.isSafeInteger(repetitions) || repetitions < ONE) {
    throw new Error('--repetitions must be a positive integer.');
  }
  return repetitions;
};

const resolveSpecs = (
  providerValues: readonly string[] | undefined,
  models: readonly string[] | undefined,
): ProviderSpec[] => {
  const providers = providerValues ?? ['jev'];
  if (models !== undefined && models.length !== providers.length) {
    throw new Error('Provide exactly one --model for each --provider.');
  }
  const specs: ProviderSpec[] = [];
  for (const [index, value] of providers.entries()) {
    if (!isProvider(value)) {
      throw new Error('--provider must be jev or openai.');
    }
    let model = models?.[index] ?? '';
    if (value === 'jev' && model === '') {
      model = 'jev-latest';
    }
    if (model === '') {
      throw new Error('--model is required for the OpenAI provider.');
    }
    specs.push({ model, provider: value });
  }
  return specs;
};

const parseEvalOptions = (args: readonly string[]): EvalOptions => {
  const { values } = parseArgs({
    args,
    options: {
      evidence: { type: 'boolean' },
      help: { short: 'h', type: 'boolean' },
      model: { multiple: true, type: 'string' },
      provider: { multiple: true, type: 'string' },
      repetitions: { type: 'string' },
    },
    strict: true,
  });
  return {
    evidence: values.evidence ?? false,
    help: values.help ?? false,
    repetitions: parseRepetitions(values.repetitions),
    specs: resolveSpecs(values.provider, values.model),
  };
};

export type { EvalOptions };
export { HELP, parseEvalOptions };
