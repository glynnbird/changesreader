/* global describe it afterEach */
const assert = require('assert')
const nock = require('nock')
const ME = process.env.cloudant_username || 'nodejs'
const PASSWORD = process.env.cloudant_password || 'sjedon'
const SERVER = 'https://myhost.couchdb.com'
const DBNAME = 'changesreader'
const URL = `https://${ME}:${PASSWORD}@myhost.couchdb.com`
const ChangesReader = require('../index.js')

describe('ChangesReader', function () {
  afterEach(function () {
    nock.cleanAll()
  })

  describe('polling', function () {
    it('one poll no changes', function (done) {
      const changeURL = `/${DBNAME}/_changes`
      nock(SERVER)
        .post(changeURL)
        .query({ feed: 'longpoll', timeout: 60000, since: 'now', limit: 100, include_docs: false })
        .reply(200, { results: [], last_seq: '1-0', pending: 0 })
        .post(changeURL)
        .delay(2000)
        .reply(500)
      const changesReader = new ChangesReader(DBNAME, URL)
      const cr = changesReader.start()
      cr.on('seq', function (seq) {
        // after our initial call with since=now, we should get a reply with last_seq=0-1
        assert.strictEqual(seq, '1-0')
        changesReader.stop()
        done()
      })
    })

    it('one poll no changes - fast changes', function (done) {
      const changeURL = `/${DBNAME}/_changes`
      nock(SERVER)
        .post(changeURL)
        .query({ feed: 'longpoll', timeout: 60000, since: 'now', limit: 100, include_docs: false, seq_interval: 100 })
        .reply(200, { results: [], last_seq: '1-0', pending: 0 })
        .post(changeURL)
        .delay(2000)
        .reply(500)
      const changesReader = new ChangesReader(DBNAME, URL)
      const cr = changesReader.start({ fastChanges: true })
      cr.on('seq', function (seq) {
        // after our initial call with since=now, we should get a reply with last_seq=0-1
        assert.strictEqual(seq, '1-0')
        changesReader.stop()
        done()
      })
    })

    it('one poll no changes with selector', function (done) {
      const changeURL = `/${DBNAME}/_changes`
      nock(SERVER)
        .post(changeURL)
        .query({ feed: 'longpoll', timeout: 60000, since: 'now', limit: 100, include_docs: false, filter: '_selector' })
        .reply(200, { results: [], last_seq: '1-0', pending: 0 })
        .post(changeURL)
        .delay(2000)
        .reply(500)
      const changesReader = new ChangesReader(DBNAME, URL)
      const cr = changesReader.start({ selector: { name: 'fred' } })
      cr.on('seq', function (seq) {
        // after our initial call with since=now, we should get a reply with last_seq=0-1
        assert.strictEqual(seq, '1-0')
        changesReader.stop()
        done()
      })
    })

    it('one poll multi changes', function (done) {
      const changeURL = `/${DBNAME}/_changes`
      const changes = [{ seq: null, id: '1', changes: ['1-1'] },
        { seq: null, id: '2', changes: ['1-1'] },
        { seq: null, id: '3', changes: ['1-1'] },
        { seq: null, id: '4', changes: ['1-1'] },
        { seq: null, id: '5', changes: ['1-1'] }]
      nock(SERVER)
        .post(changeURL)
        .query({ feed: 'longpoll', timeout: 60000, since: 'now', limit: 100, include_docs: false })
        .reply(200, { results: changes, last_seq: '1-0', pending: 0 })
        .post(changeURL)
        .delay(2000)
        .reply(500)

      const changesReader = new ChangesReader(DBNAME, URL)
      const cr = changesReader.start()
      let i = 0
      cr.on('change', function (c) {
        assert.deepStrictEqual(c, changes[i++])
      }).on('batch', function (b) {
        assert.deepStrictEqual(b, changes)
      }).on('seq', function (seq) {
        // after our initial call with since=now, we should get a reply with last_seq=0-1
        assert.strictEqual(seq, '1-0')
        changesReader.stop()
        done()
      })
    })

    it('multiple polls', function (done) {
      this.timeout(10000)
      const changeURL = `/${DBNAME}/_changes`
      const change = { seq: null, id: 'a', changes: ['1-1'] }
      nock(SERVER)
        .post(changeURL)
        .query({ feed: 'longpoll', timeout: 1000, since: 'now', limit: 100, include_docs: false })
        .reply(200, { results: [], last_seq: '1-0', pending: 0 })
        .post(changeURL)
        .query({ feed: 'longpoll', timeout: 1000, since: '1-0', limit: 100, include_docs: false })
        .reply(200, { results: [], last_seq: '1-0', pending: 0 })
        .post(changeURL)
        .query({ feed: 'longpoll', timeout: 1000, since: '1-0', limit: 100, include_docs: false })
        .reply(200, { results: [change], last_seq: '2-0', pending: 0 })
        .post(changeURL)
        .delay(2000)
        .reply(500)

      const changesReader = new ChangesReader(DBNAME, URL)
      const cr = changesReader.start({ timeout: 1000 })
      cr.on('change', function (c) {
        // ensure we get a change on the third poll
        assert.deepStrictEqual(c, change)
        changesReader.stop()
        done()
      })
    })
  })

  describe('spooling', function () {
    it('spooling changes', function (done) {
      const changeURL = `/${DBNAME}/_changes`
      const fs = require('fs')
      const reply = fs.readFileSync('./test/changes.json')
      const replyObj = JSON.parse(reply)
      nock(SERVER)
        .post(changeURL)
        .query({ since: '0', include_docs: false, seq_interval: 100 })
        .reply(200, reply)

      const changesReader = new ChangesReader(DBNAME, URL)
      const cr = changesReader.spool({ since: 0 })
      cr.on('batch', function (batch) {
        assert.strictEqual(JSON.stringify(batch), JSON.stringify(replyObj.results))
      }).on('end', (lastSeq) => {
        assert.strictEqual(lastSeq, replyObj.last_seq)
        done()
      })
    })
  })

  describe('parameters', function () {
    it('batchSize', function (done) {
      const changeURL = `/${DBNAME}/_changes`
      const limit = 44
      nock(SERVER)
        .post(changeURL)
        .query({ feed: 'longpoll', timeout: 60000, since: 'now', limit: limit, include_docs: false })
        .reply(200, { results: [], last_seq: '1-0', pending: 0 })
        .post(changeURL)
        .delay(2000)
        .reply(500)

      const changesReader = new ChangesReader(DBNAME, URL)
      const cr = changesReader.start({ batchSize: limit })
      cr.on('seq', function (seq) {
        // after our initial call with since=now, we should get a reply with last_seq=0-1
        assert.strictEqual(seq, '1-0')
        changesReader.stop()
        done()
      })
    })

    it('since', function (done) {
      const changeURL = `/${DBNAME}/_changes`
      const limit = 44
      const since = 'thedawnoftime'
      nock(SERVER)
        .post(changeURL)
        .query({ feed: 'longpoll', timeout: 60000, since: since, limit: limit, include_docs: false })
        .reply(200, { results: [], last_seq: '1-0', pending: 0 })
        .post(changeURL)
        .delay(2000)
        .reply(500)

      const changesReader = new ChangesReader(DBNAME, URL)
      const cr = changesReader.start({ batchSize: limit, since: since })
      cr.on('seq', function (seq) {
        // after our initial call with since=now, we should get a reply with last_seq=0-1
        assert.strictEqual(seq, '1-0')
        changesReader.stop()
        done()
      })
    })
  })

  describe('stopOnEmptyChanges', function () {
    it('stop on no changes', function (done) {
      const changeURL = `/${DBNAME}/_changes`
      const since = 'thedawnoftime'
      const batchSize = 45
      nock(SERVER)
        .post(changeURL)
        .query({ feed: 'longpoll', timeout: 60000, since: since, limit: batchSize, include_docs: false })
        .reply(200, { results: [], last_seq: '1-0', pending: 0 })
        .post(changeURL)
        .delay(2000)
        .reply(500)

      const changesReader = new ChangesReader(DBNAME, URL)
      const cr = changesReader.get({ batchSize: batchSize, since: since })
      cr.on('seq', function (seq) {
        // after our initial call with since=now, we should get a reply with last_seq=0-1
        assert.strictEqual(seq, '1-0')
      }).on('end', function () {
        done()
      })
    })

    it('stop after multiple batches - small batch stop', function (done) {
      let i
      const changeURL = `/${DBNAME}/_changes`
      const since = 'now'
      const batchSize = 45
      const batch1 = []
      const batch2 = []
      for (i = 0; i < batchSize; i++) {
        batch1.push({ seq: (i + 1) + '-0', id: 'a' + i, changes: ['1-1'] })
      }
      for (i = 0; i < 5; i++) {
        batch2.push({ seq: (45 + i + 1) + '-0', id: 'b' + i, changes: ['1-1'] })
      }
      nock(SERVER)
        .post(changeURL)
        .query({ feed: 'longpoll', timeout: 60000, since: since, limit: batchSize, include_docs: false })
        .reply(200, { results: batch1, last_seq: '45-0', pending: 2 })
        .post(changeURL)
        .query({ feed: 'longpoll', timeout: 60000, since: '45-0', limit: batchSize, include_docs: false })
        .reply(200, { results: batch2, last_seq: '50-0', pending: 0 })

      const changesReader = new ChangesReader(DBNAME, URL)
      const cr = changesReader.get({ batchSize: batchSize, since: since })
      let batchCount = 0
      cr.on('seq', function (seq) {
        if (batchCount === 0) {
          assert.strictEqual(seq, '45-0')
          batchCount++
        } else {
          assert.strictEqual(seq, '50-0')
        }
      }).on('end', function (lastSeq) {
        assert.strictEqual(lastSeq, '50-0')
        done()
      })
    })

    it('stop after multiple batches - zero stop', function (done) {
      let i
      const changeURL = `/${DBNAME}/_changes`
      const since = 'now'
      const batchSize = 45
      const batch1 = []
      const batch2 = []
      for (i = 0; i < batchSize; i++) {
        batch1.push({ seq: null, id: 'a' + i, changes: ['1-1'] })
      }
      for (i = 0; i < 5; i++) {
        batch2.push({ seq: null, id: 'b' + i, changes: ['1-1'] })
      }
      nock(SERVER)
        .post(changeURL)
        .query({ feed: 'longpoll', timeout: 60000, since: since, limit: batchSize, include_docs: false })
        .reply(200, { results: batch1, last_seq: '45-0', pending: 2 })
        .post(changeURL)
        .query({ feed: 'longpoll', timeout: 60000, since: '45-0', limit: batchSize, include_docs: false })
        .reply(200, { results: batch2, last_seq: '90-0', pending: 0 })
        .post(changeURL)
        .query({ feed: 'longpoll', timeout: 60000, since: '90-0', limit: batchSize, include_docs: false })
        .reply(200, { results: [], last_seq: '90-0', pending: 0 })

      const changesReader = new ChangesReader(DBNAME, URL)
      const cr = changesReader.get({ batchSize: batchSize, since: since })
      let batchCount = 0
      cr.on('seq', function (seq) {
        if (batchCount === 0) {
          assert.strictEqual(seq, '45-0')
          batchCount++
        } else {
          assert.strictEqual(seq, '90-0')
        }
      }).on('end', function () {
        done()
      })
    })
  })

  describe('errors', function () {
    it('on bad credentials', function (done) {
      const changeURL = `/${DBNAME}/_changes`
      nock(SERVER)
        .post(changeURL)
        .query({ feed: 'longpoll', timeout: 60000, since: 'now', limit: 100, include_docs: false })
        .reply(401)
      const changesReader = new ChangesReader(DBNAME, URL)
      const cr = changesReader.start()
      cr.on('error', function (err) {
        assert.strictEqual(err.statusCode, 401)
        done()
      })
    })

    it('on bad since value', function (done) {
      const changeURL = `/${DBNAME}/_changes`
      nock(SERVER)
        .post(changeURL)
        .query({ feed: 'longpoll', timeout: 60000, since: 'badtoken', limit: 100, include_docs: false })
        .reply(400, { error: 'bad_request', reason: 'Malformed sequence supplied in \'since\' parameter.' })

      const changesReader = new ChangesReader(DBNAME, URL)
      const cr = changesReader.start({ since: 'badtoken' })
      cr.on('error', function (err) {
        assert.strictEqual(err.statusCode, 400)
        done()
      })
    })
  })

  describe('survival', function () {
    it('survives 500', function (done) {
      this.timeout(10000)
      const changeURL = `/${DBNAME}/_changes`
      const change = { seq: null, id: 'a', changes: ['1-1'] }
      nock(SERVER)
        .post(changeURL)
        .query({ feed: 'longpoll', timeout: 1000, since: 'now', limit: 100, include_docs: false })
        .reply(200, { results: [], last_seq: '1-0', pending: 0 })
        .post(changeURL)
        .query({ feed: 'longpoll', timeout: 1000, since: '1-0', limit: 100, include_docs: false })
        .reply(500)
        .post(changeURL)
        .query({ feed: 'longpoll', timeout: 1000, since: '1-0', limit: 100, include_docs: false })
        .reply(200, { results: [change], last_seq: '2-0', pending: 0 })
        .post(changeURL)
        .delay(2000)
        .reply(500)

      const changesReader = new ChangesReader(DBNAME, URL)
      const cr = changesReader.start({ timeout: 1000 })
      cr.on('change', function (c) {
        // ensure we get a change on the third poll
        assert.deepStrictEqual(c, change)
        changesReader.stop()
        done()
      }).on('error', function (err) {
        assert.strictEqual(err.statusCode, 500)
      })
    })

    it('survives 429', function (done) {
      this.timeout(10000)
      const changeURL = `/${DBNAME}/_changes`
      const change = { seq: null, id: 'a', changes: ['1-1'] }
      nock(SERVER)
        .post(changeURL)
        .query({ feed: 'longpoll', timeout: 1000, since: 'now', limit: 100, include_docs: false })
        .reply(200, { results: [], last_seq: '1-0', pending: 0 })
        .post(changeURL)
        .query({ feed: 'longpoll', timeout: 1000, since: '1-0', limit: 100, include_docs: false })
        .reply(429, { error: 'too_many_requests', reason: 'You\'ve exceeded your current limit of x requests per second for x class. Please try later.', class: 'x', rate: 1 })
        .post(changeURL)
        .query({ feed: 'longpoll', timeout: 1000, since: '1-0', limit: 100, include_docs: false })
        .reply(200, { results: [change], last_seq: '2-0', pending: 0 })
        .post(changeURL)
        .delay(2000)
        .reply(500)

      const changesReader = new ChangesReader(DBNAME, URL)
      const cr = changesReader.start({ timeout: 1000 })
      cr.on('change', function (c) {
        // ensure we get a change on the third poll
        assert.deepStrictEqual(c, change)
        changesReader.stop()
        done()
      }).on('error', function (err) {
        assert.strictEqual(err.statusCode, 429)
      })
    })

    it('survives malformed JSON', function (done) {
      this.timeout(10000)
      const changeURL = `/${DBNAME}/_changes`
      const change = { seq: null, id: 'a', changes: ['1-1'] }
      nock(SERVER)
        .post(changeURL)
        .query({ feed: 'longpoll', timeout: 1000, since: 'now', limit: 100, include_docs: false })
        .reply(200, '{ results: [], last_seq: "1-0", pending: 0') // missing bracket } - malformed JSON
        .post(changeURL)
        .query({ feed: 'longpoll', timeout: 1000, since: 'now', limit: 100, include_docs: false })
        .reply(200, { results: [change], last_seq: '1-0', pending: 0 })
        .post(changeURL)
        .delay(2000)
        .reply(500)

      const changesReader = new ChangesReader(DBNAME, URL)
      const cr = changesReader.start({ timeout: 1000 })
      cr.on('change', function (c) {
        assert.deepStrictEqual(c, change)
        changesReader.stop()
        done()
      }).on('error', function (err) {
        if (err) {
          assert(false)
        }
      })
    })

    it('survives zombie apocolypse', function (done) {
      done()
    })
  })
})
