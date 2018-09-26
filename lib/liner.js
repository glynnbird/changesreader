const stream = require('stream')

const liner = () => {
  const liner = new stream.Transform({ objectMode: true })

  liner._transform = function (chunk, encoding, done) {
    let data = chunk.toString('utf8')
    if (this._lastLineData) {
      data = this._lastLineData + data
      this._lastLineData = null
    }

    const lines = data.split(/\s*\n/)
    this._lastLineData = lines.splice(lines.length - 1, 1)[0]
    lines.forEach(this.push.bind(this))
    done()
  }

  liner._flush = function (done) {
    this.push(this._lastLineData)
    this._lastLineData = null
    done()
  }

  return liner
}

module.exports = liner
