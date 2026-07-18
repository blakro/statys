/**
 * Client du moteur statistique Python + cache de session.
 *
 * Chaque appel n'envoie que la tranche de données nécessaire (les valeurs de
 * la colonne analysée) ; les résultats sont mis en cache pour la durée de la
 * session afin de ne pas recalculer une analyse déjà exécutée.
 */

/** Limite de valeurs envoyées à l'API (borne du corps de requête Vercel ~4,5 Mo). */
export const MAX_API_VALUES = 300_000;

export interface NumericStats {
  n: number;
  central: { mean: number; median: number; mode: number | null };
  dispersion: {
    std: number;
    variance: number;
    iqr: number;
    range: number;
    cv: number | null;
  };
  position: {
    min: number;
    max: number;
    q1: number;
    q3: number;
    p10: number;
    p90: number;
    skewness: number | null;
    kurtosis: number | null;
  };
}

export interface NormalityResult {
  test: string;
  reason: string;
  statistic: number;
  pvalue: number;
  alpha: number;
  normal: boolean;
}

export interface QqData {
  theoretical: number[];
  sample: number[];
  slope: number;
  intercept: number;
  r_squared: number;
}

export interface UnivariateNumericResult {
  stats: NumericStats;
  normality: NormalityResult | null;
  qq: QqData | null;
  interpretation: string;
  excluded: number;
}

export class ApiError extends Error {}

const cache = new Map<string, unknown>();

async function postJson<T>(url: string, body: unknown, cacheKey: string): Promise<T> {
  if (cache.has(cacheKey)) return cache.get(cacheKey) as T;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const detail = (await res.json().catch(() => null)) as { detail?: string } | null;
    throw new ApiError(
      detail?.detail ??
        `Le moteur statistique a répondu ${res.status}. En local, vérifiez que l'API Python tourne (npm run dev).`
    );
  }

  const data = (await res.json()) as T;
  cache.set(cacheKey, data);
  return data;
}

/**
 * Analyse univariée d'une variable quantitative. `cacheKey` doit identifier
 * la colonne et son contexte (fichier, type effectif, séparateur décimal).
 */
export async function fetchUnivariateNumeric(
  values: (number | null)[],
  cacheKey: string
): Promise<UnivariateNumericResult> {
  const sent = values.length > MAX_API_VALUES ? values.slice(0, MAX_API_VALUES) : values;
  return postJson<UnivariateNumericResult>(
    "/api/py/univariate/numeric",
    { values: sent },
    `numeric:${cacheKey}`
  );
}

// ---------------------------------------------------------------------------
// Analyse bivariée
// ---------------------------------------------------------------------------

export interface CorrelationEntry {
  r: number;
  pvalue: number;
  ci95: [number, number] | null;
}

export interface NumericNumericResult {
  n: number;
  excluded: number;
  pearson: CorrelationEntry;
  spearman: CorrelationEntry;
  kendall: CorrelationEntry;
  regression: { slope: number; intercept: number; r_squared: number };
  interpretation: string;
}

export interface GroupStat {
  label: string;
  n: number;
  mean: number;
  median: number;
  std: number;
  ci95: [number, number];
}

export interface CategoricalNumericResult {
  groups: GroupStat[];
  dropped_groups: string[];
  assumptions: {
    normality: Record<
      string,
      { test: string | null; statistic: number | null; pvalue: number | null; normal: boolean }
    >;
    all_normal: boolean;
    homogeneity: {
      levene: { statistic: number; pvalue: number; homogeneous: boolean };
      bartlett: { statistic: number; pvalue: number; homogeneous: boolean } | null;
    };
    homogeneous: boolean;
  };
  decision: { n_groups: number; path: string[] };
  test: {
    name: string;
    statistic: number;
    pvalue: number;
    df: number | string | null;
  };
  effect_size: { name: string; value: number; magnitude: string };
  ks: { statistic: number; pvalue: number; different: boolean } | null;
  interpretation: string;
}

export interface CategoricalCategoricalResult {
  test: {
    name: string;
    reason: string | null;
    statistic: number;
    statistic_label: string;
    pvalue: number;
    df: number | null;
    warning?: string | null;
  };
  expected: number[][];
  min_expected: number;
  cramer_v: number;
  cramer_v_magnitude: string;
  residuals: number[][];
  interpretation: string;
}

export interface CorrelationMatrixResult {
  variables: string[];
  method: string;
  matrix: number[][];
  pvalues: number[][];
}

export async function fetchNumericNumeric(
  x: (number | null)[],
  y: (number | null)[],
  cacheKey: string
): Promise<NumericNumericResult> {
  return postJson<NumericNumericResult>(
    "/api/py/bivariate/numeric-numeric",
    { x: x.slice(0, MAX_API_VALUES), y: y.slice(0, MAX_API_VALUES) },
    `nn:${cacheKey}`
  );
}

export async function fetchCategoricalNumeric(
  groups: Record<string, (number | null)[]>,
  includeKs: boolean,
  cacheKey: string
): Promise<CategoricalNumericResult> {
  return postJson<CategoricalNumericResult>(
    "/api/py/bivariate/categorical-numeric",
    { groups, include_ks: includeKs },
    `cn:${cacheKey}:${includeKs}`
  );
}

export async function fetchCategoricalCategorical(
  observed: number[][],
  rowLabels: string[],
  colLabels: string[],
  cacheKey: string
): Promise<CategoricalCategoricalResult> {
  return postJson<CategoricalCategoricalResult>(
    "/api/py/bivariate/categorical-categorical",
    { observed, row_labels: rowLabels, col_labels: colLabels },
    `cc:${cacheKey}`
  );
}

export async function fetchCorrelationMatrix(
  columns: Record<string, (number | null)[]>,
  method: string,
  cacheKey: string
): Promise<CorrelationMatrixResult> {
  return postJson<CorrelationMatrixResult>(
    "/api/py/bivariate/correlation-matrix",
    { columns, method },
    `cm:${cacheKey}:${method}`
  );
}

// ---------------------------------------------------------------------------
// Rapport PDF
// ---------------------------------------------------------------------------

export interface ReportPayload {
  branding: {
    bank_name: string;
    report_title: string;
    author: string;
    accent_color: string;
    /** Devise du rapport : "XOF" (FCFA) par défaut, "none" pour aucune. */
    currency: string;
    /** Logo de l'établissement (data URI PNG/JPEG), affiché en page de garde. */
    logo_data_uri: string;
  };
  context: {
    file_name: string;
    row_count: number;
    column_count: number;
    import_options: string;
    exec_note: string;
    /** Lieu d'établissement (ex. Niamey), pour le bloc signature. */
    location: string;
    /** Identité de l'exportateur (journal d'audit — jamais les données). */
    exported_by: string;
    organization: string;
  };
  sections: {
    kind: string;
    title: string;
    subtitle: string;
    interpretation: string;
    images: { title: string; data_uri: string }[];
    tables: { title: string; columns: string[]; rows: (string | number)[][] }[];
  }[];
}

/** Génère le rapport PDF (pas de cache : chaque export est un événement). */
export async function fetchReportPdf(payload: ReportPayload): Promise<Blob> {
  const res = await fetch("/api/py/report/pdf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const detail = (await res.json().catch(() => null)) as { detail?: string } | null;
    throw new ApiError(detail?.detail ?? `Échec de la génération du rapport (${res.status}).`);
  }
  return res.blob();
}

/** Vide le cache (à appeler quand un nouveau fichier est importé). */
export function clearApiCache() {
  cache.clear();
}
