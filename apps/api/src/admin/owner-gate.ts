/** Whether the user is the first-instance owner account. */
export function isInstanceOwnerFor(
	userId: string | null | undefined,
	ownerId: string | null
): boolean {
	return !!ownerId && ownerId === userId
}
