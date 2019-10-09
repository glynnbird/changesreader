const stream = require('stream')

module.exports = (ee, batchSize) => {
  const changeProcessor = new stream.Transform({ objectMode: true })
  const buffer = []
  changeProcessor.lastSeq = '0'

  // emit batch of data, record last sequence token
  const emit = (data) => {
    ee.emit('batch', data)
  }

  changeProcessor._transform = function (chunk, encoding, done) {
    // remove last char from string
    if (chunk[chunk.length - 1] === ',') {
      chunk = chunk.slice(0, -1)
    }

    try {
      const j = JSON.parse(chunk)
      buffer.push(j)
      if (buffer.length >= batchSize) {
        emit(buffer.splice(0, batchSize))
      }
      done()
    } catch (e) {
      // look for last_seq
      const match = chunk.match(/"last_seq":"([^"]+)"/)
      if (match) {
        changeProcessor.lastSeq = match[1]
      }
      done()
    }
  }

  changeProcessor._flush = function (done) {
    if (buffer.length > 0) {
      emit(buffer.splice(0, buffer.length))
    }
    done()
  }

  return changeProcessor
}
