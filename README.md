# ChangesReader

The *ChangesReader* object allows a CouchDB databases's changes feed to be consumed across one or more HTTP requests. Once started, the *ChangesReader* will continuously poll the server for changes, handle network errors & retries and feed you with database changes as and when they arrive. The *ChangesReader* library has three modes of operation - start/get/spool:

1. `start()` - to listen to changes indefinitely by repeated "long poll" requests. This mode continues to poll for changes forever.
2. `get()` - to listen to changes until the end of the changes feed is reached, by repeated "long poll" requests. Once a response with zero changes is received, the 'end' event will indicate the end of the changes and polling will stop.
3. `spool()` - listen to changes in one long HTTP request. (as opposed to repeated round trips) - spool is faster but less reliable.

> Note: you may also call `stop()` during start/get modes to prematurely end the polling sequence.

The `ChangesReader` library hides the myriad of options that the CouchDB changes API offers and exposes only the features you need to build a resilient, resumable change listener.

## Listening to a changes feed indefinitely

Initialise the *ChangesReader* with the name of the database and URL of your CouchDB service (including credentials, if required) - then call its `start` method to monitor the changes feed indefinitely:

```js
const ChangesReader = require('changesreader')
const cr = new ChangesReader('mydatabase', 'http://admin:admin@localhost:5984')
```

The object returned from `start()` emits events when a change occurs:

```js
cr.start()
  .on('change', (c) => {
    console.log('change', c);
  }).on('batch', (b) => {
    console.log('a batch of', b.length, 'changes has arrived');
  }).on('seq', (s) => {
    console.log('sequence token', s);
  }).on('error', (e) => {
    console.error('error', e);
  });
```

> Note: you probably want to monitor *either* the `change` or `batch` event, not both.

## Listening to the changes feed until you have caught up

Alternatively the `get()` method is available to monitor the changes feed until there are no more changes to consume, at which point an `end` event is emitted.

```js
cr.get()
  .on('change', (c) => {
    console.log('change', c);
  }).on('batch', (b) => {
    console.log('a batch of', b.length, 'changes has arrived');
  }).on('seq', (s) => {
    console.log('sequence token', s);
  }).on('error', (e) => {
    console.error('error', e);
  }).on('end', (count) => {
    console.log('changes feed monitoring has stopped', count);
  });
```

## Listening for changes with `wait=true`

By supplying `wait:true` in the options to `get`/`start`, then your code can rate-limit the rate of changes feed polling. Your code decides when the next request is fired by calling the `on('batch')` callback when ready.

```js
changesReader.get({wait: true})
  .on('change', (c) => {
    console.log('change', c);
  }).on('batch', (b, callback) => {
    console.log('a batch of', b.length, 'changes has arrived');
    // call "callback" when you are ready to poll for new changes
    callback()
  }).on('seq', (s) => {
    console.log('sequence token', s);
  }).on('error', (e) => {
    console.error('error', e);
  }).on('end', (count) => {
    console.log('changes feed monitoring has stopped', count);
  });
```

This allows you to process some asynchronous work safely without building up a back-log of unprocessed data.

## Listening to the changes feed in one HTTP call

Another option is `spool()` which churns through the changes feed in one go. It only emits `batch` events and an `end` event when it finishes.

```js
ct.spool({ since: '0'})
  .on('batch', (b) => {
    console.log('a batch of', b.length, 'changes has arrived');
  }).on('end', (count) => {
    console.log('changes feed monitoring has stopped', count);
  });
```

## Options

| Parameter | Description                                                                                                                                                                             | Default value | e.g.                            |   |
|-----------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|---------------|---------------------------------|---|
| batchSize | The maximum number of changes to ask CouchDB for per HTTP request. This is the maximum number of changes you will receive in a `batch` event. | 100           | 500                             |   |
| since     | The position in the changes feed to start from where `0` means the beginning of time, `now` means the current position or a string token indicates a fixed position in the changes feed | now           | 390768-g1AAAAGveJzLYWBgYMlgTmGQ |   |
| includeDocs | Whether to include document bodies or not | false | e.g. true |
| wait | Got `get`/`start` mode, only processes requests the next batch of changes when the calling code indicates it's ready with a callback  | false | e.g. true |
| fastChanges | Adds a seq_interval parameter to fetch changes more quickly | false           | true                             |   |
| selector | Filters the changes feed with the supplied Mango selector | {"name":"fred}           | null                             |   |
| timeout | The number of milliseconds a changes feed request waits for data| 60000         | 10000                             |   |

To consume the changes feed of a large database from the beginning, you may want to increase the `batchSize` e.g. `{ batchSize: 10000, since: 0}`. 

## Events

The objects returned by `changesReader.start()` and `changesReader.get()` emit the following events:

| Event  | Description                                                                                                                                                               | Data                       |   |
|--------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------|----------------------------|---|
| change | Each detected change is emitted individually. Only available in `get`/`start` modes.                                                                                                                          | A change object            |   |
| batch  | Each batch of changes is emitted in bulk in quantities up to `batchSize`.                                                                                                                              | An array of change objects |   |
| seq    | Each new sequence token (per HTTP request). This token can be passed into `ChangesReader` as the `since` parameter to resume changes feed consumption from a known point. Only available in `get`/`start` modes. | String                     |   |
| error  | On a fatal error, a descriptive object is returned and change consumption stops.                                                                                         | Error object               |   |
| end    | Emitted when the end of the changes feed is reached. `ChangesReader.get()` mode only,                                                                                     | Nothing                    |   |

The *ChangesReader* library will handle many temporal errors such as network connectivity, service capacity limits and malformed data but it will emit an `error` event and exit when fed incorrect authentication credentials or an invalid `since` token.

## What does a change object look like?

The `change` event delivers a change object that looks like this:

```js
{
	"seq": "8-g1AAAAYIeJyt1M9NwzAUBnALKiFOdAO4gpRix3X",
	"id": "2451be085772a9e588c26fb668e1cc52",
	"changes": [{
		"rev": "4-061b768b6c0b6efe1bad425067986587"
	}],
	"doc": {
		"_id": "2451be085772a9e588c26fb668e1cc52",
		"_rev": "4-061b768b6c0b6efe1bad425067986587",
		"a": 3
	}
}
```

N.B

- `doc` is only present if `includeDocs:true` is supplied
- `seq` is not present for every change

The `id` is the unique identifier of the document that changed and the `changes` array contains the document revision tokens that were written to the database.

The `batch` event delivers an array of change objects.

## Building a resumable changes feed listener

The `ChangesReader` object gives you the building blocks to construct code that can listen to the changes feed, resuming from where it left off. To do this you will need to

- listen to the `seq` event and store the value it delivers to you. This is the sequence token of the latest change recieved.
- when starting up the *ChangesReader*, pass your last known `seq` value as the `since` parameter

## TypeScript

The `ChangesReader` class can be used in TypeScript code too:

```ts
import ChangesReader from 'changesreader'
// or
// import ChangesReader = require('changesreader')

const cr = new ChangesReader('mydb', process.env.COUCH_URL)
cr.start({since:'0'})
  .on('batch',(data) => { 
    console.log('batch', data)
  })  
```

> Note: if you choose to use the `import ChangesReader from 'changesreader'` form, you will need to supply the `--esModuleInterop` compile-time option to `tsc`. See [tsc compiler options](https://www.typescriptlang.org/docs/handbook/compiler-options.html).