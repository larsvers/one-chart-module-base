import { autoType } from 'd3-dsv';
import { csv } from 'd3-fetch';

import { dataUrl, dispatch, info } from './state';
import { buildSelectUI } from './ui';
import { buildAPIChart } from './chart';

function ready(data) {
  buildSelectUI();
  dispatch.on('blurb', function (e) {
    console.log(e);
    // buildAPIChart(info, data, e);
  });
}

csv(`${dataUrl}?${Math.random()}`, autoType).then(ready);
