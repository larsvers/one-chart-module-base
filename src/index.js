import { autoType } from 'd3-dsv';
import { csv } from 'd3-fetch';

import { dataUrl, dispatch, info } from './state';
import { buildSelectUI } from './ui';
import { buildAPIChart, buildAPIChart2 } from './chart';

function ready(data) {
  buildSelectUI();
  dispatch.on('blurb', function (eventData) {
    // console.log(eventData);
    // buildAPIChart(info, data);
    buildAPIChart2(eventData);
  });
}

csv(`${dataUrl}?${Math.random()}`, autoType).then(ready);
