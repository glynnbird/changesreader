/* global describe it before after afterEach */
const assert = require('assert')
const nock = require('nock')
const Nano = require('nano')
const request = require('request')
const ME = process.env.cloudant_username || 'nodejs'
const PASSWORD = process.env.cloudant_password || 'sjedon'
const SERVER = `https://myhost.couchdb.com`
const DBNAME = `changesreader`
const URL = `https://${ME}:${PASSWORD}@myhost.couchdb.com`
const ChangesReader = require('../index.js')

describe('ChangesReader', function () {
  afterEach(function () {
    nock.cleanAll()
  })

  before(function (done) {
    const mocks = nock(SERVER)
      .put(`/${DBNAME}`)
      .reply(201, { ok: true })

    const options = {
      url: `${SERVER}/${DBNAME}`,
      auth: { username: ME, password: PASSWORD },
      method: 'PUT'
    }
    request(options, function (err, resp) {
      assert.strictEqual(err, null)
      assert.strictEqual(resp.statusCode, 201)
      mocks.done()
      done()
    })
  })

  after(function (done) {
    var mocks = nock(SERVER)
      .delete(`/${DBNAME}`)
      .reply(200, { ok: true })

    const options = {
      url: `${SERVER}/${DBNAME}`,
      auth: { username: ME, password: PASSWORD },
      method: 'DELETE'
    }
    request(options, function (err, resp) {
      assert.strictEqual(err, null)
      assert.strictEqual(resp.statusCode, 200)
      mocks.done()
      done()
    })
  })

  describe('polling', function () {
    it('one poll no changes', function (done) {
      var changeURL = `/${DBNAME}/_changes`
      nock(SERVER)
        .get(changeURL)
        .query({ feed: 'longpoll', timeout: 60000, since: 'now', limit: 100, include_docs: false })
        .reply(200, { results: [], last_seq: '1-0', pending: 0 })
        .get(changeURL)
        .delay(2000)
        .reply(500)
      const nano = Nano(URL)
      const changesReader = new ChangesReader(DBNAME, nano.request)
      const cr = changesReader.start()
      cr.on('seq', function (seq) {
        // after our initial call with since=now, we should get a reply with last_seq=0-1
        assert.strictEqual(seq, '1-0')
        changesReader.stop()
        done()
      })
    })

    it('one poll multi changes', function (done) {
      var changeURL = `/${DBNAME}/_changes`
      var changes = [{ seq: null, id: '1', changes: ['1-1'] },
        { seq: null, id: '2', changes: ['1-1'] },
        { seq: null, id: '3', changes: ['1-1'] },
        { seq: null, id: '4', changes: ['1-1'] },
        { seq: null, id: '5', changes: ['1-1'] }]
      nock(SERVER)
        .get(changeURL)
        .query({ feed: 'longpoll', timeout: 60000, since: 'now', limit: 100, include_docs: false })
        .reply(200, { results: changes, last_seq: '1-0', pending: 0 })
        .get(changeURL)
        .delay(2000)
        .reply(500)

      const nano = Nano(URL)
      const changesReader = new ChangesReader(DBNAME, nano.request)
      const cr = changesReader.start()
      var i = 0
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
      var changeURL = `/${DBNAME}/_changes`
      var change = { seq: null, id: 'a', changes: ['1-1'] }
      nock(SERVER)
        .get(changeURL)
        .query({ feed: 'longpoll', timeout: 60000, since: 'now', limit: 100, include_docs: false })
        .reply(200, { results: [], last_seq: '1-0', pending: 0 })
        .get(changeURL)
        .query({ feed: 'longpoll', timeout: 60000, since: '1-0', limit: 100, include_docs: false })
        .reply(200, { results: [], last_seq: '1-0', pending: 0 })
        .get(changeURL)
        .query({ feed: 'longpoll', timeout: 60000, since: '1-0', limit: 100, include_docs: false })
        .reply(200, { results: [change], last_seq: '2-0', pending: 0 })
        .get(changeURL)
        .delay(2000)
        .reply(500)
      const nano = Nano(URL)
      const changesReader = new ChangesReader(DBNAME, nano.request)
      const cr = changesReader.start()
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
      var changeURL = `/${DBNAME}/_changes`
      var fs = require('fs')
      var reply = fs.readFileSync('./test/changes.json')
      var replyObj = JSON.parse(reply)
      nock(SERVER)
        .get(changeURL)
        .query({ since: '0', include_docs: false })
        .reply(200, reply)
      const nano = Nano(URL)
      const changesReader = new ChangesReader(DBNAME, nano.request)
      const cr = changesReader.spool({ since: 0 })
      cr.on('batch', function (batch) {
        assert.strictEqual(JSON.stringify(batch), JSON.stringify(replyObj.results))
      }).on('end', () => {
        done()
      })
    })
  })

  describe('parameters', function () {
    it('batchSize', function (done) {
      var changeURL = `/${DBNAME}/_changes`
      var limit = 44
      nock(SERVER)
        .get(changeURL)
        .query({ feed: 'longpoll', timeout: 60000, since: 'now', limit: limit, include_docs: false })
        .reply(200, { results: [], last_seq: '1-0', pending: 0 })
        .get(changeURL)
        .delay(2000)
        .reply(500)
      const nano = Nano(URL)
      const changesReader = new ChangesReader(DBNAME, nano.request)
      const cr = changesReader.start({ batchSize: limit })
      cr.on('seq', function (seq) {
        // after our initial call with since=now, we should get a reply with last_seq=0-1
        assert.strictEqual(seq, '1-0')
        changesReader.stop()
        done()
      })
    })

    it('since', function (done) {
      var changeURL = `/${DBNAME}/_changes`
      var limit = 44
      var since = 'thedawnoftime'
      nock(SERVER)
        .get(changeURL)
        .query({ feed: 'longpoll', timeout: 60000, since: since, limit: limit, include_docs: false })
        .reply(200, { results: [], last_seq: '1-0', pending: 0 })
        .get(changeURL)
        .delay(2000)
        .reply(500)
      const nano = Nano(URL)
      const changesReader = new ChangesReader(DBNAME, nano.request)
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
      var changeURL = `/${DBNAME}/_changes`
      var since = 'thedawnoftime'
      var batchSize = 45
      nock(SERVER)
        .get(changeURL)
        .query({ feed: 'longpoll', timeout: 60000, since: since, limit: batchSize, include_docs: false })
        .reply(200, { results: [], last_seq: '1-0', pending: 0 })
        .get(changeURL)
        .delay(2000)
        .reply(500)
      const nano = Nano(URL)
      const changesReader = new ChangesReader(DBNAME, nano.request)
      const cr = changesReader.get({ batchSize: batchSize, since: since })
      cr.on('seq', function (seq) {
        // after our initial call with since=now, we should get a reply with last_seq=0-1
        assert.strictEqual(seq, '1-0')
      }).on('end', function () {
        done()
      })
    })

    it('stop after multiple batches - small batch stop', function (done) {
      var changeURL = `/${DBNAME}/_changes`
      var since = 'now'
      var batchSize = 45
      var batch1 = []
      var batch2 = []
      for (var i = 0; i < batchSize; i++) {
        batch1.push({ seq: null, id: 'a' + i, changes: ['1-1'] })
      }
      for (i = 0; i < 5; i++) {
        batch2.push({ seq: null, id: 'b' + i, changes: ['1-1'] })
      }
      nock(SERVER)
        .get(changeURL)
        .query({ feed: 'longpoll', timeout: 60000, since: since, limit: batchSize, include_docs: false })
        .reply(200, { results: batch1, last_seq: '45-0', pending: 2 })
        .get(changeURL)
        .query({ feed: 'longpoll', timeout: 60000, since: '45-0', limit: batchSize, include_docs: false })
        .reply(200, { results: batch2, last_seq: '50-0', pending: 0 })
      const nano = Nano(URL)
      const changesReader = new ChangesReader(DBNAME, nano.request)
      const cr = changesReader.get({ batchSize: batchSize, since: since })
      var batchCount = 0
      cr.on('seq', function (seq) {
        if (batchCount === 0) {
          assert.strictEqual(seq, '45-0')
          batchCount++
        } else {
          assert.strictEqual(seq, '50-0')
        }
      }).on('end', function () {
        done()
      })
    })

    it('stop after multiple batches - zero stop', function (done) {
      var changeURL = `/${DBNAME}/_changes`
      var since = 'now'
      var batchSize = 45
      var batch1 = []
      var batch2 = []
      for (var i = 0; i < batchSize; i++) {
        batch1.push({ seq: null, id: 'a' + i, changes: ['1-1'] })
      }
      for (i = 0; i < 5; i++) {
        batch2.push({ seq: null, id: 'b' + i, changes: ['1-1'] })
      }
      nock(SERVER)
        .get(changeURL)
        .query({ feed: 'longpoll', timeout: 60000, since: since, limit: batchSize, include_docs: false })
        .reply(200, { results: batch1, last_seq: '45-0', pending: 2 })
        .get(changeURL)
        .query({ feed: 'longpoll', timeout: 60000, since: '45-0', limit: batchSize, include_docs: false })
        .reply(200, { results: batch2, last_seq: '90-0', pending: 0 })
        .get(changeURL)
        .query({ feed: 'longpoll', timeout: 60000, since: '90-0', limit: batchSize, include_docs: false })
        .reply(200, { results: [], last_seq: '90-0', pending: 0 })
      const nano = Nano(URL)
      const changesReader = new ChangesReader(DBNAME, nano.request)
      const cr = changesReader.get({ batchSize: batchSize, since: since })
      var batchCount = 0
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
      var changeURL = `/${DBNAME}/_changes`
      nock(SERVER)
        .get(changeURL)
        .query({ feed: 'longpoll', timeout: 60000, since: 'now', limit: 100, include_docs: false })
        .reply(401)
      const nano = Nano(URL)
      const changesReader = new ChangesReader(DBNAME, nano.request)
      const cr = changesReader.start()
      cr.on('error', function (err) {
        assert.strictEqual(err.statusCode, 401)
        done()
      })
    })

    it('on bad since value', function (done) {
      var changeURL = `/${DBNAME}/_changes`
      nock(SERVER)
        .get(changeURL)
        .query({ feed: 'longpoll', timeout: 60000, since: 'badtoken', limit: 100, include_docs: false })
        .reply(400, { error: 'bad_request', reason: 'Malformed sequence supplied in \'since\' parameter.' })
      const nano = Nano(URL)
      const changesReader = new ChangesReader(DBNAME, nano.request)
      const cr = changesReader.start({ since: 'badtoken' })
      cr.on('error', function (err) {
        assert.strictEqual(err.statusCode, 400)
        done()
      })
    })
  })

  describe('survival', function () {
    it('survives 500', function (done) {
      var changeURL = `/${DBNAME}/_changes`
      var change = { seq: null, id: 'a', changes: ['1-1'] }
      nock(SERVER)
        .get(changeURL)
        .query({ feed: 'longpoll', timeout: 60000, since: 'now', limit: 100, include_docs: false })
        .reply(200, { results: [], last_seq: '1-0', pending: 0 })
        .get(changeURL)
        .query({ feed: 'longpoll', timeout: 60000, since: '1-0', limit: 100, include_docs: false })
        .reply(500)
        .get(changeURL)
        .query({ feed: 'longpoll', timeout: 60000, since: '1-0', limit: 100, include_docs: false })
        .reply(200, { results: [change], last_seq: '2-0', pending: 0 })
        .get(changeURL)
        .delay(2000)
        .reply(500)
      const nano = Nano(URL)
      const changesReader = new ChangesReader(DBNAME, nano.request)
      const cr = changesReader.start()
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
      var changeURL = `/${DBNAME}/_changes`
      var change = { seq: null, id: 'a', changes: ['1-1'] }
      nock(SERVER)
        .get(changeURL)
        .query({ feed: 'longpoll', timeout: 60000, since: 'now', limit: 100, include_docs: false })
        .reply(200, { results: [], last_seq: '1-0', pending: 0 })
        .get(changeURL)
        .query({ feed: 'longpoll', timeout: 60000, since: '1-0', limit: 100, include_docs: false })
        .reply(429, { error: 'too_many_requests', reason: 'You\'ve exceeded your current limit of x requests per second for x class. Please try later.', class: 'x', rate: 1 })
        .get(changeURL)
        .query({ feed: 'longpoll', timeout: 60000, since: '1-0', limit: 100, include_docs: false })
        .reply(200, { results: [change], last_seq: '2-0', pending: 0 })
        .get(changeURL)
        .delay(2000)
        .reply(500)
      const nano = Nano(URL)
      const changesReader = new ChangesReader(DBNAME, nano.request)
      const cr = changesReader.start()
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
      var changeURL = `/${DBNAME}/_changes`
      var change = { seq: null, id: 'a', changes: ['1-1'] }
      nock(SERVER)
        .get(changeURL)
        .query({ feed: 'longpoll', timeout: 60000, since: 'now', limit: 100, include_docs: false })
        .reply(200, '{ results: [], last_seq: "1-0", pending: 0') // missing bracket } - malformed JSON
        .get(changeURL)
        .query({ feed: 'longpoll', timeout: 60000, since: 'now', limit: 100, include_docs: false })
        .reply(200, { results: [change], last_seq: '1-0', pending: 0 })
        .get(changeURL)
        .delay(2000)
        .reply(500)
      const nano = Nano(URL)
      const changesReader = new ChangesReader(DBNAME, nano.request)
      const cr = changesReader.start()
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
