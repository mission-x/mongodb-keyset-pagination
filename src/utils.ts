import type { ObjectIdLike } from 'bson';
import { ObjectId } from 'mongodb';

export function isObjectId(obj: unknown): boolean {
	return (
		typeof obj === 'object' &&
		'toHexString' in obj &&
		ObjectId.isValid((obj as ObjectIdLike).toHexString())
	);
}

export function getObjectIdToString(obj: ObjectIdLike): string {
	return obj?.toHexString?.();
}
