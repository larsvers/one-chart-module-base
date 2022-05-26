import { autoType } from 'd3-dsv';
import { csv, json } from 'd3-fetch';
import { timeFormat } from 'd3-time-format';
import Flourish from '@flourish/live-api';
import cloneDeep from 'lodash.clonedeep';

// const dataUrl = '../data/c02_covid_impacts_latest.csv';
// Or use GH URL:
const dataUrl =
  'https://raw.githubusercontent.com/larsvers/one-chart-module-base/main/data/c02_covid_impacts_latest.csv?token=GHSAT0AAAAAABRDVE5JKVC7HIK5YHGDDQIQYUH3FMA';

const apiKey = 'ibeisDkN0WvNvxeSbWLz0PKTAHPCksrufizuWLMUC6U-UlH2PekIv0jeq8yZUkhU';

const info = {
  container: '#chart-container',
  base_chart: '10068155',
  country: 'ZAF', // not doing anything yet
  template: '@flourish/line-bar-pie',
  state: {
    chart_type: 'column_grouped',
  },
  bindings: {
    // data: { // assuming the script will know the data sheet name.
    filter: 'indicator',
    label: 'iso_code',
    metadata: ['date', 'indicator_name'],
    value: ['value'],
    // },
  },
};

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
        filter: info.bindings.filter,
        label: info.bindings.label,
        value: info.bindings.value,
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

function ready(data) {
  // console.log(data);
  buildAPIChart(info, data);
}

csv(`${dataUrl}?${Math.random()}`, autoType).then(ready);
