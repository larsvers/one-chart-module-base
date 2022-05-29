(function () {
  'use strict';

  var EOL = {},
      EOF = {},
      QUOTE = 34,
      NEWLINE = 10,
      RETURN = 13;

  function objectConverter(columns) {
    return new Function("d", "return {" + columns.map(function(name, i) {
      return JSON.stringify(name) + ": d[" + i + "] || \"\"";
    }).join(",") + "}");
  }

  function customConverter(columns, f) {
    var object = objectConverter(columns);
    return function(row, i) {
      return f(object(row), i, columns);
    };
  }

  // Compute unique columns in order of discovery.
  function inferColumns(rows) {
    var columnSet = Object.create(null),
        columns = [];

    rows.forEach(function(row) {
      for (var column in row) {
        if (!(column in columnSet)) {
          columns.push(columnSet[column] = column);
        }
      }
    });

    return columns;
  }

  function pad$1(value, width) {
    var s = value + "", length = s.length;
    return length < width ? new Array(width - length + 1).join(0) + s : s;
  }

  function formatYear$1(year) {
    return year < 0 ? "-" + pad$1(-year, 6)
      : year > 9999 ? "+" + pad$1(year, 6)
      : pad$1(year, 4);
  }

  function formatDate(date) {
    var hours = date.getUTCHours(),
        minutes = date.getUTCMinutes(),
        seconds = date.getUTCSeconds(),
        milliseconds = date.getUTCMilliseconds();
    return isNaN(date) ? "Invalid Date"
        : formatYear$1(date.getUTCFullYear()) + "-" + pad$1(date.getUTCMonth() + 1, 2) + "-" + pad$1(date.getUTCDate(), 2)
        + (milliseconds ? "T" + pad$1(hours, 2) + ":" + pad$1(minutes, 2) + ":" + pad$1(seconds, 2) + "." + pad$1(milliseconds, 3) + "Z"
        : seconds ? "T" + pad$1(hours, 2) + ":" + pad$1(minutes, 2) + ":" + pad$1(seconds, 2) + "Z"
        : minutes || hours ? "T" + pad$1(hours, 2) + ":" + pad$1(minutes, 2) + "Z"
        : "");
  }

  function dsvFormat(delimiter) {
    var reFormat = new RegExp("[\"" + delimiter + "\n\r]"),
        DELIMITER = delimiter.charCodeAt(0);

    function parse(text, f) {
      var convert, columns, rows = parseRows(text, function(row, i) {
        if (convert) return convert(row, i - 1);
        columns = row, convert = f ? customConverter(row, f) : objectConverter(row);
      });
      rows.columns = columns || [];
      return rows;
    }

    function parseRows(text, f) {
      var rows = [], // output rows
          N = text.length,
          I = 0, // current character index
          n = 0, // current line number
          t, // current token
          eof = N <= 0, // current token followed by EOF?
          eol = false; // current token followed by EOL?

      // Strip the trailing newline.
      if (text.charCodeAt(N - 1) === NEWLINE) --N;
      if (text.charCodeAt(N - 1) === RETURN) --N;

      function token() {
        if (eof) return EOF;
        if (eol) return eol = false, EOL;

        // Unescape quotes.
        var i, j = I, c;
        if (text.charCodeAt(j) === QUOTE) {
          while (I++ < N && text.charCodeAt(I) !== QUOTE || text.charCodeAt(++I) === QUOTE);
          if ((i = I) >= N) eof = true;
          else if ((c = text.charCodeAt(I++)) === NEWLINE) eol = true;
          else if (c === RETURN) { eol = true; if (text.charCodeAt(I) === NEWLINE) ++I; }
          return text.slice(j + 1, i - 1).replace(/""/g, "\"");
        }

        // Find next delimiter or newline.
        while (I < N) {
          if ((c = text.charCodeAt(i = I++)) === NEWLINE) eol = true;
          else if (c === RETURN) { eol = true; if (text.charCodeAt(I) === NEWLINE) ++I; }
          else if (c !== DELIMITER) continue;
          return text.slice(j, i);
        }

        // Return last token before EOF.
        return eof = true, text.slice(j, N);
      }

      while ((t = token()) !== EOF) {
        var row = [];
        while (t !== EOL && t !== EOF) row.push(t), t = token();
        if (f && (row = f(row, n++)) == null) continue;
        rows.push(row);
      }

      return rows;
    }

    function preformatBody(rows, columns) {
      return rows.map(function(row) {
        return columns.map(function(column) {
          return formatValue(row[column]);
        }).join(delimiter);
      });
    }

    function format(rows, columns) {
      if (columns == null) columns = inferColumns(rows);
      return [columns.map(formatValue).join(delimiter)].concat(preformatBody(rows, columns)).join("\n");
    }

    function formatBody(rows, columns) {
      if (columns == null) columns = inferColumns(rows);
      return preformatBody(rows, columns).join("\n");
    }

    function formatRows(rows) {
      return rows.map(formatRow).join("\n");
    }

    function formatRow(row) {
      return row.map(formatValue).join(delimiter);
    }

    function formatValue(value) {
      return value == null ? ""
          : value instanceof Date ? formatDate(value)
          : reFormat.test(value += "") ? "\"" + value.replace(/"/g, "\"\"") + "\""
          : value;
    }

    return {
      parse: parse,
      parseRows: parseRows,
      format: format,
      formatBody: formatBody,
      formatRows: formatRows,
      formatRow: formatRow,
      formatValue: formatValue
    };
  }

  var csv$1 = dsvFormat(",");

  var csvParse = csv$1.parse;

  dsvFormat("\t");

  function autoType(object) {
    for (var key in object) {
      var value = object[key].trim(), number, m;
      if (!value) value = null;
      else if (value === "true") value = true;
      else if (value === "false") value = false;
      else if (value === "NaN") value = NaN;
      else if (!isNaN(number = +value)) value = number;
      else if (m = value.match(/^([-+]\d{2})?\d{4}(-\d{2}(-\d{2})?)?(T\d{2}:\d{2}(:\d{2}(\.\d{3})?)?(Z|[-+]\d{2}:\d{2})?)?$/)) {
        if (fixtz && !!m[4] && !m[7]) value = value.replace(/-/g, "/").replace(/T/, " ");
        value = new Date(value);
      }
      else continue;
      object[key] = value;
    }
    return object;
  }

  // https://github.com/d3/d3-dsv/issues/45
  const fixtz = new Date("2019-01-01T00:00").getHours() || new Date("2019-07-01T00:00").getHours();

  function responseText(response) {
    if (!response.ok) throw new Error(response.status + " " + response.statusText);
    return response.text();
  }

  function text(input, init) {
    return fetch(input, init).then(responseText);
  }

  function dsvParse(parse) {
    return function(input, init, row) {
      if (arguments.length === 2 && typeof init === "function") row = init, init = undefined;
      return text(input, init).then(function(response) {
        return parse(response, row);
      });
    };
  }

  var csv = dsvParse(csvParse);

  function responseJson(response) {
    if (!response.ok) throw new Error(response.status + " " + response.statusText);
    if (response.status === 204 || response.status === 205) return;
    return response.json();
  }

  function json(input, init) {
    return fetch(input, init).then(responseJson);
  }

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

  function ascending$1(a, b) {
    return a == null || b == null ? NaN : a < b ? -1 : a > b ? 1 : a >= b ? 0 : NaN;
  }

  function descending(a, b) {
    return a == null || b == null ? NaN
      : b < a ? -1
      : b > a ? 1
      : b >= a ? 0
      : NaN;
  }

  function bisector(f) {
    let compare1, compare2, delta;

    // If an accessor is specified, promote it to a comparator. In this case we
    // can test whether the search value is (self-) comparable. We can’t do this
    // for a comparator (except for specific, known comparators) because we can’t
    // tell if the comparator is symmetric, and an asymmetric comparator can’t be
    // used to test whether a single value is comparable.
    if (f.length !== 2) {
      compare1 = ascending$1;
      compare2 = (d, x) => ascending$1(f(d), x);
      delta = (d, x) => f(d) - x;
    } else {
      compare1 = f === ascending$1 || f === descending ? f : zero;
      compare2 = f;
      delta = f;
    }

    function left(a, x, lo = 0, hi = a.length) {
      if (lo < hi) {
        if (compare1(x, x) !== 0) return hi;
        do {
          const mid = (lo + hi) >>> 1;
          if (compare2(a[mid], x) < 0) lo = mid + 1;
          else hi = mid;
        } while (lo < hi);
      }
      return lo;
    }

    function right(a, x, lo = 0, hi = a.length) {
      if (lo < hi) {
        if (compare1(x, x) !== 0) return hi;
        do {
          const mid = (lo + hi) >>> 1;
          if (compare2(a[mid], x) <= 0) lo = mid + 1;
          else hi = mid;
        } while (lo < hi);
      }
      return lo;
    }

    function center(a, x, lo = 0, hi = a.length) {
      const i = left(a, x, lo, hi - 1);
      return i > lo && delta(a[i - 1], x) > -delta(a[i], x) ? i - 1 : i;
    }

    return {left, center, right};
  }

  function zero() {
    return 0;
  }

  function number(x) {
    return x === null ? NaN : +x;
  }

  bisector(ascending$1);
  bisector(number).center;

  class InternMap extends Map {
    constructor(entries, key = keyof) {
      super();
      Object.defineProperties(this, {_intern: {value: new Map()}, _key: {value: key}});
      if (entries != null) for (const [key, value] of entries) this.set(key, value);
    }
    get(key) {
      return super.get(intern_get(this, key));
    }
    has(key) {
      return super.has(intern_get(this, key));
    }
    set(key, value) {
      return super.set(intern_set(this, key), value);
    }
    delete(key) {
      return super.delete(intern_delete(this, key));
    }
  }

  function intern_get({_intern, _key}, value) {
    const key = _key(value);
    return _intern.has(key) ? _intern.get(key) : value;
  }

  function intern_set({_intern, _key}, value) {
    const key = _key(value);
    if (_intern.has(key)) return _intern.get(key);
    _intern.set(key, value);
    return value;
  }

  function intern_delete({_intern, _key}, value) {
    const key = _key(value);
    if (_intern.has(key)) {
      value = _intern.get(key);
      _intern.delete(key);
    }
    return value;
  }

  function keyof(value) {
    return value !== null && typeof value === "object" ? value.valueOf() : value;
  }

  function identity(x) {
    return x;
  }

  function group(values, ...keys) {
    return nest(values, identity, identity, keys);
  }

  function nest(values, map, reduce, keys) {
    return (function regroup(values, i) {
      if (i >= keys.length) return reduce(values);
      const groups = new InternMap();
      const keyof = keys[i++];
      let index = -1;
      for (const value of values) {
        const key = keyof(value, ++index, values);
        const group = groups.get(key);
        if (group) group.push(value);
        else groups.set(key, [value]);
      }
      for (const [key, values] of groups) {
        groups.set(key, regroup(values, i));
      }
      return map(groups);
    })(values, 0);
  }

  var xhtml = "http://www.w3.org/1999/xhtml";

  var namespaces = {
    svg: "http://www.w3.org/2000/svg",
    xhtml: xhtml,
    xlink: "http://www.w3.org/1999/xlink",
    xml: "http://www.w3.org/XML/1998/namespace",
    xmlns: "http://www.w3.org/2000/xmlns/"
  };

  function namespace(name) {
    var prefix = name += "", i = prefix.indexOf(":");
    if (i >= 0 && (prefix = name.slice(0, i)) !== "xmlns") name = name.slice(i + 1);
    return namespaces.hasOwnProperty(prefix) ? {space: namespaces[prefix], local: name} : name; // eslint-disable-line no-prototype-builtins
  }

  function creatorInherit(name) {
    return function() {
      var document = this.ownerDocument,
          uri = this.namespaceURI;
      return uri === xhtml && document.documentElement.namespaceURI === xhtml
          ? document.createElement(name)
          : document.createElementNS(uri, name);
    };
  }

  function creatorFixed(fullname) {
    return function() {
      return this.ownerDocument.createElementNS(fullname.space, fullname.local);
    };
  }

  function creator(name) {
    var fullname = namespace(name);
    return (fullname.local
        ? creatorFixed
        : creatorInherit)(fullname);
  }

  function none() {}

  function selector(selector) {
    return selector == null ? none : function() {
      return this.querySelector(selector);
    };
  }

  function selection_select(select) {
    if (typeof select !== "function") select = selector(select);

    for (var groups = this._groups, m = groups.length, subgroups = new Array(m), j = 0; j < m; ++j) {
      for (var group = groups[j], n = group.length, subgroup = subgroups[j] = new Array(n), node, subnode, i = 0; i < n; ++i) {
        if ((node = group[i]) && (subnode = select.call(node, node.__data__, i, group))) {
          if ("__data__" in node) subnode.__data__ = node.__data__;
          subgroup[i] = subnode;
        }
      }
    }

    return new Selection(subgroups, this._parents);
  }

  // Given something array like (or null), returns something that is strictly an
  // array. This is used to ensure that array-like objects passed to d3.selectAll
  // or selection.selectAll are converted into proper arrays when creating a
  // selection; we don’t ever want to create a selection backed by a live
  // HTMLCollection or NodeList. However, note that selection.selectAll will use a
  // static NodeList as a group, since it safely derived from querySelectorAll.
  function array(x) {
    return x == null ? [] : Array.isArray(x) ? x : Array.from(x);
  }

  function empty() {
    return [];
  }

  function selectorAll(selector) {
    return selector == null ? empty : function() {
      return this.querySelectorAll(selector);
    };
  }

  function arrayAll(select) {
    return function() {
      return array(select.apply(this, arguments));
    };
  }

  function selection_selectAll(select) {
    if (typeof select === "function") select = arrayAll(select);
    else select = selectorAll(select);

    for (var groups = this._groups, m = groups.length, subgroups = [], parents = [], j = 0; j < m; ++j) {
      for (var group = groups[j], n = group.length, node, i = 0; i < n; ++i) {
        if (node = group[i]) {
          subgroups.push(select.call(node, node.__data__, i, group));
          parents.push(node);
        }
      }
    }

    return new Selection(subgroups, parents);
  }

  function matcher(selector) {
    return function() {
      return this.matches(selector);
    };
  }

  function childMatcher(selector) {
    return function(node) {
      return node.matches(selector);
    };
  }

  var find = Array.prototype.find;

  function childFind(match) {
    return function() {
      return find.call(this.children, match);
    };
  }

  function childFirst() {
    return this.firstElementChild;
  }

  function selection_selectChild(match) {
    return this.select(match == null ? childFirst
        : childFind(typeof match === "function" ? match : childMatcher(match)));
  }

  var filter = Array.prototype.filter;

  function children() {
    return Array.from(this.children);
  }

  function childrenFilter(match) {
    return function() {
      return filter.call(this.children, match);
    };
  }

  function selection_selectChildren(match) {
    return this.selectAll(match == null ? children
        : childrenFilter(typeof match === "function" ? match : childMatcher(match)));
  }

  function selection_filter(match) {
    if (typeof match !== "function") match = matcher(match);

    for (var groups = this._groups, m = groups.length, subgroups = new Array(m), j = 0; j < m; ++j) {
      for (var group = groups[j], n = group.length, subgroup = subgroups[j] = [], node, i = 0; i < n; ++i) {
        if ((node = group[i]) && match.call(node, node.__data__, i, group)) {
          subgroup.push(node);
        }
      }
    }

    return new Selection(subgroups, this._parents);
  }

  function sparse(update) {
    return new Array(update.length);
  }

  function selection_enter() {
    return new Selection(this._enter || this._groups.map(sparse), this._parents);
  }

  function EnterNode(parent, datum) {
    this.ownerDocument = parent.ownerDocument;
    this.namespaceURI = parent.namespaceURI;
    this._next = null;
    this._parent = parent;
    this.__data__ = datum;
  }

  EnterNode.prototype = {
    constructor: EnterNode,
    appendChild: function(child) { return this._parent.insertBefore(child, this._next); },
    insertBefore: function(child, next) { return this._parent.insertBefore(child, next); },
    querySelector: function(selector) { return this._parent.querySelector(selector); },
    querySelectorAll: function(selector) { return this._parent.querySelectorAll(selector); }
  };

  function constant(x) {
    return function() {
      return x;
    };
  }

  function bindIndex(parent, group, enter, update, exit, data) {
    var i = 0,
        node,
        groupLength = group.length,
        dataLength = data.length;

    // Put any non-null nodes that fit into update.
    // Put any null nodes into enter.
    // Put any remaining data into enter.
    for (; i < dataLength; ++i) {
      if (node = group[i]) {
        node.__data__ = data[i];
        update[i] = node;
      } else {
        enter[i] = new EnterNode(parent, data[i]);
      }
    }

    // Put any non-null nodes that don’t fit into exit.
    for (; i < groupLength; ++i) {
      if (node = group[i]) {
        exit[i] = node;
      }
    }
  }

  function bindKey(parent, group, enter, update, exit, data, key) {
    var i,
        node,
        nodeByKeyValue = new Map,
        groupLength = group.length,
        dataLength = data.length,
        keyValues = new Array(groupLength),
        keyValue;

    // Compute the key for each node.
    // If multiple nodes have the same key, the duplicates are added to exit.
    for (i = 0; i < groupLength; ++i) {
      if (node = group[i]) {
        keyValues[i] = keyValue = key.call(node, node.__data__, i, group) + "";
        if (nodeByKeyValue.has(keyValue)) {
          exit[i] = node;
        } else {
          nodeByKeyValue.set(keyValue, node);
        }
      }
    }

    // Compute the key for each datum.
    // If there a node associated with this key, join and add it to update.
    // If there is not (or the key is a duplicate), add it to enter.
    for (i = 0; i < dataLength; ++i) {
      keyValue = key.call(parent, data[i], i, data) + "";
      if (node = nodeByKeyValue.get(keyValue)) {
        update[i] = node;
        node.__data__ = data[i];
        nodeByKeyValue.delete(keyValue);
      } else {
        enter[i] = new EnterNode(parent, data[i]);
      }
    }

    // Add any remaining nodes that were not bound to data to exit.
    for (i = 0; i < groupLength; ++i) {
      if ((node = group[i]) && (nodeByKeyValue.get(keyValues[i]) === node)) {
        exit[i] = node;
      }
    }
  }

  function datum(node) {
    return node.__data__;
  }

  function selection_data(value, key) {
    if (!arguments.length) return Array.from(this, datum);

    var bind = key ? bindKey : bindIndex,
        parents = this._parents,
        groups = this._groups;

    if (typeof value !== "function") value = constant(value);

    for (var m = groups.length, update = new Array(m), enter = new Array(m), exit = new Array(m), j = 0; j < m; ++j) {
      var parent = parents[j],
          group = groups[j],
          groupLength = group.length,
          data = arraylike(value.call(parent, parent && parent.__data__, j, parents)),
          dataLength = data.length,
          enterGroup = enter[j] = new Array(dataLength),
          updateGroup = update[j] = new Array(dataLength),
          exitGroup = exit[j] = new Array(groupLength);

      bind(parent, group, enterGroup, updateGroup, exitGroup, data, key);

      // Now connect the enter nodes to their following update node, such that
      // appendChild can insert the materialized enter node before this node,
      // rather than at the end of the parent node.
      for (var i0 = 0, i1 = 0, previous, next; i0 < dataLength; ++i0) {
        if (previous = enterGroup[i0]) {
          if (i0 >= i1) i1 = i0 + 1;
          while (!(next = updateGroup[i1]) && ++i1 < dataLength);
          previous._next = next || null;
        }
      }
    }

    update = new Selection(update, parents);
    update._enter = enter;
    update._exit = exit;
    return update;
  }

  // Given some data, this returns an array-like view of it: an object that
  // exposes a length property and allows numeric indexing. Note that unlike
  // selectAll, this isn’t worried about “live” collections because the resulting
  // array will only be used briefly while data is being bound. (It is possible to
  // cause the data to change while iterating by using a key function, but please
  // don’t; we’d rather avoid a gratuitous copy.)
  function arraylike(data) {
    return typeof data === "object" && "length" in data
      ? data // Array, TypedArray, NodeList, array-like
      : Array.from(data); // Map, Set, iterable, string, or anything else
  }

  function selection_exit() {
    return new Selection(this._exit || this._groups.map(sparse), this._parents);
  }

  function selection_join(onenter, onupdate, onexit) {
    var enter = this.enter(), update = this, exit = this.exit();
    if (typeof onenter === "function") {
      enter = onenter(enter);
      if (enter) enter = enter.selection();
    } else {
      enter = enter.append(onenter + "");
    }
    if (onupdate != null) {
      update = onupdate(update);
      if (update) update = update.selection();
    }
    if (onexit == null) exit.remove(); else onexit(exit);
    return enter && update ? enter.merge(update).order() : update;
  }

  function selection_merge(context) {
    var selection = context.selection ? context.selection() : context;

    for (var groups0 = this._groups, groups1 = selection._groups, m0 = groups0.length, m1 = groups1.length, m = Math.min(m0, m1), merges = new Array(m0), j = 0; j < m; ++j) {
      for (var group0 = groups0[j], group1 = groups1[j], n = group0.length, merge = merges[j] = new Array(n), node, i = 0; i < n; ++i) {
        if (node = group0[i] || group1[i]) {
          merge[i] = node;
        }
      }
    }

    for (; j < m0; ++j) {
      merges[j] = groups0[j];
    }

    return new Selection(merges, this._parents);
  }

  function selection_order() {

    for (var groups = this._groups, j = -1, m = groups.length; ++j < m;) {
      for (var group = groups[j], i = group.length - 1, next = group[i], node; --i >= 0;) {
        if (node = group[i]) {
          if (next && node.compareDocumentPosition(next) ^ 4) next.parentNode.insertBefore(node, next);
          next = node;
        }
      }
    }

    return this;
  }

  function selection_sort(compare) {
    if (!compare) compare = ascending;

    function compareNode(a, b) {
      return a && b ? compare(a.__data__, b.__data__) : !a - !b;
    }

    for (var groups = this._groups, m = groups.length, sortgroups = new Array(m), j = 0; j < m; ++j) {
      for (var group = groups[j], n = group.length, sortgroup = sortgroups[j] = new Array(n), node, i = 0; i < n; ++i) {
        if (node = group[i]) {
          sortgroup[i] = node;
        }
      }
      sortgroup.sort(compareNode);
    }

    return new Selection(sortgroups, this._parents).order();
  }

  function ascending(a, b) {
    return a < b ? -1 : a > b ? 1 : a >= b ? 0 : NaN;
  }

  function selection_call() {
    var callback = arguments[0];
    arguments[0] = this;
    callback.apply(null, arguments);
    return this;
  }

  function selection_nodes() {
    return Array.from(this);
  }

  function selection_node() {

    for (var groups = this._groups, j = 0, m = groups.length; j < m; ++j) {
      for (var group = groups[j], i = 0, n = group.length; i < n; ++i) {
        var node = group[i];
        if (node) return node;
      }
    }

    return null;
  }

  function selection_size() {
    let size = 0;
    for (const node of this) ++size; // eslint-disable-line no-unused-vars
    return size;
  }

  function selection_empty() {
    return !this.node();
  }

  function selection_each(callback) {

    for (var groups = this._groups, j = 0, m = groups.length; j < m; ++j) {
      for (var group = groups[j], i = 0, n = group.length, node; i < n; ++i) {
        if (node = group[i]) callback.call(node, node.__data__, i, group);
      }
    }

    return this;
  }

  function attrRemove(name) {
    return function() {
      this.removeAttribute(name);
    };
  }

  function attrRemoveNS(fullname) {
    return function() {
      this.removeAttributeNS(fullname.space, fullname.local);
    };
  }

  function attrConstant(name, value) {
    return function() {
      this.setAttribute(name, value);
    };
  }

  function attrConstantNS(fullname, value) {
    return function() {
      this.setAttributeNS(fullname.space, fullname.local, value);
    };
  }

  function attrFunction(name, value) {
    return function() {
      var v = value.apply(this, arguments);
      if (v == null) this.removeAttribute(name);
      else this.setAttribute(name, v);
    };
  }

  function attrFunctionNS(fullname, value) {
    return function() {
      var v = value.apply(this, arguments);
      if (v == null) this.removeAttributeNS(fullname.space, fullname.local);
      else this.setAttributeNS(fullname.space, fullname.local, v);
    };
  }

  function selection_attr(name, value) {
    var fullname = namespace(name);

    if (arguments.length < 2) {
      var node = this.node();
      return fullname.local
          ? node.getAttributeNS(fullname.space, fullname.local)
          : node.getAttribute(fullname);
    }

    return this.each((value == null
        ? (fullname.local ? attrRemoveNS : attrRemove) : (typeof value === "function"
        ? (fullname.local ? attrFunctionNS : attrFunction)
        : (fullname.local ? attrConstantNS : attrConstant)))(fullname, value));
  }

  function defaultView(node) {
    return (node.ownerDocument && node.ownerDocument.defaultView) // node is a Node
        || (node.document && node) // node is a Window
        || node.defaultView; // node is a Document
  }

  function styleRemove(name) {
    return function() {
      this.style.removeProperty(name);
    };
  }

  function styleConstant(name, value, priority) {
    return function() {
      this.style.setProperty(name, value, priority);
    };
  }

  function styleFunction(name, value, priority) {
    return function() {
      var v = value.apply(this, arguments);
      if (v == null) this.style.removeProperty(name);
      else this.style.setProperty(name, v, priority);
    };
  }

  function selection_style(name, value, priority) {
    return arguments.length > 1
        ? this.each((value == null
              ? styleRemove : typeof value === "function"
              ? styleFunction
              : styleConstant)(name, value, priority == null ? "" : priority))
        : styleValue(this.node(), name);
  }

  function styleValue(node, name) {
    return node.style.getPropertyValue(name)
        || defaultView(node).getComputedStyle(node, null).getPropertyValue(name);
  }

  function propertyRemove(name) {
    return function() {
      delete this[name];
    };
  }

  function propertyConstant(name, value) {
    return function() {
      this[name] = value;
    };
  }

  function propertyFunction(name, value) {
    return function() {
      var v = value.apply(this, arguments);
      if (v == null) delete this[name];
      else this[name] = v;
    };
  }

  function selection_property(name, value) {
    return arguments.length > 1
        ? this.each((value == null
            ? propertyRemove : typeof value === "function"
            ? propertyFunction
            : propertyConstant)(name, value))
        : this.node()[name];
  }

  function classArray(string) {
    return string.trim().split(/^|\s+/);
  }

  function classList(node) {
    return node.classList || new ClassList(node);
  }

  function ClassList(node) {
    this._node = node;
    this._names = classArray(node.getAttribute("class") || "");
  }

  ClassList.prototype = {
    add: function(name) {
      var i = this._names.indexOf(name);
      if (i < 0) {
        this._names.push(name);
        this._node.setAttribute("class", this._names.join(" "));
      }
    },
    remove: function(name) {
      var i = this._names.indexOf(name);
      if (i >= 0) {
        this._names.splice(i, 1);
        this._node.setAttribute("class", this._names.join(" "));
      }
    },
    contains: function(name) {
      return this._names.indexOf(name) >= 0;
    }
  };

  function classedAdd(node, names) {
    var list = classList(node), i = -1, n = names.length;
    while (++i < n) list.add(names[i]);
  }

  function classedRemove(node, names) {
    var list = classList(node), i = -1, n = names.length;
    while (++i < n) list.remove(names[i]);
  }

  function classedTrue(names) {
    return function() {
      classedAdd(this, names);
    };
  }

  function classedFalse(names) {
    return function() {
      classedRemove(this, names);
    };
  }

  function classedFunction(names, value) {
    return function() {
      (value.apply(this, arguments) ? classedAdd : classedRemove)(this, names);
    };
  }

  function selection_classed(name, value) {
    var names = classArray(name + "");

    if (arguments.length < 2) {
      var list = classList(this.node()), i = -1, n = names.length;
      while (++i < n) if (!list.contains(names[i])) return false;
      return true;
    }

    return this.each((typeof value === "function"
        ? classedFunction : value
        ? classedTrue
        : classedFalse)(names, value));
  }

  function textRemove() {
    this.textContent = "";
  }

  function textConstant(value) {
    return function() {
      this.textContent = value;
    };
  }

  function textFunction(value) {
    return function() {
      var v = value.apply(this, arguments);
      this.textContent = v == null ? "" : v;
    };
  }

  function selection_text(value) {
    return arguments.length
        ? this.each(value == null
            ? textRemove : (typeof value === "function"
            ? textFunction
            : textConstant)(value))
        : this.node().textContent;
  }

  function htmlRemove() {
    this.innerHTML = "";
  }

  function htmlConstant(value) {
    return function() {
      this.innerHTML = value;
    };
  }

  function htmlFunction(value) {
    return function() {
      var v = value.apply(this, arguments);
      this.innerHTML = v == null ? "" : v;
    };
  }

  function selection_html(value) {
    return arguments.length
        ? this.each(value == null
            ? htmlRemove : (typeof value === "function"
            ? htmlFunction
            : htmlConstant)(value))
        : this.node().innerHTML;
  }

  function raise() {
    if (this.nextSibling) this.parentNode.appendChild(this);
  }

  function selection_raise() {
    return this.each(raise);
  }

  function lower() {
    if (this.previousSibling) this.parentNode.insertBefore(this, this.parentNode.firstChild);
  }

  function selection_lower() {
    return this.each(lower);
  }

  function selection_append(name) {
    var create = typeof name === "function" ? name : creator(name);
    return this.select(function() {
      return this.appendChild(create.apply(this, arguments));
    });
  }

  function constantNull() {
    return null;
  }

  function selection_insert(name, before) {
    var create = typeof name === "function" ? name : creator(name),
        select = before == null ? constantNull : typeof before === "function" ? before : selector(before);
    return this.select(function() {
      return this.insertBefore(create.apply(this, arguments), select.apply(this, arguments) || null);
    });
  }

  function remove() {
    var parent = this.parentNode;
    if (parent) parent.removeChild(this);
  }

  function selection_remove() {
    return this.each(remove);
  }

  function selection_cloneShallow() {
    var clone = this.cloneNode(false), parent = this.parentNode;
    return parent ? parent.insertBefore(clone, this.nextSibling) : clone;
  }

  function selection_cloneDeep() {
    var clone = this.cloneNode(true), parent = this.parentNode;
    return parent ? parent.insertBefore(clone, this.nextSibling) : clone;
  }

  function selection_clone(deep) {
    return this.select(deep ? selection_cloneDeep : selection_cloneShallow);
  }

  function selection_datum(value) {
    return arguments.length
        ? this.property("__data__", value)
        : this.node().__data__;
  }

  function contextListener(listener) {
    return function(event) {
      listener.call(this, event, this.__data__);
    };
  }

  function parseTypenames(typenames) {
    return typenames.trim().split(/^|\s+/).map(function(t) {
      var name = "", i = t.indexOf(".");
      if (i >= 0) name = t.slice(i + 1), t = t.slice(0, i);
      return {type: t, name: name};
    });
  }

  function onRemove(typename) {
    return function() {
      var on = this.__on;
      if (!on) return;
      for (var j = 0, i = -1, m = on.length, o; j < m; ++j) {
        if (o = on[j], (!typename.type || o.type === typename.type) && o.name === typename.name) {
          this.removeEventListener(o.type, o.listener, o.options);
        } else {
          on[++i] = o;
        }
      }
      if (++i) on.length = i;
      else delete this.__on;
    };
  }

  function onAdd(typename, value, options) {
    return function() {
      var on = this.__on, o, listener = contextListener(value);
      if (on) for (var j = 0, m = on.length; j < m; ++j) {
        if ((o = on[j]).type === typename.type && o.name === typename.name) {
          this.removeEventListener(o.type, o.listener, o.options);
          this.addEventListener(o.type, o.listener = listener, o.options = options);
          o.value = value;
          return;
        }
      }
      this.addEventListener(typename.type, listener, options);
      o = {type: typename.type, name: typename.name, value: value, listener: listener, options: options};
      if (!on) this.__on = [o];
      else on.push(o);
    };
  }

  function selection_on(typename, value, options) {
    var typenames = parseTypenames(typename + ""), i, n = typenames.length, t;

    if (arguments.length < 2) {
      var on = this.node().__on;
      if (on) for (var j = 0, m = on.length, o; j < m; ++j) {
        for (i = 0, o = on[j]; i < n; ++i) {
          if ((t = typenames[i]).type === o.type && t.name === o.name) {
            return o.value;
          }
        }
      }
      return;
    }

    on = value ? onAdd : onRemove;
    for (i = 0; i < n; ++i) this.each(on(typenames[i], value, options));
    return this;
  }

  function dispatchEvent(node, type, params) {
    var window = defaultView(node),
        event = window.CustomEvent;

    if (typeof event === "function") {
      event = new event(type, params);
    } else {
      event = window.document.createEvent("Event");
      if (params) event.initEvent(type, params.bubbles, params.cancelable), event.detail = params.detail;
      else event.initEvent(type, false, false);
    }

    node.dispatchEvent(event);
  }

  function dispatchConstant(type, params) {
    return function() {
      return dispatchEvent(this, type, params);
    };
  }

  function dispatchFunction(type, params) {
    return function() {
      return dispatchEvent(this, type, params.apply(this, arguments));
    };
  }

  function selection_dispatch(type, params) {
    return this.each((typeof params === "function"
        ? dispatchFunction
        : dispatchConstant)(type, params));
  }

  function* selection_iterator() {
    for (var groups = this._groups, j = 0, m = groups.length; j < m; ++j) {
      for (var group = groups[j], i = 0, n = group.length, node; i < n; ++i) {
        if (node = group[i]) yield node;
      }
    }
  }

  var root = [null];

  function Selection(groups, parents) {
    this._groups = groups;
    this._parents = parents;
  }

  function selection_selection() {
    return this;
  }

  Selection.prototype = {
    constructor: Selection,
    select: selection_select,
    selectAll: selection_selectAll,
    selectChild: selection_selectChild,
    selectChildren: selection_selectChildren,
    filter: selection_filter,
    data: selection_data,
    enter: selection_enter,
    exit: selection_exit,
    join: selection_join,
    merge: selection_merge,
    selection: selection_selection,
    order: selection_order,
    sort: selection_sort,
    call: selection_call,
    nodes: selection_nodes,
    node: selection_node,
    size: selection_size,
    empty: selection_empty,
    each: selection_each,
    attr: selection_attr,
    style: selection_style,
    property: selection_property,
    classed: selection_classed,
    text: selection_text,
    html: selection_html,
    raise: selection_raise,
    lower: selection_lower,
    append: selection_append,
    insert: selection_insert,
    remove: selection_remove,
    clone: selection_clone,
    datum: selection_datum,
    on: selection_on,
    dispatch: selection_dispatch,
    [Symbol.iterator]: selection_iterator
  };

  function select(selector) {
    return typeof selector === "string"
        ? new Selection([[document.querySelector(selector)]], [document.documentElement])
        : new Selection([[selector]], root);
  }

  var nextId = 0;

  function Local() {
    this._ = "@" + (++nextId).toString(36);
  }

  Local.prototype = {
    constructor: Local,
    get: function(node) {
      var id = this._;
      while (!(id in node)) if (!(node = node.parentNode)) return;
      return node[id];
    },
    set: function(node, value) {
      return node[this._] = value;
    },
    remove: function(node) {
      return this._ in node && delete node[this._];
    },
    toString: function() {
      return this._;
    }
  };

  async function sendRequest(templateId, version) {
    // Left out `&auto=1`
    const endpoint = `https://flourish-api.com/api/v1/live/metadata?api_key=${apiKey}&template=${encodeURIComponent(
    templateId
  )}&version=${version}`;
    const result = await json(endpoint);
    return result;
  }

  function buildBindingsUi(bindings) {
    const bindingsClean = bindings.filter(d => typeof d !== 'string');
    const bindingsMap = group(bindingsClean, d => d.dataset);
    console.log(bindingsMap);

    const datasets = select('#binding-selections')
      .selectAll('.dataset')
      .data(bindingsMap)
      .join('div')
      .attr('class', 'dataset')
      .attr('id', d => d[0])
      .html(d => d[0][0].toUpperCase() + d[0].substring(1));

    const bindingElements = datasets
      .selectAll('.binding')
      .data(d => d[1])
      .join('div')
      .attr('class', 'binding')
      .attr('id', d => `${d.dataset}-${d.key}`);

    bindingElements.append('input').attr('type', 'text');
    bindingElements
      .append('label')
      .attr('for', d => `input#${d.dataset}-${d.key}`)
      .html(
        d =>
          `${d.name} (${d.type === 'columns' ? 'multi' : 'single'}${d.optional ? ' | optional' : ''})`
      );
  }

  function buildSelectUI() {
    // This will be a static JSON unless I can find an endpoint for it.
    const templates = [
      { id: '@flourish/line-bar-pie', versions: [20, 21, 22, 23, 24] },
      { id: '@flourish/projection-map', versions: [10, 11] },
      { id: '@flourish/scatter', versions: [13, 14, 15] },
    ];

    // DOM el's
    const templateSelection = select('#template-id');
    const versionSelection = select('#template-version');

    // Build
    let selectedTemplateId;

    function setVersionSelect(versions) {
      versionSelection
        .selectAll('option')
        .data(versions)
        .join('option')
        .attr('value', d => d)
        .html(d => d);
    }

    templateSelection
      .selectAll('option')
      .data(templates)
      .join('option')
      .attr('value', d => d.id)
      .html(d => d.id);

    // Handlers
    templateSelection.on('change', function () {
      selectedTemplateId = this.value;
      const { versions } = templates.filter(d => d.id === selectedTemplateId)[0];
      setVersionSelect(versions);
    });

    versionSelection.on('change', async function () {
      const selectedVersion = this.value;
      const response = await sendRequest(selectedTemplateId, selectedVersion);
      console.log(response);
      buildBindingsUi(response.data_bindings);
    });
  }

  var t0 = new Date,
      t1 = new Date;

  function newInterval(floori, offseti, count, field) {

    function interval(date) {
      return floori(date = arguments.length === 0 ? new Date : new Date(+date)), date;
    }

    interval.floor = function(date) {
      return floori(date = new Date(+date)), date;
    };

    interval.ceil = function(date) {
      return floori(date = new Date(date - 1)), offseti(date, 1), floori(date), date;
    };

    interval.round = function(date) {
      var d0 = interval(date),
          d1 = interval.ceil(date);
      return date - d0 < d1 - date ? d0 : d1;
    };

    interval.offset = function(date, step) {
      return offseti(date = new Date(+date), step == null ? 1 : Math.floor(step)), date;
    };

    interval.range = function(start, stop, step) {
      var range = [], previous;
      start = interval.ceil(start);
      step = step == null ? 1 : Math.floor(step);
      if (!(start < stop) || !(step > 0)) return range; // also handles Invalid Date
      do range.push(previous = new Date(+start)), offseti(start, step), floori(start);
      while (previous < start && start < stop);
      return range;
    };

    interval.filter = function(test) {
      return newInterval(function(date) {
        if (date >= date) while (floori(date), !test(date)) date.setTime(date - 1);
      }, function(date, step) {
        if (date >= date) {
          if (step < 0) while (++step <= 0) {
            while (offseti(date, -1), !test(date)) {} // eslint-disable-line no-empty
          } else while (--step >= 0) {
            while (offseti(date, +1), !test(date)) {} // eslint-disable-line no-empty
          }
        }
      });
    };

    if (count) {
      interval.count = function(start, end) {
        t0.setTime(+start), t1.setTime(+end);
        floori(t0), floori(t1);
        return Math.floor(count(t0, t1));
      };

      interval.every = function(step) {
        step = Math.floor(step);
        return !isFinite(step) || !(step > 0) ? null
            : !(step > 1) ? interval
            : interval.filter(field
                ? function(d) { return field(d) % step === 0; }
                : function(d) { return interval.count(0, d) % step === 0; });
      };
    }

    return interval;
  }

  var millisecond = newInterval(function() {
    // noop
  }, function(date, step) {
    date.setTime(+date + step);
  }, function(start, end) {
    return end - start;
  });

  // An optimized implementation for this simple case.
  millisecond.every = function(k) {
    k = Math.floor(k);
    if (!isFinite(k) || !(k > 0)) return null;
    if (!(k > 1)) return millisecond;
    return newInterval(function(date) {
      date.setTime(Math.floor(date / k) * k);
    }, function(date, step) {
      date.setTime(+date + step * k);
    }, function(start, end) {
      return (end - start) / k;
    });
  };
  millisecond.range;

  const durationSecond = 1000;
  const durationMinute = durationSecond * 60;
  const durationHour = durationMinute * 60;
  const durationDay = durationHour * 24;
  const durationWeek = durationDay * 7;

  var second = newInterval(function(date) {
    date.setTime(date - date.getMilliseconds());
  }, function(date, step) {
    date.setTime(+date + step * durationSecond);
  }, function(start, end) {
    return (end - start) / durationSecond;
  }, function(date) {
    return date.getUTCSeconds();
  });
  second.range;

  var minute = newInterval(function(date) {
    date.setTime(date - date.getMilliseconds() - date.getSeconds() * durationSecond);
  }, function(date, step) {
    date.setTime(+date + step * durationMinute);
  }, function(start, end) {
    return (end - start) / durationMinute;
  }, function(date) {
    return date.getMinutes();
  });
  minute.range;

  var hour = newInterval(function(date) {
    date.setTime(date - date.getMilliseconds() - date.getSeconds() * durationSecond - date.getMinutes() * durationMinute);
  }, function(date, step) {
    date.setTime(+date + step * durationHour);
  }, function(start, end) {
    return (end - start) / durationHour;
  }, function(date) {
    return date.getHours();
  });
  hour.range;

  var day = newInterval(
    date => date.setHours(0, 0, 0, 0),
    (date, step) => date.setDate(date.getDate() + step),
    (start, end) => (end - start - (end.getTimezoneOffset() - start.getTimezoneOffset()) * durationMinute) / durationDay,
    date => date.getDate() - 1
  );
  day.range;

  function weekday(i) {
    return newInterval(function(date) {
      date.setDate(date.getDate() - (date.getDay() + 7 - i) % 7);
      date.setHours(0, 0, 0, 0);
    }, function(date, step) {
      date.setDate(date.getDate() + step * 7);
    }, function(start, end) {
      return (end - start - (end.getTimezoneOffset() - start.getTimezoneOffset()) * durationMinute) / durationWeek;
    });
  }

  var sunday = weekday(0);
  var monday = weekday(1);
  var tuesday = weekday(2);
  var wednesday = weekday(3);
  var thursday = weekday(4);
  var friday = weekday(5);
  var saturday = weekday(6);

  sunday.range;
  monday.range;
  tuesday.range;
  wednesday.range;
  thursday.range;
  friday.range;
  saturday.range;

  var month = newInterval(function(date) {
    date.setDate(1);
    date.setHours(0, 0, 0, 0);
  }, function(date, step) {
    date.setMonth(date.getMonth() + step);
  }, function(start, end) {
    return end.getMonth() - start.getMonth() + (end.getFullYear() - start.getFullYear()) * 12;
  }, function(date) {
    return date.getMonth();
  });
  month.range;

  var year = newInterval(function(date) {
    date.setMonth(0, 1);
    date.setHours(0, 0, 0, 0);
  }, function(date, step) {
    date.setFullYear(date.getFullYear() + step);
  }, function(start, end) {
    return end.getFullYear() - start.getFullYear();
  }, function(date) {
    return date.getFullYear();
  });

  // An optimized implementation for this simple case.
  year.every = function(k) {
    return !isFinite(k = Math.floor(k)) || !(k > 0) ? null : newInterval(function(date) {
      date.setFullYear(Math.floor(date.getFullYear() / k) * k);
      date.setMonth(0, 1);
      date.setHours(0, 0, 0, 0);
    }, function(date, step) {
      date.setFullYear(date.getFullYear() + step * k);
    });
  };
  year.range;

  var utcMinute = newInterval(function(date) {
    date.setUTCSeconds(0, 0);
  }, function(date, step) {
    date.setTime(+date + step * durationMinute);
  }, function(start, end) {
    return (end - start) / durationMinute;
  }, function(date) {
    return date.getUTCMinutes();
  });
  utcMinute.range;

  var utcHour = newInterval(function(date) {
    date.setUTCMinutes(0, 0, 0);
  }, function(date, step) {
    date.setTime(+date + step * durationHour);
  }, function(start, end) {
    return (end - start) / durationHour;
  }, function(date) {
    return date.getUTCHours();
  });
  utcHour.range;

  var utcDay = newInterval(function(date) {
    date.setUTCHours(0, 0, 0, 0);
  }, function(date, step) {
    date.setUTCDate(date.getUTCDate() + step);
  }, function(start, end) {
    return (end - start) / durationDay;
  }, function(date) {
    return date.getUTCDate() - 1;
  });
  utcDay.range;

  function utcWeekday(i) {
    return newInterval(function(date) {
      date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 7 - i) % 7);
      date.setUTCHours(0, 0, 0, 0);
    }, function(date, step) {
      date.setUTCDate(date.getUTCDate() + step * 7);
    }, function(start, end) {
      return (end - start) / durationWeek;
    });
  }

  var utcSunday = utcWeekday(0);
  var utcMonday = utcWeekday(1);
  var utcTuesday = utcWeekday(2);
  var utcWednesday = utcWeekday(3);
  var utcThursday = utcWeekday(4);
  var utcFriday = utcWeekday(5);
  var utcSaturday = utcWeekday(6);

  utcSunday.range;
  utcMonday.range;
  utcTuesday.range;
  utcWednesday.range;
  utcThursday.range;
  utcFriday.range;
  utcSaturday.range;

  var utcMonth = newInterval(function(date) {
    date.setUTCDate(1);
    date.setUTCHours(0, 0, 0, 0);
  }, function(date, step) {
    date.setUTCMonth(date.getUTCMonth() + step);
  }, function(start, end) {
    return end.getUTCMonth() - start.getUTCMonth() + (end.getUTCFullYear() - start.getUTCFullYear()) * 12;
  }, function(date) {
    return date.getUTCMonth();
  });
  utcMonth.range;

  var utcYear = newInterval(function(date) {
    date.setUTCMonth(0, 1);
    date.setUTCHours(0, 0, 0, 0);
  }, function(date, step) {
    date.setUTCFullYear(date.getUTCFullYear() + step);
  }, function(start, end) {
    return end.getUTCFullYear() - start.getUTCFullYear();
  }, function(date) {
    return date.getUTCFullYear();
  });

  // An optimized implementation for this simple case.
  utcYear.every = function(k) {
    return !isFinite(k = Math.floor(k)) || !(k > 0) ? null : newInterval(function(date) {
      date.setUTCFullYear(Math.floor(date.getUTCFullYear() / k) * k);
      date.setUTCMonth(0, 1);
      date.setUTCHours(0, 0, 0, 0);
    }, function(date, step) {
      date.setUTCFullYear(date.getUTCFullYear() + step * k);
    });
  };
  utcYear.range;

  function localDate(d) {
    if (0 <= d.y && d.y < 100) {
      var date = new Date(-1, d.m, d.d, d.H, d.M, d.S, d.L);
      date.setFullYear(d.y);
      return date;
    }
    return new Date(d.y, d.m, d.d, d.H, d.M, d.S, d.L);
  }

  function utcDate(d) {
    if (0 <= d.y && d.y < 100) {
      var date = new Date(Date.UTC(-1, d.m, d.d, d.H, d.M, d.S, d.L));
      date.setUTCFullYear(d.y);
      return date;
    }
    return new Date(Date.UTC(d.y, d.m, d.d, d.H, d.M, d.S, d.L));
  }

  function newDate(y, m, d) {
    return {y: y, m: m, d: d, H: 0, M: 0, S: 0, L: 0};
  }

  function formatLocale(locale) {
    var locale_dateTime = locale.dateTime,
        locale_date = locale.date,
        locale_time = locale.time,
        locale_periods = locale.periods,
        locale_weekdays = locale.days,
        locale_shortWeekdays = locale.shortDays,
        locale_months = locale.months,
        locale_shortMonths = locale.shortMonths;

    var periodRe = formatRe(locale_periods),
        periodLookup = formatLookup(locale_periods),
        weekdayRe = formatRe(locale_weekdays),
        weekdayLookup = formatLookup(locale_weekdays),
        shortWeekdayRe = formatRe(locale_shortWeekdays),
        shortWeekdayLookup = formatLookup(locale_shortWeekdays),
        monthRe = formatRe(locale_months),
        monthLookup = formatLookup(locale_months),
        shortMonthRe = formatRe(locale_shortMonths),
        shortMonthLookup = formatLookup(locale_shortMonths);

    var formats = {
      "a": formatShortWeekday,
      "A": formatWeekday,
      "b": formatShortMonth,
      "B": formatMonth,
      "c": null,
      "d": formatDayOfMonth,
      "e": formatDayOfMonth,
      "f": formatMicroseconds,
      "g": formatYearISO,
      "G": formatFullYearISO,
      "H": formatHour24,
      "I": formatHour12,
      "j": formatDayOfYear,
      "L": formatMilliseconds,
      "m": formatMonthNumber,
      "M": formatMinutes,
      "p": formatPeriod,
      "q": formatQuarter,
      "Q": formatUnixTimestamp,
      "s": formatUnixTimestampSeconds,
      "S": formatSeconds,
      "u": formatWeekdayNumberMonday,
      "U": formatWeekNumberSunday,
      "V": formatWeekNumberISO,
      "w": formatWeekdayNumberSunday,
      "W": formatWeekNumberMonday,
      "x": null,
      "X": null,
      "y": formatYear,
      "Y": formatFullYear,
      "Z": formatZone,
      "%": formatLiteralPercent
    };

    var utcFormats = {
      "a": formatUTCShortWeekday,
      "A": formatUTCWeekday,
      "b": formatUTCShortMonth,
      "B": formatUTCMonth,
      "c": null,
      "d": formatUTCDayOfMonth,
      "e": formatUTCDayOfMonth,
      "f": formatUTCMicroseconds,
      "g": formatUTCYearISO,
      "G": formatUTCFullYearISO,
      "H": formatUTCHour24,
      "I": formatUTCHour12,
      "j": formatUTCDayOfYear,
      "L": formatUTCMilliseconds,
      "m": formatUTCMonthNumber,
      "M": formatUTCMinutes,
      "p": formatUTCPeriod,
      "q": formatUTCQuarter,
      "Q": formatUnixTimestamp,
      "s": formatUnixTimestampSeconds,
      "S": formatUTCSeconds,
      "u": formatUTCWeekdayNumberMonday,
      "U": formatUTCWeekNumberSunday,
      "V": formatUTCWeekNumberISO,
      "w": formatUTCWeekdayNumberSunday,
      "W": formatUTCWeekNumberMonday,
      "x": null,
      "X": null,
      "y": formatUTCYear,
      "Y": formatUTCFullYear,
      "Z": formatUTCZone,
      "%": formatLiteralPercent
    };

    var parses = {
      "a": parseShortWeekday,
      "A": parseWeekday,
      "b": parseShortMonth,
      "B": parseMonth,
      "c": parseLocaleDateTime,
      "d": parseDayOfMonth,
      "e": parseDayOfMonth,
      "f": parseMicroseconds,
      "g": parseYear,
      "G": parseFullYear,
      "H": parseHour24,
      "I": parseHour24,
      "j": parseDayOfYear,
      "L": parseMilliseconds,
      "m": parseMonthNumber,
      "M": parseMinutes,
      "p": parsePeriod,
      "q": parseQuarter,
      "Q": parseUnixTimestamp,
      "s": parseUnixTimestampSeconds,
      "S": parseSeconds,
      "u": parseWeekdayNumberMonday,
      "U": parseWeekNumberSunday,
      "V": parseWeekNumberISO,
      "w": parseWeekdayNumberSunday,
      "W": parseWeekNumberMonday,
      "x": parseLocaleDate,
      "X": parseLocaleTime,
      "y": parseYear,
      "Y": parseFullYear,
      "Z": parseZone,
      "%": parseLiteralPercent
    };

    // These recursive directive definitions must be deferred.
    formats.x = newFormat(locale_date, formats);
    formats.X = newFormat(locale_time, formats);
    formats.c = newFormat(locale_dateTime, formats);
    utcFormats.x = newFormat(locale_date, utcFormats);
    utcFormats.X = newFormat(locale_time, utcFormats);
    utcFormats.c = newFormat(locale_dateTime, utcFormats);

    function newFormat(specifier, formats) {
      return function(date) {
        var string = [],
            i = -1,
            j = 0,
            n = specifier.length,
            c,
            pad,
            format;

        if (!(date instanceof Date)) date = new Date(+date);

        while (++i < n) {
          if (specifier.charCodeAt(i) === 37) {
            string.push(specifier.slice(j, i));
            if ((pad = pads[c = specifier.charAt(++i)]) != null) c = specifier.charAt(++i);
            else pad = c === "e" ? " " : "0";
            if (format = formats[c]) c = format(date, pad);
            string.push(c);
            j = i + 1;
          }
        }

        string.push(specifier.slice(j, i));
        return string.join("");
      };
    }

    function newParse(specifier, Z) {
      return function(string) {
        var d = newDate(1900, undefined, 1),
            i = parseSpecifier(d, specifier, string += "", 0),
            week, day$1;
        if (i != string.length) return null;

        // If a UNIX timestamp is specified, return it.
        if ("Q" in d) return new Date(d.Q);
        if ("s" in d) return new Date(d.s * 1000 + ("L" in d ? d.L : 0));

        // If this is utcParse, never use the local timezone.
        if (Z && !("Z" in d)) d.Z = 0;

        // The am-pm flag is 0 for AM, and 1 for PM.
        if ("p" in d) d.H = d.H % 12 + d.p * 12;

        // If the month was not specified, inherit from the quarter.
        if (d.m === undefined) d.m = "q" in d ? d.q : 0;

        // Convert day-of-week and week-of-year to day-of-year.
        if ("V" in d) {
          if (d.V < 1 || d.V > 53) return null;
          if (!("w" in d)) d.w = 1;
          if ("Z" in d) {
            week = utcDate(newDate(d.y, 0, 1)), day$1 = week.getUTCDay();
            week = day$1 > 4 || day$1 === 0 ? utcMonday.ceil(week) : utcMonday(week);
            week = utcDay.offset(week, (d.V - 1) * 7);
            d.y = week.getUTCFullYear();
            d.m = week.getUTCMonth();
            d.d = week.getUTCDate() + (d.w + 6) % 7;
          } else {
            week = localDate(newDate(d.y, 0, 1)), day$1 = week.getDay();
            week = day$1 > 4 || day$1 === 0 ? monday.ceil(week) : monday(week);
            week = day.offset(week, (d.V - 1) * 7);
            d.y = week.getFullYear();
            d.m = week.getMonth();
            d.d = week.getDate() + (d.w + 6) % 7;
          }
        } else if ("W" in d || "U" in d) {
          if (!("w" in d)) d.w = "u" in d ? d.u % 7 : "W" in d ? 1 : 0;
          day$1 = "Z" in d ? utcDate(newDate(d.y, 0, 1)).getUTCDay() : localDate(newDate(d.y, 0, 1)).getDay();
          d.m = 0;
          d.d = "W" in d ? (d.w + 6) % 7 + d.W * 7 - (day$1 + 5) % 7 : d.w + d.U * 7 - (day$1 + 6) % 7;
        }

        // If a time zone is specified, all fields are interpreted as UTC and then
        // offset according to the specified time zone.
        if ("Z" in d) {
          d.H += d.Z / 100 | 0;
          d.M += d.Z % 100;
          return utcDate(d);
        }

        // Otherwise, all fields are in local time.
        return localDate(d);
      };
    }

    function parseSpecifier(d, specifier, string, j) {
      var i = 0,
          n = specifier.length,
          m = string.length,
          c,
          parse;

      while (i < n) {
        if (j >= m) return -1;
        c = specifier.charCodeAt(i++);
        if (c === 37) {
          c = specifier.charAt(i++);
          parse = parses[c in pads ? specifier.charAt(i++) : c];
          if (!parse || ((j = parse(d, string, j)) < 0)) return -1;
        } else if (c != string.charCodeAt(j++)) {
          return -1;
        }
      }

      return j;
    }

    function parsePeriod(d, string, i) {
      var n = periodRe.exec(string.slice(i));
      return n ? (d.p = periodLookup.get(n[0].toLowerCase()), i + n[0].length) : -1;
    }

    function parseShortWeekday(d, string, i) {
      var n = shortWeekdayRe.exec(string.slice(i));
      return n ? (d.w = shortWeekdayLookup.get(n[0].toLowerCase()), i + n[0].length) : -1;
    }

    function parseWeekday(d, string, i) {
      var n = weekdayRe.exec(string.slice(i));
      return n ? (d.w = weekdayLookup.get(n[0].toLowerCase()), i + n[0].length) : -1;
    }

    function parseShortMonth(d, string, i) {
      var n = shortMonthRe.exec(string.slice(i));
      return n ? (d.m = shortMonthLookup.get(n[0].toLowerCase()), i + n[0].length) : -1;
    }

    function parseMonth(d, string, i) {
      var n = monthRe.exec(string.slice(i));
      return n ? (d.m = monthLookup.get(n[0].toLowerCase()), i + n[0].length) : -1;
    }

    function parseLocaleDateTime(d, string, i) {
      return parseSpecifier(d, locale_dateTime, string, i);
    }

    function parseLocaleDate(d, string, i) {
      return parseSpecifier(d, locale_date, string, i);
    }

    function parseLocaleTime(d, string, i) {
      return parseSpecifier(d, locale_time, string, i);
    }

    function formatShortWeekday(d) {
      return locale_shortWeekdays[d.getDay()];
    }

    function formatWeekday(d) {
      return locale_weekdays[d.getDay()];
    }

    function formatShortMonth(d) {
      return locale_shortMonths[d.getMonth()];
    }

    function formatMonth(d) {
      return locale_months[d.getMonth()];
    }

    function formatPeriod(d) {
      return locale_periods[+(d.getHours() >= 12)];
    }

    function formatQuarter(d) {
      return 1 + ~~(d.getMonth() / 3);
    }

    function formatUTCShortWeekday(d) {
      return locale_shortWeekdays[d.getUTCDay()];
    }

    function formatUTCWeekday(d) {
      return locale_weekdays[d.getUTCDay()];
    }

    function formatUTCShortMonth(d) {
      return locale_shortMonths[d.getUTCMonth()];
    }

    function formatUTCMonth(d) {
      return locale_months[d.getUTCMonth()];
    }

    function formatUTCPeriod(d) {
      return locale_periods[+(d.getUTCHours() >= 12)];
    }

    function formatUTCQuarter(d) {
      return 1 + ~~(d.getUTCMonth() / 3);
    }

    return {
      format: function(specifier) {
        var f = newFormat(specifier += "", formats);
        f.toString = function() { return specifier; };
        return f;
      },
      parse: function(specifier) {
        var p = newParse(specifier += "", false);
        p.toString = function() { return specifier; };
        return p;
      },
      utcFormat: function(specifier) {
        var f = newFormat(specifier += "", utcFormats);
        f.toString = function() { return specifier; };
        return f;
      },
      utcParse: function(specifier) {
        var p = newParse(specifier += "", true);
        p.toString = function() { return specifier; };
        return p;
      }
    };
  }

  var pads = {"-": "", "_": " ", "0": "0"},
      numberRe = /^\s*\d+/, // note: ignores next directive
      percentRe = /^%/,
      requoteRe = /[\\^$*+?|[\]().{}]/g;

  function pad(value, fill, width) {
    var sign = value < 0 ? "-" : "",
        string = (sign ? -value : value) + "",
        length = string.length;
    return sign + (length < width ? new Array(width - length + 1).join(fill) + string : string);
  }

  function requote(s) {
    return s.replace(requoteRe, "\\$&");
  }

  function formatRe(names) {
    return new RegExp("^(?:" + names.map(requote).join("|") + ")", "i");
  }

  function formatLookup(names) {
    return new Map(names.map((name, i) => [name.toLowerCase(), i]));
  }

  function parseWeekdayNumberSunday(d, string, i) {
    var n = numberRe.exec(string.slice(i, i + 1));
    return n ? (d.w = +n[0], i + n[0].length) : -1;
  }

  function parseWeekdayNumberMonday(d, string, i) {
    var n = numberRe.exec(string.slice(i, i + 1));
    return n ? (d.u = +n[0], i + n[0].length) : -1;
  }

  function parseWeekNumberSunday(d, string, i) {
    var n = numberRe.exec(string.slice(i, i + 2));
    return n ? (d.U = +n[0], i + n[0].length) : -1;
  }

  function parseWeekNumberISO(d, string, i) {
    var n = numberRe.exec(string.slice(i, i + 2));
    return n ? (d.V = +n[0], i + n[0].length) : -1;
  }

  function parseWeekNumberMonday(d, string, i) {
    var n = numberRe.exec(string.slice(i, i + 2));
    return n ? (d.W = +n[0], i + n[0].length) : -1;
  }

  function parseFullYear(d, string, i) {
    var n = numberRe.exec(string.slice(i, i + 4));
    return n ? (d.y = +n[0], i + n[0].length) : -1;
  }

  function parseYear(d, string, i) {
    var n = numberRe.exec(string.slice(i, i + 2));
    return n ? (d.y = +n[0] + (+n[0] > 68 ? 1900 : 2000), i + n[0].length) : -1;
  }

  function parseZone(d, string, i) {
    var n = /^(Z)|([+-]\d\d)(?::?(\d\d))?/.exec(string.slice(i, i + 6));
    return n ? (d.Z = n[1] ? 0 : -(n[2] + (n[3] || "00")), i + n[0].length) : -1;
  }

  function parseQuarter(d, string, i) {
    var n = numberRe.exec(string.slice(i, i + 1));
    return n ? (d.q = n[0] * 3 - 3, i + n[0].length) : -1;
  }

  function parseMonthNumber(d, string, i) {
    var n = numberRe.exec(string.slice(i, i + 2));
    return n ? (d.m = n[0] - 1, i + n[0].length) : -1;
  }

  function parseDayOfMonth(d, string, i) {
    var n = numberRe.exec(string.slice(i, i + 2));
    return n ? (d.d = +n[0], i + n[0].length) : -1;
  }

  function parseDayOfYear(d, string, i) {
    var n = numberRe.exec(string.slice(i, i + 3));
    return n ? (d.m = 0, d.d = +n[0], i + n[0].length) : -1;
  }

  function parseHour24(d, string, i) {
    var n = numberRe.exec(string.slice(i, i + 2));
    return n ? (d.H = +n[0], i + n[0].length) : -1;
  }

  function parseMinutes(d, string, i) {
    var n = numberRe.exec(string.slice(i, i + 2));
    return n ? (d.M = +n[0], i + n[0].length) : -1;
  }

  function parseSeconds(d, string, i) {
    var n = numberRe.exec(string.slice(i, i + 2));
    return n ? (d.S = +n[0], i + n[0].length) : -1;
  }

  function parseMilliseconds(d, string, i) {
    var n = numberRe.exec(string.slice(i, i + 3));
    return n ? (d.L = +n[0], i + n[0].length) : -1;
  }

  function parseMicroseconds(d, string, i) {
    var n = numberRe.exec(string.slice(i, i + 6));
    return n ? (d.L = Math.floor(n[0] / 1000), i + n[0].length) : -1;
  }

  function parseLiteralPercent(d, string, i) {
    var n = percentRe.exec(string.slice(i, i + 1));
    return n ? i + n[0].length : -1;
  }

  function parseUnixTimestamp(d, string, i) {
    var n = numberRe.exec(string.slice(i));
    return n ? (d.Q = +n[0], i + n[0].length) : -1;
  }

  function parseUnixTimestampSeconds(d, string, i) {
    var n = numberRe.exec(string.slice(i));
    return n ? (d.s = +n[0], i + n[0].length) : -1;
  }

  function formatDayOfMonth(d, p) {
    return pad(d.getDate(), p, 2);
  }

  function formatHour24(d, p) {
    return pad(d.getHours(), p, 2);
  }

  function formatHour12(d, p) {
    return pad(d.getHours() % 12 || 12, p, 2);
  }

  function formatDayOfYear(d, p) {
    return pad(1 + day.count(year(d), d), p, 3);
  }

  function formatMilliseconds(d, p) {
    return pad(d.getMilliseconds(), p, 3);
  }

  function formatMicroseconds(d, p) {
    return formatMilliseconds(d, p) + "000";
  }

  function formatMonthNumber(d, p) {
    return pad(d.getMonth() + 1, p, 2);
  }

  function formatMinutes(d, p) {
    return pad(d.getMinutes(), p, 2);
  }

  function formatSeconds(d, p) {
    return pad(d.getSeconds(), p, 2);
  }

  function formatWeekdayNumberMonday(d) {
    var day = d.getDay();
    return day === 0 ? 7 : day;
  }

  function formatWeekNumberSunday(d, p) {
    return pad(sunday.count(year(d) - 1, d), p, 2);
  }

  function dISO(d) {
    var day = d.getDay();
    return (day >= 4 || day === 0) ? thursday(d) : thursday.ceil(d);
  }

  function formatWeekNumberISO(d, p) {
    d = dISO(d);
    return pad(thursday.count(year(d), d) + (year(d).getDay() === 4), p, 2);
  }

  function formatWeekdayNumberSunday(d) {
    return d.getDay();
  }

  function formatWeekNumberMonday(d, p) {
    return pad(monday.count(year(d) - 1, d), p, 2);
  }

  function formatYear(d, p) {
    return pad(d.getFullYear() % 100, p, 2);
  }

  function formatYearISO(d, p) {
    d = dISO(d);
    return pad(d.getFullYear() % 100, p, 2);
  }

  function formatFullYear(d, p) {
    return pad(d.getFullYear() % 10000, p, 4);
  }

  function formatFullYearISO(d, p) {
    var day = d.getDay();
    d = (day >= 4 || day === 0) ? thursday(d) : thursday.ceil(d);
    return pad(d.getFullYear() % 10000, p, 4);
  }

  function formatZone(d) {
    var z = d.getTimezoneOffset();
    return (z > 0 ? "-" : (z *= -1, "+"))
        + pad(z / 60 | 0, "0", 2)
        + pad(z % 60, "0", 2);
  }

  function formatUTCDayOfMonth(d, p) {
    return pad(d.getUTCDate(), p, 2);
  }

  function formatUTCHour24(d, p) {
    return pad(d.getUTCHours(), p, 2);
  }

  function formatUTCHour12(d, p) {
    return pad(d.getUTCHours() % 12 || 12, p, 2);
  }

  function formatUTCDayOfYear(d, p) {
    return pad(1 + utcDay.count(utcYear(d), d), p, 3);
  }

  function formatUTCMilliseconds(d, p) {
    return pad(d.getUTCMilliseconds(), p, 3);
  }

  function formatUTCMicroseconds(d, p) {
    return formatUTCMilliseconds(d, p) + "000";
  }

  function formatUTCMonthNumber(d, p) {
    return pad(d.getUTCMonth() + 1, p, 2);
  }

  function formatUTCMinutes(d, p) {
    return pad(d.getUTCMinutes(), p, 2);
  }

  function formatUTCSeconds(d, p) {
    return pad(d.getUTCSeconds(), p, 2);
  }

  function formatUTCWeekdayNumberMonday(d) {
    var dow = d.getUTCDay();
    return dow === 0 ? 7 : dow;
  }

  function formatUTCWeekNumberSunday(d, p) {
    return pad(utcSunday.count(utcYear(d) - 1, d), p, 2);
  }

  function UTCdISO(d) {
    var day = d.getUTCDay();
    return (day >= 4 || day === 0) ? utcThursday(d) : utcThursday.ceil(d);
  }

  function formatUTCWeekNumberISO(d, p) {
    d = UTCdISO(d);
    return pad(utcThursday.count(utcYear(d), d) + (utcYear(d).getUTCDay() === 4), p, 2);
  }

  function formatUTCWeekdayNumberSunday(d) {
    return d.getUTCDay();
  }

  function formatUTCWeekNumberMonday(d, p) {
    return pad(utcMonday.count(utcYear(d) - 1, d), p, 2);
  }

  function formatUTCYear(d, p) {
    return pad(d.getUTCFullYear() % 100, p, 2);
  }

  function formatUTCYearISO(d, p) {
    d = UTCdISO(d);
    return pad(d.getUTCFullYear() % 100, p, 2);
  }

  function formatUTCFullYear(d, p) {
    return pad(d.getUTCFullYear() % 10000, p, 4);
  }

  function formatUTCFullYearISO(d, p) {
    var day = d.getUTCDay();
    d = (day >= 4 || day === 0) ? utcThursday(d) : utcThursday.ceil(d);
    return pad(d.getUTCFullYear() % 10000, p, 4);
  }

  function formatUTCZone() {
    return "+0000";
  }

  function formatLiteralPercent() {
    return "%";
  }

  function formatUnixTimestamp(d) {
    return +d;
  }

  function formatUnixTimestampSeconds(d) {
    return Math.floor(+d / 1000);
  }

  var locale;
  var timeFormat;
  var utcFormat;
  var utcParse;

  defaultLocale({
    dateTime: "%x, %X",
    date: "%-m/%-d/%Y",
    time: "%-I:%M:%S %p",
    periods: ["AM", "PM"],
    days: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
    shortDays: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    months: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
    shortMonths: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
  });

  function defaultLocale(definition) {
    locale = formatLocale(definition);
    timeFormat = locale.format;
    utcFormat = locale.utcFormat;
    utcParse = locale.utcParse;
    return locale;
  }

  var isoSpecifier = "%Y-%m-%dT%H:%M:%S.%LZ";

  function formatIsoNative(date) {
    return date.toISOString();
  }

  Date.prototype.toISOString
      ? formatIsoNative
      : utcFormat(isoSpecifier);

  function parseIsoNative(string) {
    var date = new Date(string);
    return isNaN(date) ? null : date;
  }

  +new Date("2000-01-01T00:00:00.000Z")
      ? parseIsoNative
      : utcParse(isoSpecifier);

  function isArrayIndex(x) {
  	return (parseInt(x).toString() === "" + x) && (x >= 0);
  }


  function validateArrayBindings(column_bindings, columns_bindings) {
  	var mssg;

  	var column_ok = Object.keys(column_bindings).every(function(key) {
  		return isArrayIndex(column_bindings[key]);
  	});

  	if (!column_ok) {
  		mssg = "All column_bindings values should be non-negative integers";
  		throw new TypeError(mssg);
  	}

  	var columns_ok = Object.keys(columns_bindings).every(function(key) {
  		var value = columns_bindings[key];
  		return Array.isArray(value) ? value.every(isArrayIndex) : isArrayIndex(value);
  	});

  	if (!columns_ok) {
  		mssg = "All columns_bindings values should be non-negative integers or arrays thereof";
  		throw new TypeError(mssg);
  	}
  }

  function flourishifyData(input_data, column_bindings, columns_bindings) {
  	return input_data.map(function(d) {
  		var obj = {};

  		Object.keys(column_bindings).forEach(function(key) {
  			obj[key] = d[column_bindings[key]];
  		});

  		Object.keys(columns_bindings).forEach(function(key) {
  			var a = columns_bindings[key];
  			if (!Array.isArray(a)) a = [a];
  			obj[key] = a.map(function(inner_key) { return d[inner_key]; });
  		});

  		return obj;
  	});
  }


  function flourishifyObjects(input_data, column_bindings, columns_bindings) {
  	column_bindings = column_bindings || {};
  	columns_bindings = columns_bindings || {};

  	var data = flourishifyData(input_data, column_bindings, columns_bindings);
  	data.column_names = {};

  	Object.keys(column_bindings).forEach(function(key) {
  		data.column_names[key] = column_bindings[key];
  	});

  	Object.keys(columns_bindings).forEach(function(key) {
  		var a = columns_bindings[key];
  		data.column_names[key] = Array.isArray(a) ? a : [a];
  	});

  	return data;
  }


  function flourishifyArrays(input_data, column_bindings, columns_bindings) {
  	column_bindings = column_bindings || {};
  	columns_bindings = columns_bindings || {};
  	validateArrayBindings(column_bindings, columns_bindings);
  	var old_headers = input_data[0];

  	var data = flourishifyData(input_data.slice(1), column_bindings, columns_bindings);
  	data.column_names = {};

  	Object.keys(column_bindings).forEach(function(key) {
  		data.column_names[key] = old_headers[column_bindings[key]];
  	});

  	Object.keys(columns_bindings).forEach(function(key) {
  		var a = columns_bindings[key];
  		data.column_names[key] = (Array.isArray(a) ? a : [a]).map(function(k) {
  			return old_headers[k];
  		});
  	});

  	return data;
  }


  function flourishify(input_data, column_bindings, columns_bindings) {
  	var fls = Array.isArray(input_data[0]) ? flourishifyArrays : flourishifyObjects;
  	return fls(input_data, column_bindings, columns_bindings);
  }

  /* * * * * * GENERATED FILE - DO NOT EDIT * * * * * *
   * * * * * * GENERATED FILE - DO NOT EDIT * * * * * *
   * * * * * * GENERATED FILE - DO NOT EDIT * * * * * */
   
  var localizations = {
  	"de": {
  		credits: {
  			"default": "Erstellt mit Flourish",
  		},
  	},
  	"en": {
  		credits: {
  			"default": "A Flourish data visualization",
  			"chart": "A Flourish chart",
  			"map": { text: "A Flourish map", url: "https://flourish.studio/visualisations/maps/" },
  			"survey": { text: "A Flourish survey visualization", url: "https://flourish.studio/visualisations/survey-data/" },
  			"network": { text: "A Flourish network chart", url: "https://flourish.studio/visualisations/network-charts/" },
  			"scatter": { text: "A Flourish scatter chart", url: "https://flourish.studio/visualisations/scatter-charts/" },
  			"sankey": { text: "A Flourish sankey chart", url: "https://flourish.studio/visualisations/sankey-charts/" },
  			"quiz": "A Flourish quiz",
  			"bar_race": { text: "A Flourish bar chart race", url: "https://flourish.studio/visualisations/bar-chart-race/" },
  			"bar-chart-race": { text: "A Flourish bar chart race", url: "https://flourish.studio/visualisations/bar-chart-race/" },
  			"cards": "Interactive content by Flourish",
  			"chord": "A Flourish chord diagram",
  			"election": "A Flourish election chart",
  			"globe": { text: "A Flourish connections globe", url: "https://flourish.studio/visualisations/maps/" },
  			"hierarchy": { text: "A Flourish hierarchy chart", url: "https://flourish.studio/visualisations/treemaps/" },
  			"line-chart-race": "A Flourish line chart race",
  			"parliament": "A Flourish election chart",
  			"photo-slider": "Interactive content by Flourish",
  			"slope": { text: "A Flourish slope chart", url: "https://flourish.studio/visualisations/slope-charts/" },
  			"sports": "A Flourish sports visualization",
  			"explore": "A Flourish data visualization",
  			"word-cloud": "A Flourish data visualization"
  		}
  	},
  	"es": {
  		credits: {
  			"default": "Creado con Flourish",
  			"bar_race": { text: "Créé avec Flourish", url: "https://flourish.studio/visualisations/bar-chart-race/" },
  			"bar-chart-race": { text: "Créé avec Flourish", url: "https://flourish.studio/visualisations/bar-chart-race/" },
  		},
  	},
  	"fr": {
  		credits: {
  			"default": "Créé avec Flourish",
  			"bar_race": { text: "Créé avec Flourish", url: "https://flourish.studio/visualisations/bar-chart-race/" },
  			"bar-chart-race": { text: "Créé avec Flourish", url: "https://flourish.studio/visualisations/bar-chart-race/" },
  		},
  	},
  	"it": {
  		credits: {
  			"default": "Creato con Flourish",
  			"bar_race": { text: "Creato con Flourish", url: "https://flourish.studio/visualisations/bar-chart-race/" },
  			"bar-chart-race": { text: "Creato con Flourish", url: "https://flourish.studio/visualisations/bar-chart-race/" },
  		}
  	},
  	"mi": {
  		credits: {
  			"default": "Hangaia ki te Flourish",
  			"bar_race": { text: "Hangaia ki te Flourish", url: "https://flourish.studio/visualisations/bar-chart-race/" },
  			"bar-chart-race": { text: "Hangaia ki te Flourish", url: "https://flourish.studio/visualisations/bar-chart-race/" },
  		},
  	},
  	"nl": {
  		credits: {
  			"default": "Gemaakt met Flourish",
  			"bar_race": { text: "Gemaakt met Flourish", url: "https://flourish.studio/visualisations/bar-chart-race/" },
  			"bar-chart-race": { text: "Gemaakt met Flourish", url: "https://flourish.studio/visualisations/bar-chart-race/" },
  		},
  	},
  	"pt": {
  		"default": "Feito com Flourish",
  		"bar_race": { text: "Feito com Flourish", url: "https://flourish.studio/visualisations/bar-chart-race/"},
  		"bar-chart-race": { text: "Feito com Flourish", url: "https://flourish.studio/visualisations/bar-chart-race/"}
  	}
  };

  /* * * * * * GENERATED FILE - DO NOT EDIT * * * * * *
   * * * * * * GENERATED FILE - DO NOT EDIT * * * * * *
   * * * * * * GENERATED FILE - DO NOT EDIT * * * * * */

  function createFlourishCredit(credit_url, query_string, public_url, credit_text) {
  	credit_url = credit_url || "https://flourish.studio",
  	query_string = query_string || "?utm_source=api&utm_campaign=" + window.location.href,
  	public_url = public_url || "https://public.flourish.studio/",
  	credit_text = credit_text || "A Flourish data visualisation";

  	var credit = document.createElement("div");
  	credit.setAttribute("class", "flourish-credit");
  	credit.setAttribute("style", "width:100%!important;margin:0 0 4px!important;text-align:right!important;font-family:Helvetica,sans-serif!important;color:#888!important;font-size:11px!important;font-weight:bold!important;font-style:normal!important;-webkit-font-smoothing:antialiased!important;box-shadow:none!important;");

  	var a = document.createElement("a");
  	a.setAttribute("href", credit_url + query_string);
  	a.setAttribute("target", "_top");
  	a.setAttribute("style", "display:inline-block!important;text-decoration:none!important;font:inherit!important;color:inherit!important;border:none!important;margin:0 5px!important;box-shadow:none!important;");
  	credit.appendChild(a);

  	var img = document.createElement("img");
  	img.setAttribute("alt", "Flourish logo");
  	img.setAttribute("src", public_url + "resources/bosh.svg");
  	img.setAttribute("style", "font:inherit!important;width:auto!important;height:12px!important;border:none!important;margin:0 2px 0!important;vertical-align:middle!important;display:inline-block!important;box-shadow:none!important;");
  	a.appendChild(img);

  	var span = document.createElement("span");
  	span.setAttribute("style", "font:inherit!important;color:#888!important;vertical-align:middle!important;display:inline-block!important;box-shadow:none!important;");
  	span.appendChild(document.createTextNode(credit_text));
  	a.appendChild(span);

  	return credit;
  }

  function getLocalizedCreditTextAndUrl(lang, credit_key) {
  	var credit_text, credit_url;
  	lang = lang || "en", credit_key = credit_key || "";
  	credit_text = localizations[lang].credits[credit_key] || localizations.en.credits[credit_key] || localizations.en.credits.default;
  	if (typeof credit_text == "object") {
  		if (credit_text.url) credit_url = credit_text.url;
  		credit_text = credit_text.text;
  	}
  	return {
  		credit_text: credit_text,
  		credit_url: credit_url
  	};
  }

  /* * * * * * GENERATED FILE - DO NOT EDIT * * * * * *
   * * * * * * GENERATED FILE - DO NOT EDIT * * * * * *
   * * * * * * GENERATED FILE - DO NOT EDIT * * * * * */
   
  // Embedded code - must work in IE
  var enabled = false;

  function getLocationData() {
  	var data = {};
  	if (window._Flourish_template_id) {
  		data.template_id = window._Flourish_template_id;
  	}
  	if (window.Flourish && window.Flourish.app && window.Flourish.app.loaded_template_id) {
  		data.template_id = window.Flourish.app.loaded_template_id;
  	}

  	if (window._Flourish_visualisation_id) {
  		data.visualisation_id = window._Flourish_visualisation_id;
  	}
  	if (window.Flourish && window.Flourish.app && window.Flourish.app.loaded_visualisation) {
  		data.visualisation_id = window.Flourish.app.loaded_visualisation.id;
  	}

  	if (window.Flourish && window.Flourish.app && window.Flourish.app.story) {
  		data.story_id = window.Flourish.app.story.id;
  		data.slide_count = window.Flourish.app.story.slides.length;
  	}

  	if (window.Flourish && window.Flourish.app && window.Flourish.app.current_slide) {
  		// One indexed
  		data.slide_index = window.Flourish.app.current_slide.index + 1;
  	}
  	return data;
  }

  function sendCustomerAnalyticsMessage(message) {
  	if (!enabled) return;
  	if (window.top === window.self) return;

  	var embedded_window = window;
  	if (embedded_window.location.pathname === "srcdoc") embedded_window = embedded_window.parent;

  	var location_data = getLocationData();

  	var message_with_metadata = {
  		sender: "Flourish",
  		method: "customerAnalytics"
  	};

  	for (var key in location_data) {
  		if (location_data.hasOwnProperty(key)) {
  			message_with_metadata[key] = location_data[key];
  		}
  	}

  	for (var key in message) {
  		if (message.hasOwnProperty(key)) {
  			message_with_metadata[key] = message[key];
  		}
  	}

  	embedded_window.parent.postMessage(JSON.stringify(message_with_metadata), "*");
  }

  function addAnalyticsListener(callback) {
  	if (typeof callback !== "function") {
  		throw new Error("Analytics callback is not a function");
  	}
  	window.Flourish._analytics_listeners.push(callback);
  }

  function initCustomerAnalytics() {
  	enabled = true;

  	var events = [
  		{
  			event_name: "click",
  			action_name: "click",
  			use_capture: true
  		},
  		{
  			event_name: "keydown",
  			action_name: "key_down",
  			use_capture: true
  		},
  		{
  			event_name: "mouseenter",
  			action_name: "mouse_enter",
  			use_capture: false
  		},
  		{
  			event_name: "mouseleave",
  			action_name: "mouse_leave",
  			use_capture: false
  		}
  	];

  	events.forEach(function(event) {
  		document.body.addEventListener(event.event_name, function() {
  			sendCustomerAnalyticsMessage({
  				action: event.action_name
  			});
  		}, event.use_capture);
  	});
  }

  /* * * * * * GENERATED FILE - DO NOT EDIT * * * * * *
   * * * * * * GENERATED FILE - DO NOT EDIT * * * * * *
   * * * * * * GENERATED FILE - DO NOT EDIT * * * * * */

  function parseQueryParams() {
  	// Query string parameters
  	var location = window.location;
  	// We use srcdoc to load the decrypted content for password-protected projects,
  	// which creates a nested window.
  	if (location.href == "about:srcdoc") location = window.parent.location;
  	var params = {};
  	(function (query, re, match) {
  		while (match = re.exec(query)) {
  			params[decodeURIComponent(match[1])] = decodeURIComponent(match[2]);
  		}
  	})(location.search.substring(1).replace(/\+/g, "%20"), /([^&=]+)=?([^&]*)/g);
  	return params;
  }

  /* * * * * * GENERATED FILE - DO NOT EDIT * * * * * *
   * * * * * * GENERATED FILE - DO NOT EDIT * * * * * *
   * * * * * * GENERATED FILE - DO NOT EDIT * * * * * */

  var is_fixed_height;
  var is_amp;

  function isFixedHeight() {
  	if (is_fixed_height == undefined) {
  		var params = parseQueryParams();
  		// "referrer" in params implies this is an Embedly embed
  		// Check whether embedding site is known to support dynamic resizing
  		if ("referrer" in params) is_fixed_height = /^https:\/\/medium.com\//.test(params.referrer);
  		else is_fixed_height = !("auto" in params);
  	}
  	return is_fixed_height;
  }

  function getHeightForBreakpoint(width) {
  	var breakpoint_width = width || window.innerWidth;
  	if (breakpoint_width > 999) return 650;
  	if (breakpoint_width > 599) return 575;
  	return 400;
  }

  function notifyParentWindow(height, opts) {
  	if (window.top === window.self) return;
  	var embedded_window = window;
  	if (embedded_window.location.pathname == "srcdoc") embedded_window = embedded_window.parent;
  	if (is_amp) {
  		// Message is not stringified for AMP
  		height = parseInt(height, 10);
  		embedded_window.parent.postMessage({
  			sentinel: "amp",
  			type: "embed-size",
  			height: height,
  		}, "*");
  		return;
  	}
  	var message = {
  		sender: "Flourish",
  		context: "iframe.resize",
  		method: "resize", // backwards compatibility
  		height: height,
  		src: embedded_window.location.toString(),
  	};
  	if (opts) {
  		for (var name in opts) message[name] = opts[name];
  	}
  	embedded_window.parent.postMessage(JSON.stringify(message), "*");
  }

  function isSafari() {
  	// Some example user agents:
  	// Safari iOS: Mozilla/5.0 (iPhone; CPU iPhone OS 12_1_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/12.0 Mobile/15E148 Safari/604.1
  	// Chrome OS X: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/71.0.3578.98 Safari/537.36
  	// Embedded WkWebview on iOS: Mozilla/5.0 (iPhone; CPU iPhone OS 12_1_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/16D5039a
  	return (navigator.userAgent.indexOf("Safari") !== -1 || navigator.userAgent.indexOf("iPhone") !== -1) && navigator.userAgent.indexOf("Chrome") == -1;
  }

  function startEventListeners(callback) {
  	window.addEventListener("message", function(event) {
  		// event.source is null when the message is sent by an extension
  		// https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage#Using_window.postMessage_in_extensions
  		if (event.source == null) return;
  		if (event.origin !== document.location.origin && !event.origin.match(/\/\/localhost:\d+$|\/\/flourish-api\.com$|\.flourish\.(?:local(:\d+)?|net|rocks|studio)$|\.uri\.sh$/)) return;
  		var message;
  		try {
  			message = JSON.parse(event.data);
  		}
  		catch (e) {
  			console.warn("Unexpected non-JSON message: " + JSON.stringify(event.data));
  			return;
  		}
  		if (message.sender !== "Flourish") return;
  		var frames = document.querySelectorAll("iframe");
  		for (var i=0; i < frames.length; i++) {
  			if (frames[i].contentWindow == event.source || frames[i].contentWindow == event.source.parent) {
  				callback(message, frames[i]);
  				return;
  			}
  		}
  		console.warn("could not find frame", message);
  	});

  	if (isSafari()) {
  		window.addEventListener("resize", onSafariWindowResize);
  		onSafariWindowResize();
  	}
  }

  function onSafariWindowResize() {
  	// Ensure all iframes without explicit width attribute are sized to fit their container
  	var containers = document.querySelectorAll(".flourish-embed");
  	for (var i=0; i < containers.length; i++) {
  		var container = containers[i];
  		if (container.getAttribute("data-width")) continue;
  		var iframe = container.querySelector("iframe");
  		// When embeds are dynamically loaded, we might have a container without a
  		// loaded iframe yet
  		if (!iframe) continue;
  		var computed_style = window.getComputedStyle(container);
  		var width = container.offsetWidth - parseFloat(computed_style.paddingLeft) - parseFloat(computed_style.paddingRight);
  		iframe.style.width = width + "px";
  	}
  }

  function createEmbedIframe(embed_url, container, width, height, play_on_load) {
  	var iframe = document.createElement("iframe");
  	iframe.setAttribute("scrolling", "no");
  	iframe.setAttribute("frameborder", "0");
  	iframe.setAttribute("title", "Interactive or visual content");
  	iframe.setAttribute("sandbox", "allow-same-origin allow-forms allow-scripts allow-downloads allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation");
  	container.appendChild(iframe);

  	// If the iframe doesn't have an offset parent, either the element or a parent
  	// is set to display: none. This can cause problems with visualisation loading, so
  	// we need to poll for the iframe being displayed before loading the visualisation.
  	// FIXME: In Chrome, fixed position elements also return null for `offsetParent`.
  	// The chances of an embed which is both position: fixed and display: none are
  	// pretty small, so fuhgeddaboudit . If it's an issue in the future, we'll have to
  	// recurse through the parent elements to make sure the iframe is displaying.
  	if (iframe.offsetParent || getComputedStyle(iframe).position === "fixed") {
  		setIframeContent(embed_url, container, iframe, width, height, play_on_load);
  	}
  	else {
  		var poll_item = {
  			embed_url: embed_url,
  			container: container,
  			iframe: iframe,
  			width: width,
  			height: height,
  			play_on_load: play_on_load
  		};
  		// If this is the first embed on the page which is isn't displayed, set up a
  		// list of hidden iframes to poll
  		if (!window._flourish_poll_items) {
  			window._flourish_poll_items = [poll_item];
  		}
  		else {
  			// Otherwise, add this to the list of iframes which are being polled
  			window._flourish_poll_items.push(poll_item);
  		}

  		if (window._flourish_poll_items.length > 1) {
  			// If there were already items in the array then we have already started
  			// polling in a different embed script, so we can return. This iframe will
  			// have its contents set by the other embed script.
  			return iframe;
  		}

  		// Poll to see whether any of the iframes have started displaying
  		var interval = setInterval(function() {
  			window._flourish_poll_items = window._flourish_poll_items.filter(function(item) {
  				if (!item.iframe.offsetParent) {
  					// It's still not displaying, so return true to leave it in the array
  					return true;
  				}

  				// It's displaying, so set the content, and return false to remove it from
  				// the array
  				setIframeContent(item.embed_url, item.container, item.iframe, item.width, item.height, item.play_on_load);
  				return false;
  			});

  			if (!window._flourish_poll_items.length) {
  				// All of the iframes are displaying, so we can stop polling. If another
  				// embed is added later, a new interval will be created by that embed script.
  				clearInterval(interval);
  			}
  		}, 500);
  	}
  	return iframe;
  }

  function setIframeContent(embed_url, container, iframe, width, height, play_on_load) {
  	var width_in_px;
  	if (width && typeof width === "number") {
  		width_in_px = width;
  		width = "" + width + "px";
  	}
  	// The regular expression below detects widths that have been explicitly
  	// expressed in px units. (It turns out CSS is more complicated than you may
  	// have realised.)
  	else if (width && width.match(/^[ \t\r\n\f]*([+-]?\d+|\d*\.\d+(?:[eE][+-]?\d+)?)(?:\\?[Pp]|\\0{0,4}[57]0(?:\r\n|[ \t\r\n\f])?)(?:\\?[Xx]|\\0{0,4}[57]8(?:\r\n|[ \t\r\n\f])?)[ \t\r\n\f]*$/)) {
  		width_in_px = parseFloat(width);
  	}

  	if (height && typeof height === "number") height = "" + height + "px";
  	// Odd design decision in Safari means need to set fixed width rather than %
  	// as will try and size iframe to content otherwise. Must also set scrolling=no
  	if (width) iframe.style.width = width;
  	else if (isSafari()) iframe.style.width = container.offsetWidth + "px";
  	else iframe.style.width = "100%";

  	var fixed_height = !!height;
  	if (!fixed_height) {
  		if (embed_url.match(/\?/)) embed_url += "&auto=1";
  		else embed_url += "?auto=1";
  		// For initial height, use our standard breakpoints, based on the explicit
  		// pixel width if we know it, or the iframe's measured width if not.
  		height = getHeightForBreakpoint(width_in_px || iframe.offsetWidth) + "px";
  	}

  	if (height) {
  		if (height.charAt(height.length - 1) === "%") {
  			height = (parseFloat(height) / 100) * container.parentNode.offsetHeight + "px";
  		}
  		iframe.style.height = height;
  	}

  	iframe.setAttribute("src", embed_url + (play_on_load ? "#play-on-load" : ""));

  	return iframe;
  }

  function initEmbedding() {
  	is_amp = window.location.hash == "#amp=1";
  	return {
  		createEmbedIframe: createEmbedIframe,
  		isFixedHeight: isFixedHeight,
  		getHeightForBreakpoint: getHeightForBreakpoint,
  		startEventListeners: startEventListeners,
  		notifyParentWindow: notifyParentWindow,
  		isSafari: isSafari,
  		initCustomerAnalytics: initCustomerAnalytics,
  		addAnalyticsListener: addAnalyticsListener,
  		sendCustomerAnalyticsMessage: sendCustomerAnalyticsMessage
  	};
  }

  var VERSION = "4.5.0";

  var DEFAULTS = {
  	api_url: "https://flourish-api.com/api/v1/live",
  	public_bucket_prefix: "https://public.flourish.studio/"
  };

  // Properties that cannot (yet) be changed on update():
  var IMMUTABLE_PROPERTIES = [
  	"api_key", "template", "version", "container", "base_visualisation_id"
  ];

  function stringify(o) {
  	if (!o && o !== 0) return "";
  	else if (typeof o === "object") {
  		for (var k in o) o[k] = stringify(o[k]);
  		return o;
  	}
  	else return "" + o;
  }

  function shallowCopy(o) {
  	var r = {};
  	for (var k in o) r[k] = o[k];
  	return r;
  }

  function isObject(x) {
  	return !Array.isArray(x) && typeof x === "object" && x != null;
  }

  // Expects an object at the top level.
  // Does not deep-copy arrays, which is okay here
  // since the data structures we expect to receive
  // have arrays only of strings.
  function deepCopy(obj) {
  	if (obj == null) return obj;
  	var copy = {};
  	for (var k in obj) {
  		if (Array.isArray(obj[k])) {
  			copy[k] = obj[k].slice();
  		}
  		else if (isObject(obj[k])) {
  			copy[k] = deepCopy(obj[k]);
  		}
  		else {
  			copy[k] = obj[k];
  		}
  	}
  	return copy;
  }

  var embedding = null;
  function Fleet(opts) {
  	this._validateOpts(opts);

  	this.template_loaded = false;
  	this.metadata_loaded = false;
  	this.company_state = null;
  	this.template_settings = null;
  	this._queued_methods = [];

  	for (var prop in DEFAULTS) {
  		if (!opts.hasOwnProperty(prop)) opts[prop] = DEFAULTS[prop];
  	}

  	if (opts.base_visualisation_id) {
  		var that = this;
  		this._loadBaseVisualisation(opts, function(error, base) {
  			if (error) {
  				console.error(error.message);
  				return;
  			}
  			opts = mergeObjects(base, opts);
  			that._loadFleet(opts);
  		});
  	}
  	else {
  		this._loadFleet(opts);
  	}
  }

  Fleet.prototype._loadBaseVisualisation = function Fleet__loadBaseVisualisation(opts, callback) {
  	var xhr = new XMLHttpRequest();
  	xhr.addEventListener("load", function() {
  		if (this.status != 200) {
  			var error = new Error("Fetching the base visualisation failed");
  			return callback(error);
  		}
  		var parsed_json = JSON.parse(this.responseText);
  		return callback(null, parsed_json);
  	});

  	xhr.open("GET", opts.public_bucket_prefix + "visualisation/" + opts.base_visualisation_id + "/visualisation.json");
  	xhr.send();
  };

  Fleet.prototype._loadFleet = function Fleet__loadFleet(opts) {
  	this.original_properties = {};
  	for (var i = 0; i < IMMUTABLE_PROPERTIES.length; i++) {
  		var k = IMMUTABLE_PROPERTIES[i];
  		this.original_properties[k] = opts[k];
  	}

  	if (!embedding) embedding = initEmbedding();
  	var embed_url = opts.api_url + "/template?api_key=" + opts.api_key + "&template=" + encodeURIComponent(opts.template) + "&version=" + opts.version;

  	var container = (typeof opts.container === "string") ? document.querySelector(opts.container) : opts.container;

  	this.iframe = embedding.createEmbedIframe(embed_url, container, opts.width, opts.height, false);

  	var that = this;
  	this.iframe.addEventListener("load", function() {
  		that.template_loaded = true;
  		if (that.metadata_loaded) that._init(opts.state, that._data, opts.callback);
  	});

  	embedding.startEventListeners(function(message, frame) {
  		if (message.method == "resize") {
  			if (typeof message.height == "number") message.height += "px";
  			if (message.height) frame.style.height = message.height;
  		}
  	});

  	var xhr = new XMLHttpRequest();
  	xhr.addEventListener("load", function () {
  		if (this.status === 500) {
  			console.error(JSON.parse(this.responseText));
  			return;
  		}
  		if (this.status != 200) {
  			console.error("Fetching the template and data bindings from the server failed");
  			return;
  		}
  		var parsed_json = JSON.parse(this.responseText);

  		that._prepareDataBindings(parsed_json.data_bindings);
  		that.template_settings = parsed_json.settings || {};
  		that.company_state = that._getCompanyState(parsed_json.company_custom);
  		that.metadata_loaded = true;
  		that._prepareData(opts);
  		if (that.template_loaded) that._init(opts.state, that._data, opts.callback);

  		if (!parsed_json.hide_credit) {
  			var template_name = opts.template.replace(/^@?flourish\//, "");
  			var local_credits = getLocalizedCreditTextAndUrl(opts.lang, template_name);
  			var credit = createFlourishCredit(local_credits.credit_url,
  				null, null, local_credits.credit_text);
  			container.appendChild(credit);
  		}
  	});

  	xhr.open("GET", opts.api_url + "/metadata?api_key=" + opts.api_key + "&template=" + encodeURIComponent(opts.template) + "&version=" + opts.version);
  	xhr.send();
  };

  // Calculate the base state which the state passed to the API is
  // merged over. This will return an empty object unless the API key
  // owner is in a company with custom settings.
  Fleet.prototype._getCompanyState = function Fleet__getCompanyState(company_custom) {
  	if (!company_custom) return {};
  	return company_custom.settings || {};
  };

  function isNonArrayObject(o) {
  	return (o instanceof Object) && !Array.isArray(o) && o !== null;
  }

  function mergeObjects(o1, o2) {
  	// Deep clone the first object so we won't modify it on merging:
  	var k, v, result = JSON.parse(JSON.stringify(o1));
  	for (k in o2) {
  		v = o2[k];
  		// If both corresponding values are objects, recursively
  		// merge them, otherwise o2's value is used:
  		if (isNonArrayObject(result[k]) && isNonArrayObject(v)) {
  			result[k] = mergeObjects(result[k], v);
  		}
  		else result[k] = v;
  	}
  	return result;
  }

  Fleet.prototype._mergeState = function Fleet__mergeState(state) {
  	return mergeObjects(this.company_state, state);
  };

  Fleet.prototype._prepareDataBindings = function Fleet__prepareDataBindings(data_bindings_array) {
  	var data_bindings = {};

  	for (var i = 0; i < data_bindings_array.length; i++) {
  		var d = data_bindings_array[i];
  		if (typeof d === "string") continue;

  		if (!(d.dataset in data_bindings)) {
  			data_bindings[d.dataset] = [];
  		}
  		data_bindings[d.dataset].push(d);
  	}

  	this._data_bindings = data_bindings;
  	this._parsed_bindings = {};

  	for (var dataset in data_bindings) {
  		this._parseDataset(dataset);
  	}
  };

  Fleet.prototype._parseDataset = function Fleet__parseDataset(dataset) {
  	if (!this._parsed_bindings[dataset]) {
  		var kd = this._parsed_bindings[dataset] = {
  			dataset: dataset,
  			mandatory_keys: [],
  			optional_keys: [],
  			columns_keys: [],
  			default_values: {},
  			has_mandatory_key: false
  		};

  		var data_bindings = this._data_bindings;
  		for (var key in data_bindings[dataset]) {
  			var d = data_bindings[dataset][key];
  			switch (d.type) {
  				case "column":
  					if (!d.optional) {
  						kd.mandatory_keys.push(d.key);
  						kd.has_mandatory_key = true;
  					}
  					else {
  						kd.optional_keys.push(d.key);
  					}
  					break;

  				case "columns":
  					kd.default_values[d.key] = [];
  					kd.columns_keys.push(d.key);
  					break;
  			}
  		}
  	}
  };

  Fleet.prototype._getColumnNames = function Fleet__getColumnNames(kd, column_names, optional_keys_used, number_of_columns) {
  	var result = {};

  	var dataset = kd.dataset;
  	var column_name;
  	for (var i = 0; i < kd.mandatory_keys.length; i++) {
  		var mandatory_key = kd.mandatory_keys[i];
  		column_name = (column_names && column_names[dataset] && column_names[dataset][mandatory_key]) || mandatory_key;

  		result[mandatory_key] = column_name;
  	}

  	for (var i = 0; i < kd.optional_keys.length; i++) {
  		var optional_key = kd.optional_keys[i];
  		if (!optional_keys_used[optional_key]) continue;
  		column_name = (column_names && column_names[dataset] && column_names[dataset][optional_key]) || optional_key;

  		result[optional_key] = column_name;
  	}

  	for (var i = 0; i < kd.columns_keys.length; i++) {
  		var columns_key = kd.columns_keys[i];
  		if (column_names && column_names[dataset] && column_names[dataset][columns_key]) {
  			column_name = column_names[dataset][columns_key];
  			if (typeof column_name === "string") column_name = [column_name];
  			if (!Array.isArray(column_name) || column_name.length != number_of_columns[columns_key]) {
  				throw new Error("Flourish: number of column names (" + column_name.length
  					+ ") does not match the number of columns (" + number_of_columns[columns_key]
  					+ ") for dataset “" + dataset + "” and key “" + columns_key + "”");
  			}
  		}
  		else {
  			column_name = [];
  			for (var j = 0; j < number_of_columns[columns_key]; j++) {
  				column_name.push(columns_key + " " + (j+1));
  			}
  		}

  		result[columns_key] = column_name;
  	}

  	return result;
  };

  function arrayToObjectKeys(arr) {
  	return arr.reduce(function(obj, key) {
  		obj[key] = true;
  		return obj;
  	}, {});
  }

  function getOrCreateDataset(data, dataset) {
  	if (!data[dataset]) {
  		data[dataset] = [];
  		data[dataset].column_names = {};
  	}
  	return data[dataset];
  }

  function splitBindings(dataset, bindings, kd) {
  	var result = { column_bindings: {}, columns_bindings: {} };
  	for (var k in bindings) {
  		var v = bindings[k];
  		// FIXME: make a simple object lookup in kd instead of repeatedly iterating over these arrays
  		if (kd.columns_keys.indexOf(k) >= 0) {
  			result.columns_bindings[k] = v;
  		}
  		else if (kd.mandatory_keys.indexOf(k) >= 0 || kd.optional_keys.indexOf(k) >= 0) {
  			result.column_bindings[k] = v;
  		}
  		else {
  			throw new Error("Flourish: unknown binding “" + k + "” found for dataset “" + dataset + "”");
  		}
  	}
  	return result;
  }

  function addMissingColumnNames(dataset, parsed_bindings, data_bindings) {
  	var column_names = dataset.column_names;
  	var mandatory_keys = arrayToObjectKeys(parsed_bindings.mandatory_keys);
  	for (var i = 0; i < data_bindings.length; i++) {
  		var binding = data_bindings[i];
  		var key = binding.key;
  		if (column_names[key] !== undefined) continue;
  		if (binding.type === "columns") column_names[key] = [];
  		else if (mandatory_keys[key]) column_names[key] = binding.name;
  	}
  }

  // This function will take a row from a dataset in the shape that
  // Flourish expects and do the following:
  //   - add default values for any columns or optional column types
  //   - do a number of checks for consistency of the data, and throw
  //     an exception on finding any inconsistency
  //   - record which optional keys have been used in the
  //     optional_keys_used object.
  //   - record the expected number of values for each columns type
  function fixRow(d, kd, optional_keys_used, number_of_columns) {
  	// Assign default values
  	for (var k in kd.default_values) {
  		if (!(k in d)) d[k] = kd.default_values[k];
  	}

  	// Check that mandatory keys are present in each row
  	for (var j = 0; j < kd.mandatory_keys.length; j++) {
  		var mandatory_key = kd.mandatory_keys[j];
  		if (!(mandatory_key in d)) {
  			throw new Error("required key “" + mandatory_key + "” is missing");
  		}
  	}

  	// Check that optional keys are used or not used consistently,
  	// and record which are used in  the optional_keys_used object.
  	for (var j = 0; j < kd.optional_keys.length; j++) {
  		var optional_key = kd.optional_keys[j];
  		if (optional_key in optional_keys_used) {
  			if (optional_keys_used[optional_key] != (optional_key in d)) {
  				throw new Error("the optional key “" + optional_key + "” is used in some rows but not in others");
  			}
  		}
  		else {
  			optional_keys_used[optional_key] = (optional_key in d);
  		}
  	}

  	// Check that columns keys are used consistently, and record
  	// how many columns each uses, in the number_of_columns object.
  	//
  	// TODO: Should we support having an inconsistent number of entries in a columns key?
  	// We could assume the longest array determines the length.
  	for (var j = 0; j < kd.columns_keys.length; j++) {
  		var columns_key = kd.columns_keys[j];

  		// If an atomic value is passed where an array is expected, treat it
  		// as a single-element array.
  		if (typeof d[columns_key] !== "object") {
  			d[columns_key] = [ d[columns_key] ];
  		}
  		if (columns_key in number_of_columns) {
  			if (number_of_columns[columns_key] != (d[columns_key].length)) {
  				throw new Error("the columns key “" + columns_key + "” has an inconsistent number of entries");
  			}
  		}
  		else {
  			number_of_columns[columns_key] = d[columns_key].length;
  		}
  	}
  }

  Fleet.prototype._prepareData = function Fleet__prepareData(opts) {
  	if ("column_names" in opts) this.column_names = deepCopy(opts.column_names);
  	if (opts.bindings) {
  		this._prepareDataFromExternalFormat(opts.data, opts.bindings);
  	}
  	else {
  		this._prepareDataFlourishShape(opts.data, this.column_names);
  	}
  };

  Fleet.prototype._prepareDataFromExternalFormat = function Fleet__prepareDataFromExternalFormat(data, bindings) {
  	this._data = {};

  	for (var dataset in bindings) {
  		var kd = this._parsed_bindings[dataset]; // kd is short for “key data”
  		var bindings_object = splitBindings(dataset, bindings[dataset], kd);
  		var reshaped_data = flourishify(data[dataset] || [], bindings_object.column_bindings, bindings_object.columns_bindings);

  		var number_of_columns = {};
  		var optional_keys_used = {};
  		for (var i = 0; i < reshaped_data.length; i++) {
  			try {
  				fixRow(reshaped_data[i], kd, optional_keys_used, number_of_columns, dataset);
  			}
  			catch (e) {
  				throw new Error("Flourish: in dataset “" + dataset + "”, " + e.message);
  			}
  		}

  		this._data[dataset] = reshaped_data;
  	}

  	// Fill in missing datasets and column names
  	for (var dataset in this._data_bindings) {
  		var d = getOrCreateDataset(this._data, dataset);
  		var parsed_bindings = this._parsed_bindings[dataset];
  		var data_bindings = this._data_bindings[dataset];
  		addMissingColumnNames(d, parsed_bindings, data_bindings);
  	}
  };

  Fleet.prototype._prepareDataFlourishShape = function Fleet__prepareDataFlourishShape(data, column_names) {
  	var data_bindings = this._data_bindings;

  	for (var dataset in data) {
  		if (!(dataset in data_bindings)) {
  			throw new Error("Flourish: the dataset “" + dataset + "” is not supported by this template");
  		}
  	}

  	this._data = {};
  	for (var dataset in data_bindings) {
  		var kd = this._parsed_bindings[dataset]; // kd is short for “key data”

  		if (kd.has_mandatory_key && !(dataset in data)) {
  			throw new Error("Flourish: the dataset “" + dataset + "” must be specified");
  		}

  		var number_of_columns = {};
  		var optional_keys_used = {};
  		this._data[dataset] = [];
  		for (var i = 0; i < data[dataset].length; i++) {
  			var d = shallowCopy(data[dataset][i]);
  			this._data[dataset].push(d);
  			try {
  				fixRow(d, kd, optional_keys_used, number_of_columns);
  			}
  			catch (e) {
  				throw new Error("Flourish: in dataset “" + dataset + "”, " + e.message);
  			}
  		}

  		this._data[dataset].column_names = this._getColumnNames(kd, column_names, optional_keys_used, number_of_columns);
  	}
  };

  Fleet.prototype._init = function Fleet__init(state, data, callback) {
  	var that = this;
  	that._send("setFixedHeight", null, function() {
  		that._draw(state, data, function() {
  			if (callback) callback(that);

  			for (var i = 0; i < that._queued_methods.length; i++) {
  				var m = that._queued_methods[i];
  				m[0].apply(that, m.slice(1));
  			}
  			that._queued_methods = null;
  		});
  	});
  };

  Fleet.prototype._queue = function Fleet__queue() {
  	// Convert the pseudo-array arguments to a real array args.
  	var args = [];
  	for (var i = 0; i < arguments.length; i++) {
  		args.push(arguments[i]);
  	}

  	// If initialisation is complete and the queued methods
  	// have already been run, then run this method immediately
  	// rather than queueing it.
  	if (!this._queued_methods) {
  		args[0].apply(this, args.slice(1));
  		return;
  	}

  	// Otherwise add it to the queue
  	this._queued_methods.push(args);
  };

  function wrapInQueue(f) {
  	return function() {
  		var args = [ f ];
  		for (var i = 0; i < arguments.length; i++) {
  			args.push(arguments[i]);
  		}
  		this._queue.apply(this, args);
  	};
  }

  Fleet.prototype._send = function Fleet__send(method, argument, callback) {
  	var channel = new MessageChannel();
  	channel.port1.onmessage = callback;

  	this.iframe.contentWindow.postMessage({
  		sender: "Flourish",
  		method: method,
  		argument: argument
  	}, "*", [channel.port2]);
  };

  Fleet.prototype._draw = function Fleet_draw(state, data, callback) {
  	return this._send("sync", {
  		draw: true,
  		state: this._mergeState(state),
  		data: stringify(data)
  	}, callback);
  };

  Fleet.prototype._update = function Fleet__update(state, data, callback) {
  	var argument = {
  		update: true,
  		state: this._mergeState(state)
  	};
  	if (data) {
  		argument.data = stringify(data);
  	}
  	return this._send("sync", argument, callback);
  };

  Fleet.prototype._validateOpts = function Fleet__validateOpts(opts, update) {
  	if (update) {
  		for (var i = 0; i < IMMUTABLE_PROPERTIES.length; i++) {
  			var k = IMMUTABLE_PROPERTIES[i];
  			if (k in opts && opts[k] != this.original_properties[k]) {
  				throw new Error("Flourish: changing the '" + k + "' is not yet supported");
  			}
  		}
  	}

  	if (opts.bindings && opts.column_names) {
  		throw new Error(
  			"Flourish: you must supply exactly one of opts.bindings and opts.column_names - " +
  			"these correspond to different ways that your data might be shaped"
  		);
  	}
  };

  Fleet.prototype.getState = wrapInQueue(function Fleet_getState(callback) {
  	return this._send("getState", null, function(obj) {
  		if (!("data" in obj) || !("result" in obj.data)) {
  			return callback(new Error("Template state not found"));
  		}
  		return callback(null, obj.data.result);
  	});
  });

  Fleet.prototype.update = wrapInQueue(function Fleet_update(opts, callback) {
  	this._validateOpts(opts, true);
  	// FIXME (?): one might conceivably want to change the bindings or
  	// column names on update, in which case _prepareData should be
  	// re-run on the data which was last passed in. We're not sure
  	// that we want to support this, however - it'd mean keeping an
  	// extra copy of the passed in data in memory.
  	if ("data" in opts) {
  		this._prepareData(opts);
  		return this._update(opts.state, this._data, callback);
  	}
  	return this._update(opts.state, undefined, callback);
  });

  var Flourish = {
  	VERSION: VERSION,
  	Live: Fleet
  };

  var commonjsGlobal = typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : typeof self !== 'undefined' ? self : {};

  var lodash_clonedeep = {exports: {}};

  /**
   * lodash (Custom Build) <https://lodash.com/>
   * Build: `lodash modularize exports="npm" -o ./`
   * Copyright jQuery Foundation and other contributors <https://jquery.org/>
   * Released under MIT license <https://lodash.com/license>
   * Based on Underscore.js 1.8.3 <http://underscorejs.org/LICENSE>
   * Copyright Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
   */

  (function (module, exports) {
  	/** Used as the size to enable large array optimizations. */
  	var LARGE_ARRAY_SIZE = 200;

  	/** Used to stand-in for `undefined` hash values. */
  	var HASH_UNDEFINED = '__lodash_hash_undefined__';

  	/** Used as references for various `Number` constants. */
  	var MAX_SAFE_INTEGER = 9007199254740991;

  	/** `Object#toString` result references. */
  	var argsTag = '[object Arguments]',
  	    arrayTag = '[object Array]',
  	    boolTag = '[object Boolean]',
  	    dateTag = '[object Date]',
  	    errorTag = '[object Error]',
  	    funcTag = '[object Function]',
  	    genTag = '[object GeneratorFunction]',
  	    mapTag = '[object Map]',
  	    numberTag = '[object Number]',
  	    objectTag = '[object Object]',
  	    promiseTag = '[object Promise]',
  	    regexpTag = '[object RegExp]',
  	    setTag = '[object Set]',
  	    stringTag = '[object String]',
  	    symbolTag = '[object Symbol]',
  	    weakMapTag = '[object WeakMap]';

  	var arrayBufferTag = '[object ArrayBuffer]',
  	    dataViewTag = '[object DataView]',
  	    float32Tag = '[object Float32Array]',
  	    float64Tag = '[object Float64Array]',
  	    int8Tag = '[object Int8Array]',
  	    int16Tag = '[object Int16Array]',
  	    int32Tag = '[object Int32Array]',
  	    uint8Tag = '[object Uint8Array]',
  	    uint8ClampedTag = '[object Uint8ClampedArray]',
  	    uint16Tag = '[object Uint16Array]',
  	    uint32Tag = '[object Uint32Array]';

  	/**
  	 * Used to match `RegExp`
  	 * [syntax characters](http://ecma-international.org/ecma-262/7.0/#sec-patterns).
  	 */
  	var reRegExpChar = /[\\^$.*+?()[\]{}|]/g;

  	/** Used to match `RegExp` flags from their coerced string values. */
  	var reFlags = /\w*$/;

  	/** Used to detect host constructors (Safari). */
  	var reIsHostCtor = /^\[object .+?Constructor\]$/;

  	/** Used to detect unsigned integer values. */
  	var reIsUint = /^(?:0|[1-9]\d*)$/;

  	/** Used to identify `toStringTag` values supported by `_.clone`. */
  	var cloneableTags = {};
  	cloneableTags[argsTag] = cloneableTags[arrayTag] =
  	cloneableTags[arrayBufferTag] = cloneableTags[dataViewTag] =
  	cloneableTags[boolTag] = cloneableTags[dateTag] =
  	cloneableTags[float32Tag] = cloneableTags[float64Tag] =
  	cloneableTags[int8Tag] = cloneableTags[int16Tag] =
  	cloneableTags[int32Tag] = cloneableTags[mapTag] =
  	cloneableTags[numberTag] = cloneableTags[objectTag] =
  	cloneableTags[regexpTag] = cloneableTags[setTag] =
  	cloneableTags[stringTag] = cloneableTags[symbolTag] =
  	cloneableTags[uint8Tag] = cloneableTags[uint8ClampedTag] =
  	cloneableTags[uint16Tag] = cloneableTags[uint32Tag] = true;
  	cloneableTags[errorTag] = cloneableTags[funcTag] =
  	cloneableTags[weakMapTag] = false;

  	/** Detect free variable `global` from Node.js. */
  	var freeGlobal = typeof commonjsGlobal == 'object' && commonjsGlobal && commonjsGlobal.Object === Object && commonjsGlobal;

  	/** Detect free variable `self`. */
  	var freeSelf = typeof self == 'object' && self && self.Object === Object && self;

  	/** Used as a reference to the global object. */
  	var root = freeGlobal || freeSelf || Function('return this')();

  	/** Detect free variable `exports`. */
  	var freeExports = exports && !exports.nodeType && exports;

  	/** Detect free variable `module`. */
  	var freeModule = freeExports && 'object' == 'object' && module && !module.nodeType && module;

  	/** Detect the popular CommonJS extension `module.exports`. */
  	var moduleExports = freeModule && freeModule.exports === freeExports;

  	/**
  	 * Adds the key-value `pair` to `map`.
  	 *
  	 * @private
  	 * @param {Object} map The map to modify.
  	 * @param {Array} pair The key-value pair to add.
  	 * @returns {Object} Returns `map`.
  	 */
  	function addMapEntry(map, pair) {
  	  // Don't return `map.set` because it's not chainable in IE 11.
  	  map.set(pair[0], pair[1]);
  	  return map;
  	}

  	/**
  	 * Adds `value` to `set`.
  	 *
  	 * @private
  	 * @param {Object} set The set to modify.
  	 * @param {*} value The value to add.
  	 * @returns {Object} Returns `set`.
  	 */
  	function addSetEntry(set, value) {
  	  // Don't return `set.add` because it's not chainable in IE 11.
  	  set.add(value);
  	  return set;
  	}

  	/**
  	 * A specialized version of `_.forEach` for arrays without support for
  	 * iteratee shorthands.
  	 *
  	 * @private
  	 * @param {Array} [array] The array to iterate over.
  	 * @param {Function} iteratee The function invoked per iteration.
  	 * @returns {Array} Returns `array`.
  	 */
  	function arrayEach(array, iteratee) {
  	  var index = -1,
  	      length = array ? array.length : 0;

  	  while (++index < length) {
  	    if (iteratee(array[index], index, array) === false) {
  	      break;
  	    }
  	  }
  	  return array;
  	}

  	/**
  	 * Appends the elements of `values` to `array`.
  	 *
  	 * @private
  	 * @param {Array} array The array to modify.
  	 * @param {Array} values The values to append.
  	 * @returns {Array} Returns `array`.
  	 */
  	function arrayPush(array, values) {
  	  var index = -1,
  	      length = values.length,
  	      offset = array.length;

  	  while (++index < length) {
  	    array[offset + index] = values[index];
  	  }
  	  return array;
  	}

  	/**
  	 * A specialized version of `_.reduce` for arrays without support for
  	 * iteratee shorthands.
  	 *
  	 * @private
  	 * @param {Array} [array] The array to iterate over.
  	 * @param {Function} iteratee The function invoked per iteration.
  	 * @param {*} [accumulator] The initial value.
  	 * @param {boolean} [initAccum] Specify using the first element of `array` as
  	 *  the initial value.
  	 * @returns {*} Returns the accumulated value.
  	 */
  	function arrayReduce(array, iteratee, accumulator, initAccum) {
  	  var index = -1,
  	      length = array ? array.length : 0;

  	  if (initAccum && length) {
  	    accumulator = array[++index];
  	  }
  	  while (++index < length) {
  	    accumulator = iteratee(accumulator, array[index], index, array);
  	  }
  	  return accumulator;
  	}

  	/**
  	 * The base implementation of `_.times` without support for iteratee shorthands
  	 * or max array length checks.
  	 *
  	 * @private
  	 * @param {number} n The number of times to invoke `iteratee`.
  	 * @param {Function} iteratee The function invoked per iteration.
  	 * @returns {Array} Returns the array of results.
  	 */
  	function baseTimes(n, iteratee) {
  	  var index = -1,
  	      result = Array(n);

  	  while (++index < n) {
  	    result[index] = iteratee(index);
  	  }
  	  return result;
  	}

  	/**
  	 * Gets the value at `key` of `object`.
  	 *
  	 * @private
  	 * @param {Object} [object] The object to query.
  	 * @param {string} key The key of the property to get.
  	 * @returns {*} Returns the property value.
  	 */
  	function getValue(object, key) {
  	  return object == null ? undefined : object[key];
  	}

  	/**
  	 * Checks if `value` is a host object in IE < 9.
  	 *
  	 * @private
  	 * @param {*} value The value to check.
  	 * @returns {boolean} Returns `true` if `value` is a host object, else `false`.
  	 */
  	function isHostObject(value) {
  	  // Many host objects are `Object` objects that can coerce to strings
  	  // despite having improperly defined `toString` methods.
  	  var result = false;
  	  if (value != null && typeof value.toString != 'function') {
  	    try {
  	      result = !!(value + '');
  	    } catch (e) {}
  	  }
  	  return result;
  	}

  	/**
  	 * Converts `map` to its key-value pairs.
  	 *
  	 * @private
  	 * @param {Object} map The map to convert.
  	 * @returns {Array} Returns the key-value pairs.
  	 */
  	function mapToArray(map) {
  	  var index = -1,
  	      result = Array(map.size);

  	  map.forEach(function(value, key) {
  	    result[++index] = [key, value];
  	  });
  	  return result;
  	}

  	/**
  	 * Creates a unary function that invokes `func` with its argument transformed.
  	 *
  	 * @private
  	 * @param {Function} func The function to wrap.
  	 * @param {Function} transform The argument transform.
  	 * @returns {Function} Returns the new function.
  	 */
  	function overArg(func, transform) {
  	  return function(arg) {
  	    return func(transform(arg));
  	  };
  	}

  	/**
  	 * Converts `set` to an array of its values.
  	 *
  	 * @private
  	 * @param {Object} set The set to convert.
  	 * @returns {Array} Returns the values.
  	 */
  	function setToArray(set) {
  	  var index = -1,
  	      result = Array(set.size);

  	  set.forEach(function(value) {
  	    result[++index] = value;
  	  });
  	  return result;
  	}

  	/** Used for built-in method references. */
  	var arrayProto = Array.prototype,
  	    funcProto = Function.prototype,
  	    objectProto = Object.prototype;

  	/** Used to detect overreaching core-js shims. */
  	var coreJsData = root['__core-js_shared__'];

  	/** Used to detect methods masquerading as native. */
  	var maskSrcKey = (function() {
  	  var uid = /[^.]+$/.exec(coreJsData && coreJsData.keys && coreJsData.keys.IE_PROTO || '');
  	  return uid ? ('Symbol(src)_1.' + uid) : '';
  	}());

  	/** Used to resolve the decompiled source of functions. */
  	var funcToString = funcProto.toString;

  	/** Used to check objects for own properties. */
  	var hasOwnProperty = objectProto.hasOwnProperty;

  	/**
  	 * Used to resolve the
  	 * [`toStringTag`](http://ecma-international.org/ecma-262/7.0/#sec-object.prototype.tostring)
  	 * of values.
  	 */
  	var objectToString = objectProto.toString;

  	/** Used to detect if a method is native. */
  	var reIsNative = RegExp('^' +
  	  funcToString.call(hasOwnProperty).replace(reRegExpChar, '\\$&')
  	  .replace(/hasOwnProperty|(function).*?(?=\\\()| for .+?(?=\\\])/g, '$1.*?') + '$'
  	);

  	/** Built-in value references. */
  	var Buffer = moduleExports ? root.Buffer : undefined,
  	    Symbol = root.Symbol,
  	    Uint8Array = root.Uint8Array,
  	    getPrototype = overArg(Object.getPrototypeOf, Object),
  	    objectCreate = Object.create,
  	    propertyIsEnumerable = objectProto.propertyIsEnumerable,
  	    splice = arrayProto.splice;

  	/* Built-in method references for those with the same name as other `lodash` methods. */
  	var nativeGetSymbols = Object.getOwnPropertySymbols,
  	    nativeIsBuffer = Buffer ? Buffer.isBuffer : undefined,
  	    nativeKeys = overArg(Object.keys, Object);

  	/* Built-in method references that are verified to be native. */
  	var DataView = getNative(root, 'DataView'),
  	    Map = getNative(root, 'Map'),
  	    Promise = getNative(root, 'Promise'),
  	    Set = getNative(root, 'Set'),
  	    WeakMap = getNative(root, 'WeakMap'),
  	    nativeCreate = getNative(Object, 'create');

  	/** Used to detect maps, sets, and weakmaps. */
  	var dataViewCtorString = toSource(DataView),
  	    mapCtorString = toSource(Map),
  	    promiseCtorString = toSource(Promise),
  	    setCtorString = toSource(Set),
  	    weakMapCtorString = toSource(WeakMap);

  	/** Used to convert symbols to primitives and strings. */
  	var symbolProto = Symbol ? Symbol.prototype : undefined,
  	    symbolValueOf = symbolProto ? symbolProto.valueOf : undefined;

  	/**
  	 * Creates a hash object.
  	 *
  	 * @private
  	 * @constructor
  	 * @param {Array} [entries] The key-value pairs to cache.
  	 */
  	function Hash(entries) {
  	  var index = -1,
  	      length = entries ? entries.length : 0;

  	  this.clear();
  	  while (++index < length) {
  	    var entry = entries[index];
  	    this.set(entry[0], entry[1]);
  	  }
  	}

  	/**
  	 * Removes all key-value entries from the hash.
  	 *
  	 * @private
  	 * @name clear
  	 * @memberOf Hash
  	 */
  	function hashClear() {
  	  this.__data__ = nativeCreate ? nativeCreate(null) : {};
  	}

  	/**
  	 * Removes `key` and its value from the hash.
  	 *
  	 * @private
  	 * @name delete
  	 * @memberOf Hash
  	 * @param {Object} hash The hash to modify.
  	 * @param {string} key The key of the value to remove.
  	 * @returns {boolean} Returns `true` if the entry was removed, else `false`.
  	 */
  	function hashDelete(key) {
  	  return this.has(key) && delete this.__data__[key];
  	}

  	/**
  	 * Gets the hash value for `key`.
  	 *
  	 * @private
  	 * @name get
  	 * @memberOf Hash
  	 * @param {string} key The key of the value to get.
  	 * @returns {*} Returns the entry value.
  	 */
  	function hashGet(key) {
  	  var data = this.__data__;
  	  if (nativeCreate) {
  	    var result = data[key];
  	    return result === HASH_UNDEFINED ? undefined : result;
  	  }
  	  return hasOwnProperty.call(data, key) ? data[key] : undefined;
  	}

  	/**
  	 * Checks if a hash value for `key` exists.
  	 *
  	 * @private
  	 * @name has
  	 * @memberOf Hash
  	 * @param {string} key The key of the entry to check.
  	 * @returns {boolean} Returns `true` if an entry for `key` exists, else `false`.
  	 */
  	function hashHas(key) {
  	  var data = this.__data__;
  	  return nativeCreate ? data[key] !== undefined : hasOwnProperty.call(data, key);
  	}

  	/**
  	 * Sets the hash `key` to `value`.
  	 *
  	 * @private
  	 * @name set
  	 * @memberOf Hash
  	 * @param {string} key The key of the value to set.
  	 * @param {*} value The value to set.
  	 * @returns {Object} Returns the hash instance.
  	 */
  	function hashSet(key, value) {
  	  var data = this.__data__;
  	  data[key] = (nativeCreate && value === undefined) ? HASH_UNDEFINED : value;
  	  return this;
  	}

  	// Add methods to `Hash`.
  	Hash.prototype.clear = hashClear;
  	Hash.prototype['delete'] = hashDelete;
  	Hash.prototype.get = hashGet;
  	Hash.prototype.has = hashHas;
  	Hash.prototype.set = hashSet;

  	/**
  	 * Creates an list cache object.
  	 *
  	 * @private
  	 * @constructor
  	 * @param {Array} [entries] The key-value pairs to cache.
  	 */
  	function ListCache(entries) {
  	  var index = -1,
  	      length = entries ? entries.length : 0;

  	  this.clear();
  	  while (++index < length) {
  	    var entry = entries[index];
  	    this.set(entry[0], entry[1]);
  	  }
  	}

  	/**
  	 * Removes all key-value entries from the list cache.
  	 *
  	 * @private
  	 * @name clear
  	 * @memberOf ListCache
  	 */
  	function listCacheClear() {
  	  this.__data__ = [];
  	}

  	/**
  	 * Removes `key` and its value from the list cache.
  	 *
  	 * @private
  	 * @name delete
  	 * @memberOf ListCache
  	 * @param {string} key The key of the value to remove.
  	 * @returns {boolean} Returns `true` if the entry was removed, else `false`.
  	 */
  	function listCacheDelete(key) {
  	  var data = this.__data__,
  	      index = assocIndexOf(data, key);

  	  if (index < 0) {
  	    return false;
  	  }
  	  var lastIndex = data.length - 1;
  	  if (index == lastIndex) {
  	    data.pop();
  	  } else {
  	    splice.call(data, index, 1);
  	  }
  	  return true;
  	}

  	/**
  	 * Gets the list cache value for `key`.
  	 *
  	 * @private
  	 * @name get
  	 * @memberOf ListCache
  	 * @param {string} key The key of the value to get.
  	 * @returns {*} Returns the entry value.
  	 */
  	function listCacheGet(key) {
  	  var data = this.__data__,
  	      index = assocIndexOf(data, key);

  	  return index < 0 ? undefined : data[index][1];
  	}

  	/**
  	 * Checks if a list cache value for `key` exists.
  	 *
  	 * @private
  	 * @name has
  	 * @memberOf ListCache
  	 * @param {string} key The key of the entry to check.
  	 * @returns {boolean} Returns `true` if an entry for `key` exists, else `false`.
  	 */
  	function listCacheHas(key) {
  	  return assocIndexOf(this.__data__, key) > -1;
  	}

  	/**
  	 * Sets the list cache `key` to `value`.
  	 *
  	 * @private
  	 * @name set
  	 * @memberOf ListCache
  	 * @param {string} key The key of the value to set.
  	 * @param {*} value The value to set.
  	 * @returns {Object} Returns the list cache instance.
  	 */
  	function listCacheSet(key, value) {
  	  var data = this.__data__,
  	      index = assocIndexOf(data, key);

  	  if (index < 0) {
  	    data.push([key, value]);
  	  } else {
  	    data[index][1] = value;
  	  }
  	  return this;
  	}

  	// Add methods to `ListCache`.
  	ListCache.prototype.clear = listCacheClear;
  	ListCache.prototype['delete'] = listCacheDelete;
  	ListCache.prototype.get = listCacheGet;
  	ListCache.prototype.has = listCacheHas;
  	ListCache.prototype.set = listCacheSet;

  	/**
  	 * Creates a map cache object to store key-value pairs.
  	 *
  	 * @private
  	 * @constructor
  	 * @param {Array} [entries] The key-value pairs to cache.
  	 */
  	function MapCache(entries) {
  	  var index = -1,
  	      length = entries ? entries.length : 0;

  	  this.clear();
  	  while (++index < length) {
  	    var entry = entries[index];
  	    this.set(entry[0], entry[1]);
  	  }
  	}

  	/**
  	 * Removes all key-value entries from the map.
  	 *
  	 * @private
  	 * @name clear
  	 * @memberOf MapCache
  	 */
  	function mapCacheClear() {
  	  this.__data__ = {
  	    'hash': new Hash,
  	    'map': new (Map || ListCache),
  	    'string': new Hash
  	  };
  	}

  	/**
  	 * Removes `key` and its value from the map.
  	 *
  	 * @private
  	 * @name delete
  	 * @memberOf MapCache
  	 * @param {string} key The key of the value to remove.
  	 * @returns {boolean} Returns `true` if the entry was removed, else `false`.
  	 */
  	function mapCacheDelete(key) {
  	  return getMapData(this, key)['delete'](key);
  	}

  	/**
  	 * Gets the map value for `key`.
  	 *
  	 * @private
  	 * @name get
  	 * @memberOf MapCache
  	 * @param {string} key The key of the value to get.
  	 * @returns {*} Returns the entry value.
  	 */
  	function mapCacheGet(key) {
  	  return getMapData(this, key).get(key);
  	}

  	/**
  	 * Checks if a map value for `key` exists.
  	 *
  	 * @private
  	 * @name has
  	 * @memberOf MapCache
  	 * @param {string} key The key of the entry to check.
  	 * @returns {boolean} Returns `true` if an entry for `key` exists, else `false`.
  	 */
  	function mapCacheHas(key) {
  	  return getMapData(this, key).has(key);
  	}

  	/**
  	 * Sets the map `key` to `value`.
  	 *
  	 * @private
  	 * @name set
  	 * @memberOf MapCache
  	 * @param {string} key The key of the value to set.
  	 * @param {*} value The value to set.
  	 * @returns {Object} Returns the map cache instance.
  	 */
  	function mapCacheSet(key, value) {
  	  getMapData(this, key).set(key, value);
  	  return this;
  	}

  	// Add methods to `MapCache`.
  	MapCache.prototype.clear = mapCacheClear;
  	MapCache.prototype['delete'] = mapCacheDelete;
  	MapCache.prototype.get = mapCacheGet;
  	MapCache.prototype.has = mapCacheHas;
  	MapCache.prototype.set = mapCacheSet;

  	/**
  	 * Creates a stack cache object to store key-value pairs.
  	 *
  	 * @private
  	 * @constructor
  	 * @param {Array} [entries] The key-value pairs to cache.
  	 */
  	function Stack(entries) {
  	  this.__data__ = new ListCache(entries);
  	}

  	/**
  	 * Removes all key-value entries from the stack.
  	 *
  	 * @private
  	 * @name clear
  	 * @memberOf Stack
  	 */
  	function stackClear() {
  	  this.__data__ = new ListCache;
  	}

  	/**
  	 * Removes `key` and its value from the stack.
  	 *
  	 * @private
  	 * @name delete
  	 * @memberOf Stack
  	 * @param {string} key The key of the value to remove.
  	 * @returns {boolean} Returns `true` if the entry was removed, else `false`.
  	 */
  	function stackDelete(key) {
  	  return this.__data__['delete'](key);
  	}

  	/**
  	 * Gets the stack value for `key`.
  	 *
  	 * @private
  	 * @name get
  	 * @memberOf Stack
  	 * @param {string} key The key of the value to get.
  	 * @returns {*} Returns the entry value.
  	 */
  	function stackGet(key) {
  	  return this.__data__.get(key);
  	}

  	/**
  	 * Checks if a stack value for `key` exists.
  	 *
  	 * @private
  	 * @name has
  	 * @memberOf Stack
  	 * @param {string} key The key of the entry to check.
  	 * @returns {boolean} Returns `true` if an entry for `key` exists, else `false`.
  	 */
  	function stackHas(key) {
  	  return this.__data__.has(key);
  	}

  	/**
  	 * Sets the stack `key` to `value`.
  	 *
  	 * @private
  	 * @name set
  	 * @memberOf Stack
  	 * @param {string} key The key of the value to set.
  	 * @param {*} value The value to set.
  	 * @returns {Object} Returns the stack cache instance.
  	 */
  	function stackSet(key, value) {
  	  var cache = this.__data__;
  	  if (cache instanceof ListCache) {
  	    var pairs = cache.__data__;
  	    if (!Map || (pairs.length < LARGE_ARRAY_SIZE - 1)) {
  	      pairs.push([key, value]);
  	      return this;
  	    }
  	    cache = this.__data__ = new MapCache(pairs);
  	  }
  	  cache.set(key, value);
  	  return this;
  	}

  	// Add methods to `Stack`.
  	Stack.prototype.clear = stackClear;
  	Stack.prototype['delete'] = stackDelete;
  	Stack.prototype.get = stackGet;
  	Stack.prototype.has = stackHas;
  	Stack.prototype.set = stackSet;

  	/**
  	 * Creates an array of the enumerable property names of the array-like `value`.
  	 *
  	 * @private
  	 * @param {*} value The value to query.
  	 * @param {boolean} inherited Specify returning inherited property names.
  	 * @returns {Array} Returns the array of property names.
  	 */
  	function arrayLikeKeys(value, inherited) {
  	  // Safari 8.1 makes `arguments.callee` enumerable in strict mode.
  	  // Safari 9 makes `arguments.length` enumerable in strict mode.
  	  var result = (isArray(value) || isArguments(value))
  	    ? baseTimes(value.length, String)
  	    : [];

  	  var length = result.length,
  	      skipIndexes = !!length;

  	  for (var key in value) {
  	    if ((inherited || hasOwnProperty.call(value, key)) &&
  	        !(skipIndexes && (key == 'length' || isIndex(key, length)))) {
  	      result.push(key);
  	    }
  	  }
  	  return result;
  	}

  	/**
  	 * Assigns `value` to `key` of `object` if the existing value is not equivalent
  	 * using [`SameValueZero`](http://ecma-international.org/ecma-262/7.0/#sec-samevaluezero)
  	 * for equality comparisons.
  	 *
  	 * @private
  	 * @param {Object} object The object to modify.
  	 * @param {string} key The key of the property to assign.
  	 * @param {*} value The value to assign.
  	 */
  	function assignValue(object, key, value) {
  	  var objValue = object[key];
  	  if (!(hasOwnProperty.call(object, key) && eq(objValue, value)) ||
  	      (value === undefined && !(key in object))) {
  	    object[key] = value;
  	  }
  	}

  	/**
  	 * Gets the index at which the `key` is found in `array` of key-value pairs.
  	 *
  	 * @private
  	 * @param {Array} array The array to inspect.
  	 * @param {*} key The key to search for.
  	 * @returns {number} Returns the index of the matched value, else `-1`.
  	 */
  	function assocIndexOf(array, key) {
  	  var length = array.length;
  	  while (length--) {
  	    if (eq(array[length][0], key)) {
  	      return length;
  	    }
  	  }
  	  return -1;
  	}

  	/**
  	 * The base implementation of `_.assign` without support for multiple sources
  	 * or `customizer` functions.
  	 *
  	 * @private
  	 * @param {Object} object The destination object.
  	 * @param {Object} source The source object.
  	 * @returns {Object} Returns `object`.
  	 */
  	function baseAssign(object, source) {
  	  return object && copyObject(source, keys(source), object);
  	}

  	/**
  	 * The base implementation of `_.clone` and `_.cloneDeep` which tracks
  	 * traversed objects.
  	 *
  	 * @private
  	 * @param {*} value The value to clone.
  	 * @param {boolean} [isDeep] Specify a deep clone.
  	 * @param {boolean} [isFull] Specify a clone including symbols.
  	 * @param {Function} [customizer] The function to customize cloning.
  	 * @param {string} [key] The key of `value`.
  	 * @param {Object} [object] The parent object of `value`.
  	 * @param {Object} [stack] Tracks traversed objects and their clone counterparts.
  	 * @returns {*} Returns the cloned value.
  	 */
  	function baseClone(value, isDeep, isFull, customizer, key, object, stack) {
  	  var result;
  	  if (customizer) {
  	    result = object ? customizer(value, key, object, stack) : customizer(value);
  	  }
  	  if (result !== undefined) {
  	    return result;
  	  }
  	  if (!isObject(value)) {
  	    return value;
  	  }
  	  var isArr = isArray(value);
  	  if (isArr) {
  	    result = initCloneArray(value);
  	    if (!isDeep) {
  	      return copyArray(value, result);
  	    }
  	  } else {
  	    var tag = getTag(value),
  	        isFunc = tag == funcTag || tag == genTag;

  	    if (isBuffer(value)) {
  	      return cloneBuffer(value, isDeep);
  	    }
  	    if (tag == objectTag || tag == argsTag || (isFunc && !object)) {
  	      if (isHostObject(value)) {
  	        return object ? value : {};
  	      }
  	      result = initCloneObject(isFunc ? {} : value);
  	      if (!isDeep) {
  	        return copySymbols(value, baseAssign(result, value));
  	      }
  	    } else {
  	      if (!cloneableTags[tag]) {
  	        return object ? value : {};
  	      }
  	      result = initCloneByTag(value, tag, baseClone, isDeep);
  	    }
  	  }
  	  // Check for circular references and return its corresponding clone.
  	  stack || (stack = new Stack);
  	  var stacked = stack.get(value);
  	  if (stacked) {
  	    return stacked;
  	  }
  	  stack.set(value, result);

  	  if (!isArr) {
  	    var props = isFull ? getAllKeys(value) : keys(value);
  	  }
  	  arrayEach(props || value, function(subValue, key) {
  	    if (props) {
  	      key = subValue;
  	      subValue = value[key];
  	    }
  	    // Recursively populate clone (susceptible to call stack limits).
  	    assignValue(result, key, baseClone(subValue, isDeep, isFull, customizer, key, value, stack));
  	  });
  	  return result;
  	}

  	/**
  	 * The base implementation of `_.create` without support for assigning
  	 * properties to the created object.
  	 *
  	 * @private
  	 * @param {Object} prototype The object to inherit from.
  	 * @returns {Object} Returns the new object.
  	 */
  	function baseCreate(proto) {
  	  return isObject(proto) ? objectCreate(proto) : {};
  	}

  	/**
  	 * The base implementation of `getAllKeys` and `getAllKeysIn` which uses
  	 * `keysFunc` and `symbolsFunc` to get the enumerable property names and
  	 * symbols of `object`.
  	 *
  	 * @private
  	 * @param {Object} object The object to query.
  	 * @param {Function} keysFunc The function to get the keys of `object`.
  	 * @param {Function} symbolsFunc The function to get the symbols of `object`.
  	 * @returns {Array} Returns the array of property names and symbols.
  	 */
  	function baseGetAllKeys(object, keysFunc, symbolsFunc) {
  	  var result = keysFunc(object);
  	  return isArray(object) ? result : arrayPush(result, symbolsFunc(object));
  	}

  	/**
  	 * The base implementation of `getTag`.
  	 *
  	 * @private
  	 * @param {*} value The value to query.
  	 * @returns {string} Returns the `toStringTag`.
  	 */
  	function baseGetTag(value) {
  	  return objectToString.call(value);
  	}

  	/**
  	 * The base implementation of `_.isNative` without bad shim checks.
  	 *
  	 * @private
  	 * @param {*} value The value to check.
  	 * @returns {boolean} Returns `true` if `value` is a native function,
  	 *  else `false`.
  	 */
  	function baseIsNative(value) {
  	  if (!isObject(value) || isMasked(value)) {
  	    return false;
  	  }
  	  var pattern = (isFunction(value) || isHostObject(value)) ? reIsNative : reIsHostCtor;
  	  return pattern.test(toSource(value));
  	}

  	/**
  	 * The base implementation of `_.keys` which doesn't treat sparse arrays as dense.
  	 *
  	 * @private
  	 * @param {Object} object The object to query.
  	 * @returns {Array} Returns the array of property names.
  	 */
  	function baseKeys(object) {
  	  if (!isPrototype(object)) {
  	    return nativeKeys(object);
  	  }
  	  var result = [];
  	  for (var key in Object(object)) {
  	    if (hasOwnProperty.call(object, key) && key != 'constructor') {
  	      result.push(key);
  	    }
  	  }
  	  return result;
  	}

  	/**
  	 * Creates a clone of  `buffer`.
  	 *
  	 * @private
  	 * @param {Buffer} buffer The buffer to clone.
  	 * @param {boolean} [isDeep] Specify a deep clone.
  	 * @returns {Buffer} Returns the cloned buffer.
  	 */
  	function cloneBuffer(buffer, isDeep) {
  	  if (isDeep) {
  	    return buffer.slice();
  	  }
  	  var result = new buffer.constructor(buffer.length);
  	  buffer.copy(result);
  	  return result;
  	}

  	/**
  	 * Creates a clone of `arrayBuffer`.
  	 *
  	 * @private
  	 * @param {ArrayBuffer} arrayBuffer The array buffer to clone.
  	 * @returns {ArrayBuffer} Returns the cloned array buffer.
  	 */
  	function cloneArrayBuffer(arrayBuffer) {
  	  var result = new arrayBuffer.constructor(arrayBuffer.byteLength);
  	  new Uint8Array(result).set(new Uint8Array(arrayBuffer));
  	  return result;
  	}

  	/**
  	 * Creates a clone of `dataView`.
  	 *
  	 * @private
  	 * @param {Object} dataView The data view to clone.
  	 * @param {boolean} [isDeep] Specify a deep clone.
  	 * @returns {Object} Returns the cloned data view.
  	 */
  	function cloneDataView(dataView, isDeep) {
  	  var buffer = isDeep ? cloneArrayBuffer(dataView.buffer) : dataView.buffer;
  	  return new dataView.constructor(buffer, dataView.byteOffset, dataView.byteLength);
  	}

  	/**
  	 * Creates a clone of `map`.
  	 *
  	 * @private
  	 * @param {Object} map The map to clone.
  	 * @param {Function} cloneFunc The function to clone values.
  	 * @param {boolean} [isDeep] Specify a deep clone.
  	 * @returns {Object} Returns the cloned map.
  	 */
  	function cloneMap(map, isDeep, cloneFunc) {
  	  var array = isDeep ? cloneFunc(mapToArray(map), true) : mapToArray(map);
  	  return arrayReduce(array, addMapEntry, new map.constructor);
  	}

  	/**
  	 * Creates a clone of `regexp`.
  	 *
  	 * @private
  	 * @param {Object} regexp The regexp to clone.
  	 * @returns {Object} Returns the cloned regexp.
  	 */
  	function cloneRegExp(regexp) {
  	  var result = new regexp.constructor(regexp.source, reFlags.exec(regexp));
  	  result.lastIndex = regexp.lastIndex;
  	  return result;
  	}

  	/**
  	 * Creates a clone of `set`.
  	 *
  	 * @private
  	 * @param {Object} set The set to clone.
  	 * @param {Function} cloneFunc The function to clone values.
  	 * @param {boolean} [isDeep] Specify a deep clone.
  	 * @returns {Object} Returns the cloned set.
  	 */
  	function cloneSet(set, isDeep, cloneFunc) {
  	  var array = isDeep ? cloneFunc(setToArray(set), true) : setToArray(set);
  	  return arrayReduce(array, addSetEntry, new set.constructor);
  	}

  	/**
  	 * Creates a clone of the `symbol` object.
  	 *
  	 * @private
  	 * @param {Object} symbol The symbol object to clone.
  	 * @returns {Object} Returns the cloned symbol object.
  	 */
  	function cloneSymbol(symbol) {
  	  return symbolValueOf ? Object(symbolValueOf.call(symbol)) : {};
  	}

  	/**
  	 * Creates a clone of `typedArray`.
  	 *
  	 * @private
  	 * @param {Object} typedArray The typed array to clone.
  	 * @param {boolean} [isDeep] Specify a deep clone.
  	 * @returns {Object} Returns the cloned typed array.
  	 */
  	function cloneTypedArray(typedArray, isDeep) {
  	  var buffer = isDeep ? cloneArrayBuffer(typedArray.buffer) : typedArray.buffer;
  	  return new typedArray.constructor(buffer, typedArray.byteOffset, typedArray.length);
  	}

  	/**
  	 * Copies the values of `source` to `array`.
  	 *
  	 * @private
  	 * @param {Array} source The array to copy values from.
  	 * @param {Array} [array=[]] The array to copy values to.
  	 * @returns {Array} Returns `array`.
  	 */
  	function copyArray(source, array) {
  	  var index = -1,
  	      length = source.length;

  	  array || (array = Array(length));
  	  while (++index < length) {
  	    array[index] = source[index];
  	  }
  	  return array;
  	}

  	/**
  	 * Copies properties of `source` to `object`.
  	 *
  	 * @private
  	 * @param {Object} source The object to copy properties from.
  	 * @param {Array} props The property identifiers to copy.
  	 * @param {Object} [object={}] The object to copy properties to.
  	 * @param {Function} [customizer] The function to customize copied values.
  	 * @returns {Object} Returns `object`.
  	 */
  	function copyObject(source, props, object, customizer) {
  	  object || (object = {});

  	  var index = -1,
  	      length = props.length;

  	  while (++index < length) {
  	    var key = props[index];

  	    var newValue = customizer
  	      ? customizer(object[key], source[key], key, object, source)
  	      : undefined;

  	    assignValue(object, key, newValue === undefined ? source[key] : newValue);
  	  }
  	  return object;
  	}

  	/**
  	 * Copies own symbol properties of `source` to `object`.
  	 *
  	 * @private
  	 * @param {Object} source The object to copy symbols from.
  	 * @param {Object} [object={}] The object to copy symbols to.
  	 * @returns {Object} Returns `object`.
  	 */
  	function copySymbols(source, object) {
  	  return copyObject(source, getSymbols(source), object);
  	}

  	/**
  	 * Creates an array of own enumerable property names and symbols of `object`.
  	 *
  	 * @private
  	 * @param {Object} object The object to query.
  	 * @returns {Array} Returns the array of property names and symbols.
  	 */
  	function getAllKeys(object) {
  	  return baseGetAllKeys(object, keys, getSymbols);
  	}

  	/**
  	 * Gets the data for `map`.
  	 *
  	 * @private
  	 * @param {Object} map The map to query.
  	 * @param {string} key The reference key.
  	 * @returns {*} Returns the map data.
  	 */
  	function getMapData(map, key) {
  	  var data = map.__data__;
  	  return isKeyable(key)
  	    ? data[typeof key == 'string' ? 'string' : 'hash']
  	    : data.map;
  	}

  	/**
  	 * Gets the native function at `key` of `object`.
  	 *
  	 * @private
  	 * @param {Object} object The object to query.
  	 * @param {string} key The key of the method to get.
  	 * @returns {*} Returns the function if it's native, else `undefined`.
  	 */
  	function getNative(object, key) {
  	  var value = getValue(object, key);
  	  return baseIsNative(value) ? value : undefined;
  	}

  	/**
  	 * Creates an array of the own enumerable symbol properties of `object`.
  	 *
  	 * @private
  	 * @param {Object} object The object to query.
  	 * @returns {Array} Returns the array of symbols.
  	 */
  	var getSymbols = nativeGetSymbols ? overArg(nativeGetSymbols, Object) : stubArray;

  	/**
  	 * Gets the `toStringTag` of `value`.
  	 *
  	 * @private
  	 * @param {*} value The value to query.
  	 * @returns {string} Returns the `toStringTag`.
  	 */
  	var getTag = baseGetTag;

  	// Fallback for data views, maps, sets, and weak maps in IE 11,
  	// for data views in Edge < 14, and promises in Node.js.
  	if ((DataView && getTag(new DataView(new ArrayBuffer(1))) != dataViewTag) ||
  	    (Map && getTag(new Map) != mapTag) ||
  	    (Promise && getTag(Promise.resolve()) != promiseTag) ||
  	    (Set && getTag(new Set) != setTag) ||
  	    (WeakMap && getTag(new WeakMap) != weakMapTag)) {
  	  getTag = function(value) {
  	    var result = objectToString.call(value),
  	        Ctor = result == objectTag ? value.constructor : undefined,
  	        ctorString = Ctor ? toSource(Ctor) : undefined;

  	    if (ctorString) {
  	      switch (ctorString) {
  	        case dataViewCtorString: return dataViewTag;
  	        case mapCtorString: return mapTag;
  	        case promiseCtorString: return promiseTag;
  	        case setCtorString: return setTag;
  	        case weakMapCtorString: return weakMapTag;
  	      }
  	    }
  	    return result;
  	  };
  	}

  	/**
  	 * Initializes an array clone.
  	 *
  	 * @private
  	 * @param {Array} array The array to clone.
  	 * @returns {Array} Returns the initialized clone.
  	 */
  	function initCloneArray(array) {
  	  var length = array.length,
  	      result = array.constructor(length);

  	  // Add properties assigned by `RegExp#exec`.
  	  if (length && typeof array[0] == 'string' && hasOwnProperty.call(array, 'index')) {
  	    result.index = array.index;
  	    result.input = array.input;
  	  }
  	  return result;
  	}

  	/**
  	 * Initializes an object clone.
  	 *
  	 * @private
  	 * @param {Object} object The object to clone.
  	 * @returns {Object} Returns the initialized clone.
  	 */
  	function initCloneObject(object) {
  	  return (typeof object.constructor == 'function' && !isPrototype(object))
  	    ? baseCreate(getPrototype(object))
  	    : {};
  	}

  	/**
  	 * Initializes an object clone based on its `toStringTag`.
  	 *
  	 * **Note:** This function only supports cloning values with tags of
  	 * `Boolean`, `Date`, `Error`, `Number`, `RegExp`, or `String`.
  	 *
  	 * @private
  	 * @param {Object} object The object to clone.
  	 * @param {string} tag The `toStringTag` of the object to clone.
  	 * @param {Function} cloneFunc The function to clone values.
  	 * @param {boolean} [isDeep] Specify a deep clone.
  	 * @returns {Object} Returns the initialized clone.
  	 */
  	function initCloneByTag(object, tag, cloneFunc, isDeep) {
  	  var Ctor = object.constructor;
  	  switch (tag) {
  	    case arrayBufferTag:
  	      return cloneArrayBuffer(object);

  	    case boolTag:
  	    case dateTag:
  	      return new Ctor(+object);

  	    case dataViewTag:
  	      return cloneDataView(object, isDeep);

  	    case float32Tag: case float64Tag:
  	    case int8Tag: case int16Tag: case int32Tag:
  	    case uint8Tag: case uint8ClampedTag: case uint16Tag: case uint32Tag:
  	      return cloneTypedArray(object, isDeep);

  	    case mapTag:
  	      return cloneMap(object, isDeep, cloneFunc);

  	    case numberTag:
  	    case stringTag:
  	      return new Ctor(object);

  	    case regexpTag:
  	      return cloneRegExp(object);

  	    case setTag:
  	      return cloneSet(object, isDeep, cloneFunc);

  	    case symbolTag:
  	      return cloneSymbol(object);
  	  }
  	}

  	/**
  	 * Checks if `value` is a valid array-like index.
  	 *
  	 * @private
  	 * @param {*} value The value to check.
  	 * @param {number} [length=MAX_SAFE_INTEGER] The upper bounds of a valid index.
  	 * @returns {boolean} Returns `true` if `value` is a valid index, else `false`.
  	 */
  	function isIndex(value, length) {
  	  length = length == null ? MAX_SAFE_INTEGER : length;
  	  return !!length &&
  	    (typeof value == 'number' || reIsUint.test(value)) &&
  	    (value > -1 && value % 1 == 0 && value < length);
  	}

  	/**
  	 * Checks if `value` is suitable for use as unique object key.
  	 *
  	 * @private
  	 * @param {*} value The value to check.
  	 * @returns {boolean} Returns `true` if `value` is suitable, else `false`.
  	 */
  	function isKeyable(value) {
  	  var type = typeof value;
  	  return (type == 'string' || type == 'number' || type == 'symbol' || type == 'boolean')
  	    ? (value !== '__proto__')
  	    : (value === null);
  	}

  	/**
  	 * Checks if `func` has its source masked.
  	 *
  	 * @private
  	 * @param {Function} func The function to check.
  	 * @returns {boolean} Returns `true` if `func` is masked, else `false`.
  	 */
  	function isMasked(func) {
  	  return !!maskSrcKey && (maskSrcKey in func);
  	}

  	/**
  	 * Checks if `value` is likely a prototype object.
  	 *
  	 * @private
  	 * @param {*} value The value to check.
  	 * @returns {boolean} Returns `true` if `value` is a prototype, else `false`.
  	 */
  	function isPrototype(value) {
  	  var Ctor = value && value.constructor,
  	      proto = (typeof Ctor == 'function' && Ctor.prototype) || objectProto;

  	  return value === proto;
  	}

  	/**
  	 * Converts `func` to its source code.
  	 *
  	 * @private
  	 * @param {Function} func The function to process.
  	 * @returns {string} Returns the source code.
  	 */
  	function toSource(func) {
  	  if (func != null) {
  	    try {
  	      return funcToString.call(func);
  	    } catch (e) {}
  	    try {
  	      return (func + '');
  	    } catch (e) {}
  	  }
  	  return '';
  	}

  	/**
  	 * This method is like `_.clone` except that it recursively clones `value`.
  	 *
  	 * @static
  	 * @memberOf _
  	 * @since 1.0.0
  	 * @category Lang
  	 * @param {*} value The value to recursively clone.
  	 * @returns {*} Returns the deep cloned value.
  	 * @see _.clone
  	 * @example
  	 *
  	 * var objects = [{ 'a': 1 }, { 'b': 2 }];
  	 *
  	 * var deep = _.cloneDeep(objects);
  	 * console.log(deep[0] === objects[0]);
  	 * // => false
  	 */
  	function cloneDeep(value) {
  	  return baseClone(value, true, true);
  	}

  	/**
  	 * Performs a
  	 * [`SameValueZero`](http://ecma-international.org/ecma-262/7.0/#sec-samevaluezero)
  	 * comparison between two values to determine if they are equivalent.
  	 *
  	 * @static
  	 * @memberOf _
  	 * @since 4.0.0
  	 * @category Lang
  	 * @param {*} value The value to compare.
  	 * @param {*} other The other value to compare.
  	 * @returns {boolean} Returns `true` if the values are equivalent, else `false`.
  	 * @example
  	 *
  	 * var object = { 'a': 1 };
  	 * var other = { 'a': 1 };
  	 *
  	 * _.eq(object, object);
  	 * // => true
  	 *
  	 * _.eq(object, other);
  	 * // => false
  	 *
  	 * _.eq('a', 'a');
  	 * // => true
  	 *
  	 * _.eq('a', Object('a'));
  	 * // => false
  	 *
  	 * _.eq(NaN, NaN);
  	 * // => true
  	 */
  	function eq(value, other) {
  	  return value === other || (value !== value && other !== other);
  	}

  	/**
  	 * Checks if `value` is likely an `arguments` object.
  	 *
  	 * @static
  	 * @memberOf _
  	 * @since 0.1.0
  	 * @category Lang
  	 * @param {*} value The value to check.
  	 * @returns {boolean} Returns `true` if `value` is an `arguments` object,
  	 *  else `false`.
  	 * @example
  	 *
  	 * _.isArguments(function() { return arguments; }());
  	 * // => true
  	 *
  	 * _.isArguments([1, 2, 3]);
  	 * // => false
  	 */
  	function isArguments(value) {
  	  // Safari 8.1 makes `arguments.callee` enumerable in strict mode.
  	  return isArrayLikeObject(value) && hasOwnProperty.call(value, 'callee') &&
  	    (!propertyIsEnumerable.call(value, 'callee') || objectToString.call(value) == argsTag);
  	}

  	/**
  	 * Checks if `value` is classified as an `Array` object.
  	 *
  	 * @static
  	 * @memberOf _
  	 * @since 0.1.0
  	 * @category Lang
  	 * @param {*} value The value to check.
  	 * @returns {boolean} Returns `true` if `value` is an array, else `false`.
  	 * @example
  	 *
  	 * _.isArray([1, 2, 3]);
  	 * // => true
  	 *
  	 * _.isArray(document.body.children);
  	 * // => false
  	 *
  	 * _.isArray('abc');
  	 * // => false
  	 *
  	 * _.isArray(_.noop);
  	 * // => false
  	 */
  	var isArray = Array.isArray;

  	/**
  	 * Checks if `value` is array-like. A value is considered array-like if it's
  	 * not a function and has a `value.length` that's an integer greater than or
  	 * equal to `0` and less than or equal to `Number.MAX_SAFE_INTEGER`.
  	 *
  	 * @static
  	 * @memberOf _
  	 * @since 4.0.0
  	 * @category Lang
  	 * @param {*} value The value to check.
  	 * @returns {boolean} Returns `true` if `value` is array-like, else `false`.
  	 * @example
  	 *
  	 * _.isArrayLike([1, 2, 3]);
  	 * // => true
  	 *
  	 * _.isArrayLike(document.body.children);
  	 * // => true
  	 *
  	 * _.isArrayLike('abc');
  	 * // => true
  	 *
  	 * _.isArrayLike(_.noop);
  	 * // => false
  	 */
  	function isArrayLike(value) {
  	  return value != null && isLength(value.length) && !isFunction(value);
  	}

  	/**
  	 * This method is like `_.isArrayLike` except that it also checks if `value`
  	 * is an object.
  	 *
  	 * @static
  	 * @memberOf _
  	 * @since 4.0.0
  	 * @category Lang
  	 * @param {*} value The value to check.
  	 * @returns {boolean} Returns `true` if `value` is an array-like object,
  	 *  else `false`.
  	 * @example
  	 *
  	 * _.isArrayLikeObject([1, 2, 3]);
  	 * // => true
  	 *
  	 * _.isArrayLikeObject(document.body.children);
  	 * // => true
  	 *
  	 * _.isArrayLikeObject('abc');
  	 * // => false
  	 *
  	 * _.isArrayLikeObject(_.noop);
  	 * // => false
  	 */
  	function isArrayLikeObject(value) {
  	  return isObjectLike(value) && isArrayLike(value);
  	}

  	/**
  	 * Checks if `value` is a buffer.
  	 *
  	 * @static
  	 * @memberOf _
  	 * @since 4.3.0
  	 * @category Lang
  	 * @param {*} value The value to check.
  	 * @returns {boolean} Returns `true` if `value` is a buffer, else `false`.
  	 * @example
  	 *
  	 * _.isBuffer(new Buffer(2));
  	 * // => true
  	 *
  	 * _.isBuffer(new Uint8Array(2));
  	 * // => false
  	 */
  	var isBuffer = nativeIsBuffer || stubFalse;

  	/**
  	 * Checks if `value` is classified as a `Function` object.
  	 *
  	 * @static
  	 * @memberOf _
  	 * @since 0.1.0
  	 * @category Lang
  	 * @param {*} value The value to check.
  	 * @returns {boolean} Returns `true` if `value` is a function, else `false`.
  	 * @example
  	 *
  	 * _.isFunction(_);
  	 * // => true
  	 *
  	 * _.isFunction(/abc/);
  	 * // => false
  	 */
  	function isFunction(value) {
  	  // The use of `Object#toString` avoids issues with the `typeof` operator
  	  // in Safari 8-9 which returns 'object' for typed array and other constructors.
  	  var tag = isObject(value) ? objectToString.call(value) : '';
  	  return tag == funcTag || tag == genTag;
  	}

  	/**
  	 * Checks if `value` is a valid array-like length.
  	 *
  	 * **Note:** This method is loosely based on
  	 * [`ToLength`](http://ecma-international.org/ecma-262/7.0/#sec-tolength).
  	 *
  	 * @static
  	 * @memberOf _
  	 * @since 4.0.0
  	 * @category Lang
  	 * @param {*} value The value to check.
  	 * @returns {boolean} Returns `true` if `value` is a valid length, else `false`.
  	 * @example
  	 *
  	 * _.isLength(3);
  	 * // => true
  	 *
  	 * _.isLength(Number.MIN_VALUE);
  	 * // => false
  	 *
  	 * _.isLength(Infinity);
  	 * // => false
  	 *
  	 * _.isLength('3');
  	 * // => false
  	 */
  	function isLength(value) {
  	  return typeof value == 'number' &&
  	    value > -1 && value % 1 == 0 && value <= MAX_SAFE_INTEGER;
  	}

  	/**
  	 * Checks if `value` is the
  	 * [language type](http://www.ecma-international.org/ecma-262/7.0/#sec-ecmascript-language-types)
  	 * of `Object`. (e.g. arrays, functions, objects, regexes, `new Number(0)`, and `new String('')`)
  	 *
  	 * @static
  	 * @memberOf _
  	 * @since 0.1.0
  	 * @category Lang
  	 * @param {*} value The value to check.
  	 * @returns {boolean} Returns `true` if `value` is an object, else `false`.
  	 * @example
  	 *
  	 * _.isObject({});
  	 * // => true
  	 *
  	 * _.isObject([1, 2, 3]);
  	 * // => true
  	 *
  	 * _.isObject(_.noop);
  	 * // => true
  	 *
  	 * _.isObject(null);
  	 * // => false
  	 */
  	function isObject(value) {
  	  var type = typeof value;
  	  return !!value && (type == 'object' || type == 'function');
  	}

  	/**
  	 * Checks if `value` is object-like. A value is object-like if it's not `null`
  	 * and has a `typeof` result of "object".
  	 *
  	 * @static
  	 * @memberOf _
  	 * @since 4.0.0
  	 * @category Lang
  	 * @param {*} value The value to check.
  	 * @returns {boolean} Returns `true` if `value` is object-like, else `false`.
  	 * @example
  	 *
  	 * _.isObjectLike({});
  	 * // => true
  	 *
  	 * _.isObjectLike([1, 2, 3]);
  	 * // => true
  	 *
  	 * _.isObjectLike(_.noop);
  	 * // => false
  	 *
  	 * _.isObjectLike(null);
  	 * // => false
  	 */
  	function isObjectLike(value) {
  	  return !!value && typeof value == 'object';
  	}

  	/**
  	 * Creates an array of the own enumerable property names of `object`.
  	 *
  	 * **Note:** Non-object values are coerced to objects. See the
  	 * [ES spec](http://ecma-international.org/ecma-262/7.0/#sec-object.keys)
  	 * for more details.
  	 *
  	 * @static
  	 * @since 0.1.0
  	 * @memberOf _
  	 * @category Object
  	 * @param {Object} object The object to query.
  	 * @returns {Array} Returns the array of property names.
  	 * @example
  	 *
  	 * function Foo() {
  	 *   this.a = 1;
  	 *   this.b = 2;
  	 * }
  	 *
  	 * Foo.prototype.c = 3;
  	 *
  	 * _.keys(new Foo);
  	 * // => ['a', 'b'] (iteration order is not guaranteed)
  	 *
  	 * _.keys('hi');
  	 * // => ['0', '1']
  	 */
  	function keys(object) {
  	  return isArrayLike(object) ? arrayLikeKeys(object) : baseKeys(object);
  	}

  	/**
  	 * This method returns a new empty array.
  	 *
  	 * @static
  	 * @memberOf _
  	 * @since 4.13.0
  	 * @category Util
  	 * @returns {Array} Returns the new empty array.
  	 * @example
  	 *
  	 * var arrays = _.times(2, _.stubArray);
  	 *
  	 * console.log(arrays);
  	 * // => [[], []]
  	 *
  	 * console.log(arrays[0] === arrays[1]);
  	 * // => false
  	 */
  	function stubArray() {
  	  return [];
  	}

  	/**
  	 * This method returns `false`.
  	 *
  	 * @static
  	 * @memberOf _
  	 * @since 4.13.0
  	 * @category Util
  	 * @returns {boolean} Returns `false`.
  	 * @example
  	 *
  	 * _.times(2, _.stubFalse);
  	 * // => [false, false]
  	 */
  	function stubFalse() {
  	  return false;
  	}

  	module.exports = cloneDeep;
  } (lodash_clonedeep, lodash_clonedeep.exports));

  var cloneDeep = lodash_clonedeep.exports;

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

    const apiOptions = { ...base, ...state, ...bindings, ...data };

    const visual = new Flourish.Live(apiOptions);
    console.log(visual);
  }

  function ready(data) {
    buildSelectUI();
    buildAPIChart(info, data);
  }

  csv(`${dataUrl}?${Math.random()}`, autoType).then(ready);

})();
//# sourceMappingURL=app.js.map
