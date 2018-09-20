const EventEmitter = require('events').EventEmitter
const async = require('async')

/**
 * Monitors the changes feed (after calling .start()/.get()) and emits events
 *  - 'change' - per change
 *  - 'batch' - per batch of changes
 *  - 'seq' - per change of sequence number
 *  - 'error' - per 4xx error (except 429)
 *
 * @param {String} db - Name of the database.
 * @param {Object} request - The HTTP request object e.g nano.request
 */
class ChangesReader {
  // constructor
  constructor (db, request) {
    this.db = db
    this.request = request
    this.setDefaults()
  }

  // set defaults
  setDefaults () {
    this.ee = new EventEmitter()
    this.batchSize = 100
    this.since = 'now'
    this.includeDocs = false
    this.timeout = 60000
    this.heartbeat = 5000
    this.started = false
    this.stopOnEmptyChanges = false // whether to stop polling if we get an empty set of changes back
    this.continue = true // whether to poll again
  }

  // prevent another poll happening
  stop () {
    this.continue = false
  }

  // called to start listening to the changes feed. The opts object can contain:
  // - batchSize - the number of records to return per HTTP request
  // - since - the the sequence token to start from (defaults to 'now')
  start (opts) {
    const self = this

    // if we're already listening for changes
    if (self.started) {
      // return the existing event emitter
      return self.ee
    }
    self.started = true

    // handle overidden defaults
    opts = opts || {}
    if (opts.batchSize) {
      self.batchSize = opts.batchSize
    }
    if (opts.since) {
      self.since = opts.since
    }
    if (opts.includeDocs) {
      self.includeDocs = true
    }

    // monitor the changes feed forever
    async.doWhilst((next) => {
      // formulate changes feed longpoll HTTP request
      const req = {
        method: 'get',
        path: encodeURIComponent(self.db) + '/_changes',
        qs: {
          feed: 'longpoll',
          timeout: self.timeout,
          since: self.since,
          limit: self.batchSize,
          heartbeat: self.heartbeat,
          seq_interval: self.batchSize,
          include_docs: self.includeDocs
        }
      }

      // make HTTP request to get up to batchSize changes from the feed
      self.request(req).then((data) => {
        // and we have some results
        if (data && data.results && data.results.length > 0) {
          // emit 'change' events
          for (let i in data.results) {
            self.ee.emit('change', data.results[i])
          }

          // emit 'batch' event
          self.ee.emit('batch', data.results)
        }

        // update the since state
        if (data && data.last_seq && data.last_seq !== self.since) {
          self.since = data.last_seq
          self.ee.emit('seq', self.since)
        }

        // stop on empty batch or small batch
        if (self.stopOnEmptyChanges && data && typeof data.results !== 'undefined' && data.results.length < self.batchSize) {
          // emit 'end' event if we are in 'get' mode
          self.ee.emit('end')
          self.continue = false
        }

        next()
      }).catch((err) => {
        // error (wrong password, bad since value etc)
        self.ee.emit('error', err)

        // if the error is fatal
        if (err && err.statusCode && err.statusCode >= 400 && err.statusCode !== 429 && err.statusCode < 500) {
          self.continue = false
          next(err.reason)
        } else {
          next()
        }
      })
    },

    // function that decides if the doWhilst loop will continue to repeat
    () => {
      return self.continue
    },
    () => {
      // reset
      self.setDefaults()
    })

    // return the event emitter to the caller
    return self.ee
  }

  // called to start listening to the changes feed for a finite number of changes. The opts object can contain:
  // - batchSize - the number of records to return per HTTP request
  // - since - the sequence token to start from (defaults to 'now')
  get (opts) {
    this.stopOnEmptyChanges = true
    return this.start(opts)
  }
}

module.exports = ChangesReader
