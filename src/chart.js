import { json } from 'd3-fetch';
import { timeFormat } from 'd3-time-format';
import Flourish from '@flourish/live-api';
import cloneDeep from 'lodash.clonedeep';

import { apiKey } from './state.js';

async function getBaseChartConfig(id) {
  let baseConfig;
  await json(`https://public.flourish.studio/visualisation/${id}/visualisation.json`)
    .then(res => {
      baseConfig = res;
    })
    .catch(error => {
      console.warn('You probably need a published base chart');
    });

  return baseConfig;
}

function mutateOptions() {
  // not doing anything yet
}

async function buildAPIChart(info, chartData) {
  // Compose the API options.
  const config = await getBaseChartConfig(info.base_chart);

  const base = {
    template: config.template,
    version: config.version,
    api_key: apiKey,
    container: info.container,
    // height: info.height, // controlled by the container element
  };

  const state = {
    state: cloneDeep(config.state),
  };

  // Add any kind of template specific bindings config here
  // (or let that happen in WP)
  const bindings = {
    bindings: {
      data: {
        label: info.bindings.label,
        value: info.bindings.value,
        filter: info.bindings.filter,
        metadata: info.bindings.metadata,
      },
    },
  };

  // Add any kind of data prep here.
  const dataPrepped = chartData.map(d => ({
    ...d,
    date: timeFormat('%d %b %Y')(d.date),
    value: +d.value,
  }));

  const data = {
    data: {
      data: dataPrepped,
    },
  };

  // Add any kind of state mutations here.
  mutateOptions(info, state);

  const apiOptions = { ...base, ...state, ...bindings, ...data };

  const visual = new Flourish.Live(apiOptions);
  console.log(visual);
}

export { buildAPIChart };
