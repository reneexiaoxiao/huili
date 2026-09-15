import type {
  DailyBlankCompositionElement,
  DailyBlankSnapshot,
} from '@shared/api.interface';

export const DAILY_BLANK_TAKEOVER_CONTRACT = '2026-09-10.open-media';

export function isDailyBlankTakeover(
  blank?: Pick<DailyBlankSnapshot, 'contractVersion'>,
): boolean {
  return blank?.contractVersion === DAILY_BLANK_TAKEOVER_CONTRACT
    || blank?.contractVersion === '2026-09-09.gpt6'
    || blank?.contractVersion === '2026-09-03.layered1';
}

export function dailyBlankProseParagraphs(content?: string): string[] {
  return (content ?? '').split(/\n{2,}/u).filter(Boolean);
}

function compositionFallbackParagraphs(
  elements?: DailyBlankCompositionElement[],
): string[] {
  return (elements ?? []).flatMap((element: DailyBlankCompositionElement) => (
    [element.text, element.detail].filter((value: string | undefined): value is string => (
      Boolean(value && value.trim())
    ))
  ));
}

/**
 * Exp1 artwork is prose or canvas. Unexpected composition is flattened
 * to ordinary paragraphs so the layout is never the intended path.
 */
export function dailyBlankTakeoverParagraphs(
  blank?: Pick<DailyBlankSnapshot, 'content' | 'composition'>,
): string[] {
  const paragraphs = dailyBlankProseParagraphs(blank?.content);
  if (paragraphs.length > 0) return paragraphs;
  return compositionFallbackParagraphs(blank?.composition?.elements);
}
