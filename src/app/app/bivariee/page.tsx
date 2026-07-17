import { PlaceholderPhase } from "@/components/PlaceholderPhase";

export default function BivarieePage() {
  return (
    <PlaceholderPhase
      phase={3}
      title="Analyse bivariée"
      description="Corrélations (Pearson, Spearman, Kendall), sélection automatique du test de comparaison (Student, Welch, ANOVA, Kruskal-Wallis…) selon la normalité et l'homogénéité des variances, Khi-deux et V de Cramér — avec tailles d'effet systématiques."
    />
  );
}
