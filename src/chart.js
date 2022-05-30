import Flourish from '@flourish/live-api';

function buildAPIChart({ base, data, bindings, state }) {
  const apiOptions = { ...base, ...data, ...bindings, ...state };
  const visual = new Flourish.Live(apiOptions);
}

export { buildAPIChart };
