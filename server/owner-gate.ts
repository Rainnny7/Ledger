export function isInstanceOwnerFor(
  userId: string | null | undefined,
  ownerId: string | null
): boolean {
  return !!ownerId && ownerId === userId
}
