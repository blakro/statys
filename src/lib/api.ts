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

/** Vide le cache (à appeler quand un nouveau fichier est importé). */
export function clearApiCache() {
  cache.clear();
}
