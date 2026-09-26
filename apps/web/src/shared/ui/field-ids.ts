/** ids for the hint and the error of a field, and the aria-describedby that points to them. */
export function describedBy(id: string, hint: string | undefined, error: string | undefined) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const ids = [hintId, errorId].filter(Boolean).join(' ');
  return { hintId, errorId, ariaDescribedBy: ids || undefined };
}
