import {describe, it, before, after} from 'node:test';
import assert from 'node:assert';
import { MongoMemoryServer } from 'mongodb-memory-server';
import {Collection, Db, MongoClient} from 'mongodb';

describe('tests',  () => {
    let con: MongoClient;
    let mongoServer: MongoMemoryServer;
    let db: Db;
    let col: Collection;

    before(async () => {
        mongoServer = await MongoMemoryServer.create();
        con = await MongoClient.connect(mongoServer.getUri(), {});
        db = con.db(mongoServer.instanceInfo!.dbName);
        col = db.collection('test');
    });

    after(async () => {
        if (con) {
            await con.close();
        }
        if (mongoServer) {
            await mongoServer.stop();
        }
    });

    it('successfully sets & gets information from the database', async () => {
        assert.notEqual(db, undefined);
        const result = await col.insertMany([{ a: 1 }, { b: 1 }]);
        assert.strictEqual(result.insertedCount, 2);
        assert.equal(await col.countDocuments({}), 2);
    });

    it('is a subtest', () => {
        assert.ok('some relevant assertion here');
    });
});
