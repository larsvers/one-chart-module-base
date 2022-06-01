/* eslint-disable camelcase */
import { dispatch as d3_dispatch } from 'd3-dispatch';

// Sub Pub from UI to Chart build.
const dispatch = d3_dispatch('apidata');

// Example to use an external data source (functions with LBP 10068155).
const dataUrl =
  'https://raw.githubusercontent.com/larsvers/one-chart-module-base/option-select-ui/data/c02_covid_impacts_latest.csv';

// Ideally there's a single parent scoped api key for the entire application.
const apiKey = 'ibeisDkN0WvNvxeSbWLz0PKTAHPCksrufizuWLMUC6U-UlH2PekIv0jeq8yZUkhU';

export { dataUrl, apiKey, dispatch };
