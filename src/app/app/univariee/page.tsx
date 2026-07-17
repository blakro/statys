import { PlaceholderPhase } from "@/components/PlaceholderPhase";

export default function UnivarieePage() {
  return (
    <PlaceholderPhase
      phase={2}
      title="Analyse univariée"
      description="Histogrammes, boxplots, QQ-plots, tests de normalité (Shapiro-Wilk, D'Agostino-Pearson) et statistiques descriptives complètes, avec branchement automatique selon le type de la variable."
    />
  );
}
