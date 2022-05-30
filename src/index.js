import { dispatch } from './state';
import { buildSelectUI } from './ui';
import { buildAPIChart } from './chart';

buildSelectUI();
dispatch.on('apidata', function (eventData) {
  buildAPIChart(eventData);
});
