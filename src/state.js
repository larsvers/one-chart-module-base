/* eslint-disable camelcase */
import { dispatch as d3_dispatch } from 'd3-dispatch';

const dispatch = d3_dispatch('blurb');

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

export { dataUrl, apiKey, info, dispatch };
