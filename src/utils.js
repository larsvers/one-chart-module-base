// Convert an array of objects to an array of arrays.
// Adding the column names as first row in result.
function convertToArrayOfArrays(array) {
  const keys = Object.keys(array[0]);
  const arrayOfArrays = array.map(Object.values);
  arrayOfArrays.unshift(keys);
  return arrayOfArrays;
}

// Convert an array of arrays to an array of objects.
// Assuming the first row is the column names.
function convertToArrayOfObjects(array) {
  const cols = array.shift();

  const result = array.map(el => {
    const obj = {};
    cols.forEach((col, i) => (obj[col] = el[i]));
    return obj;
  });

  result.columns = cols;
  return result;
}

export { convertToArrayOfArrays, convertToArrayOfObjects };
