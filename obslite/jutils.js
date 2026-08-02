export function jdeepCopy(obj) {
  return JSON.parse(JSON.stringify(obj));
}

export function jupdateState(state, newState) {
  return Object.keys(newState).reduce(
    (res, key) => {
      const newVal = newState[key];
      if (
        Array.isArray(newVal) ||
        newVal === null ||
        typeof newVal !== "object" ||
        newVal.constructor.name !== "Object" // NOTE: add to lib
      ) {
        res[key] = newVal;
      } else {
        res[key] = jupdateState(res[key], newVal);
      }
      return res;
    },
    { ...state },
  );
}
export function jupdateByIdx(idx, newVal, arr) {
  return arr.map((oldVal, i) => (i === idx ? newVal : oldVal));
}

export const idFn = (x) => x;
