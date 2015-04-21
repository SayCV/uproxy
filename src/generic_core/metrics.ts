class Metrics {
  private metricsProvider_;  // TODO: type
  private onceLoaded_ :Promise<void>;
  private data_ = {  // TODO: type
    nextSendTimestamp: 0,  // Timestamp is in UTC milliseconds
    success: 0,
    failure: 0
  };

  constructor() {
    var counterMetric = {
      type: 'logarithmic', base: 2, num_bloombits: 8, num_hashes: 2,
      num_cohorts: 64, prob_p: 0.5, prob_q: 0.75, prob_f: 0.5, flag_oneprr: true
    };
    this.metricsProvider_ = freedom['metrics']({
      name: 'uProxyMetrics',
      definition: {'success-v1': counterMetric, 'failure-v1': counterMetric}
    });

    this.onceLoaded_ = storage.load('metrics')  // TODO: types
        .then((metricsFromStorage) => {
      log.info('Loaded metrics from storage', metricsFromStorage);
      if (metricsFromStorage.success) {
        this.data_.success = metricsFromStorage.success;
      }
      if (metricsFromStorage.failure) {
        this.data_.failure = metricsFromStorage.failure;
      }
      if (metricsFromStorage.nextSendTimestamp) {
        this.data_.nextSendTimestamp = metricsFromStorage.nextSendTimestamp;
        if (metricsFromStorage.nextSendTimestamp < Date.now()) {
          log.info('Metrics are overdue, sending');
          this.sendReport_();
        } else {
          // metricsFromStorage.nextSendTimestamp is in the future, set a
          // timeout to send a repor then.
          var offset_ms = this.data_.nextSendTimestamp - Date.now();
          log.info('Setting timeout for metrics in ' + offset_ms + ' ms');
          setTimeout(this.sendReport_.bind(this), offset_ms);
        }
      } else {
        // No nextSendTimestamp, initialize it.
        this.updateNextSendTimestamp_();
      }
    }).catch((e) => {
      log.info('No metrics loaded', e.message);
      // this.data_ will be properly initialized, just need to set the
      // nextSendTimestamp.
      this.updateNextSendTimestamp_();
    });
  }

  private sendReport_ = () => {
    // TODO: uncomment this out when we have a user setting and UI to enable
    // metrics collection
    // TODO: comment this all
    log.info('sending metrics report');
    this.onceLoaded_.then(() => {
      var successReport =
          this.metricsProvider_.report('success-v1', this.data_.success)
          .then((x) => { console.log('succcess: ' + x) })
          .catch((e) => { console.error('error reading success: ' + e)});  // TODO: remove
      var failureReport =
          this.metricsProvider_.report('failure-v1', this.data_.failure)
          .then((x) => { console.log('failure: ' + x) })
          .catch((e) => { console.error('error reading failure: ' + e)});  // TODO: remove
      log.info('Promise.all: ' + Promise.all);
      // Promise.all([successReport, failureReport]).then(() => {  // TODO: use this
      Promise.all([]).then(() => {
        log.info('calling retrieve');
        this.metricsProvider_.retrieve().then((payload) => {
          log.info('sending report: ' + payload);
          ui.update(
              uProxy.Update.POST_TO_CLOUDFRONT,
              {payload: payload, cloudfrontPath: 'submit-rappor-stats'});
          // Reset success and failure counts after sending report, and
          // update the nextSendTimestamp.
          this.data_.success = 0;
          this.data_.failure = 0;
          this.updateNextSendTimestamp_();  // Saves to storage
        });
      }).catch((e) => {
        log.error('Error retrieving metrics', e);
      });
    });
  }

  public increment = (name) => {
    if (this.data_[name] === undefined) {
      throw new Error('Undefined metric ' + name);
    }
    this.onceLoaded_.then(() => {
      this.data_[name]++;
      storage.save('metrics', this.data_).catch((e) => {
        log.error('Could not save metrics to storage', e);
      });
    })
  }

  private updateNextSendTimestamp_ = () => {
    this.onceLoaded_.then(() => {
      // Use Poisson distrubtion to calculate offset_ms in approx 24 hours.
      // TODO: use crypto.randomUint32() once crypto.getRandomValues is
      // defined in Firefox
      // log.info('crypto is ' + crypto);
      // log.info('crypto.randomUint32 is ' + crypto.randomUint32);
      // log.info('crypto.getRandomValues is ' + crypto.getRandomValues);
      // log.info('Uint32Array is ' + Uint32Array);
      // var randomFloat = crypto.randomUint32() / 4294967296;
      // log.info('randomFloat is ' + randomFloat);
      var randomFloat = Math.random();
      var MS_PER_DAY = 24 * 60 * 60 * 1000;
      var offset_ms = -Math.floor(Math.log(randomFloat) / (1 / MS_PER_DAY));
      log.info('offset_ms is ' + offset_ms);
      this.data_.nextSendTimestamp = Date.now() + offset_ms;
      log.info('next sending metrics at ' + this.data_.nextSendTimestamp);
      // setTimeout(this.sendReport_.bind(this), offset_ms);  - TODO: uncomment
      setTimeout(this.sendReport_.bind(this), 5000);  // TODO: remove
      storage.save('metrics', this.data_).catch((e) => {
        log.error('Could not save metrics to storage', e);
      });
    })
  }
}

var metrics = new Metrics();
