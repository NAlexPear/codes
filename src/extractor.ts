import type {
  BillingCode,
  CodeResult,
  JevResponse,
  ResultThresholds,
} from './codes.ts';

import catalogData from '../data/billing-codes.json' with { type: 'json' };
import { buildJevRequest, parseCatalog, readCodeResults } from './codes.ts';
import { buildEvidenceRequest, readEvidenceResults } from './evidence.ts';
import { askChoices, askJev } from './typesafe.ts';

const ZERO = 0;

interface ExtractionResult {
  manualReview: CodeResult[];
  matches: CodeResult[];
  model: string;
  thresholds: ResultThresholds;
  usage: JevResponse['usage'];
}

interface ExtractorOptions {
  apiKey: string;
  catalog: readonly BillingCode[];
  model: string;
  thresholds: ResultThresholds;
}

type Extract = (dictation: string) => Promise<ExtractionResult>;
type Enrich = (
  dictation: string,
  result: ExtractionResult,
) => Promise<ExtractionResult>;

const loadCatalog = (): Promise<BillingCode[]> =>
  Promise.resolve(parseCatalog(catalogData));

const createClassifier =
  (options: ExtractorOptions): Extract =>
  async (dictation) => {
    const request = buildJevRequest(dictation, options.catalog, options.model);
    const response = await askJev(request, { apiKey: options.apiKey });
    const results = readCodeResults(
      response,
      options.catalog,
      options.thresholds,
    );
    return {
      manualReview: results.filter(
        ({ needsManualReview }) => needsManualReview,
      ),
      matches: results.filter(({ needsManualReview }) => !needsManualReview),
      model: response.model,
      thresholds: options.thresholds,
      usage: response.usage,
    };
  };

const createEnricher =
  (options: Pick<ExtractorOptions, 'apiKey' | 'model'>): Enrich =>
  async (dictation, result) => {
    const results = [...result.matches, ...result.manualReview];
    if (results.length === ZERO) {
      return result;
    }
    const request = buildEvidenceRequest(dictation, results, options.model);
    const response = await askChoices(request, { apiKey: options.apiKey });
    const enriched = readEvidenceResults(dictation, results, response);
    return {
      ...result,
      manualReview: enriched.filter(
        ({ needsManualReview }) => needsManualReview,
      ),
      matches: enriched.filter(({ needsManualReview }) => !needsManualReview),
      usage: {
        input_tokens: result.usage.input_tokens + response.usage.input_tokens,
        output_tokens:
          result.usage.output_tokens + response.usage.output_tokens,
      },
    };
  };

const createExtractor = (options: ExtractorOptions): Extract => {
  const classify = createClassifier(options);
  const enrich = createEnricher(options);
  return async (dictation) => enrich(dictation, await classify(dictation));
};

export type { Enrich, Extract, ExtractionResult, ExtractorOptions };
export { createClassifier, createEnricher, createExtractor, loadCatalog };
