const stream = require('stream')

module.exports = (ee, batchSize) => {
  const changeProcessor = new stream.Transform({ objectMode: true })
  const buffer = []

  changeProcessor._transform = function (chunk, encoding, done) {
    // remove last char from string
    if (chunk[chunk.length - 1] === ',') {
      chunk = chunk.slice(0, -1)
    }

    try {
      const j = JSON.parse(chunk)
      buffer.push(j)
      if (buffer.length >= batchSize) {
        ee.emit('batch', buffer.splice(0, batchSize))
      }
      done()
    } catch (e) {
      done()
    }
  }

  changeProcessor._flush = function (done) {
    if (buffer.length > 0) {
      ee.emit('batch', buffer)
    }
    done()
  }

  return changeProcessor
}
