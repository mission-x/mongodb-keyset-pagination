import {describe, it, before, after} from 'node:test';
import assert from 'node:assert';
import {MongoClient} from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type {Collection, Db} from 'mongodb';

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

    it('returns the skip token contents to be able to encrypt or store as pleased', () => {
        assert.ok('');
    });

    it('skips the skip values that are not defined when building the paginated query', () => {
        assert.ok('');
    });

    describe('Paginate on skip value within an object',  () => {
        it('paginates on dot-notation, nested object property', () => {
            assert.ok('');
        });
    });

    describe('Paginate on skip value within an array',  () => {
        it('paginates an array of primitives', () => {
            assert.ok('');
        });
        it('paginates an array of objects', () => {
            assert.ok('');
        });
    });

    describe('Build paginated query with expected skip value types',  () => {
        it('paginates with skip value of type Date', () => {
            assert.ok('');
        });

        it('paginates with skip value of type ObjectId', () => {
            assert.ok('');
        });
    });

    describe('Custom encryption methods',  () => {
        it('encrypts and decrypts by provided custom encryption methods', () => {
            assert.ok('');
        });
    });

    describe('Custom date parser',  () => {
        it('paginates on dates by utilizing a provided custom date parser', () => {
            assert.ok('');
        });
    });
});
