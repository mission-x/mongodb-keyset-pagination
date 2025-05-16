import {describe, it, before} from 'node:test';
import assert from 'node:assert';

describe('tests',  () => {
    before(() => console.log('about to run some test'));
    it('is a subtest', () => {
        assert.ok('some relevant assertion here');
    });
});
