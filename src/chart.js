import Flourish from '@flourish/live-api';
import cloneDeep from 'lodash.clonedeep';
import set from 'lodash.set';

function buildAPIChart({ base, data, bindings, state }) {
  const clonedState = cloneDeep(state);

  set(clonedState.state, 'color.categorical_custom_palette', 'South Africa:skyblue');

  const apiOptions = { ...base, ...data, ...bindings, ...clonedState };
  const visual = new Flourish.Live(apiOptions);
}

export { buildAPIChart };
