import type {ObjectIdLike} from "bson";
import {ObjectId} from "mongodb";

export function isObjectId(obj: ObjectIdLike): boolean {
    return typeof obj === 'object' && "toHexString" in obj && ObjectId.isValid(obj.toHexString());
}

export function getObjectIdToString(obj: ObjectIdLike): string {
    return obj?.toHexString?.();
}

