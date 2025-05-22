import { ObjectId } from 'mongodb';
import type { ObjectIdLike } from 'bson';

export function isObjectId(obj: unknown): boolean {
	return (
		typeof obj === 'object' &&
		'toHexString' in obj &&
		ObjectId.isValid((obj as ObjectIdLike).toHexString())
	);
}

export function getObjectIdToString(obj: ObjectIdLike): string {
	return isObjectId(obj) ? obj.toHexString() : undefined;
}
