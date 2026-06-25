export function normalizeVietnameseText(text: string): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .trim();
}

export function checkRecipeAllergens(
  recipeIngredients: { name: string }[],
  userAllergies: string[],
): string[] {
  if (!userAllergies || userAllergies.length === 0 || !recipeIngredients || recipeIngredients.length === 0) {
    return [];
  }

  const allergyGroups = {
    hai_san: ['tom', 'ca', 'muc', 'cua', 'ghe', 'ngheu', 'so', 'oc'],
    ga: ['ga', 'thit ga', 'uc ga', 'dui ga'],
    bo: ['bo', 'thit bo'],
    heo: ['heo', 'thit heo', 'suon heo'],
    sua: ['sua', 'sua tuoi', 'sua dac', 'phomai', 'pho mai'],
    dau_phong: ['dau phong', 'lac'],
  };

  const matchedIngredients: string[] = [];

  for (const ingredient of recipeIngredients) {
    if (!ingredient?.name) continue;
    const normIng = normalizeVietnameseText(ingredient.name);

    for (const allergy of userAllergies) {
      if (!allergy) continue;
      const normAllergy = normalizeVietnameseText(allergy);

      // Expand allergy to target list if it belongs to a group
      let targets = [normAllergy];

      if (normAllergy === 'hai san' || normAllergy === 'hai_san') {
        targets = [...targets, ...allergyGroups.hai_san];
      } else if (normAllergy === 'ga') {
        targets = [...targets, ...allergyGroups.ga];
      } else if (normAllergy === 'bo') {
        targets = [...targets, ...allergyGroups.bo];
      } else if (normAllergy === 'heo') {
        targets = [...targets, ...allergyGroups.heo];
      } else if (normAllergy === 'sua') {
        targets = [...targets, ...allergyGroups.sua];
      } else if (normAllergy === 'dau phong' || normAllergy === 'lac') {
        targets = [...targets, ...allergyGroups.dau_phong];
      }

      // Check if allergy represents a member of a group, which triggers mapping
      // e.g. user allergy is "tôm", targets contains "tom". normIng is "tôm rim" -> match.
      const hasMatch = targets.some(target => {
        return normIng.includes(target) || target.includes(normIng);
      });

      if (hasMatch) {
        matchedIngredients.push(ingredient.name);
        break; // matched this ingredient, go to next
      }
    }
  }

  return Array.from(new Set(matchedIngredients));
}
